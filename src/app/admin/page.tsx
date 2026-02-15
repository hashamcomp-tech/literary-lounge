
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc, getDoc, updateDoc, deleteDoc, arrayUnion, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, UserCheck, UserX, Mail, Calendar, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AdminStorageBar from '@/components/admin-storage-bar';

export default function AdminPage() {
  const db = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const profileRef = useMemoFirebase(() => (user && !user.isAnonymous) ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile } = useDoc(profileRef);

  // Check if current user is approved/admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (isUserLoading) return;
      if (!user || user.isAnonymous) {
        setIsAdmin(false);
        return;
      }

      // Super-admin bypass or explicit admin role
      if (user.email === 'hashamcomp@gmail.com' || profile?.role === 'admin') {
        setIsAdmin(true);
        return;
      }

      try {
        const settingsRef = doc(db, 'settings', 'approvedEmails');
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
          const emails = snap.data().emails || [];
          setIsAdmin(emails.includes(user.email));
        } else {
          setIsAdmin(false);
        }
      } catch (e) {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, [user, isUserLoading, profile, db]);

  // Fetch pending requests
  const requestsQuery = useMemoFirebase(() => {
    if (!isAdmin) return null;
    return query(collection(db, 'publishRequests'), orderBy('requestedAt', 'desc'));
  }, [db, isAdmin]);

  const { data: requests, isLoading: isRequestsLoading } = useCollection(requestsQuery);

  const handleApprove = async (requestId: string, email: string) => {
    setProcessingId(requestId);
    try {
      const approvedRef = doc(db, 'settings', 'approvedEmails');
      
      // Add email to whitelist
      await updateDoc(approvedRef, {
        emails: arrayUnion(email)
      });

      // Remove the request
      await deleteDoc(doc(db, 'publishRequests', requestId));

      toast({
        title: "User Approved",
        description: `${email} has been added to the cloud contributors.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Approval Failed",
        description: "Could not update the whitelist.",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      await deleteDoc(doc(db, 'publishRequests', requestId));
      toast({
        title: "Request Rejected",
        description: "The request has been removed.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Rejection Failed",
        description: "Could not remove the request.",
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (isUserLoading || isAdmin === null) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <ShieldAlert className="h-16 w-16 text-destructive mb-4 opacity-20" />
          <h1 className="text-3xl font-headline font-black mb-2">Access Denied</h1>
          <p className="text-muted-foreground max-w-md">
            This area is reserved for administrators. If you believe this is an error, please contact support.
          </p>
          <Button variant="outline" className="mt-6 rounded-xl" onClick={() => router.push('/')}>
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-5xl mx-auto">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <span className="text-xs font-bold uppercase tracking-widest text-primary">Admin Control Panel</span>
              </div>
              <h1 className="text-4xl font-headline font-black">Lounge Overview</h1>
            </div>
            <Badge variant="outline" className="w-fit h-7 border-primary/20 text-primary bg-primary/5">
              {requests?.length || 0} Pending Requests
            </Badge>
          </header>

          <AdminStorageBar />

          <Card className="border-none shadow-xl bg-card/80 backdrop-blur overflow-hidden">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle>Contributor Requests</CardTitle>
              <CardDescription>Review users requesting access to publish novels to the cloud.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isRequestsLoading ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
                </div>
              ) : requests && requests.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-6">User Email</TableHead>
                      <TableHead>Requested On</TableHead>
                      <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((req) => (
                      <TableRow key={req.id} className="group transition-colors">
                        <TableCell className="pl-6 font-medium">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            {req.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Calendar className="h-3.5 w-3.5" />
                            {req.requestedAt?.toDate ? req.requestedAt.toDate().toLocaleDateString() : 'Just now'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex items-center justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                              onClick={() => handleReject(req.id)}
                              disabled={!!processingId}
                            >
                              <UserX className="h-4 w-4 mr-1.5" />
                              Reject
                            </Button>
                            <Button 
                              variant="default" 
                              size="sm" 
                              className="bg-primary hover:bg-primary/90 rounded-lg"
                              onClick={() => handleApprove(req.id, req.email)}
                              disabled={!!processingId}
                            >
                              {processingId === req.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <UserCheck className="h-4 w-4 mr-1.5" />
                              )}
                              Approve
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-12 text-center">
                  <UserCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                  <p className="text-muted-foreground">No pending requests at this time.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
