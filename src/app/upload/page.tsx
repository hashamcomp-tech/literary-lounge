"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Upload, BookPlus, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import ePub from 'epubjs';

export default function UploadPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const processEpub = async (file: File) => {
    setLoadingStatus('Initializing EPUB reader...');
    const arrayBuffer = await file.arrayBuffer();
    const book = ePub(arrayBuffer);
    await book.ready;

    const metadata = await book.loaded.metadata;
    const bookTitle = metadata.title || title;
    const bookAuthor = metadata.creator || author;

    setLoadingStatus('Extracting chapters...');
    const pagesData = [];
    const spine = book.spine;
    
    let index = 1;
    for (const item of (spine as any).items) {
      try {
        const doc = await book.load(item.href);
        const body = (doc as Document).querySelector('body');
        // Extract HTML to preserve formatting
        const htmlContent = body ? body.innerHTML || "" : "";
        
        if (htmlContent.trim().length > 50) {
          pagesData.push({
            id: crypto.randomUUID(),
            pageNumber: index++,
            content: htmlContent.trim(),
            title: item.idref || `Chapter ${index - 1}`,
          });
        }
      } catch (err) {
        console.warn(`Could not load chapter ${item.href}`, err);
      }
    }

    return { title: bookTitle, author: bookAuthor, pages: pagesData };
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !selectedFile) return;

    setLoading(true);

    try {
      const docId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      let finalTitle = title;
      let finalAuthor = author;
      let pagesData = [];

      if (selectedFile && selectedFile.name.endsWith('.epub')) {
        const result = await processEpub(selectedFile);
        finalTitle = result.title;
        finalAuthor = result.author;
        pagesData = result.pages.map(p => ({
          ...p,
          splitTextId: docId,
          createdAt: timestamp,
          updatedAt: timestamp
        }));
      } else {
        setLoadingStatus('Processing text...');
        // For plain text, we convert newlines to <p> tags for HTML rendering
        const textToUse = content || "No content provided.";
        const htmlContent = textToUse.split('\n\n').map(p => `<p>${p}</p>`).join('');
        
        pagesData = [{
          id: crypto.randomUUID(),
          splitTextId: docId,
          pageNumber: 1,
          content: htmlContent,
          title: "Full Text",
          createdAt: timestamp,
          updatedAt: timestamp
        }];
      }

      setLoadingStatus('Saving to library...');
      const existingData = JSON.parse(localStorage.getItem('novel-reader-data') || '{}');
      
      localStorage.setItem('novel-reader-data', JSON.stringify({
        ...existingData,
        [docId]: {
          splitText: { 
            id: docId, 
            title: finalTitle, 
            author: finalAuthor || 'Unknown Author',
            originalText: content || (selectedFile ? `EPUB: ${selectedFile.name}` : ''), 
            delimiterType: pagesData.length > 1 ? 'epub' : 'singlePage', 
            delimiterValue: pagesData.length.toString(), 
            createdAt: timestamp, 
            updatedAt: timestamp 
          },
          pages: pagesData
        }
      }));

      router.push(`/local-pages/${docId}/1`);
    } catch (error) {
      console.error("Upload failed", error);
      setLoadingStatus('Error processing file.');
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
              Add your own texts or EPUB files to your personal library.
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input 
                      id="title"
                      placeholder="The Great Adventure"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required={!selectedFile}
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
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <Label>Import Method</Label>
                  <div className="grid grid-cols-1 gap-4">
                    <div className={`relative border-2 border-dashed rounded-xl p-6 transition-colors ${selectedFile ? 'bg-primary/5 border-primary' : 'hover:border-primary/50'}`}>
                      <input
                        type="file"
                        id="epub-upload"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept=".epub"
                        onChange={handleFileChange}
                      />
                      <div className="flex flex-col items-center justify-center text-center">
                        {selectedFile ? (
                          <>
                            <CheckCircle2 className="h-10 w-10 text-primary mb-2" />
                            <span className="font-bold">{selectedFile.name}</span>
                            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSelectedFile(null)}>Remove</Button>
                          </>
                        ) : (
                          <>
                            <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                            <span className="font-medium text-muted-foreground">Click to upload EPUB file</span>
                            <span className="text-xs text-muted-foreground/60 mt-1">Files are processed locally</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="relative text-center">
                      <span className="bg-card px-2 text-xs font-bold text-muted-foreground uppercase relative z-10">OR</span>
                      <div className="absolute top-1/2 left-0 w-full h-px bg-border" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="content">Paste Content</Label>
                      <Textarea
                        id="content"
                        placeholder="Paste your novel content here if not using a file..."
                        className="min-h-[200px] text-lg leading-relaxed p-4"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        disabled={!!selectedFile}
                      />
                    </div>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full py-6 text-lg bg-primary hover:bg-primary/90 rounded-xl"
                  disabled={loading || (!title.trim() && !selectedFile) || (!content.trim() && !selectedFile)}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {loadingStatus || 'Processing...'}
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-5 w-5" />
                      {selectedFile ? 'Import EPUB' : 'Add to Library'}
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
