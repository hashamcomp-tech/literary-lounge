'use client';

import { useEffect, useState } from 'react';
import { doc, collection, query, orderBy, getDoc, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * @fileOverview Chapter Display Component.
 * Implements the requested <article> and <nav class="chapter-nav"> structure.
 * Fetches chapters from Firestore and renders them semantically.
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
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!firestore || !id) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch Book Metadata
        const metaRef = doc(firestore, 'books', id, 'metadata', 'info');
        const metaSnap = await getDoc(metaRef);
        
        if (!metaSnap.exists()) {
          setError(true);
          setIsLoading(false);
          return;
        }
        setMetadata(metaSnap.data());

        // 2. Fetch Chapters (Current and potentially more for flow)
        const chaptersRef = collection(firestore, 'books', id, 'chapters');
        const q = query(
          chaptersRef, 
          orderBy('chapterNumber', 'asc')
        );
        
        const chaptersSnap = await getDocs(q);
        const fetchedChapters = chaptersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Filter to show current chapter primarily, or a list if requested
        const currentView = fetchedChapters.filter(ch => ch.chapterNumber === currentChapterNum);
        
        if (currentView.length === 0) {
          setError(true);
        } else {
          setChapters(currentView);
        }
      } catch (err) {
        console.error("Cloud reader fetch error:", err);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [firestore, id, currentChapterNum]);

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
        <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
        <h1 className="text-3xl font-headline font-black mb-2">Chapter Not Found</h1>
        <p className="text-muted-foreground max-w-md mb-8">This chapter doesn't seem to exist in the cloud library yet.</p>
        <Button variant="outline" className="rounded-xl" onClick={() => router.push('/')}>
          Return to Library
        </Button>
      </div>
    );
  }

  const prevNum = currentChapterNum - 1;
  const nextNum = currentChapterNum + 1;
  const totalChapters = metadata?.totalChapters || 0;

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-12">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => router.back()}
          className="mb-6 -ml-2 text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </header>

      {/* Chapters as semantic articles */}
      {chapters.map((ch) => (
        <article key={ch.chapterNumber} id={`chapter-${ch.chapterNumber}`} className="mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <header className="mb-12 flex flex-col items-center text-center">
            {metadata?.coverURL && (
              <div className="relative w-[180px] h-[260px] mb-8 shadow-2xl rounded-xl overflow-hidden border border-border/50">
                <Image 
                  src={metadata.coverURL} 
                  alt={metadata.bookTitle || "Cover"} 
                  fill 
                  className="object-cover"
                  sizes="180px"
                />
              </div>
            )}
            
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 uppercase tracking-widest px-3 py-0.5">
                {metadata?.genre || 'Novel'}
              </Badge>
              <Badge variant="secondary" className="bg-muted text-muted-foreground border-none text-[10px] uppercase font-black px-2">
                Cloud
              </Badge>
            </div>

            <h1 className="text-4xl sm:text-5xl font-headline font-black mb-4 leading-tight">
              Chapter {ch.chapterNumber}: {ch.title || 'Untitled'}
            </h1>
            <p className="text-xl text-muted-foreground italic mb-6">By {metadata?.author || 'Unknown'}</p>
            <div className="h-1.5 w-24 bg-primary rounded-full mb-12" />
          </header>

          <div className="prose prose-slate dark:prose-invert max-w-none text-lg leading-relaxed space-y-6">
            {ch.content.split('\n\n').map((p: string, i: number) => (
              <p key={i} className="first-letter:text-2xl first-letter:font-bold first-letter:text-primary/80">
                {p.replace(/<[^>]*>?/gm, '')}
              </p>
            ))}
          </div>
        </article>
      ))}

      {/* Semantic navigation structure */}
      <nav className="chapter-nav mt-16 pt-12 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button 
          variant="outline" 
          className="w-full sm:w-auto px-8 py-6 rounded-2xl border-primary/20 hover:bg-primary/5 group"
          disabled={prevNum < 1}
          asChild={prevNum >= 1}
        >
          {prevNum >= 1 ? (
            <Link href={`/pages/${id}/${prevNum}`}>
              <ChevronLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Previous Chapter
            </Link>
          ) : (
            <span>Beginning</span>
          )}
        </Button>

        <div className="text-center px-4">
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
             {currentChapterNum} / {totalChapters} Chapters
           </span>
        </div>

        <Button 
          variant="default" 
          className="w-full sm:w-auto px-8 py-6 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl group"
          disabled={nextNum > totalChapters}
          asChild={nextNum <= totalChapters}
        >
          {nextNum <= totalChapters ? (
            <Link href={`/pages/${id}/${nextNum}`}>
              Next Chapter
              <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          ) : (
            <span>End of Novel</span>
          )}
        </Button>
      </nav>
    </div>
  );
}
