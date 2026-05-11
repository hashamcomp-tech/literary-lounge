'use client';

import {
  useEffect,
  useState,
  useRef,
  Suspense,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';

import {
  Search,
  Loader2,
  ArrowRight,
  BookX,
  User,
  Book,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type BookResult = {
  id: string;
  title: string;
  author: string;
  genre: string;
  coverImage: string;
};

type Suggestion = {
  id: string;
  title: string;
  author: string;
};

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);

  const [results, setResults] = useState<BookResult[]>([]);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const [loading, setLoading] = useState(false);

  const [showSuggestions, setShowSuggestions] =
    useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(
          e.target as Node
        )
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handleOutside
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutside
      );
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSuggestions([]);
      return;
    }

    const debounce = setTimeout(async () => {
      try {
        abortRef.current?.abort();

        const controller = new AbortController();

        abortRef.current = controller;

        setLoading(true);

        const res = await fetch(
          `/api/search?q=${encodeURIComponent(
            query
          )}`,
          {
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          throw new Error('Search failed');
        }

        const data = await res.json();

        setResults(data.results || []);
        setSuggestions(data.suggestions || []);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error(err);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(debounce);
  }, [query]);

  const handleSearch = (
    e?: React.FormEvent,
    value?: string
  ) => {
    e?.preventDefault();

    const finalQuery = value || query;

    if (!finalQuery.trim()) return;

    router.push(
      `/search?q=${encodeURIComponent(finalQuery)}`
    );

    setShowSuggestions(false);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <div className="container mx-auto px-4 pt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-3xl font-black">
              Search
            </h1>

            <p className="text-muted-foreground">
              {loading
                ? 'Searching...'
                : `${results.length} results`}
            </p>
          </div>

          <div
            className="relative w-full md:max-w-md"
            ref={dropdownRef}
          >
            <form
              onSubmit={handleSearch}
              className="flex gap-2"
            >
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() =>
                  setShowSuggestions(true)
                }
                placeholder="Search books or authors..."
                className="rounded-xl"
              />

              <Button
                type="submit"
                size="icon"
                className="rounded-xl"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            {showSuggestions &&
              suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-card border rounded-xl shadow-xl overflow-hidden z-50">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setQuery(s.title);

                        handleSearch(
                          undefined,
                          s.title
                        );
                      }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted transition text-left"
                    >
                      <div className="bg-muted rounded-lg p-2">
                        <Book className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold truncate">
                          {s.title}
                        </p>

                        <p className="text-sm text-muted-foreground truncate">
                          {s.author}
                        </p>
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
              <NovelCard
                key={book.id}
                novel={book}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-24">
            <BookX className="mx-auto h-14 w-14 opacity-20 mb-4" />

            <h2 className="text-2xl font-bold">
              No results found
            </h2>
          </div>
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