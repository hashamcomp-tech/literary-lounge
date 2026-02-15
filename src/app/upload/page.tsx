
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Upload, BookPlus, Loader2, CheckCircle2, User, Book, ShieldCheck, HardDrive, Info, Globe, Lock, Send } from 'lucide-react';
import ePub from 'epubjs';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { saveLocalBook, saveLocalChapter } from '@/lib/local-library';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { sendAccessRequestEmail } from '@/app/actions/notifications';

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
  
  const profileRef = useMemoFirebase(() => (user && !user.isAnonymous) ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile } = useDoc(profileRef);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [chapterNumber, setChapterNumber] = useState('1');
  const [content, setContent] = useState('');
  const [genre, setGenre] = useState('Novel');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  
  const [isApprovedUser, setIsApprovedUser] = useState<boolean>(false);
  const [checkingApproval, setCheckingApproval] = useState(true);

  useEffect(() => {
    const checkApproval = async () => {
      if (isUserLoading) return;
      
      if (!user || user.isAnonymous || !user.email) {
        setIsApprovedUser(false);
        setCheckingApproval(false);
        return;
      }

      // Super-admin bypass or explicit admin role
      if (user.email === 'hashamcomp@gmail.com' || profile?.role === 'admin') {
        setIsApprovedUser(true);
        setCheckingApproval(false);
        return;
      }

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
        setIsApprovedUser(false);
      } finally {
        setCheckingApproval(false);
      }
    };

    checkApproval();
  }, [user, isUserLoading, profile, db]);

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

  const handleRequestAccess = async () => {
    if (!user || user.isAnonymous || !user.email) return;
    
    setLoading(true);
    try {
      const requestRef = doc(db, 'publishRequests', user.uid);
      const requestData = {
        email: user.email,
        requestedAt: serverTimestamp(),
        status: 'pending'
      };

      await setDoc(requestRef, requestData).catch(async (err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: requestRef.path,
          operation: 'create',
          requestResourceData: requestData
        }));
      });

      await sendAccessRequestEmail(user.email);

      toast({
        title: "Access Requested",
        description: "Your request has been sent to the administrators. You will be notified via email upon approval.",
      });
    } catch (error) {
      console.error("Request failed", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not send access request.' });
    } finally {
      setLoading(false);
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

      const docId = `${slugify(finalAuthor || 'anonymous')}_${slugify(finalTitle || 'untitled')}_${Date.now()}`;

      if (isApprovedUser && user) {
        setLoadingStatus('Publishing to cloud...');
        const bookRef = doc(db, 'books', docId);
        const metadataMap = {
          info: {
            author: finalAuthor,
            bookTitle: finalTitle,
            lastUpdated: serverTimestamp(),
            ownerId: user.uid,
            totalChapters: chapters.length,
            genre: genre,
            views: 0,
            isLocalOnly: false
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
        await setDoc(infoRef, metadataMap.info, { merge: true });

        for (const ch of chapters) {
          const chRef = doc(db, 'books', docId, 'chapters', ch.chapterNumber.toString());
          await setDoc(chRef, {
            content: ch.content,
            chapterNumber: ch.chapterNumber,
            title: ch.title || `Chapter ${ch.chapterNumber}`,
            ownerId: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }

        setLoadingStatus('Caching locally...');
        await saveLocalBook({ 
          id: docId, 
          title: finalTitle, 
          author: finalAuthor, 
          genre, 
          totalChapters: chapters.length, 
          lastUpdated: new Date().toISOString(),
          isLocalOnly: false 
        });
        for (const ch of chapters) {
          await saveLocalChapter({ ...ch, bookId: docId });
        }

        toast({ title: "Successfully Published", description: "Novel is now live and cached locally." });
        router.push(`/pages/${docId}/${chapters[0]?.chapterNumber || 1}`);
      } else {
        setLoadingStatus('Saving locally...');
        const bookData = {
          id: docId,
          title: finalTitle,
          author: finalAuthor,
          genre: genre,
          totalChapters: chapters.length,
          lastUpdated: new Date().toISOString(),
          isLocalOnly: true
        };

        await saveLocalBook(bookData);
        for (const ch of chapters) {
          await saveLocalChapter({ ...ch, bookId: docId });
        }

        toast({ title: "Saved Locally", description: "Novel added to your browser's private database." });
        router.push(`/local-pages/${docId}/1`);
      }
    } catch (error) {
      console.error("Upload failed", error);
      toast({ variant: "destructive", title: "Operation Failed", description: "An error occurred during save." });
    } finally {
      setLoading(false);
    }
  };

  if (isUserLoading || checkingApproval) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const canRequestAccess = !isApprovedUser && user && !user.isAnonymous;

  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-headline font-black mb-4">Add to Library</h1>
            <p className="text-lg text-muted-foreground">
              {isApprovedUser 
                ? "Share your stories with the global Literary Lounge community." 
                : "Organize your private reading collection locally in your browser."}
            </p>
          </div>

          <div className="mb-8">
            {isApprovedUser ? (
              <Alert className="border-none shadow-sm bg-green-500/10 text-green-700">
                <Globe className="h-5 w-5" />
                <AlertTitle className="font-bold">Cloud Publishing Active</AlertTitle>
                <AlertDescription className="text-sm">
                  Your work will be visible to everyone in the Lounge and cached locally for your convenience.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-none shadow-sm bg-blue-500/10 text-blue-700">
                <Lock className="h-5 w-5" />
                <AlertTitle className="font-bold">Local Storage Active</AlertTitle>
                <AlertDescription className="text-sm flex flex-col gap-3">
                  <p>Content will be saved only to your browser's private database. No cloud publishing.</p>
                  {canRequestAccess && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleRequestAccess}
                      disabled={loading}
                      className="w-fit bg-blue-600/10 border-blue-600/20 text-blue-700 hover:bg-blue-600/20 rounded-lg gap-2"
                    >
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Request Publish Access
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Card className="border-none shadow-xl bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookPlus className="h-5 w-5 text-primary" />
                Novel Details
              </CardTitle>
              <CardDescription>
                Provide details for your {isApprovedUser ? 'global' : 'local'} collection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpload} className="space-y-6">
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Author</Label>
                    <AutocompleteInput 
                      type="author" 
                      value={author} 
                      onChange={setAuthor} 
                      placeholder="e.g. Jane Austen"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Book Title</Label>
                    <AutocompleteInput 
                      type="book" 
                      value={title} 
                      onChange={setTitle} 
                      placeholder="e.g. Pride and Prejudice"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Genre</Label>
                      <Input 
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        className="bg-background/50"
                        placeholder="Fantasy, Romance..."
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Start Chapter</Label>
                      <Input 
                        type="number" 
                        min={1} 
                        value={chapterNumber}
                        onChange={(e) => setChapterNumber(e.target.value)}
                        className="bg-background/50"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Content Source</Label>
                    {!selectedFile && <span className="text-[10px] font-bold text-primary flex items-center gap-1"><Info className="h-3 w-3" /> EPUB supports multi-chapter</span>}
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <div className={`relative border-2 border-dashed rounded-xl p-8 transition-colors ${selectedFile ? 'bg-primary/5 border-primary' : 'hover:border-primary/50'}`}>
                      <input
                        type="file"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept=".epub"
                        onChange={handleFileChange}
                      />
                      <div className="flex flex-col items-center justify-center text-center">
                        {selectedFile ? (
                          <>
                            <div className="bg-primary/10 p-3 rounded-full mb-2">
                              <CheckCircle2 className="h-8 w-8 text-primary" />
                            </div>
                            <span className="font-bold text-sm">{selectedFile.name}</span>
                            <Button variant="ghost" size="sm" className="mt-2 text-xs text-muted-foreground" onClick={() => setSelectedFile(null)}>Change File</Button>
                          </>
                        ) : (
                          <>
                            <div className="bg-muted p-3 rounded-full mb-3">
                              <Upload className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <span className="font-bold text-sm mb-1">Upload EPUB File</span>
                            <span className="text-xs text-muted-foreground">Drag and drop or click to browse</span>
                          </>
                        )}
                      </div>
                    </div>

                    {!selectedFile && (
                      <>
                        <div className="relative text-center py-2">
                          <span className="bg-card px-3 text-[10px] font-black text-muted-foreground uppercase relative z-10">OR PASTE TEXT</span>
                          <div className="absolute top-1/2 left-0 w-full h-px bg-border/50" />
                        </div>

                        <Textarea
                          placeholder="Paste your chapter content here..."
                          className="min-h-[250px] text-lg leading-relaxed p-4 bg-background/30 focus:bg-background transition-colors"
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                        />
                      </>
                    )}
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full py-8 text-lg font-bold rounded-2xl shadow-lg transition-transform active:scale-[0.98]"
                  disabled={loading || (!title.trim() && !selectedFile) || (!content.trim() && !selectedFile)}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                      {loadingStatus || 'Processing...'}
                    </>
                  ) : isApprovedUser ? (
                    <>
                      <ShieldCheck className="mr-2 h-6 w-6" />
                      Publish to Cloud
                    </>
                  ) : (
                    <>
                      <HardDrive className="mr-2 h-6 w-6" />
                      Save Locally
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
