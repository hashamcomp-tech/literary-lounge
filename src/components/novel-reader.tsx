"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { Menu, Sun, Moon, ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, Volume2, Square, Bookmark, Layers, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Novel } from '@/lib/mock-data';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import Link from 'next/link';
import { playTextToSpeech, stopTextToSpeech, isSpeaking as isSpeakingService, chunkText } from '@/lib/tts-service';
import { VoiceSettingsPopover } from '@/components/voice-settings-popover';
import { cn } from '@/lib/utils';

interface NovelReaderProps {
  novel: Novel;
}

export default function NovelReader({ novel }: NovelReaderProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user } = useUser();
  const db = useFirestore();
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [mergedRange, setMergedRange] = useState<number[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('lounge-voice-settings');
    if (saved) {
      try { setHighlightEnabled(JSON.parse(saved).highlightEnabled ?? true); } catch (e) {}
    }

    const handleSettingsChange = (e: any) => {
      setHighlightEnabled(e.detail.highlightEnabled);
    };
    window.addEventListener('lounge-voice-settings-changed', handleSettingsChange);
    return () => {
      stopTextToSpeech();
      window.removeEventListener('lounge-voice-settings-changed', handleSettingsChange);
    };
  }, []);

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

  const progress = ((currentChapterIndex + 1) / novel.chapters.length) * 100;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo(0, 0);
    stopTextToSpeech();
    localStorage.setItem(`progress-${novel.id}`, currentChapterIndex.toString());
    setMergedRange([currentChapterIndex]);

    if (user && !user.isAnonymous && db) {
      const historyRef = doc(db, 'users', user.uid, 'history', novel.id);
      const historyData = {
        bookId: novel.id,
        title: novel.title,
        author: novel.author,
        genre: novel.genre,
        coverURL: novel.coverImage,
        lastReadChapter: currentChapterIndex + 1,
        lastReadAt: serverTimestamp(),
        isCloud: false
      };
      
      setDoc(historyRef, historyData, { merge: true }).catch(() => {});
    }
  }, [currentChapterIndex, novel.id, user, db]);

  useEffect(() => {
    const saved = localStorage.getItem(`progress-${novel.id}`);
    if (saved) setCurrentChapterIndex(parseInt(saved));
  }, [novel.id]);

  const handleMergeNext = () => {
    setIsMerging(true);
    const start = Math.max(...mergedRange) + 1;
    const end = start + 9;
    const nextBatch = Array.from({ length: end - start + 1 }, (_, i) => start + i)
      .filter(idx => idx < novel.chapters.length);
    
    setMergedRange(prev => [...prev, ...nextBatch].sort((a, b) => a - b));
    setIsMerging(false);
  };

  const mergedSegments = useMemo(() => {
    const segments: { text: string; chapterIdx: number; globalIndex: number }[] = [];
    let globalCounter = 0;
    mergedRange.forEach(idx => {
      const ch = novel.chapters[idx];
      if (ch) {
        const titleText = `Chapter ${idx + 1}. ${ch.title || ''}. `;
        segments.push({ text: titleText, chapterIdx: idx, globalIndex: globalCounter++ });
        const contentChunks = chunkText(ch.content || '');
        contentChunks.forEach(chunk => {
          segments.push({ text: chunk, chapterIdx: idx, globalIndex: globalCounter++ });
        });
      }
    });
    return segments;
  }, [mergedRange, novel.chapters]);

  const handleReadAloud = async (charOffset?: number) => {
    if (isSpeaking && charOffset === undefined) {
      stopTextToSpeech();
      return;
    }

    const sentences = mergedSegments.map(s => s.text);
    if (sentences.length === 0) return;
    
    const savedSettings = localStorage.getItem('lounge-voice-settings');
    const voiceOptions = savedSettings ? JSON.parse(savedSettings) : {};
    
    playTextToSpeech(sentences, { 
      voice: voiceOptions.voice,
      rate: voiceOptions.rate || 1.0,
      contextId: `mock-${novel.id}-${currentChapterIndex}-merged-${mergedRange.length}`,
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

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-background transition-colors duration-300">
      <div className="flex-1 overflow-y-auto relative" ref={scrollRef}>
        <main className="max-w-[700px] mx-auto px-5 py-10 font-body text-[18px] leading-[1.6]">
          <header className="mb-10">
            <div className="flex items-center justify-between mb-8">
               <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-muted-foreground hover:text-primary transition-colors group">
                <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Back
              </Button>

              <div className="flex gap-2">
                <Link href={`/chat/${novel.id}`}>
                  <Button variant="outline" size="icon" className="rounded-full text-primary border-primary/20 hover:bg-primary/5" title="Reader Lounge">
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="outline" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="rounded-full shadow-sm">
                  {theme === 'dark' ? <Sun className="h-4 w-4 text-orange-400" /> : <Moon className="h-4 w-4 text-indigo-400" />}
                </Button>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="rounded-full"><Menu className="h-4 w-4" /></Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="rounded-r-3xl border-none shadow-2xl">
                    <SheetHeader><SheetTitle className="font-headline font-black text-2xl">{novel.title}</SheetTitle></SheetHeader>
                    <ScrollArea className="h-[calc(100vh-120px)] mt-6">
                      <div className="space-y-1">
                        {novel.chapters.map((ch, idx) => (
                          <Button
                            key={ch.id}
                            variant={currentChapterIndex === idx ? "secondary" : "ghost"}
                            className={`w-full justify-start text-left rounded-xl ${currentChapterIndex === idx ? 'bg-primary/10 text-primary font-bold' : ''}`}
                            onClick={() => setCurrentChapterIndex(idx)}
                          >
                            <span className="opacity-30 mr-3 font-mono text-xs">{idx + 1}</span>
                            <span className="truncate">{ch.title}</span>
                          </Button>
                        ))}
                      </div>
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            <div className="space-y-4 text-center sm:text-left">
              <Badge variant="outline" className="uppercase tracking-widest text-[10px] font-black border-primary/20 text-primary bg-primary/5 px-3">Mock Collection</Badge>
              <h1 className="text-5xl sm:text-6xl font-headline font-black leading-tight tracking-tight">
                {novel.title}
              </h1>
              <p className="text-xl text-muted-foreground italic font-medium opacity-80">By {novel.author}</p>
            </div>
          </header>

          <div className="space-y-20">
            {mergedRange.map((idx) => {
              const ch = novel.chapters[idx];
              if (!ch) return null;
              
              const chTitleSegment = mergedSegments.find(s => s.chapterIdx === idx && s.text.startsWith(`Chapter ${idx + 1}`));
              const chContentSegments = mergedSegments.filter(s => s.chapterIdx === idx && !s.text.startsWith(`Chapter ${idx + 1}`));

              return (
                <article key={idx} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <header className="mb-10 border-b border-border/50 pb-10">
                    <div className="text-xs font-black uppercase tracking-[0.3em] text-primary/60 mb-4">
                      Chapter {idx + 1}
                    </div>
                    <h2 
                      className={cn(
                        "text-4xl font-headline font-black text-primary leading-tight cursor-pointer transition-all duration-300 rounded px-1",
                        highlightEnabled && activeIndex === chTitleSegment?.globalIndex ? "bg-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)]" : "hover:text-primary/80"
                      )}
                      onClick={() => chTitleSegment && handleJumpToSegment(chTitleSegment.globalIndex)}
                    >
                      {ch.title}
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
                disabled={isMerging || Math.max(...mergedRange) >= novel.chapters.length - 1}
              >
                {isMerging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                Merge Next 10 Chapters
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
              <nav className="chapter-nav flex items-center gap-6">
                <Button 
                  variant="outline" 
                  className="h-12 px-8 rounded-2xl border-primary/20 font-black text-xs uppercase tracking-widest shadow-sm"
                  disabled={currentChapterIndex === 0}
                  onClick={() => setCurrentChapterIndex(prev => prev - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" /> Prev
                </Button>
                
                <div className="text-center min-w-[80px]">
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">
                    {mergedRange.length > 1 ? `${Math.min(...mergedRange) + 1}-${Math.max(...mergedRange) + 1}` : currentChapterIndex + 1} / {novel.chapters.length}
                  </span>
                </div>

                <Button 
                  variant="default" 
                  className="h-12 px-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl font-black text-xs uppercase tracking-widest"
                  disabled={Math.max(...mergedRange) >= novel.chapters.length - 1}
                  onClick={() => setCurrentChapterIndex(Math.max(...mergedRange) + 1)}
                >
                  Next <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </nav>
            </div>
          </section>
        </main>
      </div>

      <div className="h-1 bg-muted w-full fixed bottom-0 left-0 z-50">
        <Progress value={progress} className="h-full rounded-none bg-primary/10" />
      </div>

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
