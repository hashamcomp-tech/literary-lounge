"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, Moon, Sun, Minus, Plus, Hash } from 'lucide-react';

interface ReaderControlsProps {
  chapterNumber: number;
  totalChapters: number;
  onChapterChange: (index: number) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  isDarkMode: boolean;
  onDarkModeToggle: () => void;
}

export function ReaderControls({
  chapterNumber,
  totalChapters,
  onChapterChange,
  fontSize,
  onFontSizeChange,
  isDarkMode,
  onDarkModeToggle,
}: ReaderControlsProps) {
  const [jumpChapter, setJumpChapter] = useState('');

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(jumpChapter);
    if (!isNaN(n) && n >= 1 && n <= totalChapters) {
      onChapterChange(n - 1);
      setJumpChapter('');
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 border rounded-2xl bg-card/50 backdrop-blur shadow-sm transition-all">
      <div className="flex justify-between items-center gap-2">
        <Button 
          variant="outline" 
          size="sm"
          className="rounded-full"
          onClick={() => onChapterChange(chapterNumber - 2)} 
          disabled={chapterNumber <= 1}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <div className="text-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-0.5">Progress</span>
          <span className="text-sm font-headline font-bold">
            Chapter {chapterNumber} of {totalChapters}
          </span>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          className="rounded-full"
          onClick={() => onChapterChange(chapterNumber)} 
          disabled={chapterNumber >= totalChapters}
        >
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between p-2 bg-muted/30 rounded-xl border border-border/50">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 rounded-lg hover:bg-background"
            onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <div className="flex flex-col items-center">
             <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">Size</span>
             <span className="text-sm font-bold font-mono">{fontSize}px</span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 rounded-lg hover:bg-background"
            onClick={() => onFontSizeChange(Math.min(40, fontSize + 2))}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        
        <Button 
          variant="outline" 
          className="h-auto py-2 rounded-xl border-border/50 hover:bg-accent/10 transition-colors flex-col gap-1"
          onClick={onDarkModeToggle}
        >
          {isDarkMode ? <Sun className="h-4 w-4 text-orange-400" /> : <Moon className="h-4 w-4 text-indigo-400" />}
          <span className="text-[10px] font-bold uppercase tracking-tighter">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
        </Button>
      </div>

      <form onSubmit={handleJump} className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            type="number"
            value={jumpChapter}
            onChange={e => setJumpChapter(e.target.value)}
            placeholder="Jump to chapter..."
            className="h-10 pl-8 bg-muted/20 border-transparent focus:bg-background transition-all rounded-xl"
            min={1}
            max={totalChapters}
          />
        </div>
        <Button type="submit" className="rounded-xl h-10 px-6 bg-primary text-primary-foreground">Go</Button>
      </form>
    </div>
  );
}
