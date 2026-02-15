"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Loader2, BookX, ChevronLeft, ChevronRight, HardDrive, ArrowLeft, Navigation } from 'lucide-react';
import { getLocalBook, getLocalChapters, saveLocalProgress } from '@/lib/local-library';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export default function LocalReader() {
  const { id, pageNumber } = useParams() as { id: string; pageNumber: string };
  const router = useRouter();
  const currentChapterNum = parseInt(pageNumber);
  
  const [novelData, setNovelData] = useState<any>(null);
  const [allChapters, setAllChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [jumpValue, setJumpValue] = useState('');

  useEffect(() => {
    const loadLocalData = async () => {
      setLoading(true);
      try {
        const book = await getLocalBook(id);
        if (book) {
          setNovelData(book);
          const chapters = await getLocalChapters(id);
          const sorted = chapters.sort((a: any, b: any) => a.chapterNumber - b.chapterNumber);
          setAllChapters(sorted);

          if (currentChapterNum) {
            saveLocalProgress(id, currentChapterNum);
          }
        }
      } catch (error) {
        console.error("Failed to load local novel", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadLocalData();
  }, [id, currentChapterNum]);

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(jumpValue);
    if (!isNaN(num) && num >= 1 && num <= allChapters.length) {
      router.push(`/local-pages/${id}/${num}`);
      setJumpValue('');
    } else {
      alert(`Invalid chapter number. Must be between 1 and ${allChapters.length}`);
    }
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

  const chapter = allChapters.find(ch => ch.chapterNumber === currentChapterNum);

  if (!chapter) {
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container max-w-3xl mx-auto px-4 py-12">
        <header className="mb-12 text-center sm:text-left">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.back()}
            className="mb-6 -ml-2 text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="flex flex-col gap-4">
            <div className="flex justify-center sm:justify-start">
               <Badge variant="outline" className="border-amber-500/20 text-amber-600 bg-amber-500/5 uppercase tracking-widest gap-2 px-4 py-1">
                 <HardDrive className="h-3 w-3" /> Local Private Collection
               </Badge>
            </div>
            <h1 className="text-5xl sm:text-6xl font-headline font-black leading-tight tracking-tight mb-4">
              {novelData?.title || 'Untitled Novel'}
            </h1>
          </div>
        </header>

        <article id={`chapter-${chapter.chapterNumber}`} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <header className="mb-16 flex flex-col items-center text-center">
            <p className="text-xl text-muted-foreground mb-6">By {novelData?.author || 'Unknown Author'}</p>
            <h2 className="text-4xl font-headline font-bold text-primary mb-8">
              Chapter {chapter.chapterNumber}{chapter.title ? `: ${chapter.title}` : ''}
            </h2>
            <div className="h-1.5 w-24 bg-primary/40 mx-auto rounded-full" />
          </header>

          <div className="prose prose-slate dark:prose-invert max-w-none text-xl leading-relaxed font-serif">
            {(chapter.content || '').split(/<p>|\n\n/).map((para: string, idx: number) => {
               const clean = para.replace(/<\/p>|<[^>]*>?/gm, '').trim();
               if (!clean) return null;
               return <p key={idx} className="mb-8 first-letter:text-3xl first-letter:font-black first-letter:text-primary first-letter:float-left first-letter:mr-3">{clean}</p>
            })}
          </div>
        </article>

        <section className="mt-20 py-12 border-t space-y-8">
          <form onSubmit={handleJump} className="flex items-center justify-center gap-2">
            <label htmlFor="localJump" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Jump to chapter:</label>
            <Input 
              id="localJump"
              type="number" 
              min={1} 
              max={allChapters.length}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              className="w-20 rounded-xl"
            />
            <Button type="submit" size="sm" variant="outline" className="rounded-xl">
              <Navigation className="h-4 w-4 mr-2" /> Go
            </Button>
          </form>

          <nav className="chapter-nav flex flex-col sm:flex-row items-center justify-between gap-8">
            <Button 
              variant="outline" 
              className="w-full sm:w-auto px-10 py-7 rounded-2xl border-primary/20 text-lg font-bold"
              disabled={currentChapterNum <= 1}
              onClick={() => router.push(`/local-pages/${id}/${currentChapterNum - 1}`)}
            >
              <ChevronLeft className="h-5 w-5 mr-3" /> Previous
            </Button>
            
            <div className="text-center px-6">
               <span className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground/60">
                 {currentChapterNum} / {allChapters.length} Chapters
               </span>
            </div>

            <Button 
              variant="default" 
              className="w-full sm:w-auto px-10 py-7 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl text-lg font-bold"
              disabled={currentChapterNum >= allChapters.length}
              onClick={() => router.push(`/local-pages/${id}/${currentChapterNum + 1}`)}
            >
              Next <ChevronRight className="h-5 w-5 ml-3" />
            </Button>
          </nav>
        </section>
      </main>
    </div>
  );
}
