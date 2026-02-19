'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { doc, getDoc, collection, getDocs, updateDoc, increment, serverTimestamp, query, where, limit, setDoc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, ShieldAlert, Sun, Moon, MessageSquare, Volume2, CloudOff, Trash2, MoreVertical, Zap, Image as ImageIcon, Settings, Sparkles, Upload, CheckCircle2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { playTextToSpeech, stopTextToSpeech, isSpeaking as checkIsSpeaking } from '@/lib/tts-service';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VoiceSettingsPopover } from '@/components/voice-settings-popover';
import { deleteCloudBook, updateCloudBookCover } from '@/lib/cloud-library-utils';
import { uploadCoverImage } from '@/lib/upload-cover';
import { optimizeCoverImage, dataURLtoFile } from '@/lib/image-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { saveToLocalHistory } from '@/lib/local-history-utils';
import { generateBookCover } from '@/ai/flows/generate-cover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface CloudReaderClientProps {
  id: string;
  chapterNumber: string;
}

/**
 * @fileOverview High-Performance Cloud Reader Client.
 * Implements Predictive Buffering for seamless chapter transitions.
 * Features Lounge Studio for manuscript management and AI enhancements.
 */
export function CloudReaderClient({ id, chapterNumber }: CloudReaderClientProps) {
  const { firestore, storage, isOfflineMode } = useFirebase();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const router = useRouter();
  const currentChapterNum = parseInt(chapterNumber);
  
  const [metadata, setMetadata] = useState<any>(null);
  const [chaptersCache, setChaptersCache] = useState<Record<number, any>>({});
  const [visibleChapterNums, setVisibleChapterNums] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreloading, setIsPreloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  const viewLoggedRef = useRef<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const epubCoverInputRef = useRef<HTMLInputElement>(null);

  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [isBookDeleteDialogOpen, setIsBookDeleteDialogOpen] = useState(false);
  const [isUpdatingCover, setIsUpdatingCover] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isExtractingEpub, setIsExtractingEpub] = useState(false);

  const profileRef = useMemoFirebase(() => (user && !user.isAnonymous && firestore) ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc(profileRef);
  const isAdmin = user?.email === 'hashamcomp@gmail.com' || profile?.role === 'admin';

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setIsSpeaking(checkIsSpeaking());
    }, 500);
    return () => {
      clearInterval(interval);
      stopTextToSpeech();
    };
  }, []);

  useEffect(() => {
    setVisibleChapterNums([currentChapterNum]);
  }, [currentChapterNum]);

  /**
   * Predictive Buffer: Silently fetches a range of upcoming chapters.
   */
  const preFetchNextChapters = useCallback(async (start: number, count: number = 3) => {
    if (!firestore || !id || isOfflineMode) return;
    
    const targetNumbers = Array.from({ length: count }, (_, i) => start + i)
      .filter(n => n > 0 && n <= (metadata?.totalChapters || 9999));
    
    const missingNumbers = targetNumbers.filter(n => !chaptersCache[n]);
    
    if (missingNumbers.length > 0) {
      try {
        const chaptersCol = collection(firestore, 'books', id, 'chapters');
        const q = query(chaptersCol, where('chapterNumber', 'in', missingNumbers));
        const snap = await getDocs(q);
        const newEntries: Record<number, any> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          newEntries[Number(data.chapterNumber)] = { id: d.id, ...data };
        });
        setChaptersCache(prev => ({ ...prev, ...newEntries }));
      } catch (err) {
        // Silent fail for background pre-fetching
      }
    }
  }, [firestore, id, chaptersCache, metadata, isOfflineMode]);

  useEffect(() => {
    if (isOfflineMode) {
      setIsLoading(false);
      return;
    }
    if (!firestore || !id) return;

    const loadChapter = async () => {
      // 1. SEAMLESS CHECK: If the chapter is already in cache, skip the loader
      if (chaptersCache[currentChapterNum]) {
        setIsLoading(false);
        if (viewLoggedRef.current !== id) {
          updateDoc(doc(firestore, 'books', id), { views: increment(1) }).catch(() => {});
          viewLoggedRef.current = id;
        }
        updateHistory();
        // Background pre-fetch next few chapters for subsequent seamless clicks
        preFetchNextChapters(currentChapterNum + 1, 3);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        // Fetch metadata if missing
        let meta = metadata;
        if (!meta) {
          const bookRef = doc(firestore, 'books', id);
          const snapshot = await getDoc(bookRef);
          if (!snapshot.exists()) {
            setError('Document not found in the cloud library.');
            setIsLoading(false);
            return;
          }
          const bookData = snapshot.data();
          meta = bookData.metadata?.info || bookData;
          setMetadata(meta);
        }

        // Fetch target chapter
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
          
          // Background pre-fetch next
          preFetchNextChapters(currentChapterNum + 1, 3);
        } else {
          setError(`Chapter ${currentChapterNum} is not yet available in the cloud.`);
        }
      } catch (err: any) {
        setError('Insufficient permissions or network error.');
      } finally {
        setIsLoading(false);
      }
    };

    loadChapter();
    stopTextToSpeech();
  }, [firestore, id, currentChapterNum, isOfflineMode, user, metadata, preFetchNextChapters]);

  const updateHistory = (metaOverride?: any) => {
    const meta = metaOverride || metadata;
    if (!meta) return;

    const bookTitle = meta.bookTitle || meta.title || 'Untitled';
    const bookAuthor = meta.author || 'Unknown';
    const coverURL = meta.coverURL || null;
    const genre = meta.genre || 'Novel';

    const localKey = `lounge-progress-${id}`;
    localStorage.setItem(localKey, currentChapterNum.toString());

    saveToLocalHistory({
      id,
      title: bookTitle,
      author: bookAuthor,
      coverURL,
      genre,
      lastReadChapter: currentChapterNum,
      lastReadAt: new Date().toISOString(),
      isCloud: true
    });

    if (user && firestore) {
      const historyRef = doc(firestore, 'users', user.uid, 'history', id);
      setDoc(historyRef, {
        bookId: id,
        title: bookTitle,
        author: bookAuthor,
        coverURL,
        genre,
        lastReadChapter: currentChapterNum,
        lastReadAt: serverTimestamp(),
        isCloud: true
      }, { merge: true }).catch(() => {});
    }
  };

  const handleUpdateCover = async (file: File) => {
    if (!firestore || !storage || !id) return;
    setIsUpdatingCover(true);
    try {
      const optimizedBlob = await optimizeCoverImage(file);
      const optimizedFile = new File([optimizedBlob], file.name, { type: 'image/jpeg' });
      const downloadURL = await uploadCoverImage(storage, optimizedFile, id);
      if (downloadURL) {
        await updateCloudBookCover(firestore, id, downloadURL, optimizedFile.size);
        setMetadata((prev: any) => ({ ...prev, coverURL: downloadURL }));
        toast({ title: "Cover Updated", description: "Visual identity refreshed." });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update Failed", description: err.message });
    } finally {
      setIsUpdatingCover(false);
    }
  };

  const handleExtractEpubCover = async (file: File) => {
    if (!firestore || !id) return;
    setIsExtractingEpub(true);
    setIsUpdatingCover(true);
    try {
      toast({ title: "Analyzing Archive", description: "Locating embedded visual assets..." });
      
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/extract-cover', { method: 'POST', body: formData });
      
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Digital extraction failed.");
      }
      
      const { dataUri } = await res.json();
      const extractedFile = dataURLtoFile(dataUri, `epub_cover_${id}.jpg`);
      
      await handleUpdateCover(extractedFile);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Extraction Failed", description: err.message });
    } finally {
      setIsExtractingEpub(false);
      setIsUpdatingCover(false);
    }
  };

  const handleGenerateAICover = async () => {
    if (!firestore || !storage || !id || !metadata) return;
    setIsGeneratingAI(true);
    setIsUpdatingCover(true);
    try {
      toast({ title: "Studio Active", description: "Gemini is analyzing themes and generating art..." });
      const dataUri = await generateBookCover({
        title: metadata.bookTitle || metadata.title,
        author: metadata.author,
        genres: Array.isArray(metadata.genre) ? metadata.genre : [metadata.genre],
        description: `A unique novel in the cloud library.`
      });

      const file = dataURLtoFile(dataUri, `ai_cover_${id}.jpg`);
      await handleUpdateCover(file);
    } catch (err: any) {
      toast({ variant: "destructive", title: "AI Generation Failed", description: err.message });
    } finally {
      setIsGeneratingAI(false);
      setIsUpdatingCover(false);
    }
  };

  const handlePreloadNext10 = async () => {
    if (isPreloading) return;
    setIsPreloading(true);
    
    const lastVisible = Math.max(...visibleChapterNums);
    const total = metadata?.totalChapters || 9999;
    
    if (lastVisible >= total) {
      toast({ title: "End of Volume", description: "You have reached the final chapter." });
      setIsPreloading(false);
      return;
    }

    try {
      const start = lastVisible + 1;
      const count = 10;
      const targetNumbers = Array.from({ length: count }, (_, i) => start + i)
        .filter(n => n > 0 && n <= (metadata?.totalChapters || 9999));
      
      const missingNumbers = targetNumbers.filter(n => !chaptersCache[n]);
      
      if (missingNumbers.length > 0) {
        const chaptersCol = collection(firestore!, 'books', id, 'chapters');
        const q = query(chaptersCol, where('chapterNumber', 'in', missingNumbers));
        const snap = await getDocs(q);
        const newEntries: Record<number, any> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          newEntries[Number(data.chapterNumber)] = { id: d.id, ...data };
        });
        setChaptersCache(prev => ({ ...prev, ...newEntries }));
      }
      
      setVisibleChapterNums(prev => [...prev, ...targetNumbers]);
      toast({ title: "Reader Extended", description: `Chapter buffer increased.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Sync Interrupted", description: "Cloud connection unstable." });
    } finally {
      setIsPreloading(false);
    }
  };

  const handleDeleteBook = async () => {
    if (!firestore || !id) return;
    setIsDeleting(true);
    setIsBookDeleteDialogOpen(false);
    try {
      await deleteCloudBook(firestore, id);
      toast({ title: "Manuscript Removed", description: "Novel successfully deleted." });
      router.push('/');
    } catch (err) {} finally {
      setIsDeleting(false);
    }
  };

  const handleReadAloud = async (chNum: number, startIndex: number = 0) => {
    if (isSpeaking) {
      stopTextToSpeech();
      setIsSpeaking(false);
      return;
    }

    const chData = chaptersCache[chNum];
    if (!chData?.content) return;
    
    setIsSpeaking(true);
    try {
      const savedSettings = localStorage.getItem('lounge-voice-settings');
      const voiceOptions = savedSettings ? JSON.parse(savedSettings) : {};
      
      const rawContent = chData.content || '';
      let textToRead = rawContent;
      if (startIndex > 0) {
        const paragraphs = rawContent
          .replace(/<br\s*\/?>/gi, '\n')
          .split(/<\/p>|<div>|<\/div>|\n\n|\r\n/)
          .map((p: string) => p.replace(/<[^>]*>?/gm, '').trim())
          .filter((p: string) => p.length > 0);
        textToRead = paragraphs.slice(startIndex).join('\n\n');
      }

      await playTextToSpeech(textToRead, voiceOptions);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Speech Error", description: err.message });
      setIsSpeaking(false);
    }
  };

  if (isOfflineMode) {
    return (
      <div className="max-w-[700px] mx-auto px-5 py-24 text-center">
        <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-800 rounded-[2.5rem] p-10 shadow-xl border-none">
          <CloudOff className="h-16 w-16 mb-6 mx-auto opacity-30" />
          <AlertTitle className="text-4xl font-headline font-black mb-4">Independent Mode Active</AlertTitle>
          <AlertDescription className="text-lg opacity-80 leading-relaxed max-w-lg mx-auto">
            Cloud volumes require an active connection.
          </AlertDescription>
          <div className="mt-10">
            <Button variant="outline" className="rounded-2xl h-14 px-10 font-bold border-amber-500/30 text-amber-900 bg-amber-500/5 hover:bg-amber-500/10" onClick={() => router.push('/')}>
              Return to Library
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  if (isLoading || isDeleting) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">
          {isDeleting ? 'Updating Manuscript...' : 'Syncing with Library...'}
        </p>
      </div>
    );
  }

  if (error || !chaptersCache[currentChapterNum]) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        {error?.includes('permissions') ? <ShieldAlert className="h-16 w-16 text-destructive mb-4 opacity-20" /> : <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />}
        <h1 className="text-4xl font-headline font-black mb-4">{error?.includes('permissions') ? 'Access Restricted' : 'Shelf Empty'}</h1>
        <p className="text-muted-foreground max-w-md mb-8">{error || "This novel doesn't seem to exist."}</p>
        <Button variant="outline" className="rounded-2xl h-12 px-8 font-bold" onClick={() => router.push('/')}>Back to Library</Button>
      </div>
    );
  }

  const totalChapters = metadata?.totalChapters || 0;
  if (!mounted) return null;

  const lastVisibleNum = Math.max(...visibleChapterNums);

  return (
    <div className="max-w-[700px] mx-auto px-5 py-5 transition-all duration-500 selection:bg-primary/20 selection:text-primary">
      <header className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-muted-foreground hover:text-primary transition-colors group">
            <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full text-primary hover:bg-primary/10"
                onClick={() => setIsManageDialogOpen(true)}
                title="Lounge Studio"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              className={`rounded-xl px-4 gap-2 transition-all ${isPreloading ? 'opacity-50' : 'hover:border-primary/40'}`}
              onClick={handlePreloadNext10}
              disabled={isPreloading || lastVisibleNum >= totalChapters}
            >
              {isPreloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className={`h-3 w-3 ${visibleChapterNums.length > 1 ? 'text-green-500 fill-green-500' : 'text-primary'}`} />}
              <span className="text-[10px] font-black uppercase tracking-widest">
                {visibleChapterNums.length > 1 ? 'Extended' : `Buffer 10`}
              </span>
            </Button>

            <VoiceSettingsPopover />
            
            <Button 
              variant="outline" 
              size="icon" 
              className={`rounded-full shadow-sm transition-all ${isSpeaking ? 'bg-primary text-primary-foreground border-primary' : 'text-primary border-primary/20 hover:bg-primary/5'}`}
              onClick={() => handleReadAloud(currentChapterNum)}
              title={isSpeaking ? "Stop Reading" : "Read Aloud"}
            >
              {isSpeaking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
            </Button>

            <Link href={`/chat/${id}`}>
              <Button variant="outline" size="icon" className="rounded-full text-primary border-primary/20 hover:bg-primary/5 shadow-sm">
                <MessageSquare className="h-4 w-4" />
              </Button>
            </Link>
            <Button variant="outline" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="rounded-full">
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
            </Button>
          </div>
        </div>

        <div className="space-y-6 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3">
             <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] font-black px-4 py-1">Cloud</Badge>
             <Badge variant="outline" className="border-accent/30 text-accent uppercase text-[10px] font-black px-4 py-1">{metadata?.genre?.[0] || metadata?.genre || 'Novel'}</Badge>
          </div>
          <h1 className="text-5xl sm:text-6xl font-headline font-black leading-[1.1] tracking-tight">
            {metadata?.bookTitle || metadata?.title || 'Untitled'}
          </h1>
          <p className="text-xl text-muted-foreground italic font-medium opacity-80">By {metadata?.author || 'Unknown'}</p>
        </div>
      </header>

      <div className="space-y-20">
        {visibleChapterNums.map((chNum) => {
          const chData = chaptersCache[chNum];
          if (!chData) return null;

          const paragraphs = (chData.content || '')
            .replace(/<br\s*\/?>/gi, '\n')
            .split(/<\/p>|<div>|<\/div>|\n\n|\r\n/)
            .map((p: string) => p.replace(/<[^>]*>?/gm, '').trim())
            .filter((p: string) => p.length > 0);

          return (
            <article key={chNum} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <header className="mb-10 border-b border-border/50 pb-10">
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-6 text-xs font-black uppercase tracking-[0.3em] text-primary/60">
                  <Bookmark className="h-4 w-4" />
                  Chapter {chNum}
                </div>
                <h2 className="text-4xl font-headline font-black leading-tight text-primary">
                  {chData.title || `Chapter ${chNum}`}
                </h2>
              </header>

              <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] font-body leading-[1.6] text-foreground/90">
                {paragraphs.map((cleanPara: string, idx: number) => (
                  <p key={`${chNum}-${idx}`} onClick={() => handleReadAloud(chNum, idx)} className="mb-8 cursor-pointer hover:text-foreground transition-colors">
                    {cleanPara}
                  </p>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <section className="mt-20 pt-12 border-t border-border/50">
        <div className="flex items-center justify-between gap-8">
          <Button variant="outline" className="h-12 px-8 rounded-2xl border-primary/20 font-black text-xs uppercase tracking-widest" disabled={currentChapterNum <= 1} onClick={() => router.push(`/pages/${id}/${currentChapterNum - 1}`)}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Prev
          </Button>
          <div className="text-center min-w-[80px]">
             <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">{lastVisibleNum} / {totalChapters || '...'}</span>
          </div>
          <Button 
            variant="default" 
            className="h-12 px-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl font-black text-xs uppercase tracking-widest" 
            disabled={totalChapters > 0 && lastVisibleNum >= totalChapters} 
            onClick={() => router.push(`/pages/${id}/${lastVisibleNum + 1}`)}
          >
            Next <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
        <DialogContent className="rounded-[2.5rem] shadow-2xl border-none max-w-md overflow-hidden bg-card/95 backdrop-blur-xl">
          <div className="h-2 bg-primary w-full absolute top-0 left-0" />
          <DialogHeader className="pt-6">
            <DialogTitle className="text-3xl font-headline font-black flex items-center gap-3">
              <Settings className="h-6 w-6 text-primary" />
              Lounge Studio
            </DialogTitle>
            <DialogDescription>Enhance and manage this manuscript.</DialogDescription>
          </DialogHeader>
          
          <div className="py-6">
            <Tabs defaultValue="cover" className="w-full">
              <TabsList className="grid w-full grid-cols-2 rounded-xl h-12 bg-muted/50 p-1 mb-8">
                <TabsTrigger value="cover" className="rounded-lg font-bold">Visuals</TabsTrigger>
                <TabsTrigger value="danger" className="rounded-lg font-bold text-destructive">Control</TabsTrigger>
              </TabsList>

              <TabsContent value="cover" className="space-y-8 animate-in fade-in duration-500">
                <div className="relative aspect-[2/3] w-48 mx-auto bg-muted rounded-2xl overflow-hidden shadow-2xl border-4 border-background group">
                  <img 
                    src={metadata?.coverURL || `https://picsum.photos/seed/${id}/400/600`} 
                    alt="Current Cover" 
                    className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-700" 
                  />
                  {isUpdatingCover && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center text-white p-4">
                      <Loader2 className="h-10 w-10 animate-spin mb-3 text-primary" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                        {isExtractingEpub ? 'Extracting...' : isGeneratingAI ? 'Generating...' : 'Syncing...'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <Button 
                    variant="default" 
                    className="rounded-2xl h-16 bg-primary shadow-xl font-black gap-2 relative overflow-hidden group"
                    onClick={handleGenerateAICover}
                    disabled={isUpdatingCover}
                  >
                    <Sparkles className="h-5 w-5" />
                    Studio AI Generation
                    {isGeneratingAI && <span className="absolute inset-0 bg-white/10 animate-shimmer" />}
                  </Button>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <input 
                        type="file" 
                        ref={coverInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => e.target.files && handleUpdateCover(e.target.files[0])} 
                      />
                      <Button 
                        variant="outline" 
                        className="w-full rounded-2xl h-14 font-bold border-primary/20 text-primary hover:bg-primary/5 gap-2" 
                        onClick={() => coverInputRef.current?.click()} 
                        disabled={isUpdatingCover}
                      >
                        <Upload className="h-4 w-4" />
                        Manual
                      </Button>
                    </div>

                    <div className="relative">
                      <input 
                        type="file" 
                        ref={epubCoverInputRef} 
                        className="hidden" 
                        accept=".epub" 
                        onChange={(e) => e.target.files && handleExtractEpubCover(e.target.files[0])} 
                      />
                      <Button 
                        variant="outline" 
                        className="w-full rounded-2xl h-14 font-bold border-primary/20 text-primary hover:bg-primary/5 gap-2" 
                        onClick={() => epubCoverInputRef.current?.click()} 
                        disabled={isUpdatingCover}
                      >
                        <FileText className="h-4 w-4" />
                        EPUB
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="danger" className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                <div className="bg-destructive/5 border border-destructive/10 p-6 rounded-3xl">
                  <h4 className="text-destructive font-black text-sm uppercase tracking-widest mb-2 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    Danger Zone
                  </h4>
                  <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                    Removing this volume will purge it globally for all readers. This action is irreversible.
                  </p>
                  <Button 
                    variant="destructive" 
                    className="w-full rounded-2xl h-14 font-black gap-2"
                    onClick={() => setIsBookDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Manuscript
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="ghost" className="w-full rounded-xl" onClick={() => setIsManageDialogOpen(false)}>Close Studio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isBookDeleteDialogOpen} onOpenChange={setIsBookDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[2.5rem] shadow-2xl border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-headline font-black text-destructive">Final Deletion</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              You are about to remove <span className="font-bold text-foreground">"{metadata?.bookTitle || metadata?.title}"</span> from the global Lounge.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteBook} 
              className="bg-destructive hover:bg-destructive/90 rounded-xl font-bold px-8 h-12"
            >
              Confirm Global Purge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
