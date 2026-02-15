'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Upload, BookPlus, Loader2, CheckCircle2, User, Book, ShieldCheck, HardDrive, Globe, Lock, Send, Image as ImageIcon, Sparkles } from 'lucide-react';
import ePub from 'epubjs';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, limit, addDoc } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { saveLocalBook, saveLocalChapter, getLocalBook, openDB } from '@/lib/local-library';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { sendAccessRequestEmail } from '@/app/actions/notifications';
import { GENRES } from '@/lib/genres';
import { uploadCoverImage } from '@/lib/upload-cover';
import { uploadBookToCloud } from '@/lib/upload-book';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * @fileOverview Client Component handling the novel upload logic and form state.
 * Implements multi-chapter local saving and cloud upload requests.
 */

interface AutocompleteInputProps {
  type: 'author' | 'book';
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}

function AutocompleteInput({ type, value, onChange, placeholder }: AutocompleteInputProps) {
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

export function UploadNovelForm() {
  const router = useRouter();
  const { firestore: db, storage, user, isUserLoading } = useFirebase();
  const { toast } = useToast();
  
  const [profile, setProfile] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [chapterNumber, setChapterNumber] = useState('1');
  const [content, setContent] = useState('');
  const [genre, setGenre] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  
  const [isApprovedUser, setIsApprovedUser] = useState<boolean>(false);
  const [checkingApproval, setCheckingApproval] = useState(true);

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setCheckingApproval(false);
      return;
    }

    const fetchProfile = async () => {
      const pRef = doc(db, 'users', user.uid);
      const snap = await getDoc(pRef);
      if (snap.exists()) {
        const pData = snap.data();
        setProfile(pData);
        if (user.email === 'hashamcomp@gmail.com' || pData.role === 'admin') {
          setIsApprovedUser(true);
        } else {
          const settingsRef = doc(db, 'settings', 'approvedEmails');
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            const emails = settingsSnap.data().emails || [];
            setIsApprovedUser(emails.includes(user.email));
          }
        }
      }
      setCheckingApproval(false);
    };

    fetchProfile();
  }, [user, db]);

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

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCoverFile(e.target.files[0]);
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
        description: "Your request has been sent to the administrators.",
      });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not send access request.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestCloudUpload = async () => {
    if (!title.trim() || !content.trim()) {
      toast({ variant: 'destructive', title: 'Missing Info', description: 'Title and content are required for review.' });
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const requestData = {
        title: title.trim(),
        author: author.trim() || 'Anonymous',
        content: content.trim(),
        chapterNumber: parseInt(chapterNumber) || 1,
        genre: genre || 'Unspecified',
        requestedBy: user.uid,
        requestedAt: serverTimestamp(),
        status: 'pending',
      };
      await addDoc(collection(db, 'cloudUploadRequests'), requestData);
      toast({ title: "Review Requested", description: "Admins will review your content for cloud publishing." });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Request Failed', description: 'Could not submit request.' });
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
    
    if (!genre) {
      toast({ variant: 'destructive', title: 'Error', description: 'Genre is required.' });
      return;
    }

    setLoading(true);

    try {
      let finalTitle = title.trim();
      let finalAuthor = author.trim() || 'Anonymous';
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
          title: `Chapter ${chapterNumber}`,
        }];
      }

      const docId = `${slugify(finalAuthor)}_${slugify(finalTitle)}`;

      if (isApprovedUser && user && coverFile) {
        setLoadingStatus('Publishing to cloud...');
        await uploadBookToCloud({
          db,
          storage,
          bookId: `${docId}_${Date.now()}`,
          title: finalTitle,
          author: finalAuthor,
          genre,
          chapters,
          coverFile,
          ownerId: user.uid
        });

        toast({ title: "Successfully Published", description: "Novel is now live." });
        router.push('/');
      } else {
        setLoadingStatus('Saving locally...');
        
        // Multi-chapter local storage logic
        const existingBook = await getLocalBook(docId);
        
        let coverURL = existingBook?.coverURL || null;
        if (!coverURL && coverFile) {
          coverURL = await uploadCoverImage(storage, coverFile, docId);
        }

        const bookData = {
          id: docId,
          title: finalTitle,
          author: finalAuthor,
          genre: genre,
          totalChapters: Math.max((existingBook?.totalChapters || 0), chapters[chapters.length-1].chapterNumber),
          lastUpdated: new Date().toISOString(),
          isLocalOnly: true,
          coverURL: coverURL
        };

        await saveLocalBook(bookData);
        for (const ch of chapters) {
          await saveLocalChapter({ ...ch, bookId: docId });
        }

        toast({ title: "Saved Locally", description: `Added ${chapters.length} chapter(s) to your private library.` });
        router.push(`/local-pages/${docId}/1`);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Operation Failed", description: error.message || "An error occurred." });
    } finally {
      setLoading(false);
    }
  };

  if (checkingApproval) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  const canRequestAccess = !isApprovedUser && user && !user.isAnonymous;

  return (
    <>
      <div className="mb-8">
        {isApprovedUser ? (
          <Alert className="border-none shadow-sm bg-green-500/10 text-green-700">
            <Globe className="h-5 w-5" />
            <AlertTitle className="font-bold">Cloud Publishing Active</AlertTitle>
            <AlertDescription className="text-sm">
              Your work will be visible to everyone in the Lounge.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-none shadow-sm bg-blue-500/10 text-blue-700">
            <Lock className="h-5 w-5" />
            <AlertTitle className="font-bold">Local Storage Active</AlertTitle>
            <AlertDescription className="text-sm flex flex-col gap-3">
              <p>Content will be saved only to your browser's private database. You can add multiple chapters to the same book.</p>
              {canRequestAccess && (
                <div className="flex flex-wrap gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRequestAccess}
                    disabled={loading}
                    className="w-fit bg-blue-600/10 border-blue-600/20 text-blue-700 hover:bg-blue-600/20 rounded-lg gap-2"
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Request Contributor Access
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRequestCloudUpload}
                    disabled={loading}
                    className="w-fit bg-amber-600/10 border-amber-600/20 text-amber-700 hover:bg-amber-600/20 rounded-lg gap-2"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Request Content Review
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Card className="border-none shadow-xl bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookPlus className="h-5 w-5 text-primary" />
            Upload Book Chapter
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
                  placeholder="Author (optional)"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Book Title</Label>
                <AutocompleteInput 
                  type="book" 
                  value={title} 
                  onChange={setTitle} 
                  placeholder="Book Title"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Genre</Label>
                  <Select value={genre} onValueChange={setGenre}>
                    <SelectTrigger className="bg-background/50 h-10 rounded-md border border-input px-3">
                      <SelectValue placeholder="Select Genre" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENRES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Chapter Number</Label>
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

            {!isApprovedUser && (
               <div className="space-y-4 pt-4 border-t">
                <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" /> Cover Image (New Books Only)
                </Label>
                <div className={`relative border-2 border-dashed rounded-xl p-4 transition-colors ${coverFile ? 'bg-primary/5 border-primary' : 'hover:border-primary/50'}`}>
                  <input
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    accept="image/*"
                    onChange={handleCoverChange}
                  />
                  <div className="flex flex-col items-center justify-center text-center">
                    {coverFile ? (
                      <div className="flex items-center gap-2">
                         <CheckCircle2 className="h-5 w-5 text-primary" />
                         <span className="text-sm font-medium truncate max-w-[200px]">{coverFile.name}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                         <Upload className="h-4 w-4" />
                         <span className="text-xs font-medium">Select a cover image</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4 pt-4 border-t">
              <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Chapter Content</Label>
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
                      </>
                    ) : (
                      <>
                        <div className="bg-muted p-3 rounded-full mb-3">
                          <Upload className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <span className="font-bold text-sm mb-1">Upload EPUB File</span>
                        <span className="text-xs text-muted-foreground">Processes all chapters automatically</span>
                      </>
                    )}
                  </div>
                </div>

                {!selectedFile && (
                  <Textarea
                    placeholder="Paste chapter content here..."
                    className="min-h-[250px] text-lg leading-relaxed p-4 bg-background/30 focus:bg-background transition-colors"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 pt-4 border-t">
              <Button 
                type="submit" 
                className="w-full py-8 text-lg font-bold rounded-2xl shadow-lg transition-transform active:scale-[0.98]"
                disabled={loading || (!title.trim() && !selectedFile)}
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
              
              {!isApprovedUser && !selectedFile && (
                <Button 
                  type="button" 
                  variant="outline"
                  className="w-full py-6 rounded-2xl border-amber-500/20 text-amber-700 hover:bg-amber-500/5"
                  onClick={handleRequestCloudUpload}
                  disabled={loading || !title.trim() || !content.trim()}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Request Cloud Review for this Chapter
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
