
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Upload, BookPlus, Loader2, CheckCircle2, User, Book, ShieldCheck, HardDrive, Globe, ImageIcon, CloudUpload, FileType, CloudOff } from 'lucide-react';
import ePub from 'epubjs';
import { doc, getDoc, collection, query, where, getDocs, limit, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { saveLocalBook, saveLocalChapter } from '@/lib/local-library';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GENRES } from '@/lib/genres';
import { uploadBookToCloud } from '@/lib/upload-book';
import { uploadCoverImage } from '@/lib/upload-cover';
import { sendAccessRequestEmail } from '@/app/actions/notifications';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * @fileOverview Refined upload form with robust EPUB parsing.
 * Extracts metadata and chapters automatically for a premium contributor experience.
 */

interface AutocompleteInputProps {
  type: 'author' | 'book';
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  disabled?: boolean;
}

function AutocompleteInput({ type, value, onChange, placeholder, disabled }: AutocompleteInputProps) {
  const { firestore: db } = useFirebase();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lowerValue = value.toLowerCase();
    if (!db || lowerValue.length < 2) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      const fieldPath = type === 'author' ? 'authorLower' : 'titleLower';
      const q = query(
        collection(db, 'books'),
        where(fieldPath, '>=', lowerValue),
        where(fieldPath, '<=', lowerValue + '\uf8ff'),
        limit(5)
      );
      try {
        const snap = await getDocs(q);
        const items: string[] = [];
        snap.forEach(doc => {
          const data = doc.data();
          const val = type === 'author' ? data.author : data.title;
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
        className="bg-background/50 rounded-xl h-12"
        disabled={disabled}
      />
      {show && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-2 bg-card border rounded-2xl shadow-2xl max-h-48 overflow-auto animate-in fade-in slide-in-from-top-2 duration-200">
          {suggestions.map((s, i) => (
            <li
              key={i}
              className="px-4 py-3 hover:bg-muted cursor-pointer text-sm flex items-center gap-2 group transition-colors"
              onClick={() => {
                onChange(s);
                setShow(false);
              }}
            >
              <div className="p-1.5 bg-muted group-hover:bg-primary/10 rounded-lg transition-colors">
                {type === 'author' ? <User className="h-3.5 w-3.5 text-primary" /> : <Book className="h-3.5 w-3.5 text-primary" />}
              </div>
              <span className="font-bold">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UploadNovelForm() {
  const router = useRouter();
  const { firestore: db, storage, user, isOfflineMode } = useFirebase();
  const { toast } = useToast();
  
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [chapterNumber, setChapterNumber] = useState('1');
  const [content, setContent] = useState('');
  const [genre, setGenre] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  
  const [isApprovedUser, setIsApprovedUser] = useState<boolean>(false);
  const [checkingApproval, setCheckingApproval] = useState(true);

  useEffect(() => {
    if (isOfflineMode) {
      setCheckingApproval(false);
      return;
    }
    if (!user || user.isAnonymous) {
      setCheckingApproval(false);
      return;
    }

    const checkApproval = async () => {
      try {
        const pRef = doc(db!, 'users', user.uid);
        const snap = await getDoc(pRef);
        const pData = snap.data();
        
        if (user.email === 'hashamcomp@gmail.com' || pData?.role === 'admin') {
          setIsApprovedUser(true);
        } else {
          const settingsRef = doc(db!, 'settings', 'approvedEmails');
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            const emails = settingsSnap.data().emails || [];
            setIsApprovedUser(emails.includes(user.email));
          }
        }
      } catch (e) {
        console.error("Approval check error", e);
      } finally {
        setCheckingApproval(false);
      }
    };

    checkApproval();
  }, [user, db, isOfflineMode]);

  const slugify = (text: string) => {
    return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '_').replace(/^-+|-+$/g, '');
  };

  const handleRequestAccess = async () => {
    if (!user || !db || user.isAnonymous) return;
    setIsRequestingAccess(true);
    
    const requestRef = doc(db, 'publishRequests', user.uid);
    const requestData = {
      uid: user.uid,
      email: user.email,
      requestedAt: serverTimestamp(),
      status: 'pending'
    };

    setDoc(requestRef, requestData)
      .then(async () => {
        if (user.email) {
          await sendAccessRequestEmail(user.email);
        }
        toast({ 
          title: "Request Submitted", 
          description: "Administrators have been notified of your application." 
        });
      })
      .catch((err) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: requestRef.path,
          operation: 'create',
          requestResourceData: requestData
        }));
      })
      .finally(() => setIsRequestingAccess(false));
  };

  const handleFileChange = async (file: File) => {
    setSelectedFile(file);
    if (file.name.endsWith('.epub')) {
      setLoading(true);
      setLoadingStatus('Parsing EPUB Manuscript...');
      try {
        const arrayBuffer = await file.arrayBuffer();
        const book = ePub(arrayBuffer);
        await book.ready;
        const metadata = await book.loaded.metadata;
        if (metadata.title) setTitle(metadata.title);
        if (metadata.creator) setAuthor(metadata.creator);
        toast({ title: "Manuscript Loaded", description: `"${metadata.title}" metadata extracted.` });
      } catch (e) {
        toast({ variant: 'destructive', title: "Parsing Error", description: "Failed to read EPUB metadata." });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genre) return toast({ variant: 'destructive', title: 'Missing Genre', description: 'Please select a genre for your novel.' });
    if (!db || !storage) return;

    setLoading(true);
    setLoadingStatus(isApprovedUser && !isOfflineMode ? 'Syncing to Cloud...' : 'Saving to Private Library...');

    try {
      let finalTitle = title.trim();
      let finalAuthor = author.trim() || 'Anonymous Author';
      let chapters: any[] = [];

      if (selectedFile?.name.endsWith('.epub')) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const book = ePub(arrayBuffer);
        await book.ready;
        
        const spine = book.spine;
        let idx = 1;
        // @ts-ignore
        for (const item of spine.items) {
          const chapterDoc = await book.load(item.href);
          // @ts-ignore
          const body = chapterDoc.querySelector('body');
          if (body && body.innerText.length > 50) {
            chapters.push({ 
              chapterNumber: idx++, 
              content: body.innerHTML, 
              title: item.idref || `Chapter ${idx - 1}` 
            });
          }
        }
      } else {
        const html = (content || "").split('\n\n').map(p => `<p>${p}</p>`).join('');
        chapters = [{ chapterNumber: parseInt(chapterNumber) || 1, content: html, title: `Chapter ${chapterNumber}` }];
      }

      if (chapters.length === 0) {
        throw new Error("No readable content found in manuscript.");
      }

      const docId = `${slugify(finalAuthor)}_${slugify(finalTitle)}`;

      if (isApprovedUser && !isOfflineMode && coverFile) {
        await uploadBookToCloud({
          db, storage, bookId: `${docId}_${Date.now()}`,
          title: finalTitle, author: finalAuthor, genre, chapters, coverFile, ownerId: user!.uid
        });
        toast({ title: "Cloud Published", description: "Your novel is now available in the Lounge." });
      } else {
        let coverURL = null;
        if (coverFile && !isOfflineMode) coverURL = await uploadCoverImage(storage, coverFile, docId);
        
        const bookData = {
          id: docId, title: finalTitle, author: finalAuthor, genre, coverURL,
          lastUpdated: new Date().toISOString(), isLocalOnly: true
        };
        await saveLocalBook(bookData);
        for (const ch of chapters) {
          await saveLocalChapter({ ...ch, bookId: docId });
        }
        toast({ title: "Local Draft Saved", description: "Novel added to your private collection." });
      }
      router.push('/');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (checkingApproval) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Verifying Credentials...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4">
        {isOfflineMode ? (
          <Alert className="border-none shadow-xl bg-amber-500/10 text-amber-700 rounded-2xl p-6">
            <CloudOff className="h-6 w-6" />
            <AlertTitle className="font-headline font-black text-xl mb-1">Independent Mode Active</AlertTitle>
            <AlertDescription className="text-sm font-medium opacity-80">
              Cloud publishing and contributor verification are unavailable. Any uploads will be saved <strong>locally</strong> to your browser.
            </AlertDescription>
          </Alert>
        ) : isApprovedUser ? (
          <Alert className="border-none shadow-xl bg-primary/10 text-primary rounded-2xl p-6">
            <CloudUpload className="h-6 w-6" />
            <AlertTitle className="font-headline font-black text-xl mb-1">Cloud Access Enabled</AlertTitle>
            <AlertDescription className="text-sm font-medium opacity-80">
              You are an authorized contributor. Your novels will be published directly to the global Lounge.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-none shadow-xl bg-slate-500/10 text-slate-700 rounded-2xl p-6">
            <HardDrive className="h-6 w-6" />
            <AlertTitle className="font-headline font-black text-xl mb-1">Private Local Mode</AlertTitle>
            <AlertDescription className="text-sm font-medium opacity-80 space-y-4">
              <p>Content is currently saved to your browser's private database. Perfect for personal archives.</p>
              {user && !user.isAnonymous && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRequestAccess}
                  disabled={isRequestingAccess}
                  className="bg-slate-600/10 border-slate-600/20 text-slate-800 hover:bg-slate-600/20 rounded-xl"
                >
                  {isRequestingAccess ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Globe className="h-3.5 w-3.5 mr-2" />}
                  Request Cloud Contributor Access
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl overflow-hidden rounded-[2.5rem]">
        <div className="h-2 bg-primary w-full" />
        <CardHeader className="pt-10 pb-6 px-10">
          <CardTitle className="text-3xl font-headline font-black">Manuscript Details</CardTitle>
          <CardDescription className="text-base">Metadata is automatically extracted from EPUB files.</CardDescription>
        </CardHeader>
        <CardContent className="px-10 pb-10 space-y-8">
          <form onSubmit={handleUpload} className="space-y-8">
            <div className="grid gap-6">
              <div className="grid gap-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Author</Label>
                <AutocompleteInput type="author" value={author} onChange={setAuthor} placeholder="Author's Pen Name" disabled={isOfflineMode && !author} />
              </div>

              <div className="grid gap-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Book Title</Label>
                <AutocompleteInput type="book" value={title} onChange={setTitle} placeholder="Title of the Work" disabled={isOfflineMode && !title} />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="grid gap-2">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Genre</Label>
                  <Select value={genre} onValueChange={setGenre}>
                    <SelectTrigger className="bg-background/50 h-12 rounded-xl border-none shadow-inner">
                      <SelectValue placeholder="Select Genre" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl shadow-2xl">
                      {GENRES.map((g) => (
                        <SelectItem key={g} value={g} className="rounded-xl font-bold">{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!selectedFile && (
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Chapter Number</Label>
                    <Input type="number" min={1} value={chapterNumber} onChange={(e) => setChapterNumber(e.target.value)} className="bg-background/50 rounded-xl h-12" />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/50">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Cover Art {isApprovedUser && !isOfflineMode && '(Required for Cloud)'}
              </Label>
              <div className={`relative border-2 border-dashed rounded-[2rem] p-8 transition-all duration-500 ${coverFile ? 'bg-primary/5 border-primary shadow-inner' : 'hover:border-primary/50 bg-muted/20'}`}>
                <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*" onChange={(e) => e.target.files && setCoverFile(e.target.files[0])} />
                <div className="flex flex-col items-center justify-center text-center">
                  {coverFile ? (
                    <div className="flex items-center gap-3">
                       <div className="bg-primary p-2 rounded-full"><CheckCircle2 className="h-5 w-5 text-white" /></div>
                       <span className="text-sm font-bold truncate max-w-[200px]">{coverFile.name}</span>
                    </div>
                  ) : (
                    <div className="space-y-2 opacity-50">
                       <Upload className="h-8 w-8 mx-auto mb-2" />
                       <span className="text-xs font-black uppercase tracking-widest">Drop cover image here</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/50">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Manuscript File</Label>
              <div className="grid gap-6">
                <div className={`relative border-2 border-dashed rounded-[2rem] p-10 transition-all duration-500 ${selectedFile ? 'bg-primary/5 border-primary' : 'hover:border-primary/50 bg-muted/20'}`}>
                  <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".epub" onChange={(e) => e.target.files && handleFileChange(e.target.files[0])} />
                  <div className="flex flex-col items-center justify-center text-center">
                    {selectedFile ? (
                      <div className="space-y-2">
                        <div className="bg-primary p-3 rounded-full mx-auto w-fit">
                          {selectedFile.name.endsWith('.epub') ? <FileType className="h-6 w-6 text-white" /> : <Book className="h-6 w-6 text-white" />}
                        </div>
                        <span className="font-black uppercase tracking-widest text-[10px] block">{selectedFile.name}</span>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="text-xs text-destructive hover:bg-destructive/10">Remove File</Button>
                      </div>
                    ) : (
                      <div className="space-y-3 opacity-50">
                        <BookPlus className="h-10 w-10 mx-auto" />
                        <span className="font-black uppercase tracking-widest text-[10px] block">Upload EPUB for Auto-Parsing</span>
                        <p className="text-[10px] max-w-[200px] mx-auto">We'll extract all chapters and metadata automatically.</p>
                      </div>
                    )}
                  </div>
                </div>

                {!selectedFile && (
                  <Textarea
                    placeholder="Alternatively, paste your chapter content here..."
                    className="min-h-[300px] text-lg leading-relaxed p-6 rounded-[2rem] bg-background/50 border-none shadow-inner focus:bg-background transition-all"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="pt-6">
              <Button 
                type="submit" 
                className="w-full py-10 text-xl font-headline font-black rounded-[2rem] shadow-2xl transition-all active:scale-[0.98] hover:shadow-primary/20"
                disabled={loading || (!title.trim() && !selectedFile)}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                    {loadingStatus}
                  </>
                ) : isApprovedUser && !isOfflineMode ? (
                  <>
                    <ShieldCheck className="mr-3 h-6 w-6" />
                    Publish Volume to Cloud
                  </>
                ) : (
                  <>
                    <HardDrive className="mr-3 h-6 w-6" />
                    Archive in Local Library
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
