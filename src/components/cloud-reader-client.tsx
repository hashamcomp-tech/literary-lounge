'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser } from '@/firebase';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, ShieldAlert, Sun, Moon, MessageSquare, Volume2, CloudOff, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { playTextToSpeech, stopTextToSpeech } from '@/lib/tts-service';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VoiceSettingsPopover } from '@/components/voice-settings-popover';

interface CloudReaderClientProps {
  id: string;
  chapterNumber: string;
}

/**
 * @fileOverview Refined Cloud Reader Client.
 * Features 'Click to Read from Here' functionality.
 */
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

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
          })).sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
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

  const handleReadAloud = async (startIndex: number = 0) => {
    const currentChapter = chapters.find(ch => ch.chapterNumber === currentChapterNum);
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Syncing with Library...</p>
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

  const currentChapter = chapters.find(ch => ch.chapterNumber === currentChapterNum) || chapters[0];
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
          <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mt-4 opacity-50">Click any paragraph to read from that point.</p>
        </header>

        <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] font-body leading-[1.6] text-foreground/90">
          {paragraphs.map((cleanPara: string, idx: number) => (
            <p 
              key={idx} 
              onClick={() => handleReadAloud(idx)}
              className="mb-8 cursor-pointer hover:bg-primary/5 rounded-lg p-2 -m-2 transition-colors relative group/para first-letter:text-3xl first-letter:font-black first-letter:text-primary first-letter:float-left first-letter:mr-2 first-letter:mt-1"
            >
              <span className="absolute -left-6 top-3 opacity-0 group-hover/para:opacity-100 transition-opacity">
                <PlayCircle className="h-4 w-4 text-primary" />
              </span>
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
