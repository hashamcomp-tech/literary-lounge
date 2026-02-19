'use client';

import { useEffect, useState, useRef } from 'react';
import { doc, getDoc, collection, getDocs, updateDoc, increment, serverTimestamp, query, where, limit, setDoc, orderBy } from 'firebase/firestore';
import { useFirebase, useUser } from '@/firebase';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, Sun, Moon, Volume2, CloudOff, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { playTextToSpeech, stopTextToSpeech, isSpeaking as isSpeakingService } from '@/lib/tts-service';
import { VoiceSettingsPopover } from '@/components/voice-settings-popover';
import { saveToLocalHistory } from '@/lib/local-history-utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  const viewLoggedRef = useRef<string | null>(null);

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
  }, [firestore, id, currentChapterNum, isOfflineMode]);

  useEffect(() => {
    if (isOfflineMode || !firestore || !id || isLoading) return;

    const bufferAhead = async () => {
      const nextNumbers = [currentChapterNum + 1, currentChapterNum + 2, currentChapterNum + 3];
      const missing = nextNumbers.filter(n => !chaptersCache[n] && n > 0);
      
      if (missing.length === 0) return;

      try {
        const chaptersCol = collection(firestore, 'books', id, 'chapters');
        const q = query(chaptersCol, where('chapterNumber', 'in', missing));
        const snap = await getDocs(q);
        
        const newEntries: Record<number, any> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          newEntries[Number(data.chapterNumber)] = { id: d.id, ...data };
        });
        
        setChaptersCache(prev => ({ ...prev, ...newEntries }));
      } catch (e) {
        console.warn("Predictive buffer failed:", e);
      }
    };

    bufferAhead();
  }, [currentChapterNum, firestore, id, isOfflineMode, isLoading]);

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

  const handleReadAloud = async (charOffset?: number) => {
    if (isSpeaking && charOffset === undefined) {
      stopTextToSpeech();
      return;
    }

    const chData = chaptersCache[currentChapterNum];
    if (!chData?.content) return;
    
    const saved = localStorage.getItem('lounge-voice-settings');
    const voiceOptions = saved ? JSON.parse(saved) : {};
    
    playTextToSpeech(chData.content, { 
      voice: voiceOptions.voice,
      rate: voiceOptions.rate || 1.0,
      contextId: `cloud-${id}-${currentChapterNum}`,
      charOffset
    });
  };

  const handleJumpToWord = (paraIdx: number, e: React.MouseEvent) => {
    const chapter = chaptersCache[currentChapterNum];
    if (!chapter) return;

    const paragraphs = (chapter.content || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .split(/\n\n/)
      .map((p: string) => p.replace(/<[^>]*>?/gm, '').trim())
      .filter((p: string) => p.length > 0);

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

    let totalOffset = 0;
    for (let i = 0; i < paraIdx; i++) {
      totalOffset += paragraphs[i].length + 2; // +2 for double newlines
    }
    totalOffset += offset;

    handleReadAloud(totalOffset);
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

  const paragraphs = (chapter.content || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/\n\n/)
    .map((p: string) => p.replace(/<[^>]*>?/gm, '').trim())
    .filter((p: string) => p.length > 0);

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

      <article className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header className="mb-10 border-b border-border/50 pb-10">
          <div className="flex items-center justify-center sm:justify-start gap-3 mb-6 text-xs font-black uppercase tracking-[0.3em] text-primary/60">
            <Bookmark className="h-4 w-4" />
            Chapter {currentChapterNum}
          </div>
          <h2 className="text-4xl font-headline font-black text-primary leading-tight">
            {chapter.title || `Chapter ${currentChapterNum}`}
          </h2>
        </header>

        <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] leading-[1.6] text-foreground/90 font-body">
          {paragraphs.map((para: string, idx: number) => (
            <p 
              key={idx} 
              className="mb-8 cursor-pointer hover:text-foreground transition-colors"
              onClick={(e) => handleJumpToWord(idx, e)}
            >
              {para}
            </p>
          ))}
        </div>
      </article>

      <footer className="mt-20 pt-12 border-t border-border/50">
        <div className="flex items-center justify-between gap-8">
          <Button variant="outline" className="h-12 px-8 rounded-2xl border-primary/20 font-black text-xs uppercase tracking-widest" disabled={currentChapterNum <= 1} onClick={() => router.push(`/pages/${id}/${currentChapterNum - 1}`)}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Prev
          </Button>
          <div className="text-center">
             <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">{currentChapterNum} / {totalChapters || '...'}</span>
          </div>
          <Button variant="default" className="h-12 px-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl font-black text-xs uppercase tracking-widest" disabled={totalChapters > 0 && currentChapterNum >= totalChapters} onClick={() => router.push(`/pages/${id}/${currentChapterNum + 1}`)}>
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
