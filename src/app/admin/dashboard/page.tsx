
'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, getDocs, query, orderBy, limit, setDoc, serverTimestamp, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import Navbar from '@/components/navbar';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BookOpen, Layers, HardDrive, Users, MessageSquare, Clock, ArrowRight, RefreshCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

const MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB free tier

export default function AdminDashboard() {
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const [bookCount, setBookCount] = useState(0);
  const [chapterCount, setChapterCount] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [storageUsed, setStorageUsed] = useState(0);
  const [remainingStorage, setRemainingStorage] = useState(MAX_STORAGE_BYTES);
  const [newReportsCount, setNewReportsCount] = useState(0);
  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!db) return;

    const statsRef = doc(db, 'stats', 'storageUsage');
    const unsubscribeStats = onSnapshot(
      statsRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          const used = docSnap.data().storageBytesUsed || 0;
          setStorageUsed(used);
          setRemainingStorage(MAX_STORAGE_BYTES - used);
        }
      }
    );

    const reportsRef = collection(db, 'supportReports');
    const qReports = query(reportsRef, where('status', '==', 'new'));
    const unsubscribeReports = onSnapshot(qReports, (snap) => {
      setNewReportsCount(snap.size);
    });

    const usersRef = collection(db, 'users');
    const unsubscribeUsers = onSnapshot(usersRef, (snap) => setTotalUsers(snap.size));

    const booksRef = collection(db, 'books');
    const unsubscribeBooks = onSnapshot(booksRef, (snap) => setBookCount(snap.size));

    setIsLoading(false);

    return () => {
      unsubscribeStats();
      unsubscribeReports();
      unsubscribeUsers();
      unsubscribeBooks();
    };
  }, [db]);

  const handleRecalculateStorage = async () => {
    if (!db) return;
    setIsSyncing(true);
    try {
      const booksSnap = await getDocs(collection(db, 'books'));
      let totalSize = 0;
      booksSnap.forEach(doc => {
        const data = doc.data();
        totalSize += (data.coverSize || 0);
      });
      const statsRef = doc(db, 'stats', 'storageUsage');
      await setDoc(statsRef, { storageBytesUsed: totalSize, lastSyncedAt: serverTimestamp() }, { merge: true });
      toast({ title: "Stats Repaired" });
    } catch (err) {} finally {
      setIsSyncing(false);
    }
  };

  const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);
  const storagePercentage = (storageUsed / MAX_STORAGE_BYTES) * 100;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto">
          <Breadcrumbs 
            items={[
              { label: 'Control Panel', href: '/admin' },
              { label: 'Intelligence' }
            ]} 
          />

          <header className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-headline font-black">Lounge Intelligence</h1>
              <p className="text-muted-foreground mt-2">Real-time metrics for your readers and resources.</p>
            </div>
            <Button 
              variant="outline" 
              className="rounded-xl font-bold h-12 px-6 gap-2 border-primary/20"
              onClick={handleRecalculateStorage}
              disabled={isSyncing}
            >
              <RefreshCcw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              Repair Stats
            </Button>
          </header>

          <div className="grid gap-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="border-none shadow-lg bg-card/50 backdrop-blur">
                <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-muted-foreground">Users</CardTitle></CardHeader>
                <CardContent><div className="text-4xl font-headline font-black text-primary">{totalUsers}</div></CardContent>
              </Card>
              <Card className="border-none shadow-lg bg-card/50 backdrop-blur">
                <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-muted-foreground">Volumes</CardTitle></CardHeader>
                <CardContent><div className="text-4xl font-headline font-black text-accent">{bookCount}</div></CardContent>
              </Card>
              <Card className="border-none shadow-lg bg-card/50 backdrop-blur">
                <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-muted-foreground">Chapters</CardTitle></CardHeader>
                <CardContent><div className="text-4xl font-headline font-black text-green-600">---</div></CardContent>
              </Card>
              <Card className="border-none shadow-lg bg-card/50 backdrop-blur">
                <CardHeader className="pb-2"><CardTitle className="text-[10px] font-black uppercase text-muted-foreground">Reports</CardTitle></CardHeader>
                <CardContent><div className="text-4xl font-headline font-black text-red-500">{newReportsCount}</div></CardContent>
              </Card>
            </div>

            <Card className="border-none shadow-xl bg-card/80 backdrop-blur overflow-hidden">
              <div className="h-2 bg-primary w-full" />
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-headline font-bold">
                  <HardDrive className="h-5 w-5 text-primary" /> Storage Allocation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="flex justify-between">
                  <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase">Used</p>
                    <p className="text-3xl font-headline font-black">{formatMB(storageUsed)} MB</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-muted-foreground uppercase">Capacity</p>
                    <p className="text-3xl font-headline font-black">5120 MB</p>
                  </div>
                </div>
                <Progress value={storagePercentage} className="h-4 bg-primary/10" />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
