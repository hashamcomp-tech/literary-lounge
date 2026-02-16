'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Loader2, BookX, ChevronLeft, ChevronRight, HardDrive, ArrowLeft, Sun, Moon, Volume2 } from 'lucide-react';
import { getLocalBook, getLocalChapters, saveLocalProgress } from '@/lib/local-library';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTheme } from 'next-themes';
import { playTextToSpeech } from '@/lib/tts-service';
import { useToast } from '@/hooks/use-toast';

/**
 * @fileOverview Refined Local Reader Component.
 * Optimized for 700px width, 18px Literata typography, and resilient HTML content rendering.
 */
export default function LocalReader() {
  const { id, pageNumber } = useParams() as { id: string; pageNumber: string };
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
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

  // Fetch book and all chapters once
  useEffect(() => {
    const loadLocalData = async () => {
      setLoading(true);
      try {
        const book = await getLocalBook(id);
        if (book) {
          setNovelData(book);
          const chapters = await getLocalChapters(id);
          const sorted = chapters.sort((a: any, b: any) => 
            (Number(a.chapterNumber) || 0) - (Number(b.chapterNumber) || 0)
          );
          setAllChapters(sorted);
        }
      } catch (error) {
        console.error("Failed to load local novel archive", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadLocalData();
  }, [id]);

  // Save progress when chapter changes
  useEffect(() => {
    if (currentChapterNum && id) {
      saveLocalProgress(id, currentChapterNum).catch(() => {});
    }
  }, [id, currentChapterNum]);

  const handleReadAloud = async () => {
    const chapter = allChapters.find(ch => Number(ch.chapterNumber) === currentChapterNum);
    if (!chapter?.content) return;
    
    setIsSpeaking(true);
    try {
      // Robust plain text extraction for TTS
      const plainText = chapter.content
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>?/gm, '')
        .trim();
      await playTextToSpeech(plainText);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Speech Error",
        description: err.message || "Failed to generate speech."
      });
    } finally {
      setIsSpeaking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Accessing Archive...</p>
        </div>
      </div>
    );
  }

  // Find chapter using type-agnostic matching
  const chapter = allChapters.find(ch => Number(ch.chapterNumber) === currentChapterNum);

  if (!chapter) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
          <h1 className="text-4xl font-headline font-black mb-4">Volume Not Found</h1>
          <p className="text-muted-foreground max-w-md mb-8">This manuscript or chapter isn't available in your local archive.</p>
          <Button variant="outline" className="rounded-2xl h-12 px-8 font-bold" onClick={() => router.push('/')}>
             Return to Library
          </Button>
        </div>
      </div>
    );
  }

  if (!mounted) return null;

  // Process HTML content into clean paragraphs for the premium reader look
  const paragraphs = (chapter.content || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/<\/p>|<div>|<\/div>|\n\n|\r\n/)
    .map(p => p.replace(/<[^>]*>?/gm, '').trim())
    .filter(p => p.length > 0);

  return (
    <div className="min-h-screen flex flex-col bg-background transition-colors duration-300">
      <Navbar />
      
      <main className="flex-1 max-w-[700px] mx-auto px-5 py-10 selection:bg-primary/20 selection:text-primary">
        <header className="mb-10 text-center sm:text-left">
          <div className="flex items-center justify-between mb-8">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => router.back()}
              className="text-muted-foreground hover:text-primary transition-colors group"
            >
              <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
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
                className="rounded-full shadow-sm"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4 text-orange-400" /> : <Moon className="h-4 w-4 text-indigo-400" />}
              </Button>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <Badge variant="outline" className="border-amber-500/20 text-amber-600 bg-amber-500/5 uppercase tracking-widest gap-2 px-3 py-1 text-[10px] font-black">
                <HardDrive className="h-3 w-3" /> Private Archive
              </Badge>
              <Badge variant="secondary" className="bg-primary/5 text-primary border-none uppercase text-[10px] font-black px-3 py-1">{novelData?.genre || 'Novel'}</Badge>
            </div>
            <h1 className="text-5xl sm:text-6xl font-headline font-black leading-tight tracking-tight">
              {novelData?.title || 'Untitled Manuscript'}
            </h1>
            <p className="text-xl text-muted-foreground italic font-medium opacity-80">By {novelData?.author || 'Unknown Author'}</p>
          </div>
        </header>

        <article id={`chapter-${currentChapterNum}`} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <header className="mb-10 border-b border-border/50 pb-10">
            <div className="text-xs font-black uppercase tracking-[0.3em] text-primary/60 mb-4">
              Chapter {currentChapterNum}
            </div>
            <h2 className="text-4xl font-headline font-black text-primary leading-tight">
              {chapter.title || `Chapter ${currentChapterNum}`}
            </h2>
          </header>

          <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] leading-[1.6] text-foreground/90 font-body">
            {paragraphs.map((cleanPara: string, idx: number) => (
               <p key={idx} className="mb-8 first-letter:text-3xl first-letter:font-black first-letter:text-primary first-letter:float-left first-letter:mr-2 first-letter:mt-1">
                 {cleanPara}
               </p>
            ))}
          </div>
        </article>

        <section className="mt-20 pt-12 border-t border-border/50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
            <nav className="chapter-nav flex items-center justify-between gap-6 w-full sm:w-auto">
              <Button 
                variant="outline" 
                className="h-12 px-8 rounded-2xl border-primary/20 font-black text-xs uppercase tracking-widest shadow-sm"
                disabled={currentChapterNum <= 1}
                onClick={() => router.push(`/local-pages/${id}/${currentChapterNum - 1}`)}
              >
                <ChevronLeft className="h-4 w-4 mr-2" /> Prev
              </Button>
              
              <div className="text-center min-w-[80px]">
                 <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">
                   {currentChapterNum} / {allChapters.length}
                 </span>
              </div>

              <Button 
                variant="default" 
                className="h-12 px-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl font-black text-xs uppercase tracking-widest"
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
