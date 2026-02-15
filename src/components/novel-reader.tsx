"use client";

import { useState, useEffect, useRef } from 'react';
import { Menu, Type, Moon, Sun, ArrowLeft, Navigation, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Novel } from '@/lib/mock-data';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

interface NovelReaderProps {
  novel: Novel;
}

export default function NovelReader({ novel }: NovelReaderProps) {
  const router = useRouter();
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [jumpValue, setJumpValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentChapter = novel.chapters[currentChapterIndex];
  const progress = ((currentChapterIndex + 1) / novel.chapters.length) * 100;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(0, 0);
    }
    localStorage.setItem(`progress-${novel.id}`, currentChapterIndex.toString());
  }, [currentChapterIndex, novel.id]);

  useEffect(() => {
    const saved = localStorage.getItem(`progress-${novel.id}`);
    if (saved) {
      setCurrentChapterIndex(parseInt(saved));
    }
  }, [novel.id]);

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(jumpValue);
    if (!isNaN(num) && num >= 1 && num <= novel.chapters.length) {
      setCurrentChapterIndex(num - 1);
      setJumpValue('');
    }
  };

  return (
    <div className={`flex flex-col h-[calc(100vh-4rem)] ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex-1 overflow-y-auto relative bg-card dark:bg-slate-950 transition-colors duration-300">
        <main className="max-w-[700px] mx-auto px-5 py-10 font-body text-[18px] leading-[1.6] text-[#222] dark:text-slate-200">
          <header className="mb-10 text-center sm:text-left">
            <div className="flex items-center justify-between mb-8">
               <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.back()}
                className="text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>

              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={() => setIsDarkMode(!isDarkMode)} className="rounded-full">
                  {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="rounded-full">
                      <Menu className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left">
                    <SheetHeader>
                      <SheetTitle className="font-headline">{novel.title}</SheetTitle>
                    </SheetHeader>
                    <ScrollArea className="h-[calc(100vh-120px)] mt-4">
                      <div className="space-y-1">
                        {novel.chapters.map((ch, idx) => (
                          <Button
                            key={ch.id}
                            variant={currentChapterIndex === idx ? "secondary" : "ghost"}
                            className="w-full justify-start text-left"
                            onClick={() => setCurrentChapterIndex(idx)}
                          >
                            {idx + 1}. {ch.title}
                          </Button>
                        ))}
                      </div>
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            <div className="space-y-4">
              <Badge variant="outline" className="uppercase tracking-widest text-[10px]">Mock Collection</Badge>
              <h1 className="text-4xl sm:text-5xl font-headline font-black leading-tight tracking-tight">
                {novel.title}
              </h1>
              <p className="text-lg text-muted-foreground italic">By {novel.author}</p>
            </div>
          </header>

          <article id={`chapter-${currentChapterIndex + 1}`} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <header className="mb-8 border-b pb-8">
               <h2 className="text-3xl font-headline font-bold text-primary">
                 {currentChapter.title}
               </h2>
            </header>

            <div className="prose prose-slate dark:prose-invert max-w-none text-[18px] leading-[1.6]">
              {currentChapter.content.split('\n\n').map((para, i) => (
                <p key={i} className="mb-6 first-letter:text-2xl first-letter:font-black first-letter:text-primary first-letter:float-left first-letter:mr-2">
                  {para}
                </p>
              ))}
            </div>
          </article>

          <section className="mt-16 pt-10 border-t space-y-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <form onSubmit={handleJump} className="flex items-center gap-3">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Jump to:</label>
                <Input 
                  type="number" 
                  min={1} 
                  max={novel.chapters.length}
                  value={jumpValue}
                  onChange={(e) => setJumpValue(e.target.value)}
                  className="w-16 h-8 text-sm"
                />
                <Button type="submit" size="sm" variant="outline" className="h-8">
                  <Navigation className="h-3.5 w-3.5" />
                </Button>
              </form>

              <nav className="chapter-nav flex items-center gap-4">
                <Button 
                  variant="outline" 
                  disabled={currentChapterIndex === 0}
                  onClick={() => setCurrentChapterIndex(prev => prev - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                
                <span className="text-[10px] font-black uppercase text-muted-foreground/50">
                  {currentChapterIndex + 1} / {novel.chapters.length}
                </span>

                <Button 
                  variant="default" 
                  className="bg-primary"
                  disabled={currentChapterIndex === novel.chapters.length - 1}
                  onClick={() => setCurrentChapterIndex(prev => prev + 1)}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </nav>
            </div>
          </section>
        </main>
      </div>

      <div className="h-1 bg-muted w-full fixed bottom-0 left-0">
        <Progress value={progress} className="h-full rounded-none" />
      </div>
    </div>
  );
}
