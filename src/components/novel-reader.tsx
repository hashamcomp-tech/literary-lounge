"use client";

import { useState, useEffect, useRef } from 'react';
import { Menu, Type, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Novel } from '@/lib/mock-data';
import { Progress } from '@/components/ui/progress';
import { ReaderControls } from './reader-controls';

interface NovelReaderProps {
  novel: Novel;
}

export default function NovelReader({ novel }: NovelReaderProps) {
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentChapter = novel.chapters[currentChapterIndex];
  const progress = ((currentChapterIndex + 1) / novel.chapters.length) * 100;

  useEffect(() => {
    // Scroll to top when chapter changes
    if (scrollRef.current) {
      scrollRef.current.scrollTo(0, 0);
    }
    // Save progress to localStorage
    localStorage.setItem(`progress-${novel.id}`, currentChapterIndex.toString());
  }, [currentChapterIndex, novel.id]);

  useEffect(() => {
    // Load progress from localStorage
    const saved = localStorage.getItem(`progress-${novel.id}`);
    if (saved) {
      setCurrentChapterIndex(parseInt(saved));
    }
  }, [novel.id]);

  const goToNextChapter = () => {
    if (currentChapterIndex < novel.chapters.length - 1) {
      setCurrentChapterIndex(prev => prev + 1);
    }
  };

  const goToPrevChapter = () => {
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex(prev => prev - 1);
    }
  };

  const handleChapterChange = (index: number) => {
    if (index >= 0 && index < novel.chapters.length) {
      setCurrentChapterIndex(index);
    }
  };

  return (
    <div className={`flex flex-col h-[calc(100vh-4rem)] ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex-1 overflow-hidden relative bg-card dark:bg-slate-950 transition-colors duration-300">
        <div className="max-w-3xl mx-auto h-full flex flex-col px-4 sm:px-8 py-6">
          
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-full shadow-sm">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[300px] sm:w-[400px]">
                  <SheetHeader>
                    <SheetTitle className="font-headline text-2xl">{novel.title}</SheetTitle>
                  </SheetHeader>
                  <div className="py-4 font-headline font-semibold text-sm text-muted-foreground uppercase tracking-wider border-b">
                    Table of Contents
                  </div>
                  <ScrollArea className="h-[calc(100vh-120px)] mt-4">
                    <div className="space-y-1">
                      {novel.chapters.map((chapter, index) => (
                        <Button
                          key={chapter.id}
                          variant={currentChapterIndex === index ? "secondary" : "ghost"}
                          className={`w-full justify-start text-left font-normal ${currentChapterIndex === index ? 'text-primary font-bold' : ''}`}
                          onClick={() => setCurrentChapterIndex(index)}
                        >
                          <span className="opacity-50 mr-2 text-xs">{index + 1}.</span>
                          <span className="truncate">{chapter.title}</span>
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
              <div>
                <h1 className="text-sm font-headline font-bold text-muted-foreground uppercase tracking-tight line-clamp-1">
                  {novel.title}
                </h1>
                <p className="text-xs text-muted-foreground">Chapter {currentChapterIndex + 1} of {novel.chapters.length}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="rounded-full"
              >
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Type className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="p-6">
                  <SheetHeader className="mb-6">
                    <SheetTitle>Reading Settings</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm">
                        <span>Fine-tune Size</span>
                        <span className="font-bold">{fontSize}px</span>
                      </div>
                      <Slider
                        value={[fontSize]}
                        onValueChange={(val) => setFontSize(val[0])}
                        min={14}
                        max={32}
                        step={1}
                      />
                    </div>
                    
                    <div className="pt-4 border-t">
                      <ReaderControls 
                        chapterNumber={currentChapterIndex + 1}
                        totalChapters={novel.chapters.length}
                        onChapterChange={handleChapterChange}
                        fontSize={fontSize}
                        onFontSizeChange={setFontSize}
                        isDarkMode={isDarkMode}
                        onDarkModeToggle={() => setIsDarkMode(!isDarkMode)}
                      />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          <div 
            ref={scrollRef} 
            className="flex-1 overflow-y-auto scroll-smooth pb-20 scrollbar-hide"
            style={{ fontSize: `${fontSize}px`, lineHeight: '1.75' }}
          >
            <h2 className="text-3xl font-headline font-bold mb-8 text-center sm:text-left">
              {currentChapter.title}
            </h2>
            <div className="prose prose-slate dark:prose-invert max-w-none">
              {currentChapter.content.split('\n\n').map((para, i) => (
                <p key={i} className="mb-6 first-letter:text-2xl first-letter:font-bold first-letter:text-primary">
                  {para}
                </p>
              ))}
            </div>

            <div className="mt-12 pt-12 border-t flex flex-col gap-8">
              <div className="flex items-center justify-between gap-4">
                <Button 
                  variant="outline" 
                  onClick={goToPrevChapter} 
                  disabled={currentChapterIndex === 0}
                  className="flex-1 max-w-[150px] rounded-xl"
                >
                  Previous
                </Button>
                <Button 
                  variant="default" 
                  onClick={goToNextChapter} 
                  disabled={currentChapterIndex === novel.chapters.length - 1}
                  className="flex-1 max-w-[150px] bg-primary rounded-xl"
                >
                  Next
                </Button>
              </div>

              <div className="max-w-md mx-auto w-full">
                <ReaderControls 
                  chapterNumber={currentChapterIndex + 1}
                  totalChapters={novel.chapters.length}
                  onChapterChange={handleChapterChange}
                  fontSize={fontSize}
                  onFontSizeChange={setFontSize}
                  isDarkMode={isDarkMode}
                  onDarkModeToggle={() => setIsDarkMode(!isDarkMode)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="h-1 bg-muted w-full fixed bottom-0 left-0">
        <Progress value={progress} className="h-full rounded-none" />
      </div>
    </div>
  );
}
