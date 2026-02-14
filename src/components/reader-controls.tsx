"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Moon, Sun, Minus, Plus, BookOpen, Navigation } from 'lucide-react';

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

  const handleJump = () => {
    const n = parseInt(jumpChapter);
    if (!isNaN(n) && n >= 1 && n <= totalChapters) {
      onChapterChange(n - 1);
      setJumpChapter('');
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 border rounded-2xl bg-card/50 backdrop-blur shadow-sm transition-all max-w-2xl mx-auto">
      <div className="flex justify-between items-center gap-2">
        <Button 
          variant="outline" 
          size="sm"
          className="rounded-full h-10 px-4"
          onClick={() => onChapterChange(chapterNumber - 2)} 
          disabled={chapterNumber <= 1}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Prev
        </Button>
        
        <div className="flex-1 max-w-[200px]">
          <Select 
            value={chapterNumber.toString()} 
            onValueChange={(val) => onChapterChange(parseInt(val) - 1)}
          >
            <SelectTrigger className="w-full h-10 rounded-xl bg-muted/30 border-transparent focus:ring-primary/20">
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Select Chapter" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: totalChapters }, (_, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>
                  Chapter {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button 
          variant="outline" 
          size="sm"
          className="rounded-full h-10 px-4"
          onClick={() => onChapterChange(chapterNumber)} 
          disabled={chapterNumber >= totalChapters}
        >
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
             <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">Font</span>
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
          {isDarkMode ? (
            <>
              <Sun className="h-4 w-4 text-orange-400" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Light</span>
            </>
          ) : (
            <>
              <Moon className="h-4 w-4 text-indigo-400" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Dark</span>
            </>
          )}
        </Button>

        <div className="flex items-center gap-2 p-1 bg-muted/30 rounded-xl border border-border/50">
          <Input
            type="number"
            value={jumpChapter}
            onChange={(e) => setJumpChapter(e.target.value)}
            placeholder="Go to..."
            className="h-8 border-none bg-transparent focus-visible:ring-0 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
          />
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={handleJump}>
            <Navigation className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      <div className="text-center">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">
          Chapter {chapterNumber} of {totalChapters}
        </span>
      </div>
    </div>
  );
}
