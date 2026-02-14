
"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import { Search as SearchIcon, Loader2, BookX, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const db = useFirestore();
  const queryTerm = searchParams.get('q') || '';
  
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [localQuery, setLocalQuery] = useState(queryTerm);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (localQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(localQuery)}`);
    }
  };

  useEffect(() => {
    if (!db) return;

    const performSearch = async () => {
      if (!queryTerm.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        // Prefix search logic: finds documents where title starts with the query term
        // Note: This is case-sensitive by default in Firestore
        const q = query(
          collection(db, 'books'),
          where('title', '>=', queryTerm),
          where('title', '<=', queryTerm + '\uf8ff'),
          limit(24)
        );

        const snapshot = await getDocs(q);
        const firestoreResults = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setResults(firestoreResults);
      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setLoading(false);
      }
    };

    performSearch();
    setLocalQuery(queryTerm);
  }, [queryTerm, db]);

  return (
    <div className="container mx-auto px-4 pt-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-3 rounded-2xl">
            <SearchIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-headline font-black">Search results</h1>
            <p className="text-muted-foreground">
              {loading ? "Searching our library..." : `${results.length} results found for "${queryTerm}"`}
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 w-full md:max-w-sm">
          <Input 
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Search titles..."
            className="rounded-xl bg-card border-muted-foreground/20"
          />
          <Button type="submit" size="icon" className="rounded-xl shrink-0">
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">Scouring the lounge...</p>
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-8">
          {results.map((book) => (
            <NovelCard 
              key={book.id} 
              novel={{
                id: book.id,
                title: book.title,
                author: book.authorName || 'Unknown Author',
                genre: book.genres?.[0] || 'Novel',
                summary: book.description || '',
                coverImage: book.coverImageUrl || '',
                chapters: [] 
              }} 
            />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <div className="bg-muted w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <BookX className="h-10 w-10 text-muted-foreground opacity-20" />
          </div>
          <h2 className="text-2xl font-headline font-bold mb-2">No matches found</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            We couldn't find any cloud novels matching "{queryTerm}". Try searching for a specific book title or ensure your capitalization is correct.
          </p>
          <Button 
            variant="outline" 
            className="mt-8 rounded-xl"
            onClick={() => router.push('/')}
          >
            Back to Library
          </Button>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen pb-20">
      <Navbar />
      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center pt-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      }>
        <SearchResults />
      </Suspense>
    </div>
  );
}
