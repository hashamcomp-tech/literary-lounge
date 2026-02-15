'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, User, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * @fileOverview Chapter Display Component for Cloud Novels.
 * Implements semantic <article> and paragraph structure.
 * The primary heading is now removed to focus on chapters.
 */
interface CloudReaderClientProps {
  id: string;
  chapterNumber: string;
}

export function CloudReaderClient({ id, chapterNumber }: CloudReaderClientProps) {
  const { firestore } = useFirebase();
  const router = useRouter();
  const currentChapterNum = parseInt(chapterNumber);
  
  const [metadata, setMetadata] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firestore || !id) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const bookRef = doc(firestore, 'books', id);
        const snapshot = await getDoc(bookRef);
        
        if (!snapshot.exists()) {
          setError('Document not found in the cloud library.');
          setIsLoading(false);
          return;
        }

        const data = snapshot.data();
        let chaptersList = data.chapters || [];
        
        // Fallback to chapters subcollection
        if (chaptersList.length === 0) {
          const subColRef = collection(firestore, 'books', id, 'chapters');
          const subSnap = await getDocs(subColRef);
          chaptersList = subSnap.docs.map(d => ({ 
            id: d.id, 
            ...d.data() 
          })).sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
        }

        if (chaptersList.length === 0) {
          setError('This novel exists but has no chapters published yet.');
        } else {
          setMetadata(data.metadata?.info || data);
          setChapters(chaptersList);
        }
      } catch (err: any) {
        const permError = new FirestorePermissionError({
          path: `books/${id}`,
          operation: 'get'
        });
        errorEmitter.emit('permission-error', permError);
        setError('Insufficient permissions or network error.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [firestore, id]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">Opening the Lounge...</p>
      </div>
    );
  }

  if (error || chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        {error?.includes('permissions') ? (
          <ShieldAlert className="h-16 w-16 text-destructive mb-4 opacity-20" />
        ) : (
          <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
        )}
        <h1 className="text-3xl font-headline font-black mb-2">
          {error?.includes('permissions') ? 'Access Restricted' : 'Novel Not Found'}
        </h1>
        <p className="text-muted-foreground max-w-md mb-8">
          {error || "This novel doesn't seem to exist in the cloud library yet."}
        </p>
        <Button variant="outline" className="rounded-xl px-8" onClick={() => router.push('/')}>
          Return to Library
        </Button>
      </div>
    );
  }

  const prevNum = currentChapterNum - 1;
  const nextNum = currentChapterNum + 1;
  const totalChapters = chapters.length;

  return (
    <div className="max-w-3xl mx-auto selection:bg-primary/20 selection:text-primary">
      <header className="mb-20 text-center sm:text-left">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => router.back()}
          className="mb-8 -ml-2 text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Library
        </Button>

        <div className="space-y-4">
          <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] uppercase font-black px-4 py-1 tracking-[0.2em] mb-4">
            Cloud Library Edition
          </Badge>
          <p className="text-xl sm:text-2xl text-muted-foreground italic flex items-center justify-center sm:justify-start gap-2 pt-2">
            <User className="h-5 w-5 text-primary/60" /> By {metadata?.author || 'Unknown Author'}
          </p>
          <div className="h-1.5 w-32 bg-primary/30 rounded-full mt-8 mx-auto sm:mx-0" />
        </div>
      </header>

      {/* Chapters as semantic articles */}
      <div className="space-y-32">
        {chapters.map((ch) => (
          <article key={ch.chapterNumber} id={`chapter-${ch.chapterNumber}`} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="mb-16 flex flex-col items-center text-center sm:items-start sm:text-left">
              {metadata?.coverURL && ch.chapterNumber === 1 && (
                <div className="relative w-[200px] h-[300px] mb-12 shadow-2xl rounded-2xl overflow-hidden border border-border/50 group">
                  <Image 
                    src={metadata.coverURL} 
                    alt={metadata.bookTitle || metadata.title || "Cover"} 
                    fill 
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="200px"
                  />
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-primary/90 text-white backdrop-blur-sm border-none shadow-lg">
                      {metadata.genre}
                    </Badge>
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-3 mb-6">
                 <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-primary">
                   <Bookmark className="h-3.5 w-3.5" />
                   Chapter {ch.chapterNumber}
                 </div>
                 <span className="text-xs text-muted-foreground/40 font-bold">•</span>
                 <span className="text-xs font-bold text-muted-foreground/60">
                   Part {ch.chapterNumber} of {totalChapters}
                 </span>
              </div>

              <h2 className="text-4xl sm:text-5xl font-headline font-bold mb-8 leading-tight">
                {ch.title || `Chapter ${ch.chapterNumber}`}
              </h2>
            </header>

            <div className="prose prose-slate dark:prose-invert max-w-none text-xl leading-relaxed font-serif">
              {(ch.content || '').split('\n\n').map((para: string, idx: number) => {
                const cleanPara = para.replace(/<[^>]*>?/gm, '').trim();
                if (!cleanPara) return null;
                return (
                  <p key={idx} className="mb-8 first-letter:text-4xl first-letter:font-black first-letter:text-primary first-letter:float-left first-letter:mr-3 first-letter:mt-1">
                    {cleanPara}
                  </p>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      <nav className="chapter-nav mt-32 pt-16 border-t flex flex-col sm:flex-row items-center justify-between gap-8">
        <Button 
          variant="outline" 
          className="w-full sm:w-auto px-12 py-8 rounded-2xl border-primary/20 hover:bg-primary/5 group text-lg font-bold"
          disabled={prevNum < 1}
          asChild={prevNum >= 1}
        >
          {prevNum >= 1 ? (
            <Link href={`/pages/${id}/${prevNum}`}>
              <ChevronLeft className="mr-3 h-5 w-5 group-hover:-translate-x-1 transition-transform" />
              Previous
            </Link>
          ) : (
            <span>Beginning</span>
          )}
        </Button>

        <div className="text-center px-6">
           <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">
             End of Book Navigation
           </span>
        </div>

        <Button 
          variant="default" 
          className="w-full sm:w-auto px-12 py-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl group text-lg font-bold"
          disabled={nextNum > totalChapters}
          asChild={nextNum <= totalChapters}
        >
          {nextNum <= totalChapters ? (
            <Link href={`/pages/${id}/${nextNum}`}>
              Next Chapter
              <ChevronRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          ) : (
            <span>The End</span>
          )}
        </Button>
      </nav>
    </div>
  );
}
