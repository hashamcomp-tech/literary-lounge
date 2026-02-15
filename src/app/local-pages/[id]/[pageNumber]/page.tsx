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
          <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">Loading Archive...</p>
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
          <h1 className="text-3xl font-headline font-black mb-2">Not Found</h1>
          <p className="text-muted-foreground max-w-md mb-8">This page isn't in your local library.</p>
          <Button variant="outline" className="rounded-xl" onClick={() => router.push('/')}>
             Return Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 max-w-[700px] mx-auto px-5 py-10 font-body text-[18px] leading-[1.6] text-[#222]">
        <header className="mb-10">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.back()}
            className="mb-8 -ml-2 text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="space-y-2">
            <Badge variant="outline" className="border-amber-500/20 text-amber-600 bg-amber-500/5 uppercase tracking-widest gap-2 px-3 py-0.5 text-[10px]">
              <HardDrive className="h-3 w-3" /> Private Collection
            </Badge>
            <h1 className="text-4xl font-headline font-black leading-tight tracking-tight mb-2">
              {novelData?.title || 'Untitled Novel'}
            </h1>
            <p className="text-lg text-muted-foreground">By {novelData?.author || 'Unknown Author'}</p>
          </div>
        </header>

        <article id={`chapter-${chapter.chapterNumber}`} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <header className="mb-8">
            <h2 className="text-3xl font-headline font-bold text-primary mb-6">
              Chapter {chapter.chapterNumber}{chapter.title ? `: ${chapter.title}` : ''}
            </h2>
          </header>

          <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] leading-[1.6] text-[#222]">
            {(chapter.content || '').split(/<p>|\n\n/).map((para: string, idx: number) => {
               const clean = para.replace(/<\/p>|<[^>]*>?/gm, '').trim();
               if (!clean) return null;
               return <p key={idx} className="mb-6 first-letter:text-2xl first-letter:font-black first-letter:text-primary first-letter:float-left first-letter:mr-2">{clean}</p>
            })}
          </div>
        </article>

        <section className="mt-16 pt-10 border-t space-y-8">
          <form onSubmit={handleJump} className="flex items-center gap-3">
            <label htmlFor="localJump" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Jump to:</label>
            <Input 
              id="localJump"
              type="number" 
              min={1} 
              max={allChapters.length}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              className="w-16 h-8 text-sm rounded-lg"
            />
            <Button type="submit" size="sm" variant="outline" className="h-8 rounded-lg px-3">
              <Navigation className="h-3.5 w-3.5 mr-1.5" /> Go
            </Button>
          </form>

          <nav className="chapter-nav flex items-center justify-between">
            <Button 
              variant="outline" 
              className="h-10 px-6 rounded-xl border-primary/20 font-bold"
              disabled={currentChapterNum <= 1}
              onClick={() => router.push(`/local-pages/${id}/${currentChapterNum - 1}`)}
            >
              <ChevronLeft className="h-4 w-4 mr-2" /> Previous
            </Button>
            
            <div className="text-center px-6">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
                 {currentChapterNum} / {allChapters.length}
               </span>
            </div>

            <Button 
              variant="default" 
              className="h-10 px-6 rounded-xl bg-primary hover:bg-primary/90 shadow-md font-bold"
              disabled={currentChapterNum >= allChapters.length}
              onClick={() => router.push(`/local-pages/${id}/${currentChapterNum + 1}`)}
            >
              Next <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </nav>
        </section>
      </main>
    </div>
  );
}
