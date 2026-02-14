"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Upload, BookPlus, Loader2, FileText, CheckCircle2, Cloud, HardDrive } from 'lucide-react';
import ePub from 'epubjs';
import { doc, setDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export default function UploadPage() {
  const router = useRouter();
  const db = useFirestore();
  const { user } = useUser();
  
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [chapterNumber, setChapterNumber] = useState('1');
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [storageType, setStorageType] = useState<'local' | 'cloud'>('local');

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
    // @ts-ignore
    for (const item of spine.items) {
      try {
        const doc = await book.load(item.href);
        const body = (doc as Document).querySelector('body');
        const htmlContent = body ? body.innerHTML || "" : "";
        
        if (htmlContent.trim().length > 50) {
          pagesData.push({
            chapterNumber: index++,
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
    if (storageType === 'cloud' && !user) {
      alert("Please sign in to upload to the cloud.");
      return;
    }

    setLoading(true);

    try {
      const docId = crypto.randomUUID();
      let finalTitle = title;
      let finalAuthor = author;
      let chapters: any[] = [];

      if (selectedFile && selectedFile.name.endsWith('.epub')) {
        const result = await processEpub(selectedFile);
        finalTitle = result.title;
        finalAuthor = result.author;
        chapters = result.pages;
      } else {
        setLoadingStatus('Processing text...');
        const textToUse = content || "No content provided.";
        const htmlContent = textToUse.split('\n\n').map(p => `<p>${p}</p>`).join('');
        
        chapters = [{
          chapterNumber: parseInt(chapterNumber) || 1,
          content: htmlContent,
          title: "Full Text",
        }];
      }

      if (storageType === 'local') {
        setLoadingStatus('Saving to browser library...');
        const timestamp = new Date().toISOString();
        const pagesData = chapters.map(p => ({
          ...p,
          id: crypto.randomUUID(),
          novelId: docId,
          createdAt: timestamp,
          updatedAt: timestamp
        }));

        const existingData = JSON.parse(localStorage.getItem('novel-reader-data') || '{}');
        localStorage.setItem('novel-reader-data', JSON.stringify({
          ...existingData,
          [docId]: {
            splitText: { 
              id: docId, 
              title: finalTitle, 
              authorName: finalAuthor || 'Unknown Author',
              description: content.substring(0, 100) + '...',
              coverImageUrl: 'https://picsum.photos/seed/' + docId + '/400/600',
              publicationDate: timestamp,
              genres: ['Uncategorized'],
              language: 'en',
              createdAt: timestamp, 
              updatedAt: timestamp 
            },
            pages: pagesData
          }
        }));
        router.push(`/local-pages/${docId}/${chapters[0]?.chapterNumber || 1}`);
      } else if (db) {
        setLoadingStatus('Uploading to Cloud...');
        
        const bookRef = doc(db, 'novels', docId);
        const bookData = {
          id: docId,
          title: finalTitle,
          authorName: finalAuthor || 'Unknown Author',
          description: content.substring(0, 200) || 'An uploaded novel.',
          coverImageUrl: 'https://picsum.photos/seed/' + docId + '/400/600',
          publicationDate: new Date().toISOString(),
          genres: ['Uploaded'],
          language: 'en',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setDoc(bookRef, bookData)
          .catch(async () => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
              path: bookRef.path,
              operation: 'create',
              requestResourceData: bookData,
            }));
          });

        for (const ch of chapters) {
          const chapterId = crypto.randomUUID();
          const chapterRef = doc(db, 'novels', docId, 'chapters', chapterId);
          const chapterData = {
            id: chapterId,
            novelId: docId,
            chapterNumber: ch.chapterNumber,
            title: ch.title,
            content: ch.content,
            wordCount: ch.content.split(/\s+/).length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          setDoc(chapterRef, chapterData)
            .catch(async () => {
              errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: chapterRef.path,
                operation: 'create',
                requestResourceData: chapterData,
              }));
            });
        }

        router.push(`/pages/${docId}/${chapters[0]?.chapterNumber || 1}`);
      }
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
                Choose where you want to store your reading material.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpload} className="space-y-6">
                
                <div className="space-y-4 p-4 bg-muted/30 rounded-xl border">
                  <Label>Storage Location</Label>
                  <RadioGroup 
                    value={storageType} 
                    onValueChange={(val) => setStorageType(val as 'local' | 'cloud')}
                    className="grid grid-cols-2 gap-4"
                  >
                    <div>
                      <RadioGroupItem value="local" id="local" className="peer sr-only" />
                      <Label
                        htmlFor="local"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                      >
                        <HardDrive className="mb-2 h-6 w-6" />
                        <span className="font-bold">Local</span>
                        <span className="text-[10px] text-muted-foreground">Browser Only</span>
                      </Label>
                    </div>
                    <div>
                      <RadioGroupItem value="cloud" id="cloud" className="peer sr-only" />
                      <Label
                        htmlFor="cloud"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                      >
                        <Cloud className="mb-2 h-6 w-6" />
                        <span className="font-bold">Cloud</span>
                        <span className="text-[10px] text-muted-foreground">Sync Everywhere</span>
                      </Label>
                    </div>
                  </RadioGroup>
                  {storageType === 'cloud' && !user && (
                    <p className="text-xs text-destructive font-medium">Please sign in to enable Cloud storage.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="author" className="text-base">Author</Label>
                  <Input 
                    id="author" 
                    name="author" 
                    type="text" 
                    placeholder="Author Name" 
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    required 
                  />

                  <Label htmlFor="bookTitle" className="text-base">Book Title</Label>
                  <Input 
                    id="bookTitle" 
                    name="bookTitle" 
                    type="text" 
                    placeholder="Book Title" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required 
                  />

                  <Label htmlFor="chapterNumber" className="text-base">Chapter Number</Label>
                  <Input 
                    id="chapterNumber" 
                    name="chapterNumber" 
                    type="number" 
                    min={1} 
                    value={chapterNumber}
                    onChange={(e) => setChapterNumber(e.target.value)}
                    required 
                  />
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
                            <span className="text-xs text-muted-foreground/60 mt-1">EPUB formatting will be preserved</span>
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
                      {storageType === 'cloud' ? 'Upload to Cloud' : 'Save to Browser'}
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
