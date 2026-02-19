"use client";

import { useState, useEffect, useRef } from 'react';
import { Menu, Sun, Moon, ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, Volume2, Square } from 'lucide-react';
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
import { playTextToSpeech, stopTextToSpeech, isSpeaking as isSpeakingService } from '@/lib/tts-service';
import { VoiceSettingsPopover } from '@/components/voice-settings-popover';

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
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => stopTextToSpeech();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const active = isSpeakingService();
      if (active !== isSpeaking) setIsSpeaking(active);
    }, 300);
    return () => clearInterval(interval);
  }, [isSpeaking]);

  const currentChapter = novel.chapters[currentChapterIndex];
  const progress = ((currentChapterIndex + 1) / novel.chapters.length) * 100;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo(0, 0);
    stopTextToSpeech();
    localStorage.setItem(`progress-${novel.id}`, currentChapterIndex.toString());

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

  const handleReadAloud = async (textOverride?: string) => {
    if (isSpeaking && !textOverride) {
      stopTextToSpeech();
      return;
    }

    if (!currentChapter?.content) return;
    
    const savedSettings = localStorage.getItem('lounge-voice-settings');
    const voiceOptions = savedSettings ? JSON.parse(savedSettings) : {};
    
    const textToPlay = textOverride || currentChapter.content;
    playTextToSpeech(textToPlay, { voice: voiceOptions.voice });
  };

  const handleJumpToWord = (paraIdx: number, e: React.MouseEvent) => {
    const paragraphs = currentChapter.content
      .split(/\n\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    let offset = 0;
    if ((document as any).caretRangeFromPoint) {
      const range = (document as any).caretRangeFromPoint(e.clientX, e.clientY);
      if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
        offset = range.startOffset;
      }
    } else if ((document as any).caretPositionFromPoint) {
      const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) offset = pos.offset;
    }

    const remainingInPara = paragraphs[paraIdx].substring(offset);
    const followingParas = paragraphs.slice(paraIdx + 1).join('\n\n');
    const fullRemainingText = remainingInPara + (followingParas ? '\n\n' + followingParas : '');

    handleReadAloud(fullRemainingText);
  };

  if (!mounted) return null;

  const paragraphs = currentChapter.content
    .split(/\n\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

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
                <VoiceSettingsPopover />
                <Button 
                  variant="outline" 
                  size="icon" 
                  className={`rounded-full transition-colors ${isSpeaking ? 'bg-primary text-primary-foreground border-primary' : 'text-primary border-primary/20 hover:bg-primary/5'}`}
                  onClick={() => handleReadAloud()}
                  title={isSpeaking ? "Stop Narration" : "Read Aloud"}
                >
                  {isSpeaking ? <Square className="h-4 w-4 fill-current" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <Link href={`/chat/${novel.id}`}>
                  <Button variant="outline" size="icon" className="rounded-full text-primary border-primary/20 hover:bg-primary/5" title="Reader Lounge">
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="outline" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="rounded-full">
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

          <article className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="mb-10 border-b border-border/50 pb-10">
               <h2 className="text-4xl font-headline font-black text-primary leading-tight">
                 {currentChapter.title}
               </h2>
            </header>

            <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] leading-[1.6] text-foreground/90 font-body">
              {paragraphs.map((para, i) => (
                <p 
                  key={i} 
                  className="mb-8 cursor-pointer hover:text-foreground transition-colors"
                  onClick={(e) => handleJumpToWord(i, e)}
                >
                  {para}
                </p>
              ))}
            </div>
          </article>

          <section className="mt-20 pt-12 border-t border-border/50">
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
                    {currentChapterIndex + 1} / {novel.chapters.length}
                  </span>
                </div>

                <Button 
                  variant="default" 
                  className="h-12 px-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl font-black text-xs uppercase tracking-widest"
                  disabled={currentChapterIndex === novel.chapters.length - 1}
                  onClick={() => setCurrentChapterIndex(prev => prev + 1)}
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
    </div>
  );
}
