'use client';

import { useUser, useFirestore, useCollection, useMemoFirebase, useFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import Navbar from '@/components/navbar';
import { Breadcrumbs } from '@/components/breadcrumbs';
import NovelCard from '@/components/novel-card';
import { History, BookX, Loader2, Calendar, Clock, CloudOff, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getLocalHistory, LocalHistoryItem } from '@/lib/local-history-utils';
import { useEffect, useState } from 'react';

export default function ReadingHistoryPage() {
  const { user, isUserLoading } = useUser();
  const { isOfflineMode } = useFirebase();
  const db = useFirestore();
  const router = useRouter();
  const [localItems, setLocalItems] = useState<LocalHistoryItem[]>([]);

  useEffect(() => {
    setLocalItems(getLocalHistory());
  }, []);

  const historyQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'users', user.uid, 'history'),
      orderBy('lastReadAt', 'desc'),
      limit(48)
    );
  }, [db, user]);

  const { data: cloudItems, isLoading: isCloudLoading } = useCollection(historyQuery);

  if (isUserLoading || (isCloudLoading && user)) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      </div>
    );
  }

  const cloudIds = new Set(cloudItems?.map(i => i.bookId) || []);
  const supplementaryLocal = localItems.filter(l => !cloudIds.has(l.id));
  
  const formattedCloud = cloudItems?.map(i => ({
    ...i,
    id: i.bookId
  })) || [];

  const finalHistory = [...formattedCloud, ...supplementaryLocal].sort((a, b) => {
    const timeA = a.lastReadAt?.toDate ? a.lastReadAt.toDate().getTime() : new Date(a.lastReadAt).getTime();
    const timeB = b.lastReadAt?.toDate ? b.lastReadAt.toDate().getTime() : new Date(b.lastReadAt).getTime();
    return timeB - timeA;
  });

  const isAnonymous = !user || user.isAnonymous;

  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-6xl mx-auto">
          <Breadcrumbs items={[{ label: 'Reading History' }]} />
          
          <header className="mb-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-xl">
                    <History className="h-6 w-6 text-primary" />
                  </div>
                  <Badge variant="secondary" className="bg-primary/5 text-primary border-none uppercase tracking-widest text-[10px]">
                    Your Journey
                  </Badge>
                </div>
                <h1 className="text-5xl font-headline font-black">Reading History</h1>
                <p className="text-lg text-muted-foreground max-w-xl">
                  Jump back into the stories you've started.
                </p>
              </div>
            </div>
          </header>

          {finalHistory.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-8">
              {finalHistory.map((item) => (
                <div key={item.id} className="relative group">
                  <NovelCard 
                    novel={{
                      id: item.id,
                      title: item.title,
                      author: item.author,
                      genre: item.genre,
                      coverURL: item.coverURL,
                      isCloud: item.isCloud,
                      _isLocal: !item.isCloud
                    }} 
                  />
                  <div className="mt-2 px-1 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary">
                      <Clock className="h-3 w-3" />
                      Chapter {item.lastReadChapter}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-24 text-center border-2 border-dashed rounded-3xl bg-muted/20">
              <BookX className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
              <h2 className="text-2xl font-headline font-bold mb-2">Your shelf is waiting</h2>
              <Button variant="default" className="rounded-xl px-8" onClick={() => router.push('/')}>
                Discover Novels
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
