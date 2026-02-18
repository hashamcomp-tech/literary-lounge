'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { doc, getDoc, collection, getDocs, updateDoc, increment, serverTimestamp, query, where, limit, setDoc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, ShieldAlert, Sun, Moon, MessageSquare, Volume2, CloudOff, Trash2, MoreVertical, Zap, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { playTextToSpeech, stopTextToSpeech } from '@/lib/tts-service';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VoiceSettingsPopover } from '@/components/voice-settings-popover';
import { deleteCloudBook, updateCloudBookCover } from '@/lib/cloud-library-utils';
import { generateBookCover } from '@/ai/flows/generate-cover';
import { uploadCoverImage } from '@/lib/upload-cover';
import { optimizeCoverImage } from '@/lib/image-utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { saveToLocalHistory } from '@/lib/local-history-utils';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CloudReaderClientProps {
  id: string;
  chapterNumber: string;
}

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

  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [isBookDeleteDialogOpen, setIsBookDeleteDialogOpen] = useState(false);
  const [isUpdatingCover, setIsUpdatingCover] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);

  const profileRef = useMemoFirebase(() => (user && !user.isAnonymous && firestore) ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc(profileRef);
  const isAdmin = user?.email === 'hashamcomp@gmail.com' || profile?.role === 'admin';

  useEffect(() => {
    setMounted(true);
    return () => stopTextToSpeech();
  }, []);

  useEffect(() => {
    setVisibleChapterNums([currentChapterNum]);
  }, [currentChapterNum]);

  const fetchChaptersRange = useCallback(async (start: number, count: number) => {
    if (!firestore || !id) return [];
    
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
        return targetNumbers.filter(n => newEntries[n] || chaptersCache[n]);
      } catch (err: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `books/${id}/chapters`,
          operation: 'list',
        }));
        return [];
      }
    }
    
    return targetNumbers;
  }, [firestore, id, chaptersCache, metadata]);

  useEffect(() => {
    if (isOfflineMode) {
      setIsLoading(false);
      return;
    }
    if (!firestore || !id) return;

    const loadChapter = async () => {
      if (metadata && chaptersCache[currentChapterNum]) {
        if (viewLoggedRef.current !== id) {
          updateDoc(doc(firestore, 'books', id), { views: increment(1) }).catch(() => {});
          viewLoggedRef.current = id;
        }
        updateHistory();
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        const bookRef = doc(firestore, 'books', id);
        const snapshot = await getDoc(bookRef);
        if (!snapshot.exists()) {
          setError('Document not found in the cloud library.');
          setIsLoading(false);
          return;
        }
        const bookData = snapshot.data();
        const meta = bookData.metadata?.info || bookData;
        setMetadata(meta);

        const chapterRef = doc(firestore, 'books', id, 'chapters', currentChapterNum.toString());
        const chapterSnap = await getDoc(chapterRef);
        
        if (chapterSnap.exists()) {
          const chData = { id: chapterSnap.id, ...chapterSnap.data() };
          setChaptersCache(prev => ({ ...prev, [currentChapterNum]: chData }));
        } else {
          const chaptersCol = collection(firestore, 'books', id, 'chapters');
          const q = query(chaptersCol, where('chapterNumber', '==', currentChapterNum), limit(1));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            const chData = { id: querySnap.docs[0].id, ...querySnap.docs[0].data() };
            setChaptersCache(prev => ({ ...prev, [currentChapterNum]: chData }));
          } else {
            setError(`Chapter ${currentChapterNum} is not yet available in the cloud.`);
          }
        }

        if (viewLoggedRef.current !== id) {
          updateDoc(bookRef, { views: increment(1) }).catch(() => {});
          viewLoggedRef.current = id;
        }
        updateHistory(meta);
      } catch (err: any) {
        setError('Insufficient permissions or network error.');
      } finally {
        setIsLoading(false);
      }
    };

    loadChapter();
    stopTextToSpeech();
  }, [firestore, id, currentChapterNum, isOfflineMode, user]);

  const updateHistory = (metaOverride?: any) => {
    const meta = metaOverride || metadata;
    if (!meta || !firestore) return;

    const bookTitle = meta.bookTitle || meta.title || 'Untitled';
    const bookAuthor = meta.author || 'Unknown';
    const coverURL = meta.coverURL || null;
    const genre = meta.genre || 'Novel';

    // 1. Local storage persistence for all users (including unlogged in)
    const localKey = `lounge-progress-${id}`;
    localStorage.setItem(localKey, currentChapterNum.toString());

    // 2. Minimal history for unlogged users or session persistence
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

    // 3. Cloud persistence if authenticated (Anonymous or Registered)
    if (user) {
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

  const handleGenerateAiCover = async () => {
    if (!firestore || !storage || !id || !metadata) return;
    setIsGeneratingCover(true);
    try {
      const genres = Array.isArray(metadata.genre) ? metadata.genre : [metadata.genre];
      const dataUri = await generateBookCover({
        title: metadata.bookTitle || metadata.title,
        author: metadata.author,
        genres: genres,
        description: `An authentic cover for the manuscript titled ${metadata.bookTitle || metadata.title}`
      });
      const resp = await fetch(dataUri);
      const blob = await resp.blob();
      const file = new File([blob], 'ai_cover.jpg', { type: 'image/jpeg' });
      await handleUpdateCover(file);
    } catch (err: any) {
      toast({ variant: "destructive", title: "AI Generation Failed", description: err.message });
    } finally {
      setIsGeneratingCover(false);
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
      const fetchedNums = await fetchChaptersRange(lastVisible + 1, 10);
      if (fetchedNums.length > 0) {
        setVisibleChapterNums(prev => [...prev, ...fetchedNums]);
        toast({ title: "Reader Extended", description: `${fetchedNums.length} chapters added seamlessly.` });
      } else {
        toast({ variant: "destructive", title: "Sync Failed", description: "Upcoming chapters not found." });
      }
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
      await deleteCloudBook(firestore, storage!, id);
      toast({ title: "Manuscript Removed", description: "Novel successfully deleted." });
      router.push('/');
    } catch (err) {} finally {
      setIsDeleting(false);
    }
  };

  const handleReadAloud = async (chNum: number, startIndex: number = 0) => {
    const chData = chaptersCache[chNum];
    if (!chData?.content) return;
    setIsSpeaking(true);
    try {
      const savedSettings = localStorage.getItem('lounge-voice-settings');
      const voiceOptions = savedSettings ? JSON.parse(savedSettings) : {};
      
      const paragraphs = (chData.content || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .split(/<\/p>|<div>|<\/div>|\n\n|\r\n/)
        .map((p: string) => p.replace(/<[^>]*>?/gm, '').trim())
        .filter((p: string) => p.length > 0);

      const textToRead = paragraphs.slice(startIndex).join('\n\n');
      await playTextToSpeech(textToRead, voiceOptions);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Speech Error", description: err.message });
    } finally {
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl w-56 shadow-2xl border-none">
                  <DropdownMenuItem className="rounded-lg gap-2 cursor-pointer py-2.5" onClick={() => setIsManageDialogOpen(true)}>
                    <ImageIcon className="h-4 w-4" />
                    <span>Update Cover Art</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="rounded-lg gap-2 text-destructive font-bold cursor-pointer py-2.5" onClick={() => setIsBookDeleteDialogOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                    <span>Delete Manuscript</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
        <DialogContent className="rounded-2xl shadow-2xl border-none max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline font-black">Manage Manuscript</DialogTitle>
            <DialogDescription>Refresh visual identity.</DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-6">
            <div className="relative aspect-[2/3] w-40 mx-auto bg-muted rounded-xl overflow-hidden shadow-2xl border-4 border-background">
              <img src={metadata?.coverURL || `https://picsum.photos/seed/${id}/400/600`} alt="Cover" className="w-full h-full object-cover" />
              {(isUpdatingCover || isGeneratingCover) && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white p-4">
                  <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Syncing...</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files && handleUpdateCover(e.target.files[0])} />
              <Button variant="outline" className="rounded-xl h-14 font-bold" onClick={() => coverInputRef.current?.click()} disabled={isUpdatingCover || isGeneratingCover}>
                Manual Upload
              </Button>
              <Button variant="outline" className="rounded-xl h-14 font-bold bg-primary/5 text-primary" onClick={handleGenerateAiCover} disabled={isUpdatingCover || isGeneratingCover}>
                AI Design
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="w-full rounded-xl" onClick={() => setIsManageDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isBookDeleteDialogOpen} onOpenChange={setIsBookDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl shadow-2xl border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-headline font-black text-destructive">Final Deletion</AlertDialogTitle>
            <AlertDialogDescription>Remove <span className="font-bold text-foreground">"{metadata?.bookTitle || metadata?.title}"</span>? Purge globally for all readers.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBook} className="bg-destructive hover:bg-destructive/90 rounded-xl font-bold">Delete Forever</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
