'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser } from '@/firebase';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, ShieldAlert, Sun, Moon, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useTheme } from 'next-themes';
import Link from 'next/link';

interface CloudReaderClientProps {
  id: string;
  chapterNumber: string;
}

export function CloudReaderClient({ id, chapterNumber }: CloudReaderClientProps) {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const currentChapterNum = parseInt(chapterNumber);
  
  const [metadata, setMetadata] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
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
  }, [firestore, id, user, currentChapterNum]);

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

  return (
    <div className="max-w-[700px] mx-auto px-5 py-5 transition-all duration-500 selection:bg-primary/20 selection:text-primary">
      <header className="mb-12">
        <div className="flex items-center justify-between mb-10">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-muted-foreground hover:text-primary transition-colors group">
            <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Back
          </Button>
          <div className="flex gap-2">
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

        <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] leading-[1.6] font-body text-foreground/90">
          {(currentChapter.content || '').split(/<p>|\n\n/).map((para: string, idx: number) => {
            const cleanPara = para.replace(/<\/p>|<[^>]*>?/gm, '').trim();
            if (!cleanPara) return null;
            return (
              <p key={idx} className="mb-8 first-letter:text-3xl first-letter:font-black first-letter:text-primary first-letter:float-left first-letter:mr-2 first-letter:mt-1">
                {cleanPara}
              </p>
            );
          })}
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
