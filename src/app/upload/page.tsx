"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Upload, BookPlus, Loader2 } from 'lucide-react';

export default function UploadPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setLoading(true);

    try {
      // Logic for browser-based storage for short texts
      const docId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      
      const pagesData = [{
        id: crypto.randomUUID(),
        splitTextId: docId,
        pageNumber: 1,
        content: content,
        title: "Full Text",
        createdAt: timestamp,
        updatedAt: timestamp
      }];

      const existingData = JSON.parse(localStorage.getItem('novel-reader-data') || '{}');
      
      localStorage.setItem('novel-reader-data', JSON.stringify({
        ...existingData,
        [docId]: {
          splitText: { 
            id: docId, 
            title, 
            author: author || 'Unknown Author',
            originalText: content, 
            delimiterType: 'singlePage', 
            delimiterValue: '1', 
            createdAt: timestamp, 
            updatedAt: timestamp 
          },
          pages: pagesData
        }
      }));

      router.push(`/local-pages/${docId}/1`);
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-headline font-black mb-4">Upload a Novel</h1>
            <p className="text-lg text-muted-foreground">
              Add your own texts to your personal library.
            </p>
          </div>

          <Card className="border-none shadow-xl bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookPlus className="h-5 w-5 text-primary" />
                New Document
              </CardTitle>
              <CardDescription>
                Files uploaded here are stored locally in your browser.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpload} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input 
                    id="title"
                    placeholder="The Great Adventure"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="author">Author (Optional)</Label>
                  <Input 
                    id="author"
                    placeholder="Jane Doe"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Content</Label>
                  <Textarea
                    id="content"
                    placeholder="Paste your novel content here..."
                    className="min-h-[300px] text-lg leading-relaxed p-4"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    required
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full py-6 text-lg bg-primary hover:bg-primary/90 rounded-xl"
                  disabled={loading || !title.trim() || !content.trim()}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-5 w-5" />
                      Add to Library
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
