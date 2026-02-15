
'use client';

import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import ChatInterface from '@/components/chat-interface';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BookOpen, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function BookChatPage() {
  const { bookId } = useParams() as { bookId: string };
  const router = useRouter();
  const db = useFirestore();

  // Fetch book details to show context in chat
  const bookRef = useMemoFirebase(() => bookId ? doc(db, 'books', bookId) : null, [db, bookId]);
  const { data: book, isLoading } = useDoc(bookRef);

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
                onClick={() => router.back()}
                className="-ml-2 text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Novel
              </Button>
              
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-64" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ) : (
                <>
                  <h1 className="text-4xl font-headline font-black leading-tight">
                    {book?.title || 'Reader Lounge'}
                  </h1>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium">
                      <User className="h-3.5 w-3.5" /> By {book?.author || 'Unknown'}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                    <span className="flex items-center gap-1.5 font-medium">
                      <BookOpen className="h-3.5 w-3.5" /> {book?.genre || 'Discussion'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </header>

          <ChatInterface 
            chatId={bookId} 
            title={book?.title || 'Novel'} 
          />
        </div>
      </main>
    </div>
  );
}
