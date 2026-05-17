'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, getDocs } from 'firebase/firestore';

import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import { Input } from '@/components/ui/input';
import { useFirebase } from '@/firebase/provider';
import { getAllLocalBooks } from '@/lib/local-library';

import { Search, Loader2, BookX, BookOpen } from 'lucide-react';

type BookResult = {
  id: string;
  title: string;
  author?: string;
  genre?: string[];
  coverImage?: string;
  isLocalOnly?: boolean;
  _isLocal?: boolean;
  isCloud?: boolean;
};

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firestore: db, isOfflineMode } = useFirebase();

  const dropdownRef = useRef<HTMLDivElement>(null);

  const urlQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(urlQuery);
  const [books, setBooks] = useState<BookResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadBooks = async () => {
      try {
        setLoading(true);

        if (!isOfflineMode && db) {
          const snapshot = await getDocs(collection(db, 'books'));

          const firebaseBooks: BookResult[] = snapshot.docs.map((doc) => {
            const data = doc.data();

            return {
              id: doc.id,
              title: data.title || 'Untitled',
              author: data.author || 'Unknown Author',
              genre: Array.isArray(data.genre)
                ? data.genre
                : data.genre
                ? [data.genre]
                : [],
              coverImage:
                data.coverImage ||
                data.coverURL ||
                data.metadata?.info?.coverURL ||
                '',
              isCloud: true,
            };
          });

          if (mounted) {
            setBooks(firebaseBooks);
          }
        } else {
          const localBooks = await getAllLocalBooks();

          const normalized: BookResult[] = localBooks.map((book: any) => ({
            id: book.id,
            title: book.title || 'Untitled',
            author: book.author || 'Unknown Author',
            genre: Array.isArray(book.genre)
              ? book.genre
              : book.genre
              ? [book.genre]
              : [],
            coverImage: book.coverImage || '',
            isLocalOnly: true,
            _isLocal: true,
          }));

          if (mounted) {
            setBooks(normalized);
          }
        }
      } catch (error) {
        console.error('Failed to load books:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadBooks();

    return () => {
      mounted = false;
    };
  }, [db, isOfflineMode]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredBooks = useMemo(() => {
    if (normalizedQuery.length < 2) return [];

    return books.filter((book) => {
      const title = book.title?.toLowerCase() || '';
      const author = book.author?.toLowerCase() || '';
      const genres = (book.genre || []).join(' ').toLowerCase();

      return (
        title.includes(normalizedQuery) ||
        author.includes(normalizedQuery) ||
        genres.includes(normalizedQuery)
      );
    });
  }, [books, normalizedQuery]);

  const suggestions = filteredBooks.slice(0, 6);

  const handleSearch = (value: string) => {
    const trimmed = value.trim();

    if (!trimmed) return;

    setShowSuggestions(false);

    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <div className="container mx-auto px-4 pt-8">
        <div className="mb-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight">
              Search Library
            </h1>

            <p className="mt-2 text-muted-foreground">
              {loading
                ? 'Loading books...'
                : `${filteredBooks.length} result${
                    filteredBooks.length === 1 ? '' : 's'
                  } found`}
            </p>
          </div>

          <div
            ref={dropdownRef}
            className="relative w-full md:max-w-lg"
          >
            <Search className="absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              value={query}
              placeholder="Search by title, author, or genre..."
              className="h-12 rounded-2xl pl-11 text-base"
              onFocus={() => {
                if (normalizedQuery.length >= 2) {
                  setShowSuggestions(true);
                }
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch(query);
                }
              }}
            />

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-[110%] z-50 w-full overflow-hidden rounded-2xl border bg-card shadow-2xl">
                {suggestions.map((book) => (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => {
                      setQuery(book.title);
                      handleSearch(book.title);
                    }}
                    className="flex w-full items-center gap-3 border-b p-3 text-left transition hover:bg-muted last:border-b-0"
                  >
                    {book.coverImage ? (
                      <img
                        src={book.coverImage}
                        alt={book.title}
                        className="h-16 w-12 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-12 items-center justify-center rounded-md bg-muted">
                        <BookOpen className="h-5 w-5 opacity-50" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {book.title}
                      </p>

                      <p className="truncate text-sm text-muted-foreground">
                        {book.author}
                      </p>

                      {book.genre && book.genre.length > 0 && (
                        <p className="truncate text-xs text-muted-foreground">
                          {book.genre.slice(0, 3).join(', ')}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-12 w-12 animate-spin opacity-40" />
          </div>
        ) : filteredBooks.length > 0 ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {filteredBooks.map((book) => (
              <NovelCard key={book.id} novel={book} />
            ))}
          </div>
        ) : normalizedQuery.length >= 2 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookX className="mb-4 h-14 w-14 opacity-20" />

            <h2 className="text-2xl font-bold">
              No books found
            </h2>

            <p className="mt-2 text-muted-foreground">
              Try a different title, author, or genre.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Search className="mb-4 h-14 w-14 opacity-20" />

            <h2 className="text-2xl font-bold">
              Start searching
            </h2>

            <p className="mt-2 text-muted-foreground">
              Search your entire library instantly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin opacity-40" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
