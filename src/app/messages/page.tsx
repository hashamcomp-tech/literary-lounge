
'use client';

import Navbar from '@/components/navbar';
import ChatInterface from '@/components/chat-interface';
import { Mail, ShieldCheck, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useUser, useFirebase } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

/**
 * @fileOverview Messages Page (Global Lounge).
 * Provides a central hub for users to connect and message each other.
 */
export default function MessagesPage() {
  const { user, isUserLoading } = useUser();
  const { isOfflineMode } = useFirebase();
  const router = useRouter();

  if (isOfflineMode) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 text-center">
          <div className="max-w-md mx-auto space-y-8">
            <div className="bg-amber-500/10 p-10 rounded-[2.5rem] border border-amber-500/20 shadow-xl">
              <Mail className="h-16 w-16 text-amber-600 mx-auto mb-6 opacity-30" />
              <h1 className="text-3xl font-headline font-black mb-4">Lounge Offline</h1>
              <p className="text-muted-foreground leading-relaxed">
                Communal messaging requires a live connection to the Lounge cloud services. 
                Reconnect to join the conversation.
              </p>
              <Button 
                className="mt-8 rounded-2xl h-12 px-8 font-bold" 
                variant="outline"
                onClick={() => router.push('/')}
              >
                Back to Library
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!isUserLoading && (!user || user.isAnonymous)) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 text-center">
          <div className="max-w-md mx-auto space-y-8">
            <div className="bg-primary/5 p-10 rounded-[2.5rem] border border-primary/10 shadow-xl">
              <ShieldCheck className="h-16 w-16 text-primary mx-auto mb-6 opacity-30" />
              <h1 className="text-3xl font-headline font-black mb-4">Identify Yourself</h1>
              <p className="text-muted-foreground leading-relaxed">
                To message other readers and join the global lounge, please sign in to your account.
              </p>
              <Button 
                className="mt-8 rounded-2xl h-12 px-10 font-black uppercase text-xs tracking-widest bg-primary shadow-lg shadow-primary/20"
                onClick={() => router.push('/login')}
              >
                Sign In
              </Button>
            </div>
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
          <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-4 w-4 text-primary" />
                <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 uppercase tracking-[0.2em] text-[10px] px-3 font-black">
                  Global Reader Network
                </Badge>
              </div>
              <h1 className="text-5xl font-headline font-black leading-none">The Global Lounge</h1>
              <p className="text-lg text-muted-foreground mt-3 max-w-xl">
                Connect with readers from around the world to discuss manuscripts, 
                share recommendations, and build our literary community.
              </p>
            </div>
          </header>

          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <ChatInterface 
              chatId="global_lounge" 
              title="Global" 
            />
          </div>
        </div>
      </main>
    </div>
  );
}
