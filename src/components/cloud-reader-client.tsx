
'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { doc, getDoc, collection, getDocs, updateDoc, increment, serverTimestamp, query, where, setDoc, orderBy } from 'firebase/firestore';
import { useFirebase, useUser } from '@/firebase';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, Sun, Moon, Volume2, CloudOff, Square, Layers, Menu, History, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { playTextToSpeech, stopTextToSpeech, isSpeaking as isSpeakingService, chunkText } from '@/lib/tts-service';
import { VoiceSettingsPopover } from '@/components/voice-settings-popover';
import { saveToLocalHistory } from '@/lib/local-history-utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ChapterArtManager, ChapterArt } from '@/components/chapter-art-manager';

interface CloudReaderClientProps {
  id: string;
  chapterNumber: string;
}

export function CloudReaderClient({ id, chapterNumber }: CloudReaderClientProps) {
  const { firestore, isOfflineMode } = useFirebase();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentChapterNum = parseInt(chapterNumber);

  const [metadata, setMetadata] = useState<any>(null);
  const [chaptersCache, setChaptersCache] = useState<Record<number, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedRange, setMergedRange] = useState<number[]>([]);
  const [isScrollRestored, setIsScrollRestored] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [savedPos, setSavedPos] = useState(0);
  const [savedPct, setSavedPct] = useState(0);
  const [tocChapters, setTocChapters] = useState<any[]>([]);
  const [isLoadingToc, setIsLoadingToc] = useState(false);

  // Cloud art state
  const [artList, setArtList] = useState<ChapterArt[]>([]);
  const [headerArtUrl, setHeaderArtUrl] = useState<string | null>(null);
  const [showArtManager, setShowArtManager] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const bgInputRef = useRef<HTMLInputElement | null>(null);

  const viewLoggedRef = useRef<string | null>(null);
  const activeSegmentRef = useRef<HTMLSpanElement | null>(null);
  const isMergedView = searchParams.get('mode') === 'merged';

  // chapterNumber -> art URL
  const artMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const art of artList) {
      for (const ch of art.assignedChapters) map[ch] = art.url;
    }
    return map;
  }, [artList]);

  const loadArtLibrary = async () => {
    if (!firestore) return;
    try {
      const snap = await getDocs(collection(firestore, 'books', id, 'chapterArt'));
      setArtList(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChapterArt)));
    } catch {}
  };

  useEffect(() => {
    if (!firestore) return;

    setMounted(true);

    const saved = localStorage.getItem('lounge-voice-settings');

    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        setHighlightEnabled(parsed.highlightEnabled ?? true);
        setAutoScrollEnabled(parsed.autoScrollEnabled ?? false);
        setScrollSpeed(parsed.scrollSpeed ?? 1);
      } catch (err) {
        console.error('Voice settings parse failed:', err);
      }
    }

    loadArtLibrary();

    const checkAdmin = async () => {
      try {
        if (!user) {
          console.log('No authenticated user');
          setIsAdmin(false);
          return;
        }

        console.log('Checking admin...');
        console.log('UID:', user.uid);
        console.log('EMAIL:', user.email);

        const userRef = doc(firestore, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();

          console.log('User doc:', userData);

          if (userData.role === 'admin') {
            console.log('Admin via role');
            setIsAdmin(true);
            return;
          }
        }

        if (user.email) {
          const approvedRef = doc(
            firestore,
            'settings',
            'approvedEmails'
          );

          const approvedSnap = await getDoc(approvedRef);

          if (approvedSnap.exists()) {
            const emails = approvedSnap.data().emails || [];

            console.log('Approved emails:', emails);

            if (emails.includes(user.email)) {
              console.log('Admin via approved email');
              setIsAdmin(true);
              return;
            }
          }
        }

        console.log('Admin check failed');
        setIsAdmin(false);

      } catch (err) {
        console.error('Admin check crashed:', err);
        setIsAdmin(false);
      }
    };

    checkAdmin();

    const handleSettingsChange = (e: any) => {
      setHighlightEnabled(e.detail.highlightEnabled);
      setAutoScrollEnabled(e.detail.autoScrollEnabled);
      setScrollSpeed(e.detail.scrollSpeed);
    };

    window.addEventListener(
      'lounge-voice-settings-changed',
      handleSettingsChange
    );

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      if (isLoading) return;

      if (showRestorePrompt && window.scrollY > 100) {
        setShowRestorePrompt(false);
        setIsScrollRestored(true);
      }

      if (!isScrollRestored) return;

      localStorage.setItem(
        `lounge-scroll-${id}`,
        window.scrollY.toString()
      );
    };

    const debouncedScroll = () => {
      clearTimeout(scrollTimeout);

      scrollTimeout = setTimeout(
        handleScroll,
        500
      );
    };

    window.addEventListener(
      'scroll',
      debouncedScroll
    );

    return () => {
      stopTextToSpeech();

      window.removeEventListener(
        'lounge-voice-settings-changed',
        handleSettingsChange
      );

      window.removeEventListener(
        'scroll',
        debouncedScroll
      );
    };

  }, [
    firestore,
    user,
    id,
    isLoading,
    isScrollRestored,
    showRestorePrompt
  ]);

  useEffect(() => {
    if (!autoScrollEnabled || isLoading || error || !isScrollRestored) return;
    let lastTime = performance.now(); let animationId: number;
    const scrollLoop = (time: number) => {
      const delta = time - lastTime; lastTime = time;
      if (isSpeaking && activeSegmentRef.current) {
        const offset = activeSegmentRef.current.getBoundingClientRect().top + activeSegmentRef.current.getBoundingClientRect().height / 2 - window.innerHeight / 2;
        if (Math.abs(offset) > 2) window.scrollBy(0, offset * 0.05);
      } else { window.scrollBy(0, ((scrollSpeed * 5) / 1000) * delta); }
      animationId = requestAnimationFrame(scrollLoop);
    };
    animationId = requestAnimationFrame(scrollLoop);
    return () => cancelAnimationFrame(animationId);
  }, [autoScrollEnabled, scrollSpeed, isLoading, error, isSpeaking, activeIndex, isScrollRestored]);

  useEffect(() => {
    const interval = setInterval(() => {
      const active = isSpeakingService();
      if (active !== isSpeaking) { setIsSpeaking(active); if (!active) setActiveIndex(null); }
    }, 300);
    return () => clearInterval(interval);
  }, [isSpeaking]);

  useEffect(() => {
    if (isOfflineMode || !firestore || !id) return;
    const loadChapterBatch = async () => {
      setIsLoading(true); setError(null); setIsScrollRestored(false); setShowRestorePrompt(false);
      try {
        let meta = metadata;
        if (!meta) {
          const snapshot = await getDoc(doc(firestore, 'books', id));
          if (!snapshot.exists()) { setError('Manuscript not found in the global library.'); setIsLoading(false); return; }
          meta = snapshot.data(); setMetadata(meta);
          if (meta.headerArtUrl) setHeaderArtUrl(meta.headerArtUrl);
        }
        const end = isMergedView ? Math.min(currentChapterNum + 10, meta.metadata?.info?.totalChapters || currentChapterNum + 10) : currentChapterNum;
        const targetNumbers = Array.from({ length: end - currentChapterNum + 1 }, (_, i) => currentChapterNum + i);
        const querySnap = await getDocs(query(collection(firestore, 'books', id, 'chapters'), where('chapterNumber', 'in', targetNumbers)));
        if (!querySnap.empty) {
          const newEntries: Record<number, any> = {};
          querySnap.docs.forEach(d => { const data = d.data(); newEntries[Number(data.chapterNumber)] = { id: d.id, ...data }; });
          setChaptersCache(prev => ({ ...prev, ...newEntries }));
          setMergedRange(targetNumbers);
          if (viewLoggedRef.current !== id) { updateDoc(doc(firestore, 'books', id), { views: increment(1) }).catch(() => {}); viewLoggedRef.current = id; }
          updateHistory(meta);
        } else { setError('This manuscript section is unavailable.'); }
      } catch { setError('Connection interrupted.'); }
      finally { setIsLoading(false); }
    };
    loadChapterBatch(); stopTextToSpeech();
  }, [firestore, id, currentChapterNum, isOfflineMode, isMergedView]);

  useEffect(() => {
    if (!isLoading && !isScrollRestored && mounted) {
      const savedScroll = localStorage.getItem(`lounge-scroll-${id}`);
      const savedProgress = localStorage.getItem(`lounge-progress-${id}`);
      if (savedScroll && savedProgress && parseInt(savedProgress) === currentChapterNum) {
        const pos = parseInt(savedScroll);
        if (pos > 200) {
          setSavedPos(pos);
          setTimeout(() => { setSavedPct(Math.min(Math.round((pos / (document.documentElement.scrollHeight - window.innerHeight)) * 100), 100)); setShowRestorePrompt(true); }, 500);
        } else { setIsScrollRestored(true); }
      } else { setIsScrollRestored(true); }
    }
  }, [isLoading, id, currentChapterNum, mounted]);

  const handleRestoreScroll = () => { window.scrollTo({ top: savedPos, behavior: 'smooth' }); setIsScrollRestored(true); setShowRestorePrompt(false); };

  const loadToc = async () => {
    if (!firestore || !id || tocChapters.length > 0) return;
    setIsLoadingToc(true);
    try {
      const snap = await getDocs(query(collection(firestore, 'books', id, 'chapters'), orderBy('chapterNumber', 'asc')));
      setTocChapters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {} finally { setIsLoadingToc(false); }
  };

  const handleMergeNext = () => router.push(`/pages/${id}/${currentChapterNum}?mode=merged`);

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !firestore) return;
    setIsUploadingBg(true);
    try {
      const { optimizeCoverImage } = await import('@/lib/image-utils');
      const optimized = await optimizeCoverImage(file, 1400);
      const buffer = await (new File([optimized], file.name, { type: 'image/jpeg' })).arrayBuffer();
      const res = await fetch(`/api/upload?filename=${encodeURIComponent(`chapterArt/${id}_header_${Date.now()}.jpg`)}`, { method: 'POST', body: buffer });
      if (!res.ok) throw new Error('Upload failed');
      const blob = await res.json();
      setHeaderArtUrl(blob.url);
      await updateDoc(doc(firestore, 'books', id), { headerArtUrl: blob.url });
    } catch (err: any) { alert('Upload failed: ' + err.message); }
    finally { setIsUploadingBg(false); if (bgInputRef.current) bgInputRef.current.value = ''; }
  };

  const handleRemoveBg = async () => {
    if (!firestore) return;
    setHeaderArtUrl(null);
    await updateDoc(doc(firestore, 'books', id), { headerArtUrl: null }).catch(() => {});
  };

  const updateHistory = (metaOverride?: any) => {
    const meta = metaOverride || metadata; if (!meta) return;
    localStorage.setItem(`lounge-progress-${id}`, currentChapterNum.toString());
    saveToLocalHistory({ id, title: meta.title || 'Untitled', author: meta.author || 'Unknown', coverURL: meta.coverURL || null, genre: meta.genre || 'Novel', lastReadChapter: currentChapterNum, lastReadAt: new Date().toISOString(), isCloud: true });
    if (user && firestore) setDoc(doc(firestore, 'users', user.uid, 'history', id), { bookId: id, title: meta.title || 'Untitled', author: meta.author || 'Unknown', coverURL: meta.coverURL || null, genre: meta.genre || 'Novel', lastReadChapter: currentChapterNum, lastReadAt: serverTimestamp(), isCloud: true }, { merge: true }).catch(() => {});
  };

  const { structuredChapters, flatSentences } = useMemo(() => {
    const chapters: any[] = []; let globalCounter = 0; const flatSentences: string[] = [];
    mergedRange.forEach(num => {
      const ch = chaptersCache[num]; if (!ch) return;
      const titleText = `Chapter ${num}. ${ch.title || ''}. `;
      const titleSegment = { text: titleText, globalIndex: globalCounter++ };
      flatSentences.push(titleText);
      const paragraphs = (ch.content || '').split(/\n\s*\n/).map((pText: string) => {
        const sentences = chunkText(pText).map(s => { const seg = { text: s, globalIndex: globalCounter++ }; flatSentences.push(s); return seg; });
        return { sentences };
      }).filter((p: any) => p.sentences.length > 0);
      chapters.push({ num, title: ch.title, titleSegment, paragraphs });
    });
    return { structuredChapters: chapters, flatSentences };
  }, [mergedRange, chaptersCache]);

  const handleReadAloud = async (charOffset?: number) => {
    if (isSpeaking && charOffset === undefined) { stopTextToSpeech(); return; }
    if (!flatSentences.length) return;
    const voiceOptions = (() => { try { return JSON.parse(localStorage.getItem('lounge-voice-settings') || '{}'); } catch { return {}; } })();
    playTextToSpeech(flatSentences, { voice: voiceOptions.voice, rate: voiceOptions.rate || 1.0, contextId: `cloud-${id}-${currentChapterNum}-merged-${mergedRange.length}`, charOffset, onChunkStart: (index) => setActiveIndex(index) });
  };

  const handleJumpToSegment = (globalIndex: number) => {
    let offset = 0;
    for (let i = 0; i < globalIndex; i++) offset += flatSentences[i].length + 1;
    handleReadAloud(offset);
  };

  if (isOfflineMode) return (
    <div className="max-w-[700px] mx-auto px-5 py-24 text-center">
      <Alert className="bg-amber-500/10 rounded-[2.5rem] p-10 border-none shadow-xl">
        <CloudOff className="h-16 w-16 mb-6 mx-auto opacity-30" />
        <AlertTitle className="text-4xl font-headline font-black mb-4">Independent Mode</AlertTitle>
        <AlertDescription className="text-lg opacity-80 leading-relaxed max-w-lg mx-auto">Cloud volumes require an active network connection.</AlertDescription>
        <Button variant="outline" className="mt-10 rounded-2xl h-14 px-10 font-bold" onClick={() => router.push('/')}>Return to Library</Button>
      </Alert>
    </div>
  );

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Opening Manuscript...</p>
    </div>
  );

  const totalChapters = metadata?.metadata?.info?.totalChapters || 0;

  if (error || structuredChapters.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
      <h1 className="text-4xl font-headline font-black mb-4">Shelf Empty</h1>
      <p className="text-muted-foreground max-w-md mb-8">{error || "This novel doesn't exist."}</p>
      <Button variant="outline" className="rounded-2xl h-12 px-8 font-bold" onClick={() => router.push('/')}>Back to Library</Button>
    </div>
  );

  return (
    <div className="max-w-[700px] mx-auto px-5 py-5 transition-all selection:bg-primary/20">
      {showRestorePrompt && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 duration-500 w-full max-w-[300px] px-4">
          <Button variant="secondary" className="w-full rounded-full shadow-2xl bg-primary text-primary-foreground hover:bg-primary/90 px-6 h-12 gap-2 border-2 border-background" onClick={handleRestoreScroll}>
            <History className="h-4 w-4" />
            <span className="flex-1 text-xs font-bold">Restore to {savedPct}%</span>
            <div className="w-px h-4 bg-primary-foreground/20 mx-1" />
            <X className="h-4 w-4 hover:scale-110 transition-transform cursor-pointer" onClick={(e) => { e.stopPropagation(); setShowRestorePrompt(false); setIsScrollRestored(true); }} />
          </Button>
        </div>
      )}

      <header className="mb-12">
        <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
        <div className="relative rounded-3xl overflow-hidden mb-8"
          style={headerArtUrl ? { backgroundImage: `url(${headerArtUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
          {headerArtUrl && <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />}
          <div className={`relative z-10 ${headerArtUrl ? 'px-6 pt-6 pb-8 sm:px-8 sm:pt-8 sm:pb-10' : ''}`}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex flex-col gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()} className={`transition-colors group -ml-2 ${headerArtUrl ? 'text-white/80 hover:text-white hover:bg-white/10' : 'text-muted-foreground hover:text-primary'}`}>
                  <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Back
                </Button>
                <Breadcrumbs items={[{ label: 'Cloud', href: '/explore' }, { label: metadata?.title || 'Novel', href: `/book/${id}` }, { label: isMergedView ? `Merged ${Math.min(...mergedRange)}-${Math.max(...mergedRange)}` : `Chapter ${currentChapterNum}` }]} />
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (<>
                  {headerArtUrl
                    ? <Button variant="outline" size="sm" onClick={handleRemoveBg} className="rounded-full text-[10px] font-black uppercase tracking-widest bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white backdrop-blur-sm">Remove Header Art</Button>
                    : <Button variant="outline" size="sm" onClick={() => bgInputRef.current?.click()} disabled={isUploadingBg} className="rounded-full text-[10px] font-black uppercase tracking-widest">{isUploadingBg ? 'Uploading...' : '+ Header Art'}</Button>
                  }
                  <Button variant="outline" size="sm" onClick={() => setShowArtManager(true)} className={cn("rounded-full text-[10px] font-black uppercase tracking-widest", headerArtUrl ? "bg-white/10 border-white/20 text-white hover:bg-white/20" : "")}>
                    Chapter Art
                  </Button>
                </>)}
                <Button variant={headerArtUrl ? "ghost" : "outline"} size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={`rounded-full shadow-sm ${headerArtUrl ? 'bg-white/10 border-white/20 hover:bg-white/20 text-white' : ''}`}>
                  {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
                </Button>
                <Sheet onOpenChange={(open) => open && loadToc()}>
                  <SheetTrigger asChild>
                    <Button variant={headerArtUrl ? "ghost" : "outline"} size="icon" className={`rounded-full shadow-sm ${headerArtUrl ? 'bg-white/10 border-white/20 hover:bg-white/20 text-white' : ''}`}>
                      <Menu className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="rounded-l-3xl border-none shadow-2xl w-80">
                    <SheetHeader><SheetTitle className="font-headline font-black text-2xl truncate">{metadata?.title || 'Chapters'}</SheetTitle></SheetHeader>
                    <ScrollArea className="h-[calc(100vh-120px)] mt-6">
                      <div className="space-y-1">
                        {isLoadingToc ? <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" /></div>
                          : tocChapters.map(ch => (
                            <Button key={ch.id} variant={currentChapterNum === ch.chapterNumber ? "secondary" : "ghost"}
                              className={`w-full justify-start text-left rounded-xl h-auto py-3 px-4 ${currentChapterNum === ch.chapterNumber ? 'bg-primary/10 text-primary font-bold shadow-sm' : 'hover:bg-muted/50'}`}
                              onClick={() => router.push(`/pages/${id}/${ch.chapterNumber}`)}>
                              <span className={`text-[10px] font-mono mr-3 shrink-0 ${currentChapterNum === ch.chapterNumber ? 'text-primary' : 'opacity-30'}`}>{ch.chapterNumber.toString().padStart(2, '0')}</span>
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
                <Badge variant="secondary" className={`border-none text-[10px] font-black px-4 py-1 ${headerArtUrl ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`}>Cloud</Badge>
                <Badge variant="outline" className={`uppercase text-[10px] font-black px-4 py-1 ${headerArtUrl ? 'border-white/30 text-white/80' : 'border-accent/30 text-accent'}`}>{metadata?.genre?.[0] || 'Novel'}</Badge>
              </div>
              <h1 className={`text-5xl sm:text-6xl font-headline font-black leading-tight tracking-tight ${headerArtUrl ? 'text-white drop-shadow-lg' : ''}`}>{metadata?.title || 'Untitled'}</h1>
              <p className={`text-xl italic font-medium opacity-80 ${headerArtUrl ? 'text-white/80' : 'text-muted-foreground'}`}>By {metadata?.author || 'Unknown'}</p>
            </div>
          </div>
        </div>
      </header>

      <article className="space-y-32">
        {structuredChapters.map((chData, idx) => {
          const chArtUrl = artMap[chData.num];
          return (
            <section key={chData.num} className="animate-in fade-in slide-in-from-bottom-4 duration-700 relative">
              {idx > 0 && <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-32 h-px bg-border/50" />}
              <div className="relative rounded-2xl overflow-hidden mb-12"
                style={chArtUrl ? { backgroundImage: `url(${chArtUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                {chArtUrl && <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />}
                <header className={cn("border-b border-border/50 pb-10 relative z-10", chArtUrl ? "mb-0 px-6 pt-8 pb-10" : "mb-12")}>
                  <div className="flex items-center justify-between mb-6">
                    <div className={cn("flex items-center gap-3 text-xs font-black uppercase tracking-[0.3em]", chArtUrl ? "text-white/70" : "text-primary/60")}>
                      <Bookmark className="h-4 w-4" /> Chapter {chData.num}
                    </div>
                    {isAdmin && (
                      <button onClick={() => setShowArtManager(true)}
                        className={cn("text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border transition-all",
                          chArtUrl ? "bg-white/10 border-white/20 text-white hover:bg-white/20" : "border-border text-muted-foreground hover:border-primary hover:text-primary")}>
                        {chArtUrl ? "Edit Art" : "+ Art"}
                      </button>
                    )}
                  </div>
                  <h2
                    ref={highlightEnabled && activeIndex === chData.titleSegment.globalIndex ? activeSegmentRef : null}
                    className={cn("text-4xl font-headline font-black leading-tight cursor-pointer transition-all duration-300 rounded px-1",
                      chArtUrl ? "text-white drop-shadow-lg" : "text-primary",
                      highlightEnabled && activeIndex === chData.titleSegment.globalIndex ? "bg-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)]" : chArtUrl ? "hover:text-white/80" : "hover:text-primary/80")}
                    onClick={() => handleJumpToSegment(chData.titleSegment.globalIndex)}
                  >
                    {chData.title || `Chapter ${chData.num}`}
                  </h2>
                </header>
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] leading-[1.8] text-foreground/90 font-body">
                {chData.paragraphs.map((para: any, pIdx: number) => (
                  <p key={pIdx} className="mb-8">
                    {para.sentences.map((seg: any) => (
                      <span key={seg.globalIndex}
                        ref={highlightEnabled && activeIndex === seg.globalIndex ? activeSegmentRef : null}
                        className={cn("inline cursor-pointer transition-all duration-300 rounded px-0.5", highlightEnabled && activeIndex === seg.globalIndex ? "bg-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)] scale-[1.01]" : "hover:text-foreground")}
                        onClick={() => handleJumpToSegment(seg.globalIndex)}
                      >{seg.text}{" "}</span>
                    ))}
                  </p>
                ))}
              </div>
            </section>
          );
        })}
      </article>

      <footer className="mt-32 pt-12 border-t border-border/50 space-y-8">
        {!isMergedView && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="outline" className="rounded-2xl h-14 px-10 font-black uppercase text-[10px] tracking-widest gap-3 w-full sm:w-auto hover:bg-primary hover:text-white transition-all shadow-xl"
              onClick={handleMergeNext} disabled={isMerging || (totalChapters > 0 && Math.max(...mergedRange) >= totalChapters)}>
              <Layers className="h-4 w-4" /> Merge Next 10 Chapters
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between gap-8 pt-10">
          <Button variant="outline" className="h-12 px-8 rounded-2xl border-primary/20 font-black text-xs uppercase tracking-widest" disabled={Math.min(...mergedRange) <= 1} onClick={() => router.push(`/pages/${id}/${Math.min(...mergedRange) - 1}`)}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Prev
          </Button>
          <div className="text-center bg-muted/30 px-6 py-2 rounded-full border border-border/50 shadow-inner">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">
              {mergedRange.length > 1 ? `${Math.min(...mergedRange)} - ${Math.max(...mergedRange)}` : currentChapterNum} / {totalChapters || '...'}
            </span>
          </div>
          <Button variant="default" className="h-12 px-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl font-black text-xs uppercase tracking-widest"
            disabled={totalChapters > 0 && Math.max(...mergedRange) >= totalChapters} onClick={() => router.push(`/pages/${id}/${Math.max(...mergedRange) + 1}`)}>
            Next <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </footer>

      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-card/80 backdrop-blur-md border border-border/50 p-2 rounded-full shadow-2xl animate-in slide-in-from-right-4 duration-500">
        <VoiceSettingsPopover />
        <Button variant="default" size="icon"
          className={`h-10 w-10 rounded-full shadow-lg transition-all active:scale-95 ${isSpeaking ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'}`}
          onClick={() => handleReadAloud()} title={isSpeaking ? "Stop Narration" : "Read Aloud"}>
          {isSpeaking ? <Square className="h-4 w-4 fill-current" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>

      {showArtManager && isAdmin && firestore && (
        <ChapterArtManager
          bookId={id}
          firestore={firestore}
          currentChapterNum={currentChapterNum}
          onClose={() => setShowArtManager(false)}
          onArtUpdated={(list) => setArtList(list)}
        />
      )}
    </div>
  );
}

