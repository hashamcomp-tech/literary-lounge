
'use client';

import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageSquareOff } from 'lucide-react';

export default function DirectChatPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 text-center">
        <div className="max-w-md mx-auto bg-card/50 backdrop-blur p-12 rounded-[2.5rem] border shadow-2xl animate-in zoom-in duration-500">
          <div className="bg-destructive/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <MessageSquareOff className="h-10 w-10 text-destructive opacity-50" />
          </div>
          <h1 className="text-3xl font-headline font-black mb-4">Messaging Disabled</h1>
          <p className="text-muted-foreground mb-10 leading-relaxed font-medium">
            Private 1:1 chat is currently disabled for all users in the Lounge.
          </p>
          <Button 
            variant="ghost" 
            onClick={() => router.push('/')}
            className="rounded-xl font-bold text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Return to Library
          </Button>
        </div>
      </main>
    </div>
  );
}
