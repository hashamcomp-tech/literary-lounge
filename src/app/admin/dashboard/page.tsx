
'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, getDocs, query, orderBy, limit, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import Navbar from '@/components/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BookOpen, Layers, HardDrive, ArrowLeft, Users, MessageSquare, Clock, ArrowRight, RefreshCcw, CheckCircle2 } from 'lucide-react';
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
  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!db) return;

    // 1. Real-time stats listener for storage usage
    const statsRef = doc(db, 'stats', 'storageUsage');
    const unsubscribeStats = onSnapshot(
      statsRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          const used = docSnap.data().storageBytesUsed || 0;
          setStorageUsed(used);
          setRemainingStorage(MAX_STORAGE_BYTES - used);
        } else {
          // Explicitly set to 0 if doc doesn't exist
          setStorageUsed(0);
          setRemainingStorage(MAX_STORAGE_BYTES);
        }
      },
      async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: statsRef.path,
          operation: 'get',
        }));
      }
    );

    // 2. Real-time listener for the users collection
    const usersRef = collection(db, 'users');
    const unsubscribeUsers = onSnapshot(
      usersRef, 
      (snapshot) => {
        setTotalUsers(snapshot.size); 
      },
      async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: usersRef.path,
          operation: 'list',
        }));
      }
    );

    // 3. Real-time listener for the books collection
    const booksRef = collection(db, 'books');
    const unsubscribeBooks = onSnapshot(
      booksRef, 
      async (snapshot) => {
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
          // Inner errors handled contextually if needed
        }
      },
      async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: booksRef.path,
          operation: 'list',
        }));
      }
    );

    // 4. Real-time listener for cloud upload requests (recent only)
    const requestsRef = collection(db, 'cloudUploadRequests');
    const requestsQuery = query(requestsRef, orderBy('requestedAt', 'desc'), limit(5));
    const unsubscribeRequests = onSnapshot(
      requestsQuery, 
      (snapshot) => {
        setRecentRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        setIsLoading(false);
      },
      async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: requestsRef.path,
          operation: 'list',
        }));
      }
    );

    return () => {
      unsubscribeStats();
      unsubscribeUsers();
      unsubscribeBooks();
      unsubscribeRequests();
    };
  }, [db]);

  /**
   * Deep sync tool to repair storage statistics.
   * Scans all books and sums up coverSize.
   */
  const handleRecalculateStorage = async () => {
    if (!db) return;
    setIsSyncing(true);
    try {
      const booksSnap = await getDocs(collection(db, 'books'));
      let totalSize = 0;
      
      booksSnap.forEach(doc => {
        const data = doc.data();
        totalSize += (data.coverSize || data.metadata?.info?.coverSize || 0);
      });

      const statsRef = doc(db, 'stats', 'storageUsage');
      await setDoc(statsRef, { 
        storageBytesUsed: totalSize,
        lastSyncedAt: serverTimestamp() 
      }, { merge: true });

      toast({
        title: "Stats Repaired",
        description: `Library scanned. Total storage: ${(totalSize / (1024 * 1024)).toFixed(2)} MB.`
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: "Could not access library metadata."
      });
    } finally {
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
          <header className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              <h1 className="text-4xl font-headline font-black">Lounge Intelligence</h1>
              <p className="text-muted-foreground mt-2">Real-time metrics for your readers and resources.</p>
            </div>
            <Button 
              variant="outline" 
              className="rounded-xl font-bold h-12 px-6 gap-2 border-primary/20"
              onClick={handleRecalculateStorage}
              disabled={isSyncing}
            >
              {isSyncing ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Repair Stats
            </Button>
          </header>

          {isLoading ? (
            <div className="py-20 text-center animate-pulse text-muted-foreground font-bold uppercase tracking-widest text-sm">
              Syncing with live Lounge data...
            </div>
          ) : (
            <div className="grid gap-8">
              {/* Primary Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-none shadow-lg bg-card/50 backdrop-blur relative overflow-hidden group">
                  <div className="absolute right-0 top-0 p-4 opacity-5 transition-transform group-hover:scale-110">
                    <Users className="h-24 w-24 text-primary" />
                  </div>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Total Registered Users</CardTitle>
                    <Users className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-headline font-black text-primary">{totalUsers.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">Active readers in the community</p>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg bg-card/50 backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Cloud Books</CardTitle>
                    <BookOpen className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-headline font-black text-accent">{bookCount.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">Unique titles in the global shelf</p>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-lg bg-card/50 backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Cloud Chapters</CardTitle>
                    <Layers className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-headline font-black text-green-600">{chapterCount.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground mt-1">Total indexed reading units</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Storage Analysis */}
                <Card className="border-none shadow-xl bg-card/80 backdrop-blur overflow-hidden flex flex-col">
                  <div className="h-2 bg-primary w-full" />
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-xl font-headline font-bold">
                        <HardDrive className="h-5 w-5 text-primary" />
                        Storage Allocation
                      </CardTitle>
                      {storageUsed > 0 && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    </div>
                    <CardDescription>Estimated usage of Firebase 5GB Free Tier</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8 flex-1 flex flex-col justify-center">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div>
                        <p className="text-[10px] font-black text-muted-foreground mb-1 uppercase tracking-tighter">Used Storage</p>
                        <p className="text-3xl font-headline font-black">{formatMB(storageUsed)} <span className="text-lg text-muted-foreground font-normal">MB</span></p>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-[10px] font-black text-muted-foreground mb-1 uppercase tracking-tighter">Remaining Capacity</p>
                        <p className="text-3xl font-headline font-black text-green-600">{formatMB(remainingStorage)} <span className="text-lg text-muted-foreground font-normal">MB</span></p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Progress value={storagePercentage} className="h-4 bg-primary/10" />
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                        <span>0 MB</span>
                        <span>{Math.round(storagePercentage)}% Consumed</span>
                        <span>5120 MB</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Content Submission Queue */}
                <Card className="border-none shadow-xl bg-card/80 backdrop-blur overflow-hidden flex flex-col">
                  <div className="h-2 bg-amber-500 w-full" />
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-xl font-headline font-bold">
                        <MessageSquare className="h-5 w-5 text-amber-500" />
                        Live Submission Feed
                      </CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => router.push('/admin/requests')} className="text-xs h-7 gap-1">
                        View All <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                    <CardDescription>Recent requests for cloud publishing review</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 flex-1">
                    {recentRequests.length > 0 ? (
                      <div className="divide-y">
                        {recentRequests.map((req) => (
                          <div key={req.id} className="p-4 hover:bg-muted/30 transition-colors">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="text-sm font-bold truncate pr-4">{req.title}</h4>
                              <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[9px] h-4 uppercase font-black tracking-tighter">
                                {req.status || 'Pending'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span className="font-bold text-foreground">By {req.author || 'Anonymous'}</span>
                              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {req.requestedAt?.toDate ? req.requestedAt.toDate().toLocaleDateString() : 'Just now'}</span>
                              <span>Chapter {req.chapterNumber || 1}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-12 text-center">
                        <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-20" />
                        <p className="text-sm text-muted-foreground">No pending submissions in the queue.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
