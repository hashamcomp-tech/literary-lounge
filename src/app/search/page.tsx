
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

  useEffect(() => {
    const lowerLocalQuery = localQuery.toLowerCase();
    if (!db || lowerLocalQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        const titleQuery = query(
          collection(db, 'books'),
          where('metadata.info.bookTitleLower', '>=', lowerLocalQuery),
          where('metadata.info.bookTitleLower', '<=', lowerLocalQuery + '\uf8ff'),
          limit(5)
        );
        
        const authorQuery = query(
          collection(db, 'books'),
          where('metadata.info.authorLower', '>=', lowerLocalQuery),
          where('metadata.info.authorLower', '<=', lowerLocalQuery + '\uf8ff'),
          limit(5)
        );

        const [titleSnap, authorSnap] = await Promise.all([
          getDocs(titleQuery),
          getDocs(authorQuery)
        ]);

        const items: any[] = [];
        titleSnap.forEach(doc => {
          const data = doc.data();
          items.push({ id: doc.id, title: data.metadata.info.bookTitle, author: data.metadata.info.author, type: 'book' });
        });
        authorSnap.forEach(doc => {
          const data = doc.data();
          if (!items.find(i => i.id === doc.id)) {
            items.push({ id: doc.id, title: data.metadata.info.bookTitle, author: data.metadata.info.author, type: 'author' });
          }
        });

        setSuggestions(items.slice(0, 8));
      } catch (err) {
        console.error("Suggestions error", err);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [localQuery, db]);

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
              setResults(hits.map((hit: any) => ({
                id: hit.objectID || hit.id,
                title: hit.bookTitle || hit.title,
                author: hit.author || hit.authorName || 'Unknown Author',
                genre: hit.genre || 'Novel',
                coverImage: hit.coverImageUrl || hit.coverImage || `https://picsum.photos/seed/${hit.id}/400/600`,
              })));
              setSearchMethod('algolia');
              setLoading(false);
              return;
            }
          } catch (e) {}
        }

        setSearchMethod('firestore');
        const lowerQuery = queryTerm.toLowerCase();
        const qTitle = query(
          collection(db, 'books'),
          where('metadata.info.bookTitleLower', '>=', lowerQuery),
          where('metadata.info.bookTitleLower', '<=', lowerQuery + '\uf8ff'),
          limit(24)
        );

        const qAuthor = query(
          collection(db, 'books'),
          where('metadata.info.authorLower', '>=', lowerQuery),
          where('metadata.info.authorLower', '<=', lowerQuery + '\uf8ff'),
          limit(24)
        );

        const [titleSnap, authorSnap] = await Promise.all([
          getDocs(qTitle),
          getDocs(qAuthor)
        ]);

        const combinedMap = new Map();
        [...titleSnap.docs, ...authorSnap.docs].forEach(doc => {
          const data = doc.data();
          combinedMap.set(doc.id, {
            id: doc.id,
            title: data.metadata.info.bookTitle,
            author: data.metadata.info.author,
            genre: 'Novel',
            coverImage: `https://picsum.photos/seed/${doc.id}/400/600`,
          });
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
              {loading ? "Searching..." : `${results.length} results for "${queryTerm}"`}
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
              className="rounded-xl"
            />
            <Button type="submit" size="icon" className="rounded-xl">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card border rounded-xl shadow-xl z-50 overflow-hidden">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    const term = s.type === 'author' ? s.author : s.title;
                    setLocalQuery(term);
                    handleSearch(undefined, term);
                  }}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted text-left"
                >
                  <div className="p-1.5 rounded-lg bg-muted">
                    {s.type === 'author' ? <User className="h-3.5 w-3.5" /> : <Book className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground truncate">By {s.author}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-8">
          {results.map((book) => (
            <NovelCard key={book.id} novel={book} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <BookX className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h2 className="text-2xl font-headline font-bold mb-2">No matches found</h2>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/')}>Back to Library</Button>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen pb-20">
      <Navbar />
      <Suspense fallback={null}>
        <SearchResults />
      </Suspense>
    </div>
  );
}
