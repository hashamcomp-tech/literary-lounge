
'use client';

import Navbar from '@/components/navbar';
import { MessageSquare, Hourglass, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

/**
 * @fileOverview Messaging Hub (Disabled State).
 */
export default function MessagesPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 text-center">
        <div className="max-w-md mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <div className="bg-primary/5 p-12 rounded-[3rem] border border-primary/10 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
               <MessageSquare className="h-32 w-32" />
            </div>
            
            <div className="bg-primary/10 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-inner">
              <Hourglass className="h-10 w-10 text-primary animate-pulse" />
            </div>
            
            <h1 className="text-4xl font-headline font-black mb-4">Under Construction</h1>
            <p className="text-muted-foreground leading-relaxed text-lg font-medium opacity-80">
              Direct messaging between readers is currently undergoing maintenance and improvements. 
              We'll be reopening the private corridors of the Lounge soon.
            </p>
            
            <div className="pt-10">
              <Button 
                className="rounded-2xl h-14 px-10 font-black uppercase text-xs tracking-[0.2em] bg-primary shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                onClick={() => router.push('/')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Library
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
