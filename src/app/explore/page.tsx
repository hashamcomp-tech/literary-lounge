
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import { Loader2, BookOpen, Filter, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { GENRES } from '@/lib/genres';

function ExploreContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const db = useFirestore();
  const initialGenre = searchParams.get('genre') || 'All';

  const [selectedGenre, setSelectedGenre] = useState(initialGenre);

  // Sync state with URL
  useEffect(() => {
    const genre = searchParams.get('genre') || 'All';
    setSelectedGenre(genre);
  }, [searchParams]);

  const exploreQuery = useMemoFirebase(() => {
    if (!db) return null;
    const booksCol = collection(db, 'books');
    
    if (selectedGenre !== 'All') {
      // Updated to use array-contains for multi-genre support
      return query(
        booksCol,
        where('genre', 'array-contains', selectedGenre),
        orderBy('createdAt', 'desc'),
        limit(48)
      );
    }
    
    return query(
      booksCol,
      orderBy('createdAt', 'desc'),
      limit(48)
    );
  }, [db, selectedGenre]);

  const { data: books, isLoading } = useCollection(exploreQuery);

  const handleGenreChange = (genre: string) => {
    const params = new URLSearchParams(searchParams);
    if (genre === 'All') {
      params.delete('genre');
    } else {
      params.set('genre', genre);
    }
    router.push(`/explore?${params.toString()}`);
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <header className="mb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Global Collection</span>
            </div>
            <h1 className="text-5xl font-headline font-black tracking-tight">Library Explorer</h1>
            <p className="text-lg text-muted-foreground max-w-xl">
              Browse through the entire collection of community-contributed manuscripts. 
              Discover hidden gems across every genre.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className="rounded-xl h-12 px-6 gap-2 border-primary/20 hover:bg-primary/5"
              onClick={() => router.push('/search')}
            >
              <Search className="h-4 w-4" />
              Detailed Search
            </Button>
          </div>
        </div>
      </header>

      <div className="sticky top-20 z-40 bg-background/80 backdrop-blur-md py-4 -mx-4 px-4 mb-10 border-b border-border/50">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 p-2 rounded-lg hidden sm:block">
            <Filter className="h-4 w-4 text-primary" />
          </div>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2 pb-3">
              <Button
                variant={selectedGenre === 'All' ? 'default' : 'ghost'}
                size="sm"
                className={`rounded-full px-6 font-bold transition-all ${selectedGenre === 'All' ? 'shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-primary'}`}
                onClick={() => handleGenreChange('All')}
              >
                All Volumes
              </Button>
              {GENRES.map((genre) => (
                <Button
                  key={genre}
                  variant={selectedGenre === genre ? 'default' : 'ghost'}
                  size="sm"
                  className={`rounded-full px-6 font-bold transition-all ${selectedGenre === genre ? 'shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-primary'}`}
                  onClick={() => handleGenreChange(genre)}
                >
                  {genre}
                </Button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" className="hidden" />
          </ScrollArea>
        </div>
      </div>

      {isLoading ? (
        <div className="py-32 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">Syncing Library...</p>
        </div>
      ) : books && books.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {books.map((book) => (
            <NovelCard key={book.id} novel={book} />
          ))}
        </div>
      ) : (
        <div className="py-32 text-center border-2 border-dashed rounded-[3rem] bg-muted/20">
          <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h2 className="text-2xl font-headline font-black mb-2">No volumes found in "{selectedGenre}"</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-8">
            The shelf is currently empty for this selection. Try another genre or be the first to contribute!
          </p>
          <Button 
            variant="default" 
            className="rounded-2xl h-14 px-10 font-bold"
            onClick={() => setSelectedGenre('All')}
          >
            Show All Books
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      }>
        <ExploreContent />
      </Suspense>
    </div>
  );
}
