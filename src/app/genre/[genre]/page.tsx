
"use client";

import { useParams, useRouter } from 'next/navigation';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import { Loader2, BookX, ArrowLeft, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function GenrePage() {
  const { genre } = useParams() as { genre: string };
  const router = useRouter();
  const db = useFirestore();

  // Decode the genre from the URL (e.g., "Self%20Help" -> "Self Help")
  const decodedGenre = decodeURIComponent(genre);

  // Fetch books matching this genre using array-contains
  const genreQuery = useMemoFirebase(() => {
    if (!db || !decodedGenre) return null;
    return query(
      collection(db, 'books'),
      where('genre', 'array-contains', decodedGenre),
      orderBy('views', 'desc')
    );
  }, [db, decodedGenre]);

  const { data: books, isLoading } = useCollection(genreQuery);

  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-6xl mx-auto">
          <header className="mb-12">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => router.back()}
              className="mb-6 -ml-2 text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Library
            </Button>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 uppercase tracking-widest px-3">
                    Library Collection
                  </Badge>
                </div>
                <h1 className="text-5xl font-headline font-black flex items-center gap-3">
                  {decodedGenre}
                  <Star className="h-8 w-8 text-amber-500 fill-amber-500/10" />
                </h1>
                <p className="text-lg text-muted-foreground mt-2 max-w-xl">
                  Discover the most popular and highly-rated {decodedGenre.toLowerCase()} novels in the Lounge.
                </p>
              </div>
              
              {!isLoading && books && (
                <div className="text-sm font-bold text-muted-foreground">
                  {books.length} {books.length === 1 ? 'Novel' : 'Novels'} found
                </div>
              )}
            </div>
          </header>

          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
              <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Curating the shelf...</p>
            </div>
          ) : books && books.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {books.map((book) => (
                <NovelCard key={book.id} novel={book} />
              ))}
            </div>
          ) : (
            <div className="py-24 text-center border-2 border-dashed rounded-3xl bg-muted/20">
              <BookX className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
              <h2 className="text-2xl font-headline font-bold mb-2">The shelf is empty</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-8">
                We couldn't find any {decodedGenre.toLowerCase()} novels in our cloud collection yet.
              </p>
              <Button variant="default" className="rounded-xl px-8" onClick={() => router.push('/upload')}>
                Be the first to upload one!
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
