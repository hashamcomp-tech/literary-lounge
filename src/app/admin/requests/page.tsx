'use client';

import { useState } from 'react';
import Navbar from '@/components/navbar';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen, Clock, Trash2, CheckCircle2, ArrowLeft, MessageSquareQuote, User, FileText, Sparkles, BrainCircuit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { analyzeManuscript, type AnalyzeManuscriptOutput } from '@/ai/flows/analyze-manuscript';

/**
 * @fileOverview Admin dashboard for managing cloud upload requests.
 * Implements real-time monitoring and AI-powered vetting for the super admin.
 */
export default function AdminRequestsDashboard() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, AnalyzeManuscriptOutput>>({});

  const isSuperAdmin = user?.email === 'hashamcomp@gmail.com';

  // Real-time listener for cloud upload requests
  const requestsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'cloudUploadRequests'), orderBy('requestedAt', 'desc'));
  }, [db]);

  const { data: requests, isLoading } = useCollection(requestsQuery);

  const handleAIReview = async (req: any) => {
    if (!isSuperAdmin) return;
    
    setIsAnalyzing(req.id);
    try {
      const result = await analyzeManuscript({
        title: req.title,
        author: req.author || 'Anonymous',
        content: req.content?.substring(0, 15000) || '' // Safe slice for AI context
      });
      setAiResults(prev => ({ ...prev, [req.id]: result }));
      toast({ title: "Analysis Complete", description: `AI briefing generated for "${req.title}".` });
    } catch (err) {
      toast({ variant: 'destructive', title: "AI Error", description: "Failed to connect to AI assistant." });
    } finally {
      setIsAnalyzing(null);
    }
  };

  const handleDelete = (id: string) => {
    if (!db) return;
    setProcessingId(id);
    const docRef = doc(db, 'cloudUploadRequests', id);
    
    deleteDoc(docRef)
      .then(() => {
        toast({ title: "Request Removed", description: "The request has been cleared from the dashboard." });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
      })
      .finally(() => {
        setProcessingId(null);
      });
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
                <h1 className="text-4xl font-headline font-black">Cloud Submissions</h1>
                <p className="text-muted-foreground mt-2">Review novels submitted by readers for promotion to the cloud library.</p>
              </div>
              <Badge variant="outline" className="h-9 px-4 rounded-xl border-primary/20 text-primary bg-primary/5">
                {requests?.length || 0} Pending
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
                <Card key={req.id} className="border-none shadow-lg bg-card/50 backdrop-blur overflow-hidden transition-all hover:shadow-xl">
                  <div className="h-1 bg-primary/20 w-full" />
                  <CardHeader className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="text-2xl font-headline font-bold flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        {req.title}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-bold text-foreground">
                          <User className="h-3.5 w-3.5" /> {req.author || 'Anonymous'}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" /> {req.requestedAt?.toDate ? req.requestedAt.toDate().toLocaleDateString() : 'Just now'}
                        </span>
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] h-5 uppercase font-black">
                          Chapter {req.chapterNumber || 1}
                        </Badge>
                      </div>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none uppercase text-[10px] font-black h-6">
                      {req.status || 'Pending'}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="bg-muted/30 p-6 rounded-2xl border border-border/50 max-h-60 overflow-y-auto relative">
                      <div className="flex items-center gap-2 text-primary mb-3">
                        <MessageSquareQuote className="h-4 w-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">Content Excerpt</span>
                      </div>
                      <div className="text-sm text-muted-foreground leading-relaxed italic prose prose-slate dark:prose-invert max-w-none">
                        {req.content?.substring(0, 1500)}...
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-muted/50 to-transparent pointer-events-none" />
                    </div>

                    {/* AI ANALYSIS DISPLAY SECTION */}
                    {aiResults[req.id] && (
                      <div className="p-6 rounded-2xl bg-primary/5 border border-primary/10 animate-in fade-in zoom-in duration-500">
                        <div className="flex items-center gap-2 text-primary mb-4">
                          <BrainCircuit className="h-5 w-5" />
                          <span className="text-sm font-black uppercase tracking-widest">AI Editorial Brief</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div>
                              <h5 className="text-[10px] font-black uppercase text-muted-foreground mb-1">Executive Summary</h5>
                              <p className="text-sm leading-relaxed">{aiResults[req.id].summary}</p>
                            </div>
                            <div>
                              <h5 className="text-[10px] font-black uppercase text-muted-foreground mb-1">Identified Themes</h5>
                              <div className="flex flex-wrap gap-2">
                                {aiResults[req.id].themes.map((t, i) => (
                                  <Badge key={i} variant="secondary" className="bg-primary/10 text-primary border-none text-[9px] font-bold">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div className="flex justify-between">
                              <div>
                                <h5 className="text-[10px] font-black uppercase text-muted-foreground mb-1">Tone & Atmosphere</h5>
                                <span className="text-sm font-bold">{aiResults[req.id].sentiment}</span>
                              </div>
                              <div className="text-right">
                                <h5 className="text-[10px] font-black uppercase text-muted-foreground mb-1">Safety Rating</h5>
                                <Badge className={`${aiResults[req.id].safetyRating === 'Safe' ? 'bg-green-500' : 'bg-amber-500'} text-white border-none h-5 text-[9px] font-black`}>
                                  {aiResults[req.id].safetyRating}
                                </Badge>
                              </div>
                            </div>
                            <div className="pt-3 border-t border-primary/10">
                              <h5 className="text-[10px] font-black uppercase text-muted-foreground mb-1">Editorial Verdict</h5>
                              <p className="text-sm italic font-medium text-primary leading-tight">"{aiResults[req.id].verdict}"</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t gap-4">
                      <div className="flex items-center gap-2">
                        {isSuperAdmin && !aiResults[req.id] && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-xl border-primary/20 text-primary bg-primary/5 hover:bg-primary/10 font-bold gap-2"
                            onClick={() => handleAIReview(req)}
                            disabled={isAnalyzing === req.id}
                          >
                            {isAnalyzing === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            Run AI Review
                          </Button>
                        )}
                        <Badge variant="outline" className="rounded-lg border-primary/20 text-primary uppercase text-[10px] px-3">
                          {req.genre || 'Unspecified Genre'}
                        </Badge>
                      </div>
                      <div className="flex gap-3 w-full sm:w-auto">
                        <Button 
                          variant="ghost" 
                          className="flex-1 sm:flex-none text-destructive hover:bg-destructive/10 rounded-xl px-6"
                          onClick={() => handleDelete(req.id)}
                          disabled={!!processingId}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Discard
                        </Button>
                        <Button 
                          variant="default" 
                          className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 rounded-xl px-8 shadow-md"
                          onClick={() => {
                            toast({ title: "Feature Pending", description: "Manual cloud library integration coming soon." });
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Promote
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
                Novels requested for cloud publishing will appear here in real-time.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
