
'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import Navbar from '@/components/navbar';

const MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB free tier

export default function AdminDashboard() {
  const db = useFirestore();
  const [bookCount, setBookCount] = useState(0);
  const [chapterCount, setChapterCount] = useState(0);
  const [storageUsed, setStorageUsed] = useState(0);
  const [remainingStorage, setRemainingStorage] = useState(MAX_STORAGE_BYTES);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!db) return;

    // 1. Real-time stats listener for storage usage
    const statsRef = doc(db, 'stats', 'storageUsage');
    const unsubscribeStats = onSnapshot(statsRef, (docSnap) => {
      if (docSnap.exists()) {
        const used = docSnap.data().storageBytesUsed || 0;
        setStorageUsed(used);
        setRemainingStorage(MAX_STORAGE_BYTES - used);
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Real-time stats error:", err);
    });

    // 2. Real-time listener for the books collection
    const booksRef = collection(db, 'books');
    const unsubscribeBooks = onSnapshot(booksRef, async (snapshot) => {
      setBookCount(snapshot.size);

      // Recalculate total chapters across all books in real-time
      try {
        const chapterPromises = snapshot.docs.map(bookDoc => 
          getDocs(collection(db, 'books', bookDoc.id, 'chapters'))
        );
        const chapterSnaps = await Promise.all(chapterPromises);
        const total = chapterSnaps.reduce((sum, snap) => sum + snap.size, 0);
        setChapterCount(total);
      } catch (err) {
        console.warn("Failed to aggregate chapters in real-time:", err);
      }
      
      setIsLoading(false);
    });

    return () => {
      unsubscribeStats();
      unsubscribeBooks();
    };
  }, [db]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto bg-card p-10 rounded-3xl shadow-2xl border border-border/50">
          <header className="mb-10">
            <h1 className="text-4xl font-headline font-black">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-2 font-medium flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Live Lounge Metrics
            </p>
          </header>

          {isLoading ? (
            <div className="py-20 text-center animate-pulse text-muted-foreground font-bold uppercase tracking-widest text-sm">
              Connecting to live data...
            </div>
          ) : (
            <div className="space-y-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="p-8 bg-muted/30 rounded-2xl border border-border/50 transition-colors hover:bg-muted/50">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Total Books</p>
                  <p className="text-4xl font-headline font-black text-primary">{bookCount.toLocaleString()}</p>
                </div>
                <div className="p-8 bg-muted/30 rounded-2xl border border-border/50 transition-colors hover:bg-muted/50">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Total Chapters</p>
                  <p className="text-4xl font-headline font-black text-accent">{chapterCount.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-6 pt-10 border-t">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Cloud Storage Usage</p>
                    <p className="text-3xl font-headline font-black">
                      {(storageUsed / 1024 / 1024).toFixed(2)} <span className="text-lg text-muted-foreground">MB</span>
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">Remaining Capacity</p>
                    <p className="text-xl font-headline font-bold text-muted-foreground">
                      {(remainingStorage / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <div className="relative h-8 w-full bg-muted rounded-full overflow-hidden border border-border/50 shadow-inner">
                  <div 
                    className="absolute h-full bg-primary transition-all duration-1000 ease-out flex items-center justify-end px-4"
                    style={{ width: `${Math.min((storageUsed / MAX_STORAGE_BYTES) * 100, 100)}%` }}
                  >
                    {storageUsed > 0 && (
                      <span className="text-[10px] font-black text-white uppercase tracking-tighter">
                        {Math.round((storageUsed / MAX_STORAGE_BYTES) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
                
                <p className="text-[10px] text-center text-muted-foreground uppercase font-black tracking-[0.2em] opacity-60">
                  Storage limit: 5 GB (Firebase Free Tier Allocation)
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
