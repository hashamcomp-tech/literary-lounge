"use client";

import { useEffect, useState } from 'react';
import { getAllLocalBooks, deleteLocalBook } from '@/lib/local-library';
import NovelCard from '@/components/novel-card';
import { HardDrive, Trash2, Library, BookX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
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

export default function LocalLibrarySection() {
  const [localBooks, setLocalBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadLocalBooks = async () => {
    try {
      const books = await getAllLocalBooks();
      setLocalBooks(books || []);
    } catch (err) {
      console.error("Failed to load local books", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocalBooks();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteLocalBook(id);
      setLocalBooks(prev => prev.filter(b => b.id !== id));
      toast({ title: "Deleted", description: "Novel removed from your local storage." });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Could not delete local novel." });
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  if (localBooks.length === 0) return null;

  return (
    <section className="space-y-8 mt-12 pt-12 border-t">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/10 p-2 rounded-xl">
            <HardDrive className="h-5 w-5 text-blue-600" />
          </div>
          <h2 className="text-2xl font-headline font-bold">Your Local Library</h2>
        </div>
        <p className="text-xs text-muted-foreground hidden sm:block">Stored securely in your browser</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-8">
        {localBooks.map((book) => (
          <div key={book.id} className="relative group">
            <NovelCard 
              novel={{
                ...book,
                // Ensure NovelCard knows this is a local route
                isLocalOnly: book.isLocalOnly ?? true 
              }} 
            />
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full shadow-lg">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{book.title}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove this book and all its chapters from your browser's local storage. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => handleDelete(book.id)}
                      className="bg-destructive hover:bg-destructive/90 rounded-xl"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
