
"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { ReaderControls } from '@/components/reader-controls';
import Navbar from '@/components/navbar';
import { Loader2, BookX } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export default function CloudReader() {
  const { id, chapterNumber } = useParams() as { id: string; chapterNumber: string };
  const db = useFirestore();
  const router = useRouter();
  
  const [chapter, setChapter] = useState<any>(null);
  const [totalChapters, setTotalChapters] = useState(1);
  const [loading, setLoading] = useState(true);
  
  const [fontSize, setFontSize] = useState(18);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (!db || !id) return;

    const fetchData = async () => {
      setLoading(true);
      
      // Get Novel Metadata to find total chapters
      const bookRef = doc(db, 'books', id);
      getDoc(bookRef).then((snapshot) => {
        if (snapshot.exists()) {
          setTotalChapters(snapshot.data().totalChapters || 1);
        }
      });

      // Get Current Chapter
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
    };
    
    fetchData();
  }, [id, chapterNumber, db]);

  const goToChapter = (index: number) => {
    const n = index + 1;
    if (n < 1 || n > totalChapters) return;
    router.push(`/pages/${id}/${n}`);
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
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-background'}`}>
      <Navbar />
      <main className="flex-1 container max-w-3xl mx-auto px-4 py-12">
        <article className="mb-20">
          <header className="mb-12 text-center">
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
          <ReaderControls 
            chapterNumber={chapter.chapterNumber} 
            totalChapters={totalChapters} 
            onChapterChange={goToChapter}
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
