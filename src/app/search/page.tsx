
"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import { Search as SearchIcon, Loader2, BookX } from 'lucide-react';
import { Novel } from '@/lib/mock-data';

function SearchResults() {
  const searchParams = useSearchParams();
  const db = useFirestore();
  const queryTerm = searchParams.get('q') || '';
  
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!db) return;

    const performSearch = async () => {
      if (!queryTerm.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        // Simple prefix search (case-sensitive by default in Firestore)
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
  }, [queryTerm, db]);

  return (
    <div className="container mx-auto px-4 pt-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-muted p-2 rounded-lg">
          <SearchIcon className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-headline font-bold">Search results</h1>
          <p className="text-muted-foreground">
            {loading ? "Searching..." : `${results.length} cloud results for "${queryTerm}"`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-8">
          {results.map((book) => (
            <NovelCard 
              key={book.id} 
              novel={{
                id: book.id,
                title: book.title,
                author: book.authorName || book.author,
                genre: book.genres?.[0] || book.genre || 'Novel',
                summary: book.description || book.summary,
                coverImage: book.coverImageUrl || book.coverImage,
                chapters: [] // Chapters are loaded on-demand in the reader
              }} 
            />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <div className="bg-muted w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <BookX className="h-10 w-10 text-muted-foreground opacity-20" />
          </div>
          <h2 className="text-xl font-bold mb-2">No novels found</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            We couldn't find any cloud novels matching "{queryTerm}". Check your spelling or try a different title.
          </p>
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
