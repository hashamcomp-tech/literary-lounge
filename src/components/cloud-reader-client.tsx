'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { doc, getDoc, collection, getDocs, setDoc, updateDoc, increment, serverTimestamp, query, where, limit, orderBy } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, ShieldAlert, Sun, Moon, MessageSquare, Volume2, CloudOff, Trash2, Eraser, ListChecks, Check, MoreVertical, Zap, ZapOff, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { playTextToSpeech, stopTextToSpeech } from '@/lib/tts-service';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VoiceSettingsPopover } from '@/components/voice-settings-popover';
import { deleteCloudBook, deleteCloudChaptersBulk } from '@/lib/cloud-library-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from '@/components/ui/progress';

interface CloudReaderClientProps {
  id: string;
  chapterNumber: string;
}

/**
 * @fileOverview Optimized Cloud Reader.
 * Features incremental loading and "Pre-load next 10 chapters" functionality.
 * Minimizes Firestore reads by only fetching what is needed or requested.
 */
export function CloudReaderClient({ id, chapterNumber }: CloudReaderClientProps) {
  const { firestore, isOfflineMode } = useFirebase();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const router = useRouter();
  const currentChapterNum = parseInt(chapterNumber);
  
  const [metadata, setMetadata] = useState<any>(null);
  const [chaptersCache, setChaptersCache] = useState<Record<number, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isPreloading, setIsPreloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  const viewLoggedRef = useRef<string | null>(null);

  // Administrative UI States
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [isBookDeleteDialogOpen, setIsBookDeleteDialogOpen] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);

  const profileRef = useMemoFirebase(() => (user && !user.isAnonymous && firestore) ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc(profileRef);
  const isAdmin = user?.email === 'hashamcomp@gmail.com' || profile?.role === 'admin';

  useEffect(() => {
    setMounted(true);
    return () => stopTextToSpeech();
  }, []);

  /**
   * Fetches specific chapters and adds them to the local cache.
   */
  const fetchChaptersRange = useCallback(async (start: number, count: number) => {
    if (!firestore || !id) return;
    
    const targetNumbers = Array.from({ length: count }, (_, i) => start + i)
      .filter(n => !chaptersCache[n] && n > 0 && n <= (metadata?.totalChapters || 9999));

    if (targetNumbers.length === 0) return;

    try {
      const chaptersCol = collection(firestore, 'books', id, 'chapters');
      // Firestore 'in' queries are limited to 10 items
      const q = query(chaptersCol, where('chapterNumber', 'in', targetNumbers));
      const snap = await getDocs(q);
      
      const newEntries: Record<number, any> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        newEntries[Number(data.chapterNumber)] = { id: d.id, ...data };
      });

      setChaptersCache(prev => ({ ...prev, ...newEntries }));
    } catch (err) {
      console.error("Preload fetch failed", err);
    }
  }, [firestore, id, chaptersCache, metadata]);

  // Initial and Chapter Navigation Effect
  useEffect(() => {
    if (isOfflineMode) {
      setIsLoading(false);
      return;
    }
    if (!firestore || !id) return;

    const loadChapter = async () => {
      // If we already have the metadata and the chapter in cache, just update views/history
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

        // Fetch current chapter if not cached
        const chapterRef = doc(firestore, 'books', id, 'chapters', currentChapterNum.toString());
        const chapterSnap = await getDoc(chapterRef);
        
        if (chapterSnap.exists()) {
          const chData = { id: chapterSnap.id, ...chapterSnap.data() };
          setChaptersCache(prev => ({ ...prev, [currentChapterNum]: chData }));
        } else {
          // Fallback check: maybe the chapter ID is not the number string
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

        // Analytics & History
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

    const updateHistory = (metaOverride?: any) => {
      if (user && !user.isAnonymous && firestore) {
        const meta = metaOverride || metadata;
        if (!meta) return;
        
        const historyRef = doc(firestore, 'users', user.uid, 'history', id);
        setDoc(historyRef, {
          bookId: id,
          title: meta.bookTitle || meta.title || 'Untitled',
          author: meta.author || 'Unknown',
          coverURL: meta.coverURL || null,
          genre: meta.genre || 'Novel',
          lastReadChapter: currentChapterNum,
          lastReadAt: serverTimestamp(),
          isCloud: true
        }, { merge: true }).catch(() => {});
      }
    };

    loadChapter();
    stopTextToSpeech();
  }, [firestore, id, currentChapterNum, isOfflineMode, user]);

  const handlePreloadNext10 = async () => {
    if (isPreloading) return;
    setIsPreloading(true);
    
    toast({
      title: "Syncing Ahead",
      description: "Pre-loading the next 10 chapters for seamless reading.",
    });

    try {
      await fetchChaptersRange(currentChapterNum + 1, 10);
      toast({
        title: "Shelf Ready",
        description: "Next 10 chapters cached successfully.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Preload Interrupted",
        description: "Cloud connection was unstable. Some chapters may still need fetching.",
      });
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
      toast({ title: "Manuscript Removed", description: "Novel successfully deleted from global library." });
      router.push('/');
    } catch (err) {
      // Handled by global listener
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCurrentChapter = async () => {
    if (!firestore || !id) return;
    setIsDeleting(true);
    try {
      await deleteCloudChaptersBulk(firestore, id, [currentChapterNum]);
      toast({ title: "Chapter Erased", description: `Chapter ${currentChapterNum} has been removed.` });
      
      // Navigate to another chapter or home
      router.push('/');
    } catch (err) {
      // Handled by global listener
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReadAloud = async (startIndex: number = 0) => {
    const currentChapter = chaptersCache[currentChapterNum];
    if (!currentChapter?.content) return;
    
    setIsSpeaking(true);
    try {
      const savedSettings = localStorage.getItem('lounge-voice-settings');
      const voiceOptions = savedSettings ? JSON.parse(savedSettings) : {};
      
      const paragraphs = currentChapter.content.split(/<p>|\n\n/)
        .map((p: string) => p.replace(/<\/p>|<[^>]*>?/gm, '').trim())
        .filter((p: string) => p.length > 0);

      const textToRead = paragraphs.slice(startIndex).join('\n\n');
      
      await playTextToSpeech(textToRead, voiceOptions);
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

  if (isOfflineMode) {
    return (
      <div className="max-w-[700px] mx-auto px-5 py-24 text-center">
        <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-800 rounded-[2.5rem] p-10 shadow-xl border-none">
          <CloudOff className="h-16 w-16 mb-6 mx-auto opacity-30" />
          <AlertTitle className="text-4xl font-headline font-black mb-4">Independent Mode Active</AlertTitle>
          <AlertDescription className="text-lg opacity-80 leading-relaxed max-w-lg mx-auto">
            Cloud volumes require an active connection to the Lounge database. 
            Reconnect to access this novel and sync your reading journey.
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
        <p className="text-muted-foreground max-w-md mb-8">{error || "This novel doesn't seem to exist in the cloud library."}</p>
        <Button variant="outline" className="rounded-2xl h-12 px-8 font-bold" onClick={() => router.push('/')}>Back to Library</Button>
      </div>
    );
  }

  const currentChapter = chaptersCache[currentChapterNum];
  const totalChapters = metadata?.totalChapters || 0;

  if (!mounted) return null;

  const paragraphs = (currentChapter.content || '').split(/<p>|\n\n/)
    .map((para: string) => para.replace(/<\/p>|<[^>]*>?/gm, '').trim())
    .filter((para: string) => para.length > 0);

  // Check how many next chapters are cached
  const preloadedCount = Array.from({ length: 10 }, (_, i) => currentChapterNum + 1 + i)
    .filter(n => chaptersCache[n]).length;

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
                  <Button variant="ghost" size="icon" className="rounded-full text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl w-56 shadow-2xl border-none">
                  <DropdownMenuItem className="rounded-lg gap-2 text-destructive cursor-pointer py-2.5" onClick={handleDeleteCurrentChapter}>
                    <Eraser className="h-4 w-4" />
                    <span>Erase Current Chapter</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="rounded-lg gap-2 text-destructive font-bold cursor-pointer py-2.5" onClick={() => setIsBookDeleteDialogOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                    <span>Delete Entire Manuscript</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              className={`rounded-xl px-4 gap-2 transition-all ${isPreloading ? 'opacity-50' : 'hover:border-primary/40'}`}
              onClick={handlePreloadNext10}
              disabled={isPreloading || currentChapterNum >= totalChapters}
            >
              {isPreloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className={`h-3 w-3 ${preloadedCount === 10 ? 'text-green-500 fill-green-500' : 'text-primary'}`} />}
              <span className="text-[10px] font-black uppercase tracking-widest">
                {preloadedCount === 10 ? 'Chapters Ready' : `Pre-load Next 10`}
              </span>
            </Button>

            <VoiceSettingsPopover />
            <Link href={`/chat/${id}`}>
              <Button variant="outline" size="icon" className="rounded-full text-primary border-primary/20 hover:bg-primary/5 shadow-sm" title="Reader Lounge">
                <MessageSquare className="h-4 w-4" />
              </Button>
            </Link>
            <Button variant="outline" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="rounded-full shadow-sm">
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
            </Button>
          </div>
        </div>

        {preloadedCount > 0 && (
          <div className="mb-8 animate-in fade-in slide-in-from-top-1">
            <div className="flex justify-between items-center mb-1.5 px-1">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-1">
                <Sparkles className="h-2 w-2 text-primary" /> Cloud Seamless Cache
              </span>
              <span className="text-[8px] font-black text-primary uppercase">{preloadedCount} / 10 Next Chapters Buffered</span>
            </div>
            <Progress value={(preloadedCount / 10) * 100} className="h-1 bg-primary/5" />
          </div>
        )}

        <div className="space-y-6 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3">
             <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] uppercase font-black px-4 py-1 tracking-widest">Cloud Volume</Badge>
             <Badge variant="outline" className="border-accent/30 text-accent uppercase text-[10px] font-black px-4 py-1">{metadata?.genre?.[0] || metadata?.genre || 'Novel'}</Badge>
          </div>
          <h1 className="text-5xl sm:text-6xl font-headline font-black leading-[1.1] tracking-tight">
            {metadata?.bookTitle || metadata?.title || 'Untitled Novel'}
          </h1>
          <p className="text-xl text-muted-foreground italic font-medium opacity-80">
            By {metadata?.author || 'Unknown Author'}
          </p>
        </div>
      </header>

      <article id={`chapter-${currentChapter.chapterNumber}`} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header className="mb-10 border-b border-border/50 pb-10">
          <div className="flex items-center justify-center sm:justify-start gap-3 mb-6 text-xs font-black uppercase tracking-[0.3em] text-primary/60">
            <Bookmark className="h-4 w-4" />
            Chapter {currentChapter.chapterNumber}
          </div>
          <h2 className="text-4xl font-headline font-black leading-tight text-primary">
            {currentChapter.title || `Chapter ${currentChapter.chapterNumber}`}
          </h2>
        </header>

        <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] font-body leading-[1.6] text-foreground/90">
          {paragraphs.map((cleanPara: string, idx: number) => (
            <p 
              key={idx} 
              onClick={() => handleReadAloud(idx)}
              className="mb-8 cursor-pointer hover:text-foreground transition-colors"
            >
              {cleanPara}
            </p>
          ))}
        </div>
      </article>

      <section className="mt-20 pt-12 border-t border-border/50">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6 w-full sm:w-auto">
            <Button 
              variant="outline" 
              className="flex-1 sm:flex-none h-12 px-8 rounded-2xl border-primary/20 hover:bg-primary/5 font-black text-xs uppercase tracking-widest shadow-sm"
              disabled={currentChapterNum <= 1}
              onClick={() => router.push(`/pages/${id}/${currentChapterNum - 1}`)}
            >
              <ChevronLeft className="mr-2 h-4 w-4" /> Prev
            </Button>

            <div className="text-center min-w-[80px]">
               <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">
                 {currentChapterNum} / {totalChapters || '...'}
               </span>
            </div>

            <Button 
              variant="default" 
              className="flex-1 sm:flex-none h-12 px-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl font-black text-xs uppercase tracking-widest"
              disabled={totalChapters > 0 && currentChapterNum >= totalChapters}
              onClick={() => router.push(`/pages/${id}/${currentChapterNum + 1}`)}
            >
              Next <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Global Delete Alert */}
      <AlertDialog open={isBookDeleteDialogOpen} onOpenChange={setIsBookDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl shadow-2xl border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-headline font-black">Confirm Global Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-bold text-foreground">"{metadata?.bookTitle || metadata?.title}"</span> and all its chapters for all readers. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBook} className="bg-destructive hover:bg-destructive/90 rounded-xl font-bold">
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
