"use client";

import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, BookOpen, Eye, Star, Zap, Clock } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface RecommendationsSectionProps {
  title?: string;
  genre?: string;
  sortBy?: 'views' | 'createdAt' | 'lastUpdated';
  limitCount?: number;
}

export default function RecommendationsSection({ 
  title = "Popular on Cloud", 
  genre, 
  sortBy = 'views', 
  limitCount = 6 
}: RecommendationsSectionProps) {
  const db = useFirestore();

  const cloudBooksQuery = useMemoFirebase(() => {
    if (!db) return null;
    
    const booksCol = collection(db, 'books');
    
    // In production, composite indexes are required for where + orderBy.
    // For local development and early stages, we prioritize the filter or sort.
    if (genre) {
      return query(
        booksCol,
        where('genre', '==', genre),
        limit(limitCount)
      );
    }
    
    // Sort by root level fields (views, createdAt, lastUpdated)
    return query(
      booksCol,
      orderBy(sortBy, 'desc'),
      limit(limitCount)
    );
  }, [db, genre, sortBy, limitCount]);

  const { data: books, isLoading } = useCollection(cloudBooksQuery);

  if (isLoading) {
    return (
      <div className="space-y-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-8 w-48 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!books || books.length === 0) return null;

  // Client-side sort if genre filter is active (to ensure correct ordering without complex indexes)
  const sortedBooks = genre 
    ? [...books].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0))
    : books;

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {sortBy === 'createdAt' ? (
            <Clock className="h-5 w-5 text-primary animate-pulse" />
          ) : genre ? (
            <Star className="h-5 w-5 text-amber-500 fill-amber-500/20" />
          ) : (
            <TrendingUp className="h-5 w-5 text-accent animate-pulse" />
          )}
          <h2 className="text-2xl font-headline font-bold">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
           <Badge variant="secondary" className="bg-primary/5 text-primary border-none text-[10px] uppercase font-black tracking-widest px-2 py-0.5">
             {genre ? genre : sortBy === 'createdAt' ? 'New' : 'Trending'}
           </Badge>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedBooks.map((book) => (
          <Link key={book.id} href={`/pages/${book.id}/1`}>
            <Card className="bg-card/50 border-none shadow-sm hover:shadow-xl transition-all duration-500 group cursor-pointer h-full flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg font-headline font-bold group-hover:text-primary transition-colors line-clamp-1">
                      {book.title || book.metadata?.info?.bookTitle}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-medium truncate">By {book.author || book.metadata?.info?.author}</p>
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
                    {(book.views || book.metadata?.info?.views || 0).toLocaleString()} views
                  </div>
                  {book.metadata?.info?.totalChapters && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                      <Zap className="h-3.5 w-3.5" />
                      {book.metadata.info.totalChapters} chapters
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] uppercase font-bold text-accent tracking-tighter bg-accent/5 px-2 py-0.5 rounded-full border border-accent/10">
                    {book.genre || book.metadata?.info?.genre || 'Novel'}
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
