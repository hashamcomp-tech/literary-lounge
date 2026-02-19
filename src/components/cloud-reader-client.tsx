'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { doc, getDoc, collection, getDocs, updateDoc, increment, serverTimestamp, query, where, limit, setDoc } from 'firebase/firestore';
import { useFirebase, useUser } from '@/firebase';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, Sun, Moon, Volume2, CloudOff, Zap, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { playTextToSpeech, stopTextToSpeech, isSpeaking as isSpeakingService } from '@/lib/tts-service';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VoiceSettingsPopover } from '@/components/voice-settings-popover';
import { saveToLocalHistory } from '@/lib/local-history-utils';

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
  const [isBuffering, setIsBuffering] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  const viewLoggedRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => stopTextToSpeech();
  }, []);

  // Simplified state sync with TTS service
  useEffect(() => {
    const interval = setInterval(() => {
      const active = isSpeakingService();
      if (active !== isSpeaking) setIsSpeaking(active);
    }, 300);
    return () => clearInterval(interval);
  }, [isSpeaking]);

  /**
   * Decoupled Pre-fetching logic.
   * Runs in the background without affecting the primary isLoading state.
   */
  const preFetchChapters = useCallback(async (start: number, count: number = 3) => {
    if (!firestore || !id || isOfflineMode) return;
    const total = metadata?.metadata?.info?.totalChapters || 9999;
    const targetNumbers = Array.from({ length: count }, (_, i) => start + i)
      .filter(n => n > 0 && n <= total);
    
    const missing = targetNumbers.filter(n => !chaptersCache[n]);
    
    if (missing.length > 0) {
      if (count > 3) setIsBuffering(true);
      try {
        const chaptersCol = collection(firestore, 'books', id, 'chapters');
        const q = query(chaptersCol, where('chapterNumber', 'in', missing.slice(0, 10)));
        const snap = await getDocs(q);
        const newEntries: Record<number, any> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          newEntries[Number(data.chapterNumber)] = { id: d.id, ...data };
        });
        setChaptersCache(prev => ({ ...prev, ...newEntries }));
      } catch (e) {
        console.warn("Background buffer failed", e);
      } finally {
        setIsBuffering(false);
      }
    }
  }, [firestore, id, chaptersCache, metadata, isOfflineMode]);

  // Effect to trigger buffering separately from loading
  useEffect(() => {
    if (!isLoading && !error) {
      preFetchChapters(currentChapterNum + 1, 3);
    }
  }, [currentChapterNum, isLoading, error, preFetchChapters]);

  /**
   * Primary Loading Effect.
   * Decoupled from buffering to prevent circular dependency hangs.
   */
  useEffect(() => {
    if (isOfflineMode || !firestore || !id) return;

    const loadChapter = async () => {
      // Check cache first
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
            setError('Document not found.');
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
          setError(`Chapter ${currentChapterNum} is currently unavailable.`);
        }
      } catch (err: any) {
        console.error("Chapter load failed", err);
        setError('Connection interrupted.');
      } finally {
        setIsLoading(false);
      }
    };

    loadChapter();
    stopTextToSpeech();
  }, [firestore, id, currentChapterNum, isOfflineMode, metadata]);

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

  const handleReadAloud = async (startIndex: number = 0) => {
    if (isSpeaking) {
      stopTextToSpeech();
      return;
    }

    const chData = chaptersCache[currentChapterNum];
    if (!chData?.content) return;
    
    const saved = localStorage.getItem('lounge-voice-settings');
    const voiceOptions = saved ? JSON.parse(saved) : {};
    
    const paragraphsArr = (chData.content || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .split(/\n\n/)
      .map((p: string) => p.replace(/<[^>]*>?/gm, '').trim())
      .filter((p: string) => p.length > 0);

    const textToRead = paragraphsArr.slice(startIndex).join('\n\n');
    playTextToSpeech(textToRead, voiceOptions);
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
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => preFetchChapters(currentChapterNum + 1, 10)}
              className="rounded-full h-9 px-4 text-[10px] font-black uppercase tracking-widest gap-2 border-primary/20 hover:bg-primary/5 transition-all shadow-sm"
              disabled={isBuffering}
            >
              {isBuffering ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <Zap className="h-3 w-3 text-primary" />}
              {isBuffering ? "Buffering..." : "Buffer 10"}
            </Button>
            <div className="h-4 w-px bg-border/50 mx-1" />
            <VoiceSettingsPopover />
            <Button 
              variant="outline" 
              size="icon" 
              className={`rounded-full shadow-sm transition-colors ${isSpeaking ? 'bg-primary text-primary-foreground border-primary' : 'text-primary border-primary/20 hover:bg-primary/5'}`}
              onClick={() => handleReadAloud(0)} 
              title={isSpeaking ? "Stop" : "Read Aloud"}
            >
              {isSpeaking ? <Square className="h-4 w-4 fill-current" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="rounded-full">
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
              onClick={() => handleReadAloud(idx)}
              className="mb-8 cursor-pointer hover:text-foreground transition-colors"
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
    </div>
  );
}
