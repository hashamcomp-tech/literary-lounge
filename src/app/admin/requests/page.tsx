'use client';

import { useState } from 'react';
import Navbar from '@/components/navbar';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen, Clock, Trash2, CheckCircle2, ArrowLeft, MessageSquareQuote } from 'lucide-react';
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

  const handleDelete = async (id: string) => {
    if (!db) return;
    setProcessingId(id);
    try {
      await deleteDoc(doc(db, 'cloudUploadRequests', id));
      toast({ title: "Request Removed", description: "The request has been cleared from the dashboard." });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to remove request." });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <header className="mb-10">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => router.push('/admin')}
              className="mb-4 -ml-2 text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin Panel
            </Button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-headline font-black">Content Submissions</h1>
                <p className="text-muted-foreground mt-2">Review and manage book content requested for cloud publishing.</p>
              </div>
              <Badge variant="outline" className="h-9 px-4 rounded-xl border-primary/20 text-primary bg-primary/5">
                {requests?.length || 0} Submissions
              </Badge>
            </div>
          </header>

          {isLoading ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
            </div>
          ) : requests && requests.length > 0 ? (
            <div className="grid gap-6">
              {requests.map((req) => (
                <Card key={req.id} className="border-none shadow-lg bg-card/50 backdrop-blur overflow-hidden">
                  <div className="h-1 bg-primary/20 w-full" />
                  <CardHeader className="flex flex-row items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-2xl font-headline font-bold">{req.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <span className="font-bold text-foreground">By {req.author || 'Anonymous'}</span>
                        <span className="opacity-50">•</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {req.requestedAt?.toDate ? req.requestedAt.toDate().toLocaleDateString() : 'Recently'}</span>
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-none uppercase text-[10px] font-black">
                      {req.status || 'Pending'}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="bg-muted/30 p-4 rounded-xl border border-border/50 max-h-40 overflow-y-auto">
                      <div className="flex items-center gap-2 text-primary mb-2">
                        <MessageSquareQuote className="h-4 w-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">Content Excerpt</span>
                      </div>
                      <div className="text-sm text-muted-foreground leading-relaxed italic">
                        {req.content?.substring(0, 1000)}...
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="rounded-lg border-primary/20 text-primary uppercase text-[10px]">
                          {req.genre || 'Unspecified Genre'}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-destructive hover:bg-destructive/10 rounded-xl"
                          onClick={() => handleDelete(req.id)}
                          disabled={!!processingId}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Discard
                        </Button>
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="bg-primary hover:bg-primary/90 rounded-xl"
                          onClick={() => {
                            toast({ title: "Feature Pending", description: "Full content approval integration coming soon." });
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Promote to Cloud
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-24 text-center border-2 border-dashed rounded-3xl bg-muted/20">
              <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
              <h2 className="text-2xl font-headline font-bold mb-2">No active submissions</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Content requested for cloud review by users will appear here.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
