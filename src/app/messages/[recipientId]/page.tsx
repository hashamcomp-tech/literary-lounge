
'use client';

import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import ChatInterface from '@/components/chat-interface';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User, ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

/**
 * @fileOverview Private 1:1 Chat Page.
 * Routes to a unique chat room based on the participant UIDs.
 */
export default function DirectChatPage() {
  const { recipientId } = useParams() as { recipientId: string };
  const { user } = useUser();
  const db = useFirestore();
  const router = useRouter();

  // Fetch recipient profile for display
  const recipientRef = useMemoFirebase(() => {
    if (!db || !recipientId) return null;
    return doc(db, 'users', recipientId);
  }, [db, recipientId]);

  const { data: recipient, isLoading } = useDoc(recipientRef);

  // Generate a consistent chatId for two people: sort UIDs and prefix with p2p_
  const chatId = useMemoFirebase(() => {
    if (!user || !recipientId) return null;
    const sortedIds = [user.uid, recipientId].sort();
    return `p2p_${sortedIds[0]}_${sortedIds[1]}`;
  }, [user, recipientId]);

  if (!user || user.isAnonymous) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 text-center">
          <div className="bg-primary/5 p-10 rounded-[2.5rem] border border-primary/10 max-w-md mx-auto">
            <ShieldCheck className="h-16 w-16 text-primary mx-auto mb-6 opacity-30" />
            <h1 className="text-2xl font-headline font-black mb-4">Identification Required</h1>
            <Button onClick={() => router.push('/login')} className="rounded-xl px-10">Sign In</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-4xl mx-auto">
          <header className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div className="space-y-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push('/messages')}
                className="-ml-2 text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Directory
              </Button>
              
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-64" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <h1 className="text-4xl font-headline font-black leading-tight">
                      {recipient?.username || 'Private Chat'}
                    </h1>
                    <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 uppercase tracking-widest text-[10px] font-black h-6">
                      1:1 Private
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium">
                      <User className="h-3.5 w-3.5" /> Reader Access
                    </span>
                  </div>
                </>
              )}
            </div>
          </header>

          {chatId && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <ChatInterface 
                chatId={chatId} 
                title={recipient?.username || 'Reader'} 
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
