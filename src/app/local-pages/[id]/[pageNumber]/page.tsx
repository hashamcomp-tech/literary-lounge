
"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ReaderControls } from '@/components/reader-controls';
import Navbar from '@/components/navbar';
import { Loader2, BookX, ChevronLeft, ChevronRight, HardDrive } from 'lucide-react';
import { getLocalBook, getLocalChapters, saveLocalProgress } from '@/lib/local-library';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export default function LocalReader() {
  const { id, pageNumber } = useParams() as { id: string; pageNumber: string };
  const router = useRouter();
  
  const [novelData, setNovelData] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
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
          const allLocalChapters = await getLocalChapters(id);
          const sorted = allLocalChapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
          setTotalChapters(sorted.length);
          
          const pageNum = parseInt(pageNumber);
          // For local reader, we'll still show one chapter at a time for performance but use the article/nav structure
          const current = sorted.filter(c => c.chapterNumber === pageNum);
          setChapters(current);

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

  if (chapters.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
          <h1 className="text-3xl font-headline font-bold mb-2">Content Not Found</h1>
          <p className="text-muted-foreground max-w-md">We couldn't locate this page in your local library.</p>
        </div>
      </div>
    );
  }

  const prevNum = parseInt(pageNumber) - 1;
  const nextNum = parseInt(pageNumber) + 1;

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-background'}`}>
      <Navbar />
      
      <main className="flex-1 container max-w-3xl mx-auto px-4 py-12">
        <div className="mb-12 flex justify-center">
           <Badge variant="outline" className="border-amber-500/20 text-amber-600 bg-amber-500/5 uppercase tracking-widest gap-2">
             <HardDrive className="h-3 w-3" /> Local Private Collection
           </Badge>
        </div>

        <div>
          {chapters.map((ch) => (
            <article key={ch.chapterNumber} id={`chapter-${ch.chapterNumber}`} className="mb-20">
              <header className="mb-12 flex flex-col items-center text-center">
                {novelData?.coverURL && (
                  <div className="relative w-[150px] h-[220px] mb-8 shadow-2xl rounded-lg overflow-hidden border border-border/50">
                    <Image 
                      src={novelData.coverURL} 
                      alt={novelData.title || "Cover"} 
                      fill 
                      className="object-cover"
                      sizes="150px"
                    />
                  </div>
                )}
                <h1 className="text-4xl font-headline font-black mb-4">
                  {novelData.title}
                </h1>
                <p className="text-muted-foreground mb-4">By {novelData.author}</p>
                <h2 className="text-xl font-headline font-bold text-primary mb-4">
                  Chapter {ch.chapterNumber}: {ch.title || `Chapter ${ch.chapterNumber}`}
                </h2>
                <div className="h-1 w-24 bg-primary mx-auto rounded-full" />
              </header>

              <div 
                className="prose prose-slate dark:prose-invert max-w-none leading-relaxed select-text"
                style={{ fontSize: `${fontSize}px` }}
                dangerouslySetInnerHTML={{ __html: ch.content }}
              />
            </article>
          ))}
        </div>

        <nav className="chapter-nav flex items-center justify-between mb-12 py-8 border-t">
          <div className="flex items-center gap-4 w-full">
            <Button variant="outline" disabled={prevNum < 1} asChild={prevNum >= 1} className="flex-1 rounded-xl h-12">
              {prevNum >= 1 ? <Link href={`/local-pages/${id}/${prevNum}`}><ChevronLeft className="h-4 w-4 mr-2" /> Previous</Link> : <span>Beginning</span>}
            </Button>
            
            <Button variant="default" disabled={nextNum > totalChapters} asChild={nextNum <= totalChapters} className="flex-1 rounded-xl h-12 bg-primary hover:bg-primary/90">
              {nextNum <= totalChapters ? <Link href={`/local-pages/${id}/${nextNum}`}>Next <ChevronRight className="h-4 w-4 ml-2" /></Link> : <span>End Reached</span>}
            </Button>
          </div>
        </nav>

        <section className="pt-12 border-t">
          <ReaderControls 
            chapterNumber={parseInt(pageNumber)} 
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
