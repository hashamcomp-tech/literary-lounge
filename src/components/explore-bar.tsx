'use client';

import Link from 'next/link';
import { Compass, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

/**
 * @fileOverview Slim Library Explorer Bar.
 * Provides quick-access filters for trending genres and a primary link to the Explorer.
 */

const TRENDING_GENRES = [
  "Fantasy",
  "Mystery",
  "Science Fiction",
  "Romance",
  "History",
  "Self Help",
  "Thriller",
  "Horror"
];

export default function ExploreBar() {
  return (
    <div className="w-full mb-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
      <div className="bg-card/30 backdrop-blur-md border border-border/40 rounded-[2rem] p-2 flex items-center gap-2 overflow-hidden shadow-sm">
        {/* Visual Anchor */}
        <div className="flex items-center gap-2 pl-4 pr-4 border-r border-border/50 hidden md:flex">
          <Compass className="h-4 w-4 text-primary opacity-60" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Lounge Node</span>
        </div>
        
        {/* Genre Scroll Area */}
        <ScrollArea className="flex-1 whitespace-nowrap">
          <div className="flex gap-1.5 p-1">
            {TRENDING_GENRES.map((genre) => (
              <Link key={genre} href={`/explore?genre=${encodeURIComponent(genre)}`}>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="rounded-full px-4 h-8 text-[11px] font-bold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all active:scale-95"
                >
                  {genre}
                </Button>
              </Link>
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="hidden" />
        </ScrollArea>

        {/* Global Explorer Link */}
        <div className="pl-2">
          <Link href="/explore">
            <Button 
              variant="default" 
              size="sm" 
              className="rounded-full h-8 px-5 text-[10px] font-black uppercase tracking-widest bg-primary/90 hover:bg-primary shadow-sm gap-2 transition-transform active:scale-95"
            >
              Explore All
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
