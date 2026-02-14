"use client";

import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, BookOpen, Eye } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export default function RecommendationsSection() {
  const db = useFirestore();

  // Fetch top 6 books by views from Firestore
  const topBooksQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(
      collection(db, 'books'),
      orderBy('metadata.info.views', 'desc'),
      limit(6)
    );
  }, [db]);

  const { data: topBooks, isLoading } = useCollection(topBooksQuery);

  if (isLoading) {
    return (
      <div className="space-y-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-5 w-5 text-accent" />
          <h2 className="text-2xl font-headline font-bold">Trending Now</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // If no cloud data yet, don't show the section
  if (!topBooks || topBooks.length === 0) return null;

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-accent animate-pulse" />
          <h2 className="text-2xl font-headline font-bold">Popular on Cloud</h2>
        </div>
        <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Most Viewed</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {topBooks.map((book) => (
          <Link key={book.id} href={`/pages/${book.id}/1`}>
            <Card className="bg-card/50 border-none shadow-sm hover:shadow-xl transition-all duration-500 group cursor-pointer h-full flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg font-headline font-bold group-hover:text-primary transition-colors line-clamp-1">
                      {book.metadata.info.bookTitle}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-medium truncate">By {book.metadata.info.author}</p>
                  </div>
                  <div className="bg-primary/10 p-2 rounded-xl">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between pt-2">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" />
                    {(book.metadata.info.views || 0).toLocaleString()} views
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <BookOpen className="h-3.5 w-3.5" />
                    {book.metadata.info.totalChapters} chapters
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] uppercase font-bold text-accent tracking-tighter bg-accent/5 px-2 py-0.5 rounded-full border border-accent/10">
                    {book.metadata.info.genre || 'Novel'}
                  </Badge>
                  <span className="text-xs font-black text-primary group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                    Read Now →
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
