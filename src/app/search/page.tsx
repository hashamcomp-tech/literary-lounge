'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import { Search, Loader2, BookX, Book } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useFirebase } from '@/firebase/provider';
import { collection, getDocs } from 'firebase/firestore';
import { getAllLocalBooks } from '@/lib/local-library';

type BookResult = {
  id: string;
  title: string;
  author: string;
  genre: string[];
  coverImage: string;
};

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firestore: db, isOfflineMode } = useFirebase();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [allBooks, setAllBooks] = useState<BookResult[]>([]);
  const [results, setResults] = useState<BookResult[]>([]);
  const [suggestions, setSuggestions] = useState<BookResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load all books once on mount
  useEffect(() => {
    const load = async () => {
      try {
        if (!isOfflineMode && db) {
          const snap = await getDocs(collection(db, 'books'));
          const books = snap.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              title: data.title || '',
              author: data.author || '',
              genre: data.genre || [],
              coverImage: data.coverImage || '',
            };
          });
          setAllBooks(books);
        } else {
          const local = await getAllLocalBooks();
          const books = local.map((b) => ({
            id: b.id,
            title: b.title,
            author: b.author,
            genre: Array.isArray(b.genre) ? b.genre : [b.genre],
            coverImage: b.coverImage || '',
          }));
          setAllBooks(books);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [db, isOfflineMode]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter on query change
  useEffect(() => {
    const q = query.trim().toLowerCase();

    if (q.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      if (q.length === 0) setResults([]);
      return;
    }

    const matched = allBooks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q)
    );

    setSuggestions(matched.slice(0, 8));
    setShowSuggestions(matched.length > 0);

    // Also update full results if query matches URL param
    if (query.trim() === (searchParams.get('q') || '')) {
      setResults(matched);
    }
  }, [query, allBooks, searchParams]);

  // Run full search when URL q param changes
  useEffect(() => {
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    if (!q || q.length < 3) { setResults([]); return; }
    const matched = allBooks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q)
    );
    setResults(matched);
  }, [searchParams, allBooks]);

  const commitSearch = (value: string) => {
    const q = value.trim();
    if (!q) return;
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <div className="container mx-auto px-4 pt-8">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-3xl font-black">Search</h1>
            <p className="text-muted-foreground">
              {loading ? 'Loading library...' : `${results.length} results`}
            </p>
          </div>

          <div className="relative w-full md:max-w-md" ref={dropdownRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => query.trim().length >= 3 && setShowSuggestions(true)}
                onKeyDown={(e) => e.key === 'Enter' && commitSearch(query)}
                placeholder="Search books or authors..."
                className="pl-9 rounded-xl"
              />
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-card border rounded-xl shadow-xl overflow-hidden z-50">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setQuery(s.title);
                      commitSearch(s.title);
                    }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted transition text-left"
                  >
                    <div className="bg-muted rounded-lg p-2">
                      <Book className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{s.title}</p>
                      <p className="text-sm text-muted-foreground truncate">{s.author}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin opacity-30" />
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {results.map((book) => (
              <NovelCard key={book.id} novel={book} />
            ))}
          </div>
        ) : (
          query.trim().length >= 3 && (
            <div className="text-center py-24">
              <BookX className="mx-auto h-14 w-14 opacity-20 mb-4" />
              <h2 className="text-2xl font-bold">No results found</h2>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchContent />
    </Suspense>
  );
}
