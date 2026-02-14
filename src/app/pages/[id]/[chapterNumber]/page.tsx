
"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc, collection, query, orderBy } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { ReaderControls } from '@/components/reader-controls';
import Navbar from '@/components/navbar';
import { Loader2, BookX, ChevronLeft, ChevronRight } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export default function CloudReader() {
  const { id, chapterNumber } = useParams() as { id: string; chapterNumber: string };
  const db = useFirestore();
  const router = useRouter();
  
  const [chapter, setChapter] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [fontSize, setFontSize] = useState(18);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Fetch Metadata from /books/{id}/metadata/info
  useEffect(() => {
    if (!db || !id) return;
    const metaRef = doc(db, 'books', id, 'metadata', 'info');
    getDoc(metaRef).then((snapshot) => {
      if (snapshot.exists()) {
        setMetadata(snapshot.data());
      }
    });
  }, [db, id]);

  // Fetch Current Chapter from /books/{id}/chapters/{num}
  useEffect(() => {
    if (!db || !id) return;
    setLoading(true);
    const chapterRef = doc(db, 'books', id, 'chapters', chapterNumber);
    getDoc(chapterRef)
      .then((snapshot) => {
        if (snapshot.exists()) {
          setChapter(snapshot.data());
        } else {
          setChapter(null);
        }
        setLoading(false);
      })
      .catch(async (err) => {
        const permissionError = new FirestorePermissionError({
          path: chapterRef.path,
          operation: 'get',
        });
        errorEmitter.emit('permission-error', permissionError);
        setLoading(false);
      });
  }, [id, chapterNumber, db]);

  // Fetch All Chapters for Navigation from /books/{id}/chapters
  const chaptersQuery = useMemoFirebase(() => {
    if (!db || !id) return null;
    return query(collection(db, 'books', id, 'chapters'), orderBy('chapterNumber', 'asc'));
  }, [db, id]);

  const { data: allChapters, isLoading: chaptersLoading } = useCollection(chaptersQuery);

  const goToChapter = (num: number) => {
    router.push(`/pages/${id}/${num}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
          <h1 className="text-3xl font-headline font-bold mb-2">Chapter Not Found</h1>
          <p className="text-muted-foreground max-w-md">
            We couldn't locate chapter {chapterNumber} for this book.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => router.push('/')}>
            Back to Library
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-background'}`}>
      <Navbar />
      
      {/* Chapter Navigation Bar */}
      <div className="border-b bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="container max-w-5xl mx-auto px-4">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex items-center gap-2 py-3">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-2">Chapters:</span>
              {allChapters?.map((ch) => (
                <Button
                  key={ch.id}
                  variant={parseInt(chapterNumber) === ch.chapterNumber ? "default" : "ghost"}
                  size="sm"
                  className="rounded-full h-8 px-4"
                  onClick={() => goToChapter(ch.chapterNumber)}
                >
                  {ch.chapterNumber}
                </Button>
              ))}
              {chaptersLoading && <Loader2 className="h-4 w-4 animate-spin opacity-20" />}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>

      <main className="flex-1 container max-w-3xl mx-auto px-4 py-12">
        <article className="mb-20">
          <header className="mb-12 text-center">
            <p className="text-xs uppercase tracking-widest font-bold text-primary mb-2">
              {metadata?.bookTitle || 'Cloud Novel'}
            </p>
            <h1 className="text-4xl font-headline font-black mb-4">
              {chapter.title || `Chapter ${chapter.chapterNumber}`}
            </h1>
            <div className="h-1 w-24 bg-primary mx-auto rounded-full" />
          </header>
          
          <div 
            className="prose prose-slate dark:prose-invert max-w-none leading-relaxed select-text"
            style={{ fontSize: `${fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: chapter.content || '<p>No content found.</p>' }}
          />
        </article>

        <section className="pb-12 border-t pt-12">
          <div className="flex items-center justify-between mb-8">
             <Button 
                variant="outline" 
                disabled={parseInt(chapterNumber) <= 1}
                onClick={() => goToChapter(parseInt(chapterNumber) - 1)}
                className="gap-2 rounded-xl"
             >
                <ChevronLeft className="h-4 w-4" /> Previous
             </Button>
             <Button 
                variant="default" 
                disabled={allChapters && parseInt(chapterNumber) >= allChapters.length}
                onClick={() => goToChapter(parseInt(chapterNumber) + 1)}
                className="gap-2 rounded-xl bg-primary"
             >
                Next <ChevronRight className="h-4 w-4" />
             </Button>
          </div>

          <ReaderControls 
            chapterNumber={parseInt(chapterNumber)} 
            totalChapters={metadata?.totalChapters || allChapters?.length || parseInt(chapterNumber)} 
            onChapterChange={(index) => goToChapter(index + 1)}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            isDarkMode={isDarkMode}
            onDarkModeToggle={() => setIsDarkMode(!isDarkMode)}
          />
        </section>
      </main>
    </div>
  );
}
