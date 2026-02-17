"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore, useUser, useCollection, useMemoFirebase, useDoc, useFirebase } from '@/firebase';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, arrayUnion, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, UserCheck, UserX, Mail, ShieldAlert, BookOpen, Layers, Activity, BarChart3, Inbox, Users, Star, CloudOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AdminStorageBar from '@/components/admin-storage-bar';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export default function AdminPage() {
  const db = useFirestore();
  const { user, isUserLoading } = useUser();
  const { isOfflineMode } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Library Stats
  const [bookCount, setBookCount] = useState<number>(0);
  const [chapterCount, setChapterCount] = useState<number>(0);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // Guard the profile reference
  const profileRef = useMemoFirebase(() => {
    if (!db || !user || user.isAnonymous || isUserLoading) return null;
    return doc(db, 'users', user.uid);
  }, [db, user, isUserLoading]);
  
  const { data: profile } = useDoc(profileRef);

  // Robust Admin Verification Logic
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (isOfflineMode) {
        setIsAdmin(false);
        return;
      }
      
      if (isUserLoading || !db) return;

      if (!user || user.isAnonymous) {
        setIsAdmin(false);
        return;
      }

      const superAdmins = ['hashamcomp@gmail.com'];
      if (user.email && superAdmins.includes(user.email)) {
        setIsAdmin(true);
        return;
      }

      if (profile?.role === 'admin') {
        setIsAdmin(true);
        return;
      }

      if (user.email) {
        const settingsRef = doc(db, 'settings', 'approvedEmails');
        getDoc(settingsRef)
          .then((snap) => {
            if (snap.exists()) {
              const emails = snap.data().emails || [];
              setIsAdmin(emails.includes(user.email!));
            } else {
              setIsAdmin(false);
            }
          })
          .catch(() => {
            setIsAdmin(false);
          });
      } else {
        setIsAdmin(false);
      }
    };

    checkAdminStatus();
  }, [user, isUserLoading, profile, db, isOfflineMode]);

  // Redirect if unauthorized
  useEffect(() => {
    if (isAdmin === false) {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "Redirecting to safety."
      });
      router.push('/');
    }
  }, [isAdmin, router, toast]);

  // Fetch Library Statistics (Only if admin)
  useEffect(() => {
    if (!isAdmin || isOfflineMode || !db) return;

    const fetchStats = async () => {
      setIsStatsLoading(true);
      try {
        const booksSnap = await getDocs(collection(db, 'books'));
        setBookCount(booksSnap.size);

        const usersSnap = await getDocs(collection(db, 'users'));
        setTotalUsers(usersSnap.size);

        let total = 0;
        const chapterPromises = booksSnap.docs.map(b => getDocs(collection(db, 'books', b.id, 'chapters')));
        const chapterSnaps = await Promise.all(chapterPromises);
        chapterSnaps.forEach(snap => total += snap.size);
        
        setChapterCount(total);
      } catch (err) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'books',
          operation: 'list',
        }));
      } finally {
        setIsStatsLoading(false);
      }
    };

    fetchStats();
  }, [db, isAdmin, isOfflineMode]);

  const requestsQuery = useMemoFirebase(() => {
    if (!isAdmin || isOfflineMode || !db) return null;
    return query(collection(db, 'publishRequests'), orderBy('requestedAt', 'desc'));
  }, [db, isAdmin, isOfflineMode]);

  const { data: requests, isLoading: isRequestsLoading } = useCollection(requestsQuery);

  const bookRequestsQuery = useMemoFirebase(() => {
    if (!isAdmin || isOfflineMode || !db) return null;
    return query(collection(db, 'cloudUploadRequests'));
  }, [db, isAdmin, isOfflineMode]);
  const { data: bookRequests } = useCollection(bookRequestsQuery);

  const handleApprove = async (requestId: string, email: string) => {
    if (!db) return;
    setProcessingId(requestId);
    
    const approvedRef = doc(db, 'settings', 'approvedEmails');
    const deleteReqRef = doc(db, 'publishRequests', requestId);

    // Use setDoc with merge to ensure document exists
    const approvalPayload = { emails: arrayUnion(email) };
    setDoc(approvedRef, approvalPayload, { merge: true })
      .then(() => deleteDoc(deleteReqRef))
      .then(() => {
        toast({ title: "User Approved", description: `${email} has been added to the cloud contributors.` });
      })
      .catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: approvedRef.path,
          operation: 'write',
          requestResourceData: approvalPayload,
        }));
      })
      .finally(() => setProcessingId(null));
  };

  const handleReject = async (requestId: string) => {
    if (!db) return;
    setProcessingId(requestId);
    const docRef = doc(db, 'publishRequests', requestId);
    
    deleteDoc(docRef)
      .then(() => {
        toast({ title: "Request Rejected", description: "The request has been removed." });
      })
      .catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        }));
      })
      .finally(() => setProcessingId(null));
  };

  if (isUserLoading || (isAdmin === null && !isOfflineMode)) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      </div>
    );
  }

  if (isOfflineMode) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto">
          <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-800 rounded-[2.5rem] p-10 shadow-xl border-none">
            <CloudOff className="h-16 w-16 mb-6 mx-auto opacity-30" />
            <AlertTitle className="text-4xl font-headline font-black mb-4">Lounge Control Offline</AlertTitle>
            <AlertDescription className="text-lg opacity-80 leading-relaxed">
              The Admin Panel requires an active connection to Firebase services to manage cloud manuscripts and contributor credentials.
            </AlertDescription>
            <div className="mt-10">
              <Button variant="outline" className="rounded-2xl h-14 px-10 font-bold border-amber-500/30 text-amber-900 bg-amber-500/5 hover:bg-amber-500/10" onClick={() => router.push('/')}>
                Back to Library
              </Button>
            </div>
          </Alert>
        </div>
      </div>
    );
  }

  if (isAdmin === false) return null;

  return (
    <div className="min-h-screen pb-20 bg-background transition-colors duration-500">
      <Navbar />
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-5xl mx-auto">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Authority Dashboard</span>
              </div>
              <h1 className="text-5xl font-headline font-black leading-none">Lounge Control</h1>
              <p className="text-muted-foreground mt-2 text-lg">Manage the global shelf and contributor whitelist.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/admin/requests">
                <Button variant="outline" className="h-12 rounded-2xl border-amber-500/20 text-amber-700 bg-amber-500/5 hover:bg-amber-500/10 transition-all font-bold">
                  <Inbox className="h-4 w-4 mr-2" />
                  Manuscripts
                  {bookRequests && bookRequests.length > 0 && (
                    <Badge className="ml-2 bg-amber-500 h-5 px-1.5 min-w-5">{bookRequests.length}</Badge>
                  )}
                </Button>
              </Link>
              <Link href="/admin/dashboard">
                <Button className="h-12 rounded-2xl bg-primary text-primary-foreground shadow-xl hover:shadow-primary/20 transition-all font-bold px-6">
                  <BarChart3 className="h-4 w-4 mr-2" /> Live Analytics
                </Button>
              </Link>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <Card className="bg-card/40 backdrop-blur-xl border-none shadow-xl rounded-[2rem] overflow-hidden group">
              <div className="h-1 bg-primary w-full opacity-20 group-hover:opacity-100 transition-opacity" />
              <CardContent className="p-8">
                <Users className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-4xl font-headline font-black">{totalUsers.toLocaleString()}</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-2">Active Readers</p>
              </CardContent>
            </Card>

            <Card className="bg-card/40 backdrop-blur-xl border-none shadow-xl rounded-[2rem] overflow-hidden group">
              <div className="h-1 bg-primary w-full opacity-20 group-hover:opacity-100 transition-opacity" />
              <CardContent className="p-8">
                <BookOpen className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-4xl font-headline font-black">{bookCount.toLocaleString()}</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-2">Cloud Volumes</p>
              </CardContent>
            </Card>

            <Card className="bg-card/40 backdrop-blur-xl border-none shadow-xl rounded-[2rem] overflow-hidden group">
              <div className="h-1 bg-accent w-full opacity-20 group-hover:opacity-100 transition-opacity" />
              <CardContent className="p-8">
                <Layers className="h-6 w-6 text-accent mb-4" />
                <h3 className="text-4xl font-headline font-black">{chapterCount.toLocaleString()}</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-2">Total Chapters</p>
              </CardContent>
            </Card>

            <Card className="bg-card/40 backdrop-blur-xl border-none shadow-xl rounded-[2rem] overflow-hidden group">
              <div className="h-1 bg-green-500 w-full opacity-20 group-hover:opacity-100 transition-opacity" />
              <CardContent className="p-8">
                <Activity className="h-6 w-6 text-green-600 mb-4" />
                <h3 className="text-4xl font-headline font-black text-green-600">Stable</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-2">System Status</p>
              </CardContent>
            </Card>
          </div>

          <AdminStorageBar />

          <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl overflow-hidden rounded-[2.5rem]">
            <CardHeader className="bg-muted/30 p-10">
              <CardTitle className="text-2xl font-headline font-black">Contributor Applications</CardTitle>
              <CardDescription className="text-base">Vet users requesting global publishing privileges.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isRequestsLoading ? (
                <div className="p-20 flex justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" /></div>
              ) : requests && requests.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10 border-none">
                      <TableHead className="pl-10 font-black uppercase tracking-widest text-[10px]">Candidate Email</TableHead>
                      <TableHead className="font-black uppercase tracking-widest text-[10px]">Applied On</TableHead>
                      <TableHead className="text-right pr-10 font-black uppercase tracking-widest text-[10px]">Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((req) => (
                      <TableRow key={req.id} className="border-border/50 hover:bg-primary/5 transition-colors h-24">
                        <TableCell className="pl-10 font-bold text-lg">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-xl"><Mail className="h-5 w-5 text-primary" /></div>
                            {req.email}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-medium">
                          {req.requestedAt?.toDate ? req.requestedAt.toDate().toLocaleDateString() : 'Pending Sync'}
                        </TableCell>
                        <TableCell className="text-right pr-10">
                          <div className="flex items-center justify-end gap-3">
                            <Button 
                              variant="ghost" 
                              className="text-destructive hover:bg-destructive/10 rounded-xl font-bold"
                              onClick={() => handleReject(req.id)}
                              disabled={!!processingId}
                            >
                              <UserX className="h-4 w-4 mr-2" /> Discard
                            </Button>
                            <Button 
                              className="bg-primary hover:bg-primary/90 shadow-lg rounded-xl font-bold px-6"
                              onClick={() => handleApprove(req.id, req.email)}
                              disabled={!!processingId}
                            >
                              {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4 mr-2" />}
                              Approve
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-24 text-center opacity-50 flex flex-col items-center">
                  <Star className="h-16 w-16 mb-4 text-primary animate-pulse" />
                  <p className="text-xl font-headline font-bold">No Pending Applications</p>
                  <p className="text-sm mt-1">The Lounge is currently well-staffed.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
