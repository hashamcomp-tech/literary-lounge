"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import { Search as SearchIcon, Loader2, BookX, ArrowRight, Zap, User, Book } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import algoliasearch from 'algoliasearch/lite';
import { cn } from '@/lib/utils';

// Initialize Algolia client
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
  
  const [suggestions, setSuggestions] = useState<{title: string, author: string, id: string, type: 'author' | 'book'}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);

  const algoliaClient = useMemo(() => {
    if (ALGOLIA_APP_ID && ALGOLIA_SEARCH_KEY) {
      return algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY);
    }
    return null;
  }, []);

  const handleSearch = (e?: React.FormEvent, term?: string) => {
    e?.preventDefault();
    const finalTerm = term || localQuery;
    if (finalTerm.trim()) {
      router.push(`/search?q=${encodeURIComponent(finalTerm)}`);
      setShowSuggestions(false);
    }
  };

  // Autocomplete Suggestions logic
  useEffect(() => {
    if (!db || localQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        // Query by title prefix
        const titleQuery = query(
          collection(db, 'books'),
          where('title', '>=', localQuery),
          where('title', '<=', localQuery + '\uf8ff'),
          limit(5)
        );
        
        // Query by author prefix
        const authorQuery = query(
          collection(db, 'books'),
          where('authorName', '>=', localQuery),
          where('authorName', '<=', localQuery + '\uf8ff'),
          limit(5)
        );

        const [titleSnap, authorSnap] = await Promise.all([
          getDocs(titleQuery),
          getDocs(authorQuery)
        ]);

        const items: any[] = [];
        titleSnap.forEach(doc => {
          const data = doc.data();
          items.push({ id: doc.id, title: data.title, author: data.authorName, type: 'book' });
        });
        authorSnap.forEach(doc => {
          const data = doc.data();
          // Avoid duplicates
          if (!items.find(i => i.id === doc.id)) {
            items.push({ id: doc.id, title: data.title, author: data.authorName, type: 'author' });
          }
        });

        // Remove duplicates and limit
        const uniqueSuggestions = items.slice(0, 8);
        setSuggestions(uniqueSuggestions);
      } catch (err) {
        console.error("Suggestions error", err);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [localQuery, db]);

  // Handle clicking outside suggestions
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!db) return;

    const performSearch = async () => {
      if (!queryTerm.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
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

        setSearchMethod('firestore');
        // Search by title prefix
        const qTitle = query(
          collection(db, 'books'),
          where('title', '>=', queryTerm),
          where('title', '<=', queryTerm + '\uf8ff'),
          limit(24)
        );

        // Search by author prefix
        const qAuthor = query(
          collection(db, 'books'),
          where('authorName', '>=', queryTerm),
          where('authorName', '<=', queryTerm + '\uf8ff'),
          limit(24)
        );

        const [titleSnap, authorSnap] = await Promise.all([
          getDocs(qTitle),
          getDocs(qAuthor)
        ]);

        const combinedMap = new Map();
        titleSnap.docs.forEach(doc => {
          const data = doc.data();
          combinedMap.set(doc.id, {
            id: doc.id,
            title: data.title,
            author: data.authorName || 'Unknown Author',
            genre: data.genres?.[0] || 'Novel',
            summary: data.description || '',
            coverImage: data.coverImageUrl || '',
          });
        });

        authorSnap.docs.forEach(doc => {
          if (!combinedMap.has(doc.id)) {
            const data = doc.data();
            combinedMap.set(doc.id, {
              id: doc.id,
              title: data.title,
              author: data.authorName || 'Unknown Author',
              genre: data.genres?.[0] || 'Novel',
              summary: data.description || '',
              coverImage: data.coverImageUrl || '',
            });
          }
        });

        setResults(Array.from(combinedMap.values()));
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

        <div className="relative w-full md:max-w-sm" ref={suggestionRef}>
          <form onSubmit={(e) => handleSearch(e)} className="flex gap-2">
            <Input 
              value={localQuery}
              onChange={(e) => {
                setLocalQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search titles or authors..."
              className="rounded-xl bg-card border-muted-foreground/20 pr-10"
            />
            <Button type="submit" size="icon" className="rounded-xl shrink-0">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          {/* Autocomplete Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b bg-muted/30">
                Suggestions
              </div>
              <div className="max-h-[350px] overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      const searchTerm = s.type === 'author' ? s.author : s.title;
                      setLocalQuery(searchTerm);
                      handleSearch(undefined, searchTerm);
                    }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left group"
                  >
                    <div className="bg-muted group-hover:bg-background p-1.5 rounded-lg">
                      {s.type === 'author' ? <User className="h-3.5 w-3.5 text-primary" /> : <Book className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{s.title}</p>
                      <p className="text-xs text-muted-foreground truncate">By {s.author}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
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
