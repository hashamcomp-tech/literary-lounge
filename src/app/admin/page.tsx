"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore, useUser, useCollection, useMemoFirebase, useDoc, useFirebase, useStorage } from '@/firebase';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, arrayUnion, arrayRemove, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, UserCheck, UserX, Mail, BookOpen, Layers, Activity, BarChart3, Inbox, Users, Star, CloudOff, Trash2, Search, ExternalLink, ChevronDown, UserMinus, ImagePlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AdminStorageBar from '@/components/admin-storage-bar';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Input } from '@/components/ui/input';
import { deleteCloudBook, updateCloudBookCover } from '@/lib/cloud-library-utils';
import { uploadCoverImage } from '@/lib/upload-cover';
import { optimizeCoverImage } from '@/lib/image-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * @fileOverview Lounge Control Panel.
 * Primary command center for administrators.
 * Features real-time status monitoring, contributor vetting, and visual asset management.
 */
export default function AdminPage() {
  const db = useFirestore();
  const storage = useStorage();
  const { user, isUserLoading } = useUser();
  const { isOfflineMode } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [updatingCoverId, setUpdatingCoverId] = useState<string | null>(null);
  const [approvedEmails, setApprovedEmails] = useState<string[]>([]);
  
  const [bookCount, setBookCount] = useState<number>(0);
  const [chapterCount, setChapterCount] = useState<number>(0);
  const [totalUsers, setTotalUsers] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user || user.isAnonymous || isUserLoading) return null;
    return doc(db, 'users', user.uid);
  }, [db, user, isUserLoading]);
  
  const { data: profile } = useDoc(profileRef);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (isOfflineMode) { setIsAdmin(false); return; }
      if (isUserLoading || !db) return;
      if (!user || user.isAnonymous) { setIsAdmin(false); return; }

      const superAdmins = ['hashamcomp@gmail.com'];
      if (user.email && superAdmins.includes(user.email)) { setIsAdmin(true); return; }
      if (profile?.role === 'admin') { setIsAdmin(true); return; }

      if (user.email) {
        const settingsRef = doc(db, 'settings', 'approvedEmails');
        getDoc(settingsRef).then((snap) => {
          if (snap.exists()) {
            const emails = snap.data().emails || [];
            setIsAdmin(emails.includes(user.email!));
          } else { setIsAdmin(false); }
        }).catch(() => setIsAdmin(false));
      } else { setIsAdmin(false); }
    };
    checkAdminStatus();
  }, [user, isUserLoading, profile, db, isOfflineMode]);

  useEffect(() => {
    if (!isAdmin || isOfflineMode || !db) return;
    const settingsRef = doc(db, 'settings', 'approvedEmails');
    const unsubscribe = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) setApprovedEmails(snap.data().emails || []);
    });
    return () => unsubscribe();
  }, [db, isAdmin, isOfflineMode]);

  useEffect(() => {
    if (isAdmin === false) { router.push('/'); }
  }, [isAdmin, router]);

  useEffect(() => {
    if (!isAdmin || isOfflineMode || !db) return;
    const fetchStats = async () => {
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
      } catch (err) {}
    };
    fetchStats();
  }, [db, isAdmin, isOfflineMode]);

  const requestsQuery = useMemoFirebase(() => {
    if (!isAdmin || isOfflineMode || !db) return null;
    return query(collection(db, 'publishRequests'), orderBy('requestedAt', 'desc'));
  }, [db, isAdmin, isOfflineMode]);

  const { data: requests, isLoading: isRequestsLoading } = useCollection(requestsQuery);

  const cloudRequestsQuery = useMemoFirebase(() => {
    if (!isAdmin || isOfflineMode || !db) return null;
    return collection(db, 'cloudUploadRequests');
  }, [db, isAdmin, isOfflineMode]);

  const { data: cloudRequests } = useCollection(cloudRequestsQuery);
  const hasCloudRequests = cloudRequests && cloudRequests.length > 0;

  const booksQuery = useMemoFirebase(() => {
    if (!isAdmin || isOfflineMode || !db) return null;
    return query(collection(db, 'books'), orderBy('createdAt', 'desc'), limit(100));
  }, [db, isAdmin, isOfflineMode]);

  const { data: allBooks, isLoading: isBooksLoading } = useCollection(booksQuery);

  const handleApprove = async (requestId: string, email: string) => {
    if (!db) return;
    setProcessingId(requestId);
    const approvedRef = doc(db, 'settings', 'approvedEmails');
    const deleteReqRef = doc(db, 'publishRequests', requestId);
    const payload = { emails: arrayUnion(email) };
    setDoc(approvedRef, payload, { merge: true })
      .then(() => deleteDoc(deleteReqRef))
      .then(() => toast({ title: "User Approved", description: `${email} is now a contributor.` }))
      .finally(() => setProcessingId(null));
  };

  const handleRemoveContributor = async (email: string) => {
    if (!db) return;
    const settingsRef = doc(db, 'settings', 'approvedEmails');
    const payload = { emails: arrayRemove(email) };
    setDoc(settingsRef, payload, { merge: true })
      .then(() => toast({ title: "Contributor Removed", description: `${email} access revoked.` }));
  };

  const handleDeleteBook = async (bookId: string) => {
    if (!db) return;
    setProcessingId(bookId);
    deleteCloudBook(db, bookId).then(() => {
      toast({ title: "Book Deleted", description: "Manuscript purged from the Lounge." });
    }).finally(() => setProcessingId(null));
  };

  const handleTriggerCoverEdit = (bookId: string) => {
    setUpdatingCoverId(bookId);
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !updatingCoverId || !db || !storage) return;

    setProcessingId(updatingCoverId);
    try {
      const optimizedBlob = await optimizeCoverImage(file);
      const optimizedFile = new File([optimizedBlob], `cover_${updatingCoverId}.jpg`, { type: 'image/jpeg' });
      const url = await uploadCoverImage(storage, optimizedFile, updatingCoverId);
      
      if (!url) throw new Error("Cloud upload rejected.");
      
      await updateCloudBookCover(db, updatingCoverId, url, optimizedFile.size);
      
      toast({ title: "Cover Updated", description: "The volume's visual identity has been synchronized." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update Failed", description: err.message });
    } finally {
      setProcessingId(null);
      setUpdatingCoverId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isUserLoading || (isAdmin === null && !isOfflineMode)) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  if (isAdmin === false) return null;

  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*"
        onChange={onFileChange} 
      />
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-5xl mx-auto">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Authority Dashboard</span>
              </div>
              <h1 className="text-5xl font-headline font-black leading-none">Lounge Control</h1>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/admin/requests">
                <Button variant="outline" className="rounded-2xl relative">
                  Submissions
                  {hasCloudRequests && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                  )}
                </Button>
              </Link>
              <Link href="/admin/dashboard"><Button className="rounded-2xl">Live Analytics</Button></Link>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <Card className="bg-card/40 p-8 rounded-[2rem] border-none shadow-xl">
              <Users className="h-6 w-6 text-primary mb-4" />
              <h3 className="text-4xl font-headline font-black">{totalUsers}</h3>
              <p className="text-[10px] font-black uppercase text-muted-foreground mt-2">Active Readers</p>
            </Card>
            <Card className="bg-card/40 p-8 rounded-[2rem] border-none shadow-xl">
              <BookOpen className="h-6 w-6 text-primary mb-4" />
              <h3 className="text-4xl font-headline font-black">{bookCount}</h3>
              <p className="text-[10px] font-black uppercase text-muted-foreground mt-2">Cloud Volumes</p>
            </Card>
            <Card className="bg-card/40 p-8 rounded-[2rem] border-none shadow-xl">
              <Layers className="h-6 w-6 text-accent mb-4" />
              <h3 className="text-4xl font-headline font-black">{chapterCount}</h3>
              <p className="text-[10px] font-black uppercase text-muted-foreground mt-2">Total Chapters</p>
            </Card>
            <Card className="bg-card/40 p-8 rounded-[2rem] border-none shadow-xl">
              <Activity className="h-6 w-6 text-green-600 mb-4" />
              <h3 className="text-4xl font-headline font-black text-green-600">Stable</h3>
              <p className="text-[10px] font-black uppercase text-muted-foreground mt-2">System Status</p>
            </Card>
          </div>

          <AdminStorageBar />

          <Accordion type="single" collapsible className="mb-6">
            <AccordionItem value="manuscripts" className="border-none">
              <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden bg-card/80">
                <AccordionTrigger className="p-6 hover:no-underline">
                  <div className="text-left">
                    <CardTitle className="text-xl font-headline font-black">Global Manuscript Management</CardTitle>
                    <CardDescription>Review, remove, or update cloud volumes.</CardDescription>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-0 border-t">
                  {isBooksLoading ? <div className="p-12 flex justify-center"><Loader2 className="animate-spin" /></div> : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Title & Author</TableHead><TableHead>Genre</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {allBooks?.map(book => (
                          <TableRow key={book.id}>
                            <TableCell className="font-bold">
                              {book.title}
                              <br/>
                              <span className="text-[10px] text-muted-foreground">By {book.author}</span>
                            </TableCell>
                            <TableCell><Badge variant="outline">{Array.isArray(book.genre) ? book.genre[0] : book.genre}</Badge></TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleTriggerCoverEdit(book.id)} 
                                  disabled={processingId === book.id} 
                                  className="text-primary"
                                  title="Change Cover"
                                >
                                  {processingId === book.id && updatingCoverId === book.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleDeleteBook(book.id)} 
                                  disabled={processingId === book.id} 
                                  className="text-destructive"
                                  title="Delete Book"
                                >
                                  {processingId === book.id && updatingCoverId !== book.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </AccordionContent>
              </Card>
            </AccordionItem>
          </Accordion>

          <Accordion type="single" collapsible className="mb-6">
            <AccordionItem value="contributors" className="border-none">
              <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden bg-card/80">
                <AccordionTrigger className="p-6 hover:no-underline">
                  <div className="text-left">
                    <CardTitle className="text-xl font-headline font-black">Approved Contributors</CardTitle>
                    <CardDescription>Users permitted to publish directly to the global shelf.</CardDescription>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-0 border-t">
                  <Table>
                    <TableHeader><TableRow><TableHead>Email Address</TableHead><TableHead className="text-right">Manage</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {approvedEmails.map(email => (
                        <TableRow key={email}>
                          <TableCell className="font-bold">{email}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveContributor(email)} className="text-destructive font-bold text-[10px]">
                              <UserMinus className="h-3 w-3 mr-1" /> Revoke Access
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </Card>
            </AccordionItem>
          </Accordion>

          <Accordion type="single" collapsible className="mb-12">
            <AccordionItem value="applications" className="border-none">
              <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden bg-card/80">
                <AccordionTrigger className="p-6 hover:no-underline">
                  <div className="text-left">
                    <CardTitle className="text-xl font-headline font-black">Contributor Applications</CardTitle>
                    <CardDescription>Vet users requesting global publishing privileges.</CardDescription>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-0 border-t">
                  {isRequestsLoading ? <div className="p-12 flex justify-center"><Loader2 className="animate-spin" /></div> : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Candidate Email</TableHead><TableHead className="text-right">Decision</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {requests?.map(req => (
                          <TableRow key={req.id}>
                            <TableCell className="font-bold">{req.email}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" onClick={() => handleApprove(req.id, req.email)} disabled={!!processingId} className="rounded-xl h-8 text-[10px] font-black">Approve</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </AccordionContent>
              </Card>
            </AccordionItem>
          </Accordion>
        </div>
      </main>
    </div>
  );
}
