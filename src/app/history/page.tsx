'use client';

import { useUser, useFirestore, useCollection, useMemoFirebase, useFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import { History, BookX, Loader2, Calendar, Clock, CloudOff, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * @fileOverview Reading History page.
 * Displays a list of novels the user has recently read, with their last progress.
 */
export default function ReadingHistoryPage() {
  const { user, isUserLoading } = useUser();
  const { isOfflineMode } = useFirebase();
  const db = useFirestore();
  const router = useRouter();

  const historyQuery = useMemoFirebase(() => {
    if (!db || !user || user.isAnonymous) return null;
    return query(
      collection(db, 'users', user.uid, 'history'),
      orderBy('lastReadAt', 'desc'),
      limit(24)
    );
  }, [db, user]);

  const { data: historyItems, isLoading } = useCollection(historyQuery);

  if (isUserLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-6xl mx-auto">
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-primary/10 p-2 rounded-xl">
                <History className="h-6 w-6 text-primary" />
              </div>
              <Badge variant="secondary" className="bg-primary/5 text-primary border-none uppercase tracking-widest text-[10px]">
                Your Journey
              </Badge>
            </div>
            <h1 className="text-5xl font-headline font-black">Reading History</h1>
            <p className="text-lg text-muted-foreground mt-2 max-w-xl">
              Jump back into the stories you've started. We remember your progress so you don't have to.
            </p>
          </header>

          {isOfflineMode ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-800 rounded-3xl p-8">
                <CloudOff className="h-8 w-8 mb-4" />
                <AlertTitle className="text-2xl font-headline font-black">Cloud Sync Unavailable</AlertTitle>
                <AlertDescription className="text-base mt-2 max-w-2xl">
                  The Lounge is currently in <strong>Independent Mode</strong>. Your cloud reading history cannot be retrieved or synced until a connection is established. 
                  Your <strong>Local Drafts</strong> progress is still saved within your browser.
                </AlertDescription>
              </Alert>
              
              <div className="text-center py-20 bg-muted/20 rounded-3xl border-2 border-dashed">
                 <Info className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                 <p className="text-muted-foreground font-medium">Reconnect to see your global bookshelf.</p>
              </div>
            </div>
          ) : !user || user.isAnonymous ? (
            <div className="py-24 text-center border-2 border-dashed rounded-3xl bg-muted/20">
              <History className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
              <h1 className="text-3xl font-headline font-black mb-2">Sign in Required</h1>
              <p className="text-muted-foreground max-w-md mb-8 mx-auto">
                Please sign in to your account to view and sync your reading history across devices.
              </p>
              <Button variant="default" className="rounded-xl px-8" onClick={() => router.push('/login')}>
                Sign In
              </Button>
            </div>
          ) : isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
            </div>
          ) : historyItems && historyItems.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-8">
              {historyItems.map((item) => (
                <div key={item.id} className="relative group">
                  <NovelCard 
                    novel={{
                      id: item.bookId,
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
                      {item.lastReadAt?.toDate ? item.lastReadAt.toDate().toLocaleDateString() : 'Recently'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-24 text-center border-2 border-dashed rounded-3xl bg-muted/20">
              <BookX className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
              <h2 className="text-2xl font-headline font-bold mb-2">Your shelf is waiting</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-8">
                You haven't started reading any novels yet. Explore our collection to begin your adventure.
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
