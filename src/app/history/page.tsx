'use client';

import { useUser, useFirestore, useCollection, useMemoFirebase, useFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import { History, BookX, Loader2, Calendar, Clock, CloudOff, Info, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getLocalHistory, LocalHistoryItem } from '@/lib/local-history-utils';
import { useEffect, useState } from 'react';

/**
 * @fileOverview Reading History page.
 * Merges Cloud history with Local history to ensure unlogged users have a consistent journey.
 */
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

  // Loading state
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

  // Merge items: Prefer cloud but supplement with local items not found in cloud
  const cloudIds = new Set(cloudItems?.map(i => i.bookId) || []);
  const supplementaryLocal = localItems.filter(l => !cloudIds.has(l.id));
  
  // Format cloud items to match common shape
  const formattedCloud = cloudItems?.map(i => ({
    ...i,
    id: i.bookId // Ensure id matches the novel ID for the card
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
                  {isAnonymous && " We're remembering your progress locally until you sign in."}
                </p>
              </div>
              
              {isAnonymous && !isOfflineMode && (
                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex items-center gap-4 animate-in zoom-in">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-xs">
                    <p className="font-bold">Sync this history?</p>
                    <button onClick={() => router.push('/login')} className="text-primary hover:underline">Create an account →</button>
                  </div>
                </div>
              )}
            </div>
          </header>

          {isOfflineMode && finalHistory.length === 0 ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-800 rounded-3xl p-8">
                <CloudOff className="h-8 w-8 mb-4" />
                <AlertTitle className="text-2xl font-headline font-black">Cloud Sync Unavailable</AlertTitle>
                <AlertDescription className="text-base mt-2 max-w-2xl">
                  The Lounge is in Independent Mode.
                </AlertDescription>
              </Alert>
            </div>
          ) : finalHistory.length > 0 ? (
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
                    <div className="text-[9px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-2.5 w-2.5" />
                      {item.lastReadAt?.toDate ? item.lastReadAt.toDate().toLocaleDateString() : new Date(item.lastReadAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-24 text-center border-2 border-dashed rounded-3xl bg-muted/20">
              <BookX className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
              <h2 className="text-2xl font-headline font-black mb-2">Your shelf is waiting</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-8">
                You haven't started reading any novels yet.
              </p>
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
