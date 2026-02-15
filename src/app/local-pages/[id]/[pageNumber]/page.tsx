"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ReaderControls } from '@/components/reader-controls';
import Navbar from '@/components/navbar';
import { Loader2, BookX, ChevronLeft, ChevronRight, HardDrive, ArrowLeft } from 'lucide-react';
import { getLocalBook, getLocalChapters, saveLocalProgress } from '@/lib/local-library';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

/**
 * @fileOverview Chapter Display Component for Local/Private Novels.
 * Implements semantic <article> and paragraph structure.
 * Fetches content from IndexedDB (Browser Local Storage).
 */
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
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
          <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">Loading Private Archive...</p>
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
          <h1 className="text-3xl font-headline font-black mb-2">Content Not Found</h1>
          <p className="text-muted-foreground max-w-md mb-8">We couldn't locate this page in your local library.</p>
          <Button variant="outline" className="rounded-xl" onClick={() => router.push('/')}>
             Return to Library
          </Button>
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
          
          <div className="flex justify-center mb-8">
             <Badge variant="outline" className="border-amber-500/20 text-amber-600 bg-amber-500/5 uppercase tracking-widest gap-2 px-4 py-1">
               <HardDrive className="h-3 w-3" /> Local Private Collection
             </Badge>
          </div>
        </header>

        {/* Chapters as semantic articles */}
        <div className="space-y-20">
          {chapters.map((ch) => (
            <article key={ch.chapterNumber} id={`chapter-${ch.chapterNumber}`} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <header className="mb-16 flex flex-col items-center text-center">
                {novelData?.coverURL && (
                  <div className="relative w-[180px] h-[260px] mb-10 shadow-2xl rounded-2xl overflow-hidden border border-border/50">
                    <Image 
                      src={novelData.coverURL} 
                      alt={novelData.title || "Cover"} 
                      fill 
                      className="object-cover"
                      sizes="180px"
                    />
                  </div>
                )}
                <p className="text-xl text-muted-foreground mb-6">By {novelData.author}</p>
                <h2 className="text-2xl font-headline font-bold text-primary mb-8">
                  Chapter {ch.chapterNumber}{ch.title ? `: ${ch.title}` : ''}
                </h2>
                <div className="h-1.5 w-24 bg-primary/40 mx-auto rounded-full" />
              </header>

              <div 
                className="prose prose-slate dark:prose-invert max-w-none text-xl leading-relaxed font-serif"
                style={{ fontSize: `${fontSize}px` }}
              >
                {(ch.content || '').split(/<p>|\n\n/).map((para: string, idx: number) => {
                   const clean = para.replace(/<\/p>|<[^>]*>?/gm, '').trim();
                   if (!clean) return null;
                   return <p key={idx} className="mb-8 first-letter:text-3xl first-letter:font-black first-letter:text-primary first-letter:float-left first-letter:mr-3">{clean}</p>
                })}
              </div>
            </article>
          ))}
        </div>

        {/* Semantic navigation structure */}
        <nav className="chapter-nav flex flex-col sm:flex-row items-center justify-between mt-24 py-12 border-t gap-6">
          <Button variant="outline" disabled={prevNum < 1} asChild={prevNum >= 1} className="w-full sm:w-auto px-10 py-7 rounded-2xl border-primary/20 text-lg font-bold">
            {prevNum >= 1 ? <Link href={`/local-pages/${id}/${prevNum}`}><ChevronLeft className="h-5 w-5 mr-3" /> Previous</Link> : <span>Beginning</span>}
          </Button>
          
          <div className="text-center px-6">
             <span className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground/60">
               {parseInt(pageNumber)} / {totalChapters} Chapters
             </span>
          </div>

          <Button variant="default" disabled={nextNum > totalChapters} asChild={nextNum <= totalChapters} className="w-full sm:w-auto px-10 py-7 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl text-lg font-bold">
            {nextNum <= totalChapters ? <Link href={`/local-pages/${id}/${nextNum}`}>Next <ChevronRight className="h-5 w-5 ml-3" /></Link> : <span>The End</span>}
          </Button>
        </nav>

        <section className="pt-20 border-t">
          <div className="max-w-xl mx-auto">
            <ReaderControls 
              chapterNumber={parseInt(pageNumber)} 
              totalChapters={totalChapters} 
              onChapterChange={goToPage}
              fontSize={fontSize}
              onFontSizeChange={setFontSize}
              isDarkMode={isDarkMode}
              onDarkModeToggle={() => setIsDarkMode(!isDarkMode)}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
