'use client';

import { useState } from 'react';
import Navbar from '@/components/navbar';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  BookOpen, 
  Clock, 
  Trash2, 
  CheckCircle2, 
  User, 
  FileText, 
  MessageSquareQuote
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function AdminRequestsDashboard() {
  const db = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  
  const [processingId, setProcessingId] = useState<string | null>(null);

  const requestsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'cloudUploadRequests'), orderBy('requestedAt', 'desc'));
  }, [db]);

  const { data: requests, isLoading } = useCollection(requestsQuery);

  const handleDelete = (id: string) => {
    if (!db) return;
    setProcessingId(id);
    deleteDoc(doc(db, 'cloudUploadRequests', id))
      .then(() => toast({ title: "Request Removed" }))
      .finally(() => setProcessingId(null));
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <Breadcrumbs 
            items={[
              { label: 'Control Panel', href: '/admin' },
              { label: 'Submissions' }
            ]} 
          />

          <header className="mb-10">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-headline font-black">Cloud Submissions</h1>
                <p className="text-muted-foreground mt-2">Review novels submitted by readers.</p>
              </div>
              <Badge variant="outline" className="h-9 px-4 rounded-xl border-primary/20 text-primary bg-primary/5">
                {requests?.length || 0} Pending
              </Badge>
            </div>
          </header>

          {isLoading ? (
            <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-primary opacity-20" /></div>
          ) : requests && requests.length > 0 ? (
            <div className="grid gap-8">
              {requests.map((req) => (
                <Card key={req.id} className="border-none shadow-lg bg-card/50 backdrop-blur overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-2xl font-headline font-bold flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" /> {req.title}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="font-bold text-foreground flex items-center gap-1"><User className="h-3 w-3" /> {req.author}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {req.requestedAt?.toDate ? req.requestedAt.toDate().toLocaleDateString() : ''}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="bg-muted/30 p-6 rounded-2xl border max-h-60 overflow-y-auto">
                      <p className="text-sm text-muted-foreground italic leading-relaxed">{req.content?.substring(0, 1000)}...</p>
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button variant="ghost" className="text-destructive rounded-xl" onClick={() => handleDelete(req.id)} disabled={!!processingId}>Discard</Button>
                      <Button className="bg-primary rounded-xl" onClick={() => toast({ title: "Feature Pending" })}>Promote</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-24 text-center border-2 border-dashed rounded-3xl bg-muted/20">
              <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
              <h2 className="text-2xl font-headline font-bold">No active submissions</h2>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
