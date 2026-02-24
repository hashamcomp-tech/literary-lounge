'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Loader2, BookX, ChevronLeft, ChevronRight, HardDrive, ArrowLeft, Sun, Moon, Volume2, Square, Layers, Bookmark, Menu } from 'lucide-react';
import { getLocalBook, getLocalChapters, saveLocalProgress } from '@/lib/local-library';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTheme } from 'next-themes';
import { playTextToSpeech, stopTextToSpeech, isSpeaking as isSpeakingService, chunkText } from '@/lib/tts-service';
import { VoiceSettingsPopover } from '@/components/voice-settings-popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function LocalReader() {
  const { id, pageNumber } = useParams() as { id: string; pageNumber: string };
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const currentChapterNum = parseInt(pageNumber);
  
  const [novelData, setNovelData] = useState<any>(null);
  const [allChapters, setAllChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [mergedRange, setMergedRange] = useState<number[]>([]);
  const [isMerging, setIsMerging] = useState(false);

  const scrollRestoredRef = useRef<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('lounge-voice-settings');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        setHighlightEnabled(parsed.highlightEnabled ?? true);
        setAutoScrollEnabled(parsed.autoScrollEnabled ?? false);
        setScrollSpeed(parsed.scrollSpeed ?? 1);
      } catch (e) {}
    }

    const handleSettingsChange = (e: any) => {
      setHighlightEnabled(e.detail.highlightEnabled);
      setAutoScrollEnabled(e.detail.autoScrollEnabled);
      setScrollSpeed(e.detail.scrollSpeed);
    };
    window.addEventListener('lounge-voice-settings-changed', handleSettingsChange);

    // Scroll Persistence: Save
    const handleScroll = () => {
      if (loading) return;
      localStorage.setItem(`lounge-scroll-${id}`, window.scrollY.toString());
    };

    let scrollTimeout: NodeJS.Timeout;
    const debouncedScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScroll, 500);
    };

    window.addEventListener('scroll', debouncedScroll);

    return () => {
      stopTextToSpeech();
      window.removeEventListener('lounge-voice-settings-changed', handleSettingsChange);
      window.removeEventListener('scroll', debouncedScroll);
    };
  }, [id, loading]);

  // Auto Scroll Engine
  useEffect(() => {
    if (!autoScrollEnabled || loading) return;

    let lastTime = performance.now();
    const scroll = (time: number) => {
      if (!autoScrollEnabled) return;
      const delta = time - lastTime;
      lastTime = time;
      
      // Speed mapping: 1 = ~12px/sec, 10 = ~120px/sec
      const pixelsPerMs = (scrollSpeed * 12) / 1000;
      window.scrollBy(0, pixelsPerMs * delta);
      
      requestAnimationFrame(scroll);
    };

    const animationId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animationId);
  }, [autoScrollEnabled, scrollSpeed, loading]);

  useEffect(() => {
    const interval = setInterval(() => {
      const active = isSpeakingService();
      if (active !== isSpeaking) {
        setIsSpeaking(active);
        if (!active) setActiveIndex(null);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [isSpeaking]);

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

          const exists = sorted.some(ch => Number(ch.chapterNumber) === currentChapterNum);
          if (!exists && sorted.length > 0) {
            router.replace(`/local-pages/${id}/${sorted[0].chapterNumber}`);
          }
        }
      } catch (error) {
        console.error("Failed to load local novel", error);
      } finally {
        setLoading(false);
      }
    };
    loadLocalData();
    stopTextToSpeech();
    setMergedRange([currentChapterNum]);
    scrollRestoredRef.current = false;
  }, [id, currentChapterNum]);

  // Scroll Restoration Logic
  useEffect(() => {
    if (!loading && !scrollRestoredRef.current && mounted) {
      const savedScroll = localStorage.getItem(`lounge-scroll-${id}`);
      const savedProgress = localStorage.getItem(`lounge-progress-${id}`);
      
      if (savedScroll && savedProgress && parseInt(savedProgress) === currentChapterNum) {
        setTimeout(() => {
          window.scrollTo({
            top: parseInt(savedScroll),
            behavior: 'smooth'
          });
          scrollRestoredRef.current = true;
        }, 100);
      } else {
        window.scrollTo(0, 0);
        scrollRestoredRef.current = true;
      }
    }
  }, [loading, id, currentChapterNum, mounted]);

  useEffect(() => {
    if (currentChapterNum && id) {
      saveLocalProgress(id, currentChapterNum).catch(() => {});
    }
  }, [id, currentChapterNum]);

  const handleMergeNext = () => {
    setIsMerging(true);
    const start = Math.max(...mergedRange) + 1;
    const end = start + 9;
    const nextBatch = Array.from({ length: end - start + 1 }, (_, i) => start + i)
      .filter(num => allChapters.some(ch => Number(ch.chapterNumber) === num));
    
    setMergedRange(prev => [...prev, ...nextBatch].sort((a, b) => a - b));
    setIsMerging(false);
  };

  const mergedSegments = useMemo(() => {
    const segments: { text: string; chapterNum: number; globalIndex: number }[] = [];
    let globalCounter = 0;
    mergedRange.forEach(num => {
      const ch = allChapters.find(c => Number(c.chapterNumber) === num);
      if (ch) {
        const titleText = `Chapter ${num}. ${ch.title || ''}. `;
        segments.push({ text: titleText, chapterNum: num, globalIndex: globalCounter++ });
        const contentChunks = chunkText(ch.content || '');
        contentChunks.forEach(chunk => {
          segments.push({ text: chunk, chapterNum: num, globalIndex: globalCounter++ });
        });
      }
    });
    return segments;
  }, [mergedRange, allChapters]);

  const handleReadAloud = async (charOffset?: number) => {
    if (isSpeaking && charOffset === undefined) {
      stopTextToSpeech();
      return;
    }

    const sentences = mergedSegments.map(s => s.text);
    if (sentences.length === 0) return;
    
    const saved = localStorage.getItem('lounge-voice-settings');
    const voiceOptions = saved ? JSON.parse(saved) : {};
    
    playTextToSpeech(sentences, { 
      voice: voiceOptions.voice,
      rate: voiceOptions.rate || 1.0,
      contextId: `local-${id}-${currentChapterNum}-merged-${mergedRange.length}`,
      charOffset,
      onChunkStart: (index) => setActiveIndex(index)
    });
  };

  const handleJumpToSegment = (globalIndex: number) => {
    let offset = 0;
    for (let i = 0; i < globalIndex; i++) {
      offset += mergedSegments[i].text.length + 1;
    }
    handleReadAloud(offset);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Reading Archive...</p>
        </div>
      </div>
    );
  }

  const firstChapter = allChapters.find(ch => Number(ch.chapterNumber) === currentChapterNum);

  if (!firstChapter) {
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

  return (
    <div className="min-h-screen flex flex-col bg-background transition-colors duration-300">
      <Navbar />
      
      <main className="flex-1 max-w-[700px] mx-auto px-5 py-10 selection:bg-primary/20">
        <header className="mb-10">
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
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
                className="rounded-full shadow-sm"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4 text-orange-400" /> : <Moon className="h-4 w-4 text-indigo-400" />}
              </Button>
              
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-full shadow-sm">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="rounded-l-3xl border-none shadow-2xl w-80">
                  <SheetHeader>
                    <SheetTitle className="font-headline font-black text-2xl truncate">{novelData?.title || 'Archive TOC'}</SheetTitle>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(100vh-120px)] mt-6">
                    <div className="space-y-1">
                      {allChapters.map((ch) => (
                        <Button
                          key={ch.chapterNumber}
                          variant={currentChapterNum === Number(ch.chapterNumber) ? "secondary" : "ghost"}
                          className={`w-full justify-start text-left rounded-xl h-auto py-3 px-4 ${currentChapterNum === Number(ch.chapterNumber) ? 'bg-primary/10 text-primary font-bold shadow-sm' : 'hover:bg-muted/50'}`}
                          onClick={() => {
                            router.push(`/local-pages/${id}/${ch.chapterNumber}`);
                          }}
                        >
                          <span className={`text-[10px] font-mono mr-3 shrink-0 ${currentChapterNum === Number(ch.chapterNumber) ? 'text-primary' : 'opacity-30'}`}>
                            {ch.chapterNumber.toString().padStart(2, '0')}
                          </span>
                          <span className="truncate text-sm">{ch.title || `Chapter ${ch.chapterNumber}`}</span>
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            </div>
          </div>
          
          <div className="space-y-6 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <Badge variant="outline" className="border-amber-500/20 text-amber-600 bg-amber-500/5 uppercase tracking-widest gap-2 px-3 py-1 text-[10px] font-black">
                <HardDrive className="h-3 w-3" /> Archive
              </Badge>
              <Badge variant="secondary" className="bg-primary/5 text-primary border-none uppercase text-[10px] font-black px-3 py-1">{novelData?.genre || 'Novel'}</Badge>
            </div>
            <h1 className="text-5xl sm:text-6xl font-headline font-black leading-tight tracking-tight">
              {novelData?.title || 'Untitled'}
            </h1>
            <p className="text-xl text-muted-foreground italic font-medium opacity-80">By {novelData?.author || 'Unknown'}</p>
          </div>
        </header>

        <div className="space-y-20">
          {mergedRange.map((num) => {
            const ch = allChapters.find(c => Number(c.chapterNumber) === num);
            if (!ch) return null;
            
            const chTitleSegment = mergedSegments.find(s => s.chapterNum === num && s.text.startsWith(`Chapter ${num}`));
            const chContentSegments = mergedSegments.filter(s => s.chapterNum === num && !s.text.startsWith(`Chapter ${num}`));

            return (
              <article key={num} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <header className="mb-10 border-b border-border/50 pb-10">
                  <div className="text-xs font-black uppercase tracking-[0.3em] text-primary/60 mb-4">
                    Chapter {num}
                  </div>
                  <h2 
                    className={cn(
                      "text-4xl font-headline font-black text-primary leading-tight cursor-pointer transition-all duration-300 rounded px-1",
                      highlightEnabled && activeIndex === chTitleSegment?.globalIndex ? "bg-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)]" : "hover:text-primary/80"
                    )}
                    onClick={() => chTitleSegment && handleJumpToSegment(chTitleSegment.globalIndex)}
                  >
                    {ch.title || `Chapter ${num}`}
                  </h2>
                </header>

                <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] leading-[1.6] text-foreground/90 font-body">
                  {chContentSegments.map((seg) => (
                    <span 
                      key={seg.globalIndex}
                      className={cn(
                        "block mb-8 cursor-pointer transition-all duration-300 rounded px-1",
                        highlightEnabled && activeIndex === seg.globalIndex ? "bg-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)] scale-[1.01]" : "hover:text-foreground"
                      )}
                      onClick={() => handleJumpToSegment(seg.globalIndex)}
                    >
                      {seg.text}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>

        <section className="mt-20 pt-12 border-t border-border/50 space-y-8">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              variant="outline" 
              className="rounded-2xl h-14 px-8 font-black uppercase text-[10px] tracking-widest gap-2 w-full sm:w-auto"
              onClick={handleMergeNext}
              disabled={isMerging || Math.max(...mergedRange) >= Math.max(...allChapters.map(c => Number(c.chapterNumber)))}
            >
              {isMerging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              Merge Next 10 Chapters
            </Button>
          </div>

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
                   {mergedRange.length > 1 ? `${Math.min(...mergedRange)}-${Math.max(...mergedRange)}` : currentChapterNum} / {allChapters.length}
                 </span>
              </div>

              <Button 
                variant="default" 
                className="h-12 px-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl font-black text-xs uppercase tracking-widest"
                disabled={Math.max(...mergedRange) >= Math.max(...allChapters.map(c => Number(c.chapterNumber)))}
                onClick={() => router.push(`/local-pages/${id}/${Math.max(...mergedRange) + 1}`)}
              >
                Next <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </nav>
          </div>
        </section>
      </main>

      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-card/80 backdrop-blur-md border border-border/50 p-2 rounded-full shadow-2xl animate-in slide-in-from-right-4 duration-500">
        <VoiceSettingsPopover />
        <Button 
          variant="default" 
          size="icon" 
          className={`h-10 w-10 rounded-full shadow-lg transition-all active:scale-95 ${isSpeaking ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'}`}
          onClick={() => handleReadAloud()} 
          title={isSpeaking ? "Stop Narration" : "Read Aloud"}
        >
          {isSpeaking ? <Square className="h-4 w-4 fill-current" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
