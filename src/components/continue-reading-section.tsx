'use client';

import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { PlayCircle, Clock, ArrowRight, Book, History } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getLocalHistory, LocalHistoryItem } from '@/lib/local-history-utils';
import { useEffect, useState } from 'react';

/**
 * @fileOverview Continue Reading Section.
 * Intelligently merges cloud history with local browser history for an unauthenticated-first experience.
 */
export default function ContinueReadingSection() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [localItems, setLocalItems] = useState<LocalHistoryItem[]>([]);

  // Load local items on mount
  useEffect(() => {
    setLocalItems(getLocalHistory().slice(0, 3));
  }, []);

  // Fetch cloud items
  const historyQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'users', user.uid, 'history'),
      orderBy('lastReadAt', 'desc'),
      limit(3)
    );
  }, [db, user]);

  const { data: cloudItems, isLoading: isCloudLoading } = useCollection(historyQuery);

  if (isUserLoading || (isCloudLoading && user)) {
    return (
      <div className="py-8 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // Merge items: prefer cloud but show local if user is anonymous or just started
  const mergedItems = cloudItems && cloudItems.length > 0 ? cloudItems : localItems;

  if (mergedItems.length === 0) {
    return null;
  }

  return (
    <section className="py-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-headline font-black">Continue Reading</h2>
        </div>
        <Link href="/history">
          <Button variant="ghost" size="sm" className="text-xs font-bold text-muted-foreground hover:text-primary gap-1">
            Full History <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {mergedItems.map((item: any) => {
          const id = item.bookId || item.id;
          const coverURL = item.coverURL || `https://picsum.photos/seed/${id}/200/300`;
          const href = item.isCloud ? `/pages/${id}/${item.lastReadChapter}` : `/novel/${id}`;
          
          return (
            <Link key={id} href={href}>
              <div className="group bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-4 flex items-center gap-4 transition-all hover:shadow-xl hover:bg-card/60 hover:-translate-y-1">
                <div className="relative h-20 w-14 shrink-0 rounded-md overflow-hidden shadow-md bg-muted/20 flex items-center justify-center">
                  {coverURL ? (
                    <img 
                      src={coverURL} 
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <Book className="h-6 w-6 text-muted-foreground/30" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-headline font-bold text-base leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate mb-2">By {item.author}</p>
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/10 text-primary text-[9px] font-black uppercase px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      Chapter {item.lastReadChapter}
                    </div>
                  </div>
                </div>
                <div className="h-8 w-8 rounded-full bg-primary/5 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
