
"use client";

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import { Search as SearchIcon, Loader2, BookX, ArrowRight, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import algoliasearch from 'algoliasearch/lite';

// Initialize Algolia client with placeholders
const ALGOLIA_APP_ID = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID || '';
const ALGOLIA_SEARCH_KEY = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY || '';

function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const db = useFirestore();
  const queryTerm = searchParams.get('q') || '';
  
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [localQuery, setLocalQuery] = useState(queryTerm);
  const [searchMethod, setSearchMethod] = useState<'firestore' | 'algolia'>('firestore');

  const algoliaClient = useMemo(() => {
    if (ALGOLIA_APP_ID && ALGOLIA_SEARCH_KEY) {
      return algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY);
    }
    return null;
  }, []);

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
        // 1. Try Algolia first if configured
        if (algoliaClient) {
          try {
            const index = algoliaClient.initIndex('books');
            const { hits } = await index.search(queryTerm, { hitsPerPage: 24 });
            
            if (hits.length > 0) {
              const algoliaResults = hits.map((hit: any) => ({
                id: hit.objectID || hit.id,
                title: hit.title || hit.bookTitle,
                author: hit.author || hit.authorName || 'Unknown Author',
                genre: hit.genre || (hit.genres?.[0]) || 'Novel',
                summary: hit.summary || hit.description || '',
                coverImage: hit.coverImageUrl || hit.coverImage || '',
                chapters: hit.chapters || []
              }));
              setResults(algoliaResults);
              setSearchMethod('algolia');
              setLoading(false);
              return;
            }
          } catch (algoliaError) {
            console.error("Algolia search failed, falling back to Firestore", algoliaError);
          }
        }

        // 2. Fallback to Firestore Prefix Search
        setSearchMethod('firestore');
        const q = query(
          collection(db, 'books'),
          where('title', '>=', queryTerm),
          where('title', '<=', queryTerm + '\uf8ff'),
          limit(24)
        );

        const snapshot = await getDocs(q);
        const firestoreResults = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title,
            author: data.authorName || 'Unknown Author',
            genre: data.genres?.[0] || 'Cloud Novel',
            summary: data.description || '',
            coverImage: data.coverImageUrl || '',
            chapters: [] 
          };
        });

        setResults(firestoreResults);
      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setLoading(false);
      }
    };

    performSearch();
    setLocalQuery(queryTerm);
  }, [queryTerm, db, algoliaClient]);

  return (
    <div className="container mx-auto px-4 pt-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-3 rounded-2xl">
            <SearchIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-headline font-black">Search results</h1>
              {searchMethod === 'algolia' && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none flex items-center gap-1">
                  <Zap className="h-3 w-3 fill-current" /> Full-text
                </Badge>
              )}
            </div>
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
              novel={book} 
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
            We couldn't find any books matching "{queryTerm}". Try searching for a specific title or check your spelling.
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
