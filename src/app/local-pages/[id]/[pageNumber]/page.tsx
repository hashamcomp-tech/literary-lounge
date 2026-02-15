'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Loader2, BookX, ChevronLeft, ChevronRight, HardDrive, ArrowLeft, Navigation, Sun, Moon, Volume2 } from 'lucide-react';
import { getLocalBook, getLocalChapters, saveLocalProgress } from '@/lib/local-library';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTheme } from 'next-themes';
import { playTextToSpeech } from '@/lib/tts-service';

export default function LocalReader() {
  const { id, pageNumber } = useParams() as { id: string; pageNumber: string };
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const currentChapterNum = parseInt(pageNumber);
  
  const [novelData, setNovelData] = useState<any>(null);
  const [allChapters, setAllChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const handleReadAloud = async () => {
    const chapter = allChapters.find(ch => ch.chapterNumber === currentChapterNum);
    if (!chapter?.content) return;
    
    setIsSpeaking(true);
    // Strip HTML tags
    const plainText = chapter.content.replace(/<[^>]*>?/gm, '');
    await playTextToSpeech(plainText);
    setIsSpeaking(false);
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

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background transition-colors duration-300">
      <Navbar />
      
      <main className="flex-1 max-w-[700px] mx-auto px-5 py-10 font-body text-[18px] leading-[1.6] text-foreground transition-colors duration-300">
        <header className="mb-10 text-center sm:text-left">
          <div className="flex items-center justify-between mb-8">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => router.back()}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                className={`rounded-full shadow-sm transition-colors ${isSpeaking ? 'bg-primary text-primary-foreground border-primary' : 'text-primary border-primary/20 hover:bg-primary/5'}`}
                onClick={handleReadAloud}
                disabled={isSpeaking}
                title="Read Aloud"
              >
                <Volume2 className={`h-4 w-4 ${isSpeaking ? 'animate-pulse' : ''}`} />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
                className="rounded-full"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4 text-orange-400" /> : <Moon className="h-4 w-4 text-indigo-400" />}
              </Button>
            </div>
          </div>
          
          <div className="space-y-4">
            <Badge variant="outline" className="border-amber-500/20 text-amber-600 bg-amber-500/5 uppercase tracking-widest gap-2 px-3 py-0.5 text-[10px]">
              <HardDrive className="h-3 w-3" /> Private Collection
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-headline font-black leading-tight tracking-tight mb-2">
              {novelData?.title || 'Untitled Novel'}
            </h1>
            <p className="text-lg text-muted-foreground">By {novelData?.author || 'Unknown Author'}</p>
          </div>
        </header>

        <article id={`chapter-${chapter.chapterNumber}`} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <header className="mb-8 border-b pb-8">
            <h2 className="text-3xl font-headline font-bold text-primary">
              Chapter {chapter.chapterNumber}{chapter.title ? `: ${chapter.title}` : ''}
            </h2>
          </header>

          <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] leading-[1.6]">
            {(chapter.content || '').split(/<p>|\n\n/).map((para: string, idx: number) => {
               const clean = para.replace(/<\/p>|<[^>]*>?/gm, '').trim();
               if (!clean) return null;
               return <p key={idx} className="mb-6 first-letter:text-2xl first-letter:font-black first-letter:text-primary first-letter:float-left first-letter:mr-2">{clean}</p>
            })}
          </div>
        </article>

        <section className="mt-16 pt-10 border-t space-y-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <nav className="chapter-nav flex items-center justify-between gap-4">
              <Button 
                variant="outline" 
                className="h-10 px-6 rounded-xl border-primary/20 font-bold"
                disabled={currentChapterNum <= 1}
                onClick={() => router.push(`/local-pages/${id}/${currentChapterNum - 1}`)}
              >
                <ChevronLeft className="h-4 w-4 mr-2" /> Prev
              </Button>
              
              <div className="text-center min-w-[60px]">
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
          </div>
        </section>
      </main>
    </div>
  );
}
