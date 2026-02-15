
'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { BookX, Loader2, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, ShieldAlert, Navigation, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Input } from '@/components/ui/input';
import { useTheme } from 'next-themes';

interface CloudReaderClientProps {
  id: string;
  chapterNumber: string;
}

export function CloudReaderClient({ id, chapterNumber }: CloudReaderClientProps) {
  const { firestore } = useFirebase();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const currentChapterNum = parseInt(chapterNumber);
  
  const [metadata, setMetadata] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jumpValue, setJumpValue] = useState('');
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
          setMetadata(data.metadata?.info || data);
          setChapters(chaptersList);
        }
      } catch (err: any) {
        const permError = new FirestorePermissionError({
          path: `books/${id}`,
          operation: 'get'
        });
        errorEmitter.emit('permission-error', permError);
        setError('Insufficient permissions or network error.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [firestore, id]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">Opening the Lounge...</p>
      </div>
    );
  }

  if (error || chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        {error?.includes('permissions') ? (
          <ShieldAlert className="h-16 w-16 text-destructive mb-4 opacity-20" />
        ) : (
          <BookX className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
        )}
        <h1 className="text-3xl font-headline font-black mb-2">
          {error?.includes('permissions') ? 'Access Restricted' : 'Novel Not Found'}
        </h1>
        <p className="text-muted-foreground max-w-md mb-8">
          {error || "This novel doesn't seem to exist in the cloud library yet."}
        </p>
        <Button variant="outline" className="rounded-xl px-8" onClick={() => router.push('/')}>
          Return to Library
        </Button>
      </div>
    );
  }

  const currentChapter = chapters.find(ch => ch.chapterNumber === currentChapterNum) || chapters[0];
  const totalChapters = chapters.length;

  if (!mounted) return null;

  return (
    <div className="max-w-[700px] mx-auto px-5 py-5 font-body text-[18px] leading-[1.6] text-foreground transition-colors duration-300">
      <header className="mb-10 text-center sm:text-left">
        <div className="flex items-center justify-between mb-8">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.back()}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
            className="rounded-full"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
          </Button>
        </div>

        <div className="space-y-4">
          <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] uppercase font-black px-3 py-0.5 tracking-[0.1em]">
            Cloud Edition
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-headline font-black leading-tight tracking-tight mb-2">
            {metadata?.bookTitle || metadata?.title || 'Untitled Novel'}
          </h1>
          <p className="text-lg text-muted-foreground italic">
            By {metadata?.author || 'Unknown Author'}
          </p>
        </div>
      </header>

      <article id={`chapter-${currentChapter.chapterNumber}`} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <header className="mb-8 border-b pb-8">
          <div className="flex items-center justify-center sm:justify-start gap-3 mb-4 text-xs font-bold uppercase tracking-widest text-primary">
            <Bookmark className="h-3.5 w-3.5" />
            Chapter {currentChapter.chapterNumber}
          </div>
          <h2 className="text-3xl font-headline font-bold leading-tight">
            {currentChapter.title || `Chapter ${currentChapter.chapterNumber}`}
          </h2>
        </header>

        <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] leading-[1.6]">
          {(currentChapter.content || '').split('\n\n').map((para: string, idx: number) => {
            const cleanPara = para.replace(/<[^>]*>?/gm, '').trim();
            if (!cleanPara) return null;
            return (
              <p key={idx} className="mb-6 first-letter:text-2xl first-letter:font-black first-letter:text-primary first-letter:float-left first-letter:mr-2">
                {cleanPara}
              </p>
            );
          })}
        </div>
      </article>

      <section className="mt-16 pt-10 border-t space-y-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              className="h-10 px-6 rounded-xl border-primary/20 hover:bg-primary/5 font-bold"
              disabled={currentChapterNum <= 1}
              onClick={() => router.push(`/pages/${id}/${currentChapterNum - 1}`)}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Prev
            </Button>

            <div className="text-center min-w-[60px]">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
                 {currentChapterNum} / {totalChapters}
               </span>
            </div>

            <Button 
              variant="default" 
              className="h-10 px-6 rounded-xl bg-primary hover:bg-primary/90 shadow-md font-bold"
              disabled={currentChapterNum >= totalChapters}
              onClick={() => router.push(`/pages/${id}/${currentChapterNum + 1}`)}
            >
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
