'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import Navbar from '@/components/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BookOpen, Layers, HardDrive, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

const MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB free tier

export default function AdminDashboard() {
  const db = useFirestore();
  const router = useRouter();
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

  const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);
  const storagePercentage = (storageUsed / MAX_STORAGE_BYTES) * 100;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <header className="mb-10 flex items-center justify-between">
            <div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push('/admin')}
                className="mb-4 -ml-2 text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin Panel
              </Button>
              <h1 className="text-4xl font-headline font-black">Live Lounge Metrics</h1>
              <p className="text-muted-foreground mt-2">Real-time monitoring of your cloud library resources.</p>
            </div>
          </header>

          {isLoading ? (
            <div className="py-20 text-center animate-pulse text-muted-foreground font-bold uppercase tracking-widest text-sm">
              Connecting to live data...
            </div>
          ) : (
            <div className="grid gap-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-none shadow-lg bg-card/50 backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Total Books</CardTitle>
                    <BookOpen className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-headline font-black text-primary">{bookCount.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">Unique titles published to cloud</p>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg bg-card/50 backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Total Chapters</CardTitle>
                    <Layers className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-headline font-black text-accent">{chapterCount.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">Total indexed reading units</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-none shadow-xl bg-card/80 backdrop-blur overflow-hidden">
                <div className="h-2 bg-primary w-full" />
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5 text-primary" />
                    Storage Allocation
                  </CardTitle>
                  <CardDescription>Based on Firebase Free Tier (5 GB limit)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div>
                      <p className="text-sm font-bold text-muted-foreground mb-1 uppercase tracking-tighter">Used Storage</p>
                      <p className="text-3xl font-headline font-black">{formatMB(storageUsed)} <span className="text-lg text-muted-foreground">MB</span></p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm font-bold text-muted-foreground mb-1 uppercase tracking-tighter">Remaining Capacity</p>
                      <p className="text-3xl font-headline font-black text-green-600">{formatMB(remainingStorage)} <span className="text-lg text-muted-foreground font-normal">MB</span></p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Progress value={storagePercentage} className="h-4" />
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <span>0 GB</span>
                      <span>{Math.round(storagePercentage)}% Consumed</span>
                      <span>5 GB</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
