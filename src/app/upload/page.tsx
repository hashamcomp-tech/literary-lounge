
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, BookPlus, Loader2, FileText, CheckCircle2, User, Book, AlertCircle, ShieldCheck } from 'lucide-react';
import ePub from 'epubjs';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

interface AutocompleteInputProps {
  type: 'author' | 'book';
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}

function AutocompleteInput({ type, value, onChange, placeholder }: AutocompleteInputProps) {
  const db = useFirestore();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!db || value.length < 2) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      const fieldPath = type === 'author' ? 'metadata.info.author' : 'metadata.info.bookTitle';
      const q = query(
        collection(db, 'books'),
        where(fieldPath, '>=', value),
        where(fieldPath, '<=', value + '\uf8ff'),
        limit(5)
      );
      try {
        const snap = await getDocs(q);
        const items: string[] = [];
        snap.forEach(doc => {
          const data = doc.data();
          const val = type === 'author' ? data.metadata?.info?.author : data.metadata?.info?.bookTitle;
          if (val) items.push(val);
        });
        setSuggestions([...new Set(items)]);
      } catch (e) {
        console.error("Suggestions error", e);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [value, db, type]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShow(true);
        }}
        onFocus={() => setShow(true)}
        placeholder={placeholder}
        className="bg-background/50"
      />
      {show && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-card border rounded-xl shadow-xl max-h-48 overflow-auto animate-in fade-in slide-in-from-top-2 duration-200">
          {suggestions.map((s, i) => (
            <li
              key={i}
              className="px-4 py-3 hover:bg-muted cursor-pointer text-sm flex items-center gap-2 group transition-colors"
              onClick={() => {
                onChange(s);
                setShow(false);
              }}
            >
              <div className="p-1 bg-muted group-hover:bg-background rounded">
                {type === 'author' ? <User className="h-3 w-3 text-primary" /> : <Book className="h-3 w-3 text-primary" />}
              </div>
              <span className="font-medium">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const db = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [chapterNumber, setChapterNumber] = useState('1');
  const [content, setContent] = useState('');
  const [genre, setGenre] = useState('Novel');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  
  const [isApprovedUser, setIsApprovedUser] = useState<boolean | null>(null);
  const [checkingApproval, setCheckingApproval] = useState(true);

  useEffect(() => {
    if (isUserLoading) return;
    
    if (!user || user.isAnonymous) {
      setIsApprovedUser(false);
      setCheckingApproval(false);
      return;
    }

    const checkApproval = async () => {
      try {
        const settingsRef = doc(db, 'settings', 'approvedEmails');
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
          const emails = snap.data().emails || [];
          setIsApprovedUser(emails.includes(user.email));
        } else {
          setIsApprovedUser(false);
        }
      } catch (e) {
        console.error("Approval check failed", e);
        setIsApprovedUser(false);
      } finally {
        setCheckingApproval(false);
      }
    };

    checkApproval();
  }, [user, isUserLoading, db]);

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '_')
      .replace(/^-+|-+$/g, '');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
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
    
    if (!isApprovedUser && user && !user.isAnonymous) {
      toast({
        variant: 'destructive',
        title: 'Unauthorized',
        description: 'Only approved users can upload to the cloud library.'
      });
      return;
    }

    setLoading(true);

    try {
      let finalTitle = title.trim();
      let finalAuthor = author.trim();
      let chapters: any[] = [];

      if (selectedFile && selectedFile.name.endsWith('.epub')) {
        const result = await processEpub(selectedFile);
        finalTitle = result.title;
        finalAuthor = result.author;
        chapters = result.pages;
      } else {
        const textToUse = content || "";
        if (!textToUse.trim()) {
          toast({ variant: 'destructive', title: 'Error', description: 'Please paste text or upload a file.' });
          setLoading(false);
          return;
        }
        const htmlContent = textToUse.split('\n\n').map(p => `<p>${p}</p>`).join('');
        chapters = [{
          chapterNumber: parseInt(chapterNumber) || 1,
          content: htmlContent,
          title: "Full Text",
        }];
      }

      if (finalAuthor && finalTitle && isApprovedUser) {
        if (!user) {
          toast({ variant: 'destructive', title: 'Error', description: 'Please log in for cloud storage.' });
          setLoading(false);
          return;
        }

        setLoadingStatus('Uploading to cloud...');
        const docId = `${slugify(finalAuthor)}_${slugify(finalTitle)}`;
        const bookRef = doc(db, 'books', docId);
        
        const metadataMap = {
          info: {
            author: finalAuthor,
            bookTitle: finalTitle,
            lastUpdated: serverTimestamp(),
            ownerId: user.uid,
            totalChapters: chapters.length,
            genre: genre,
            views: 0
          }
        };

        await setDoc(bookRef, { metadata: metadataMap }, { merge: true }).catch(err => {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: bookRef.path,
            operation: 'write',
            requestResourceData: { metadata: metadataMap }
          }));
        });

        const infoRef = doc(db, 'books', docId, 'metadata', 'info');
        await setDoc(infoRef, metadataMap.info, { merge: true }).catch(err => {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: infoRef.path,
            operation: 'write',
            requestResourceData: metadataMap.info
          }));
        });

        for (const ch of chapters) {
          const chRef = doc(db, 'books', docId, 'chapters', ch.chapterNumber.toString());
          const chData = {
            content: ch.content,
            chapterNumber: ch.chapterNumber,
            title: ch.title || `Chapter ${ch.chapterNumber}`,
            ownerId: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          
          await setDoc(chRef, chData, { merge: true }).catch(err => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
              path: chRef.path,
              operation: 'write',
              requestResourceData: chData
            }));
          });
        }

        router.push(`/pages/${docId}/${chapters[0]?.chapterNumber || 1}`);
      } else {
        setLoadingStatus('Saving locally...');
        const docId = crypto.randomUUID();
        const textToUse = content || "";
        const pagesData = [{ 
          id: crypto.randomUUID(), 
          novelId: docId, 
          pageNumber: 1, 
          content: textToUse.split('\n\n').map(p => `<p>${p}</p>`).join(''),
          createdAt: new Date().toISOString(), 
          updatedAt: new Date().toISOString() 
        }];

        const allLocalData = JSON.parse(localStorage.getItem('novel-reader-data') || '{}');
        allLocalData[docId] = {
          splitText: { 
            id: docId, 
            title: textToUse.substring(0, 30) + '...', 
            author: 'Local User',
            createdAt: new Date().toISOString(), 
            updatedAt: new Date().toISOString() 
          },
          pages: pagesData
        };
        localStorage.setItem('novel-reader-data', JSON.stringify(allLocalData));

        router.push(`/local-pages/${docId}/1`);
      }
    } catch (error) {
      console.error("Upload failed", error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "An unexpected error occurred."
      });
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
            <h1 className="text-4xl font-headline font-black mb-4">Add to Library</h1>
            <p className="text-lg text-muted-foreground">
              Add your own texts or EPUB files. Cloud storage is reserved for approved members.
            </p>
          </div>

          {!checkingApproval && isApprovedUser === false && user && !user.isAnonymous && (
             <Alert variant="destructive" className="mb-8 border-destructive/20 bg-destructive/5">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Cloud Upload Disabled</AlertTitle>
                <AlertDescription>
                  Your account ({user.email}) is not on the approved whitelist. Any uploads will be stored locally on this device only.
                </AlertDescription>
             </Alert>
          )}

          {!checkingApproval && isApprovedUser === true && (
             <div className="flex items-center gap-2 mb-8 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-600">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-sm font-bold">Cloud Privileges Active</span>
             </div>
          )}

          <Card className="border-none shadow-xl bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookPlus className="h-5 w-5 text-primary" />
                New Novel
              </CardTitle>
              <CardDescription>
                {isApprovedUser ? "Metadata provided here will link this novel to your cloud account." : "Guest uploads are stored locally in your browser cache."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpload} className="space-y-6">
                
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="author" className="text-base font-bold">Author</Label>
                    <AutocompleteInput 
                      type="author" 
                      value={author} 
                      onChange={setAuthor} 
                      placeholder="e.g. Jane Austen"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="bookTitle" className="text-base font-bold">Book Title</Label>
                    <AutocompleteInput 
                      type="book" 
                      value={title} 
                      onChange={setTitle} 
                      placeholder="e.g. Pride and Prejudice"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="genre" className="text-base font-bold">Genre</Label>
                    <Input 
                      id="genre" 
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      className="bg-background/50"
                      placeholder="e.g. Fantasy, Romance, Sci-Fi"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="chapterNumber" className="text-base font-bold">Chapter Number</Label>
                    <Input 
                      id="chapterNumber" 
                      type="number" 
                      min={1} 
                      value={chapterNumber}
                      onChange={(e) => setChapterNumber(e.target.value)}
                      className="bg-background/50"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-base font-bold">Content</Label>
                  <div className="grid grid-cols-1 gap-4">
                    <div className={`relative border-2 border-dashed rounded-xl p-6 transition-colors ${selectedFile ? 'bg-primary/5 border-primary' : 'hover:border-primary/50'}`}>
                      <input
                        type="file"
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
                            <span className="font-medium text-muted-foreground">Click to upload EPUB</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="relative text-center">
                      <span className="bg-card px-2 text-xs font-bold text-muted-foreground uppercase relative z-10">OR PASTE TEXT</span>
                      <div className="absolute top-1/2 left-0 w-full h-px bg-border" />
                    </div>

                    <Textarea
                      placeholder="Paste your content here..."
                      className="min-h-[200px] text-lg leading-relaxed p-4"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      disabled={!!selectedFile}
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full py-6 text-lg bg-primary hover:bg-primary/90 rounded-xl"
                  disabled={loading || checkingApproval || (!title.trim() && !selectedFile) || (!content.trim() && !selectedFile)}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {loadingStatus || 'Processing...'}
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-5 w-5" />
                      {isApprovedUser ? "Save to Cloud" : "Save Locally"}
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
