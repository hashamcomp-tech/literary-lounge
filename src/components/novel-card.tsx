"use client";

import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, Book, Play } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { deleteCloudBook } from '@/lib/cloud-library-utils';
import { doc } from 'firebase/firestore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface NovelCardProps {
  novel: any;
}

/**
 * @fileOverview Universal Novel Card.
 * Intelligently routes between Mock, Cloud, and Local library collections.
 * remembers how far the user has read by checking localStorage fallback.
 */
export default function NovelCard({ novel }: NovelCardProps) {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [lastReadChapter, setLastReadChapter] = useState<number>(1);

  useEffect(() => {
    // Check local storage for reading progress
    const localProgress = localStorage.getItem(`lounge-progress-${novel.id}`);
    if (localProgress) {
      setLastReadChapter(parseInt(localProgress));
    }
  }, [novel.id]);

  // Explicitly determine route type
  const isLocal = !!(novel.isLocalOnly || novel._isLocal);
  const isCloud = !!(novel.isCloud && !isLocal);
  
  // Check admin status
  const profileRef = useMemoFirebase(() => (db && user && !user.isAnonymous) ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile } = useDoc(profileRef);
  const isAdmin = user?.email === 'hashamcomp@gmail.com' || profile?.role === 'admin';
  
  let href = `/novel/${novel.id}`; // Default to Mock
  
  if (isLocal) {
    href = `/local-pages/${novel.id}/${lastReadChapter}`;
  } else if (isCloud) {
    href = `/pages/${novel.id}/${lastReadChapter}`;
  }

  const authorName = novel.author || 'Unknown Author';
  
  const genres: string[] = (Array.isArray(novel.genre) ? novel.genre : (novel.genre ? [novel.genre] : [])).filter(Boolean);
  
  const displayImage = novel.coverURL || 
                       novel.metadata?.info?.coverURL || 
                       novel.coverImage || 
                       `https://picsum.photos/seed/${novel.id}/400/600`;

  const handleDeleteCloudBook = () => {
    if (!db || !novel.id) return;
    setIsDeleting(true);
    
    deleteCloudBook(db, novel.id)
      .then(() => {
        toast({
          title: "Manuscript Removed",
          description: `"${novel.title}" has been deleted from the global Lounge.`
        });
      })
      .catch((err: any) => {})
      .finally(() => {
        setIsDeleting(false);
      });
  };

  return (
    <div className="relative group">
      <Link href={href}>
        <Card className="overflow-hidden border-none shadow-none bg-transparent hover:bg-card/50 transition-colors duration-300">
          <CardContent className="p-0">
            <div className="relative aspect-[150/220] w-full overflow-hidden rounded-lg mb-3 shadow-sm group-hover:shadow-lg group-hover:-translate-y-1 transition-all duration-500 border border-border/10 bg-muted/20 flex items-center justify-center">
              {displayImage ? (
                <Image
                  src={displayImage}
                  alt={novel.title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
                  data-ai-hint="book cover"
                />
              ) : (
                <Book className="h-12 w-12 text-muted-foreground/20" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                <Badge variant="secondary" className="bg-white/95 backdrop-blur-sm text-primary border-none font-bold py-1 px-3 flex items-center gap-1.5">
                  {lastReadChapter > 1 ? <Play className="h-3 w-3 fill-primary" /> : null}
                  {lastReadChapter > 1 ? `Resume Ch. ${lastReadChapter}` : 'Read Now'}
                </Badge>
              </div>
            </div>
            <div className="px-1">
              <h3 className="font-headline font-bold text-lg line-clamp-1 group-hover:text-primary transition-colors duration-300">
                {novel.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-2 line-clamp-1">By {authorName}</p>
              <div className="flex gap-1.5 flex-wrap items-center">
                {genres.slice(0, 2).map((g, i) => (
                  <Badge key={`${novel.id}-genre-${i}`} variant="outline" className="text-[9px] h-4.5 uppercase tracking-wider font-bold border-muted-foreground/20 text-muted-foreground">
                    {g}
                  </Badge>
                ))}
                {genres.length > 2 && (
                  <span className="text-[8px] font-black opacity-40">+{genres.length - 2}</span>
                )}
                {isCloud && (
                  <Badge variant="secondary" className="text-[9px] h-4.5 uppercase tracking-wider font-bold bg-primary/10 text-primary border-none">
                    Cloud
                  </Badge>
                )}
                {isLocal && (
                  <Badge variant="secondary" className="text-[9px] h-4.5 uppercase tracking-wider font-bold bg-amber-100 text-amber-700 border-none">
                    Local
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      {isAdmin && isCloud && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive" 
                size="icon" 
                className="h-8 w-8 rounded-full shadow-lg border-2 border-background"
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-2xl font-headline font-black">Global Manuscript Deletion</AlertDialogTitle>
                <AlertDialogDescription className="text-base">
                  You are about to remove <span className="font-bold text-foreground">"{novel.title}"</span> from the Lounge's global cloud library. This will purge the volume for all readers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="pt-4">
                <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDeleteCloudBook}
                  className="bg-destructive hover:bg-destructive/90 rounded-xl font-bold px-6"
                >
                  Confirm Global Deletion
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
