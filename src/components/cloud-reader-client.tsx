'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, ShieldAlert, Sun, Moon, MessageSquare, Volume2, CloudOff, Trash2, Eraser, ListChecks, Check } from 'lucide-react';
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CloudReaderClientProps {
  id: string;
  chapterNumber: string;
}

export function CloudReaderClient({ id, chapterNumber }: CloudReaderClientProps) {
  const { firestore, isOfflineMode } = useFirebase();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const router = useRouter();
  const currentChapterNum = parseInt(chapterNumber);
  
  const [metadata, setMetadata] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // Bulk Selection States
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);

  // Check admin status via profile
  const profileRef = useMemoFirebase(() => (user && !user.isAnonymous && firestore) ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile } = useDoc(profileRef);
  const isAdmin = user?.email === 'hashamcomp@gmail.com' || profile?.role === 'admin';

  useEffect(() => {
    setMounted(true);
    return () => stopTextToSpeech();
  }, []);

  useEffect(() => {
    if (isOfflineMode) {
      setIsLoading(false);
      return;
    }
    if (!firestore || !id) return;

    const fetchData = async () => {
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

        const data = snapshot.data();
        let chaptersList = data.chapters || [];
        
        if (chaptersList.length === 0) {
          const subColRef = collection(firestore, 'books', id, 'chapters');
          const subSnap = await getDocs(subColRef);
          chaptersList = subSnap.docs.map(d => ({ 
            id: d.id, 
            ...d.data() 
          })).sort((a, b) => (Number(a.chapterNumber) || 0) - (Number(b.chapterNumber) || 0));
        }

        if (chaptersList.length === 0) {
          setError('This novel exists but has no chapters published yet.');
        } else {
          const meta = data.metadata?.info || data;
          setMetadata(meta);
          setChapters(chaptersList);

          if (user && !user.isAnonymous) {
            const historyRef = doc(firestore, 'users', user.uid, 'history', id);
            const historyData = {
              bookId: id,
              title: meta.bookTitle || meta.title || 'Untitled',
              author: meta.author || 'Unknown',
              coverURL: meta.coverURL || null,
              genre: meta.genre || 'Novel',
              lastReadChapter: currentChapterNum,
              lastReadAt: serverTimestamp(),
              isCloud: true
            };
            
            setDoc(historyRef, historyData, { merge: true }).catch(() => {});
          }
        }
      } catch (err: any) {
        setError('Insufficient permissions or network error.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    stopTextToSpeech();
  }, [firestore, id, user, currentChapterNum, isOfflineMode]);

  const handleDeleteBook = async () => {
    if (!firestore || !id) return;
    setIsDeleting(true);
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

  const handleBulkDelete = async () => {
    if (!firestore || !id || selectedChapters.length === 0) return;
    setIsDeleting(true);
    setIsManageDialogOpen(false);
    try {
      await deleteCloudChaptersBulk(firestore, id, selectedChapters);
      toast({ 
        title: "Chapters Removed", 
        description: `${selectedChapters.length} chapter(s) have been deleted.` 
      });
      
      // If the current chapter was deleted, redirect to start
      if (selectedChapters.includes(currentChapterNum)) {
        router.push(`/pages/${id}/1`);
      } else {
        // Just refresh local state by re-fetching (implicitly handled by firestore listener if we used one, but here we re-run useEffect by navigating/triggering)
        window.location.reload(); 
      }
    } catch (err) {
      // Handled by global listener
    } finally {
      setIsDeleting(false);
      setSelectedChapters([]);
    }
  };

  const toggleChapterSelection = (num: number) => {
    setSelectedChapters(prev => 
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const handleReadAloud = async (startIndex: number = 0) => {
    const currentChapter = chapters.find(ch => Number(ch.chapterNumber) === currentChapterNum);
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

  if (error || chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        {error?.includes('permissions') ? <ShieldAlert className="h-16 w-16 text-destructive mb-4 opacity-20" /> : <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />}
        <h1 className="text-4xl font-headline font-black mb-4">{error?.includes('permissions') ? 'Access Restricted' : 'Shelf Empty'}</h1>
        <p className="text-muted-foreground max-w-md mb-8">{error || "This novel doesn't seem to exist in the cloud library."}</p>
        <Button variant="outline" className="rounded-2xl h-12 px-8 font-bold" onClick={() => router.push('/')}>Back to Library</Button>
      </div>
    );
  }

  const currentChapter = chapters.find(ch => Number(ch.chapterNumber) === currentChapterNum) || chapters[0];
  const totalChapters = chapters.length;

  if (!mounted) return null;

  const paragraphs = (currentChapter.content || '').split(/<p>|\n\n/)
    .map((para: string) => para.replace(/<\/p>|<[^>]*>?/gm, '').trim())
    .filter((para: string) => para.length > 0);

  return (
    <div className="max-w-[700px] mx-auto px-5 py-5 transition-all duration-500 selection:bg-primary/20 selection:text-primary">
      <header className="mb-12">
        <div className="flex items-center justify-between mb-10">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-muted-foreground hover:text-primary transition-colors group">
            <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Back
          </Button>
          <div className="flex gap-2">
            {isAdmin && (
              <div className="flex gap-1">
                {/* Manage Chapters Dialog */}
                <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10" title="Manage Chapters">
                      <ListChecks className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-[2rem] max-w-md border-none shadow-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-headline font-black">Manuscript Management</DialogTitle>
                      <DialogDescription>
                        Select one or more chapters to remove from the global cloud library.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <ScrollArea className="h-64 mt-4 pr-4">
                      <div className="space-y-2">
                        {chapters.map((ch) => (
                          <div 
                            key={ch.chapterNumber} 
                            className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${selectedChapters.includes(Number(ch.chapterNumber)) ? 'bg-primary/5 border-primary' : 'hover:bg-muted/50'}`}
                            onClick={() => toggleChapterSelection(Number(ch.chapterNumber))}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox 
                                checked={selectedChapters.includes(Number(ch.chapterNumber))} 
                                onCheckedChange={() => toggleChapterSelection(Number(ch.chapterNumber))}
                                className="rounded-md"
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-bold">Chapter {ch.chapterNumber}</span>
                                <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{ch.title || 'Untitled'}</span>
                              </div>
                            </div>
                            {selectedChapters.includes(Number(ch.chapterNumber)) && <Check className="h-4 w-4 text-primary" />}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>

                    <DialogFooter className="mt-6">
                      <Button variant="ghost" onClick={() => setSelectedChapters([])} className="rounded-xl">Clear Selection</Button>
                      <Button 
                        variant="destructive" 
                        onClick={handleBulkDelete}
                        disabled={selectedChapters.length === 0}
                        className="rounded-xl font-bold px-6 shadow-lg shadow-destructive/20"
                      >
                        Delete Selected ({selectedChapters.length})
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Delete Entire Book */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full text-destructive hover:bg-destructive/10" title="Delete Entire Manuscript">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
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
            )}
            <Button 
              variant="outline" 
              size="icon" 
              className={`rounded-full shadow-sm transition-colors ${isSpeaking ? 'bg-primary text-primary-foreground border-primary' : 'text-primary border-primary/20 hover:bg-primary/5'}`}
              onClick={() => handleReadAloud(0)}
              disabled={isSpeaking}
              title="Read Aloud"
            >
              <Volume2 className={`h-4 w-4 ${isSpeaking ? 'animate-pulse' : ''}`} />
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

        <div className="space-y-6 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3">
             <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] uppercase font-black px-4 py-1 tracking-widest">Cloud Volume</Badge>
             <Badge variant="outline" className="border-accent/30 text-accent uppercase text-[10px] font-black px-4 py-1">{metadata?.genre || 'Novel'}</Badge>
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
              className="mb-8 cursor-pointer"
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
                 {currentChapterNum} / {totalChapters}
               </span>
            </div>

            <Button 
              variant="default" 
              className="flex-1 sm:flex-none h-12 px-8 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl font-black text-xs uppercase tracking-widest"
              disabled={currentChapterNum >= totalChapters}
              onClick={() => router.push(`/pages/${id}/${currentChapterNum + 1}`)}
            >
              Next <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
