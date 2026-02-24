'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { doc, getDoc, collection, getDocs, updateDoc, increment, serverTimestamp, query, where, limit, setDoc, orderBy } from 'firebase/firestore';
import { useFirebase, useUser } from '@/firebase';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, Sun, Moon, Volume2, CloudOff, Square, Layers, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { playTextToSpeech, stopTextToSpeech, isSpeaking as isSpeakingService, chunkText } from '@/lib/tts-service';
import { VoiceSettingsPopover } from '@/components/voice-settings-popover';
import { saveToLocalHistory } from '@/lib/local-history-utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface CloudReaderClientProps {
  id: string;
  chapterNumber: string;
}

export function CloudReaderClient({ id, chapterNumber }: CloudReaderClientProps) {
  const { firestore, isOfflineMode } = useFirebase();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const currentChapterNum = parseInt(chapterNumber);
  
  const [metadata, setMetadata] = useState<any>(null);
  const [chaptersCache, setChaptersCache] = useState<Record<number, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedRange, setMergedRange] = useState<number[]>([]);
  
  // Table of Contents State
  const [tocChapters, setTocChapters] = useState<any[]>([]);
  const [isLoadingToc, setIsLoadingToc] = useState(false);
  
  const viewLoggedRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (isOfflineMode || !firestore || !id) return;

    const loadChapter = async () => {
      if (chaptersCache[currentChapterNum]) {
        setIsLoading(false);
        updateHistory(metadata);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        let meta = metadata;
        if (!meta) {
          const bookRef = doc(firestore, 'books', id);
          const snapshot = await getDoc(bookRef);
          if (!snapshot.exists()) {
            setError('Manuscript not found in the global library.');
            setIsLoading(false);
            return;
          }
          meta = snapshot.data();
          setMetadata(meta);
        }

        const chaptersCol = collection(firestore, 'books', id, 'chapters');
        const q = query(chaptersCol, where('chapterNumber', '==', currentChapterNum), limit(1));
        const querySnap = await getDocs(q);
        
        if (!querySnap.empty) {
          const chData = { id: querySnap.docs[0].id, ...querySnap.docs[0].data() };
          setChaptersCache(prev => ({ ...prev, [currentChapterNum]: chData }));
          
          if (viewLoggedRef.current !== id) {
            updateDoc(doc(firestore, 'books', id), { views: increment(1) }).catch(() => {});
            viewLoggedRef.current = id;
          }
          updateHistory(meta);
        } else {
          const startQ = query(chaptersCol, orderBy('chapterNumber', 'asc'), limit(1));
          const startSnap = await getDocs(startQ);
          
          if (!startSnap.empty) {
            const firstNum = startSnap.docs[0].data().chapterNumber;
            router.replace(`/pages/${id}/${firstNum}`);
            return;
          }
          
          setError(`This manuscript has no chapters available.`);
        }
      } catch (err: any) {
        console.error("Chapter load failure:", err);
        setError('Connection interrupted.');
      } finally {
        setIsLoading(false);
      }
    };

    loadChapter();
    stopTextToSpeech();
    setMergedRange([currentChapterNum]);
  }, [firestore, id, currentChapterNum, isOfflineMode]);

  const loadToc = async () => {
    if (!firestore || !id || tocChapters.length > 0) return;
    setIsLoadingToc(true);
    try {
      const chaptersCol = collection(firestore, 'books', id, 'chapters');
      const q = query(chaptersCol, orderBy('chapterNumber', 'asc'));
      const snap = await getDocs(q);
      setTocChapters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.warn("Failed to load TOC", e);
    } finally {
      setIsLoadingToc(false);
    }
  };

  const handleMergeNext = async () => {
    if (!firestore || !id || isMerging) return;
    setIsMerging(true);
    
    try {
      const start = Math.max(...mergedRange) + 1;
      const end = start + 9;
      const targetNumbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      
      const missing = targetNumbers.filter(n => !chaptersCache[n]);
      
      if (missing.length > 0) {
        const chaptersCol = collection(firestore, 'books', id, 'chapters');
        const q = query(chaptersCol, where('chapterNumber', 'in', missing));
        const snap = await getDocs(q);
        
        const newEntries: Record<number, any> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          newEntries[Number(data.chapterNumber)] = { id: d.id, ...data };
        });
        setChaptersCache(prev => ({ ...prev, ...newEntries }));
      }

      setMergedRange(prev => [...prev, ...targetNumbers].sort((a, b) => a - b));
    } catch (e) {
      console.error("Merge failed", e);
    } finally {
      setIsMerging(false);
    }
  };

  const updateHistory = (metaOverride?: any) => {
    const meta = metaOverride || metadata;
    if (!meta) return;

    const bookTitle = meta.title || 'Untitled';
    const bookAuthor = meta.author || 'Unknown';
    const coverURL = meta.coverURL || null;
    const genre = meta.genre || 'Novel';

    localStorage.setItem(`lounge-progress-${id}`, currentChapterNum.toString());

    saveToLocalHistory({
      id, title: bookTitle, author: bookAuthor, coverURL, genre,
      lastReadChapter: currentChapterNum, lastReadAt: new Date().toISOString(), isCloud: true
    });

    if (user && firestore) {
      const historyRef = doc(firestore, 'users', user.uid, 'history', id);
      setDoc(historyRef, {
        bookId: id, title: bookTitle, author: bookAuthor, coverURL, genre,
        lastReadChapter: currentChapterNum, lastReadAt: serverTimestamp(), isCloud: true
      }, { merge: true }).catch(() => {});
    }
  };

  // Pre-calculate segments for highlighting
  const mergedSegments = useMemo(() => {
    const segments: { text: string; chapterNum: number; globalIndex: number }[] = [];
    let globalCounter = 0;
    mergedRange.forEach(num => {
      const ch = chaptersCache[num];
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
  }, [mergedRange, chaptersCache]);

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
      contextId: `cloud-${id}-${currentChapterNum}-merged-${mergedRange.length}`,
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

  if (isOfflineMode) {
    return (
      <div className="max-w-[700px] mx-auto px-5 py-24 text-center">
        <Alert className="bg-amber-500/10 rounded-[2.5rem] p-10 border-none shadow-xl">
          <CloudOff className="h-16 w-16 mb-6 mx-auto opacity-30" />
          <AlertTitle className="text-4xl font-headline font-black mb-4">Independent Mode</AlertTitle>
          <AlertDescription className="text-lg opacity-80 leading-relaxed max-w-lg mx-auto">
            Cloud volumes require an active network connection.
          </AlertDescription>
          <Button variant="outline" className="mt-10 rounded-2xl h-14 px-10 font-bold" onClick={() => router.push('/')}>
            Return to Library
          </Button>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Opening Manuscript...</p>
      </div>
    );
  }

  const chapter = chaptersCache[currentChapterNum];
  const totalChapters = metadata?.metadata?.info?.totalChapters || 0;

  if (error || !chapter) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
        <h1 className="text-4xl font-headline font-black mb-4">Shelf Empty</h1>
        <p className="text-muted-foreground max-w-md mb-8">{error || "This novel doesn't exist."}</p>
        <Button variant="outline" className="rounded-2xl h-12 px-8 font-bold" onClick={() => router.push('/')}>Back to Library</Button>
      </div>
    );
  }

  return (
    <div className="max-w-[700px] mx-auto px-5 py-5 transition-all selection:bg-primary/20">
      <header className="mb-12">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-muted-foreground hover:text-primary transition-colors group">
            <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="rounded-full shadow-sm">
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
            </Button>
            
            <Sheet onOpenChange={(open) => open && loadToc()}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full shadow-sm">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="rounded-l-3xl border-none shadow-2xl w-80">
                <SheetHeader>
                  <SheetTitle className="font-headline font-black text-2xl truncate">{metadata?.title || 'Chapters'}</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-120px)] mt-6">
                  <div className="space-y-1">
                    {isLoadingToc ? (
                      <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" /></div>
                    ) : (
                      tocChapters.map((ch) => (
                        <Button
                          key={ch.id}
                          variant={currentChapterNum === ch.chapterNumber ? "secondary" : "ghost"}
                          className={`w-full justify-start text-left rounded-xl h-auto py-3 px-4 ${currentChapterNum === ch.chapterNumber ? 'bg-primary/10 text-primary font-bold shadow-sm' : 'hover:bg-muted/50'}`}
                          onClick={() => {
                            router.push(`/pages/${id}/${ch.chapterNumber}`);
                          }}
                        >
                          <span className={`text-[10px] font-mono mr-3 shrink-0 ${currentChapterNum === ch.chapterNumber ? 'text-primary' : 'opacity-30'}`}>
                            {ch.chapterNumber.toString().padStart(2, '0')}
                          </span>
                          <span className="truncate text-sm">{ch.title || `Chapter ${ch.chapterNumber}`}</span>
                        </Button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="space-y-6 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3">
             <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] font-black px-4 py-1">Cloud</Badge>
             <Badge variant="outline" className="border-accent/30 text-accent uppercase text-[10px] font-black px-4 py-1">{metadata?.genre?.[0] || 'Novel'}</Badge>
          </div>
          <h1 className="text-5xl sm:text-6xl font-headline font-black leading-tight tracking-tight">
            {metadata?.title || 'Untitled'}
          </h1>
          <p className="text-xl text-muted-foreground italic font-medium opacity-80">By {metadata?.author || 'Unknown'}</p>
        </div>
      </header>

      <div className="space-y-20">
        {mergedRange.map((num) => {
          const ch = chaptersCache[num];
          if (!ch) return null;
          
          const chTitleSegment = mergedSegments.find(s => s.chapterNum === num && s.text.startsWith(`Chapter ${num}`));
          const chContentSegments = mergedSegments.filter(s => s.chapterNum === num && !s.text.startsWith(`Chapter ${num}`));

          return (
            <article key={num} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <header className="mb-10 border-b border-border/50 pb-10">
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-6 text-xs font-black uppercase tracking-[0.3em] text-primary/60">
                  <Bookmark className="h-4 w-4" />
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

      <footer className="mt-20 pt-12 border-t border-border/50 space-y-8">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button 
            variant="outline" 
            className="rounded-2xl h-14 px-8 font-black uppercase text-[10px] tracking-widest gap-2 w-full sm:w-auto"
            onClick={handleMergeNext}
            disabled={isMerging || (totalChapters > 0 && Math.max(...mergedRange) >= totalChapters)}
          >
            {isMerging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
            Merge Next 10 Chapters
          </Button>
        </div>

        <div className="flex items-center justify-between gap-8">
          <Button variant="outline" className="h-12 px-8 rounded-2xl border-primary/20 font-black text-xs uppercase tracking-widest" disabled={currentChapterNum <= 1} onClick={() => router.push(`/pages/${id}/${currentChapterNum - 1}`)}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Prev
          </Button>
          <div className="text-center">
             <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">
               {mergedRange.length > 1 ? `${Math.min(...mergedRange)}-${Math.max(...mergedRange)}` : currentChapterNum} / {totalChapters || '...'}
             </span>
          </div>
          <Button variant="default" className="h-12 px-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl font-black text-xs uppercase tracking-widest" disabled={totalChapters > 0 && Math.max(...mergedRange) >= totalChapters} onClick={() => router.push(`/pages/${id}/${Math.max(...mergedRange) + 1}`)}>
            Next <ChevronRight className="mr-2 h-4 w-4" />
          </Button>
        </div>
      </footer>

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
