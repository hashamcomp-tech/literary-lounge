
"use client";

import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Eye, Star, Zap, Clock, Book } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

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
    
    if (genre) {
      return query(
        booksCol,
        where('genre', '==', genre),
        limit(limitCount)
      );
    }
    
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

  // Gracefully handle missing firebase data
  if (!db || !books || books.length === 0) return null;

  const sortedBooks = genre 
    ? [...books].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0))
    : books;

  return (
    <div className="py-8 animate-in fade-in duration-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {sortBy === 'createdAt' ? (
            <Clock className="h-5 w-5 text-primary" />
          ) : genre ? (
            <Star className="h-5 w-5 text-amber-500 fill-amber-500/20" />
          ) : (
            <TrendingUp className="h-5 w-5 text-accent" />
          )}
          <h2 className="text-2xl font-headline font-bold">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
           <Badge variant="secondary" className="bg-primary/5 text-primary border-none text-[10px] uppercase font-black tracking-widest px-2 py-0.5">
             Cloud Collection
           </Badge>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedBooks.map((book) => {
          const coverImg = book.coverURL || book.metadata?.info?.coverURL || book.coverImage || `https://picsum.photos/seed/${book.id}/400/600`;
          
          return (
            <Link key={book.id} href={`/pages/${book.id}/1`}>
              <Card className="bg-card/50 border-none shadow-sm hover:shadow-xl transition-all duration-500 group cursor-pointer h-full flex flex-col overflow-hidden">
                <div className="flex flex-row">
                  <div className="relative w-[100px] h-[150px] shrink-0 m-4 shadow-md bg-muted/20 flex items-center justify-center rounded-md overflow-hidden">
                    {coverImg ? (
                      <Image 
                        src={coverImg}
                        alt={book.title || "Book Cover"}
                        fill
                        className="object-cover"
                        data-ai-hint="book cover"
                      />
                    ) : (
                      <Book className="h-8 w-8 text-muted-foreground/20" />
                    )}
                  </div>
                  <div className="flex-1 flex flex-col py-4 pr-4 min-w-0">
                    <CardHeader className="p-0 mb-2">
                      <CardTitle className="text-lg font-headline font-bold group-hover:text-primary transition-colors line-clamp-2">
                        {book.title || book.metadata?.info?.bookTitle}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground font-medium truncate">By {book.author || book.metadata?.info?.author}</p>
                    </CardHeader>
                    <CardContent className="p-0 flex-1 flex flex-col justify-between">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                          <Eye className="h-3 w-3" />
                          {(book.views || book.metadata?.info?.views || 0).toLocaleString()}
                        </div>
                        {book.metadata?.info?.totalChapters && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                            <Zap className="h-3 w-3" />
                            {book.metadata.info.totalChapters} ch
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px] uppercase font-bold text-accent tracking-tighter bg-accent/5 px-2 py-0.5 rounded-full border border-accent/10">
                          {book.genre || book.metadata?.info?.genre || 'Novel'}
                        </Badge>
                        <span className="text-[10px] font-black text-primary group-hover:translate-x-1 transition-transform">
                          Read Now →
                        </span>
                      </div>
                    </CardContent>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
