
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
        // Handled silently
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
        className="bg-background/50 rounded-lg h-10"
        disabled={disabled}
      />
      {show && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-card border rounded-xl shadow-2xl max-h-48 overflow-auto animate-in fade-in slide-in-from-top-1 duration-200">
          {suggestions.map((s, i) => (
            <li
              key={i}
              className="px-3 py-2 hover:bg-muted cursor-pointer text-sm flex items-center gap-2 group transition-colors"
              onClick={() => {
                onChange(s);
                setShow(false);
              }}
            >
              <div className="p-1 bg-muted group-hover:bg-primary/10 rounded transition-colors">
                {type === 'author' ? <User className="h-3 w-3 text-primary" /> : <Book className="h-3 w-3 text-primary" />}
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
  const [uploadMode, setUploadMode] = useState<'cloud' | 'local'>('cloud');

  useEffect(() => {
    if (isOfflineMode || !db || !user || user.isAnonymous) {
      setCheckingApproval(false);
      return;
    }

    const checkApproval = async () => {
      try {
        const pRef = doc(db, 'users', user.uid);
        const snap = await getDoc(pRef);
        const pData = snap.data();
        
        if (user.email === 'hashamcomp@gmail.com' || pData?.role === 'admin') {
          setIsApprovedUser(true);
        } else {
          const settingsRef = doc(db, 'settings', 'approvedEmails');
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            const emails = settingsSnap.data().emails || [];
            setIsApprovedUser(emails.includes(user.email));
          }
        }
      } catch (e) {
        // Silently handled
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
      setLoadingStatus('Parsing EPUB...');
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
    if (!genre) return toast({ variant: 'destructive', title: 'Missing Genre', description: 'Please select a genre.' });
    if (!db) return;

    const isCloudTarget = isApprovedUser && !isOfflineMode && uploadMode === 'cloud';

    if (isCloudTarget && !storage) {
      toast({ 
        variant: "destructive", 
        title: "Storage Error", 
        description: "Cloud storage is unavailable. You can still save locally to your browser." 
      });
      return;
    }

    setLoading(true);
    setLoadingStatus(isCloudTarget ? 'Publishing...' : 'Saving Locally...');

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
          if (body) {
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
        throw new Error("No readable content found.");
      }

      const docId = `${slugify(finalAuthor)}_${slugify(finalTitle)}`;

      if (isCloudTarget) {
        await uploadBookToCloud({
          db, 
          storage: storage!, 
          bookId: `${docId}_${Date.now()}`,
          title: finalTitle, 
          author: finalAuthor, 
          genre, 
          chapters, 
          coverFile: coverFile, 
          ownerId: user!.uid
        });
        toast({ title: "Cloud Published", description: "Novel published to the Lounge." });
      } else {
        let coverURL = null;
        if (coverFile && !isOfflineMode && storage) {
          try {
            coverURL = await uploadCoverImage(storage, coverFile, docId);
          } catch (e) {
            console.warn("Cover upload failed for local draft, proceeding without it.");
          }
        }
        
        const bookData = {
          id: docId, 
          title: finalTitle, 
          author: finalAuthor, 
          genre, 
          coverURL,
          lastUpdated: new Date().toISOString(), 
          isLocalOnly: true
        };
        
        await saveLocalBook(bookData);
        for (const ch of chapters) {
          await saveLocalChapter({ ...ch, bookId: docId });
        }
        toast({ title: "Local Draft Saved", description: "Saved to your browser library." });
      }
      
      router.push('/');
    } catch (error: any) {
      console.error("Upload process failed:", error);
      toast({ 
        variant: "destructive", 
        title: "Upload Failed", 
        description: error.message || "An unexpected error occurred during the upload." 
      });
    } finally {
      setLoading(false);
    }
  };

  if (checkingApproval) {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Verifying...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-xl mx-auto">
      {isOfflineMode ? (
        <Alert className="border-none shadow-md bg-amber-500/10 text-amber-700 rounded-xl p-4">
          <CloudOff className="h-4 w-4" />
          <AlertTitle className="font-headline font-black text-sm mb-0.5">Independent Mode</AlertTitle>
          <AlertDescription className="text-[11px] opacity-80">Saving locally to browser.</AlertDescription>
        </Alert>
      ) : isApprovedUser ? (
        <Alert className="border-none shadow-md bg-primary/10 text-primary rounded-xl p-4">
          <CloudUpload className="h-4 w-4" />
          <AlertTitle className="font-headline font-black text-sm mb-0.5">Contributor Mode</AlertTitle>
          <AlertDescription className="text-[11px] opacity-80">Direct cloud publishing enabled.</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-none shadow-xl bg-card/80 backdrop-blur-xl overflow-hidden rounded-[1.5rem]">
        <div className="h-1.5 bg-primary w-full" />
        <CardHeader className="pt-6 pb-4 px-6">
          <CardTitle className="text-xl font-headline font-black">Manuscript Details</CardTitle>
          <CardDescription className="text-xs">Add your work to the library collection.</CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-6">
          <form onSubmit={handleUpload} className="space-y-6">
            
            {isApprovedUser && !isOfflineMode && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/10">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/10 p-1.5 rounded-md">
                    {uploadMode === 'cloud' ? <Globe className="h-4 w-4 text-primary" /> : <HardDrive className="h-4 w-4 text-primary" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold">Target</p>
                    <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">
                      {uploadMode === 'cloud' ? 'Global Cloud' : 'Private Archive'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 scale-90">
                  <Switch 
                    id="upload-mode" 
                    checked={uploadMode === 'cloud'} 
                    onCheckedChange={(checked) => setUploadMode(checked ? 'cloud' : 'local')}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">Author</Label>
                <AutocompleteInput type="author" value={author} onChange={setAuthor} placeholder="Pen Name" disabled={isOfflineMode && !author} />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">Book Title</Label>
                <AutocompleteInput type="book" value={title} onChange={setTitle} placeholder="Title of the Work" disabled={isOfflineMode && !title} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">Genre</Label>
                  <Select value={genre} onValueChange={setGenre}>
                    <SelectTrigger className="bg-background/50 h-10 rounded-lg border-none shadow-inner text-xs">
                      <SelectValue placeholder="Genre" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-2xl">
                      {GENRES.map((g) => (
                        <SelectItem key={g} value={g} className="rounded-lg text-xs font-bold">{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!selectedFile && (
                  <div className="grid gap-1.5">
                    <Label className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">Chapter</Label>
                    <Input type="number" min={1} value={chapterNumber} onChange={(e) => setChapterNumber(e.target.value)} className="bg-background/50 rounded-lg h-10 text-xs" />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/50">
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
                  <ImageIcon className="h-3 w-3" /> Cover Art
                </Label>
                <div className={`relative border border-dashed rounded-xl p-4 transition-all h-24 flex items-center justify-center ${coverFile ? 'bg-primary/5 border-primary shadow-inner' : 'hover:border-primary/50 bg-muted/20'}`}>
                  <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*" onChange={(e) => e.target.files && setCoverFile(e.target.files[0])} />
                  {coverFile ? (
                    <div className="flex flex-col items-center gap-1">
                       <CheckCircle2 className="h-4 w-4 text-primary" />
                       <span className="text-[9px] font-bold truncate max-w-[120px]">{coverFile.name}</span>
                    </div>
                  ) : (
                    <Upload className="h-5 w-5 opacity-20" />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
                  <FileType className="h-3 w-3" /> EPUB File
                </Label>
                <div className={`relative border border-dashed rounded-xl p-4 transition-all h-24 flex items-center justify-center ${selectedFile ? 'bg-primary/5 border-primary shadow-inner' : 'hover:border-primary/50 bg-muted/20'}`}>
                  <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".epub" onChange={(e) => e.target.files && handleFileChange(e.target.files[0])} />
                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-1 text-center">
                      <FileType className="h-4 w-4 text-primary" />
                      <span className="text-[9px] font-bold truncate max-w-[120px]">{selectedFile.name}</span>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="text-[8px] text-destructive font-black uppercase">Clear</button>
                    </div>
                  ) : (
                    <BookPlus className="h-5 w-5 opacity-20" />
                  )}
                </div>
              </div>
            </div>

            {!selectedFile && (
              <div className="pt-2 border-t border-border/50">
                <Textarea
                  placeholder="Paste chapter content here..."
                  className="min-h-[150px] text-sm leading-relaxed p-4 rounded-xl bg-background/50 border-none shadow-inner"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
            )}

            <div className="pt-2">
              <Button 
                type="submit" 
                className="w-full py-6 text-sm font-headline font-black rounded-xl shadow-lg transition-all active:scale-[0.98]"
                disabled={loading || (!title.trim() && !selectedFile)}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {loadingStatus}
                  </>
                ) : (uploadMode === 'cloud') ? (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Publish to Cloud
                  </>
                ) : (
                  <>
                    <HardDrive className="mr-2 h-4 w-4" />
                    Save Locally
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
