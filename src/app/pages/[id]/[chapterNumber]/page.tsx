
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, collection, query, where, orderBy, limit, getDoc, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import Navbar from '@/components/navbar';
import { ReaderControls } from '@/components/reader-controls';
import { BookX, ChevronLeft, ChevronRight, TrendingUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import Link from 'next/link';

export default function CloudReader() {
  const { id, chapterNumber } = useParams() as { id: string; chapterNumber: string };
  const db = useFirestore();
  const router = useRouter();
  
  const currentChapterNum = parseInt(chapterNumber);
  
  const [metadata, setMetadata] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!db || !id || !chapterNumber) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch Metadata
        const metaRef = doc(db, 'books', id, 'metadata', 'info');
        const metaSnap = await getDoc(metaRef);
        
        if (!metaSnap.exists()) {
          setError(true);
          setIsLoading(false);
          return;
        }
        setMetadata(metaSnap.data());

        // 2. Fetch Chapters (Current and Next)
        const chaptersRef = collection(db, 'books', id, 'chapters');
        const q = query(
          chaptersRef, 
          where('chapterNumber', '>=', currentChapterNum),
          orderBy('chapterNumber', 'asc'),
          limit(2)
        );
        
        const chaptersSnap = await getDocs(q);
        const fetchedChapters = chaptersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        if (fetchedChapters.length === 0) {
          setError(true);
        } else {
          setChapters(fetchedChapters);
        }
      } catch (err) {
        console.error("Cloud reader fetch error:", err);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [db, id, chapterNumber, currentChapterNum]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      </div>
    );
  }

  if (error || chapters.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
          <h1 className="text-3xl font-headline font-bold mb-2">Chapter Not Found</h1>
          <p className="text-muted-foreground max-w-md">We couldn't locate this content in the cloud library.</p>
          <Button variant="outline" className="mt-6" asChild>
            <Link href="/">Back to Library</Link>
          </Button>
        </div>
      </div>
    );
  }

  const activeChapter = chapters[0];
  const nextChapter = chapters.length > 1 ? chapters[1] : null;
  const prevNum = currentChapterNum - 1;
  const nextNum = currentChapterNum + 1;
  const hasNext = !!nextChapter || (metadata?.totalChapters && nextNum <= metadata.totalChapters);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container max-w-3xl mx-auto px-4 py-12">
        <div>
          {chapters.map((ch: any) => (
            <article key={ch.chapterNumber} id={`chapter-${ch.chapterNumber}`} className="mb-24 last:mb-0">
              <header className="mb-12 flex flex-col items-center text-center">
                {ch.chapterNumber === currentChapterNum && metadata?.coverURL && (
                  <div className="relative w-[150px] h-[220px] mb-8 shadow-2xl rounded-lg overflow-hidden border border-border/50 animate-in fade-in zoom-in duration-500">
                    <Image 
                      src={metadata.coverURL} 
                      alt={metadata.bookTitle || "Cover"} 
                      fill 
                      className="object-cover"
                      sizes="150px"
                    />
                  </div>
                )}
                
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold tracking-widest px-3">
                    {metadata?.genre || 'Novel'}
                  </Badge>
                  {metadata?.views !== undefined && ch.chapterNumber === currentChapterNum && (
                    <div className="flex items-center gap-1 text-muted-foreground text-xs font-bold">
                      <TrendingUp className="h-3 w-3" /> {metadata.views.toLocaleString()} views
                    </div>
                  )}
                </div>
                
                <p className="text-sm font-headline font-medium text-muted-foreground mb-1">
                  {metadata?.bookTitle || 'Cloud Novel'}
                </p>
                <h1 className="text-4xl font-headline font-black mb-4">
                  Chapter {ch.chapterNumber}: {ch.title || `Chapter ${ch.chapterNumber}`}
                </h1>
                <div className="h-1 w-24 bg-primary mx-auto rounded-full" />
              </header>
              
              <div 
                className="prose prose-slate dark:prose-invert max-w-none leading-relaxed select-text"
                style={{ fontSize: '18px' }}
                dangerouslySetInnerHTML={{ __html: ch.content || '<p>No content found.</p>' }}
              />
            </article>
          ))}

          {nextChapter && (
            <nav className="chapter-nav mt-12 py-12 border-t flex flex-col items-center gap-4">
              <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Continue Reading</p>
              <Button variant="default" className="rounded-2xl h-14 px-8 text-lg font-bold bg-primary hover:bg-primary/90 shadow-xl" asChild>
                <Link href={`/pages/${id}/${nextChapter.chapterNumber}`}>
                  Next Chapter: {nextChapter.title || nextChapter.chapterNumber} <ChevronRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </nav>
          )}

          {!nextChapter && hasNext && (
             <nav className="chapter-nav mt-12 py-12 border-t flex flex-col items-center gap-4">
              <Button variant="default" className="rounded-2xl h-14 px-8 text-lg font-bold bg-primary shadow-xl" asChild>
                <Link href={`/pages/${id}/${nextNum}`}>
                  Load Next Chapter <ChevronRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </nav>
          )}
        </div>

        <section className="pt-20 mt-12 border-t">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-4">
              <Button variant="outline" className="flex-1 rounded-xl h-12" disabled={prevNum < 1} asChild={prevNum >= 1}>
                {prevNum >= 1 ? <Link href={`/pages/${id}/${prevNum}`}><ChevronLeft className="mr-2 h-4 w-4" /> Previous</Link> : <span>First Chapter</span>}
              </Button>
              <Button variant="outline" className="flex-1 rounded-xl h-12" disabled={!hasNext} asChild={hasNext}>
                 {hasNext ? <Link href={`/pages/${id}/${nextNum}`}>Next <ChevronRight className="ml-2 h-4 w-4" /></Link> : <span>End of Book</span>}
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
