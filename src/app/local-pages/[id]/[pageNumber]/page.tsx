"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ReaderControls } from '@/components/reader-controls';
import Navbar from '@/components/navbar';
import { Loader2, BookX } from 'lucide-react';
import { getLocalBook, getLocalChapters, saveLocalProgress } from '@/lib/local-library';

export default function LocalReader() {
  const { id, pageNumber } = useParams() as { id: string; pageNumber: string };
  const router = useRouter();
  
  const [novelData, setNovelData] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<any>(null);
  const [totalChapters, setTotalChapters] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [fontSize, setFontSize] = useState(18);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const loadLocalData = async () => {
      setLoading(true);
      try {
        const book = await getLocalBook(id);
        if (book) {
          setNovelData(book);
          const chapters = await getLocalChapters(id);
          const sortedChapters = chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
          setTotalChapters(sortedChapters.length);
          
          const pageNum = parseInt(pageNumber);
          const page = sortedChapters.find((p: any) => p.chapterNumber === pageNum);
          setCurrentPage(page || null);

          // Save reading progress locally
          if (pageNum) {
            saveLocalProgress(id, pageNum);
          }
        }
      } catch (error) {
        console.error("Failed to load local novel", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadLocalData();
  }, [id, pageNumber]);

  const goToPage = (index: number) => {
    const n = index + 1;
    if (n < 1 || n > totalChapters) return;
    router.push(`/local-pages/${id}/${n}`);
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

  if (!currentPage) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
          <h1 className="text-3xl font-headline font-bold mb-2">Content Not Found</h1>
          <p className="text-muted-foreground max-w-md">
            We couldn't locate this page in your local library.
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
              {novelData.title}
            </h1>
            <p className="text-muted-foreground mb-4">By {novelData.author}</p>
            <h2 className="text-xl font-headline font-bold text-primary mb-4">
              {currentPage.title || `Chapter ${currentPage.chapterNumber}`}
            </h2>
            <div className="h-1 w-24 bg-primary mx-auto rounded-full" />
          </header>

          <div 
            className="prose prose-slate dark:prose-invert max-w-none leading-relaxed select-text"
            style={{ fontSize: `${fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: currentPage.content }}
          />
        </article>

        <section className="pb-12 border-t pt-12">
          <ReaderControls 
            chapterNumber={currentPage.chapterNumber} 
            totalChapters={totalChapters} 
            onChapterChange={goToPage}
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
