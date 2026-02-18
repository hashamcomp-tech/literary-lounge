"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Globe, HardDrive, FileText, ChevronDown, Check, CloudUpload, Loader2, Book, User, Search } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { saveLocalBook, saveLocalChapter, getAllLocalBooks } from '@/lib/local-library';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GENRES } from '@/lib/genres';
import { uploadBookToCloud } from '@/lib/upload-book';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface Suggestion {
  id: string;
  title: string;
  author: string;
  totalChapters: number;
  genre: string[];
}

export function UploadNovelForm() {
  const router = useRouter();
  const { firestore: db, storage, user, isOfflineMode } = useFirebase();
  const { toast } = useToast();
  
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [chapterNumber, setChapterNumber] = useState('1');
  const [chapterTitle, setChapterTitle] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [sourceMode, setSourceMode] = useState<'file' | 'text'>('file');
  
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  
  const [canUploadCloud, setCanUploadCloud] = useState<boolean>(false);
  const [uploadMode, setUploadMode] = useState<'cloud' | 'local'>('local');

  // Autocomplete States
  const [allBooks, setAllBooks] = useState<Suggestion[]>([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedMode = localStorage.getItem("lounge-upload-mode") as 'cloud' | 'local';
    if (savedMode === 'cloud' || savedMode === 'local') {
      setUploadMode(savedMode);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("lounge-upload-mode", uploadMode);
    fetchLibraryIndex();
  }, [uploadMode, db]);

  const fetchLibraryIndex = async () => {
    try {
      if (uploadMode === 'cloud' && db) {
        const snap = await getDocs(collection(db, 'books'));
        const books = snap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title || data.metadata?.info?.bookTitle || '',
            author: data.author || data.metadata?.info?.author || '',
            totalChapters: data.metadata?.info?.totalChapters || 0,
            genre: data.genre || data.metadata?.info?.genre || []
          };
        });
        setAllBooks(books);
      } else {
        const local = await getAllLocalBooks();
        setAllBooks(local.map(b => ({
          id: b.id,
          title: b.title,
          author: b.author,
          totalChapters: b.totalChapters || 0,
          genre: Array.isArray(b.genre) ? b.genre : [b.genre]
        })));
      }
    } catch (e) {
      console.warn("Library index fetch failed");
    }
  };

  useEffect(() => {
    if (isOfflineMode || !db || !user || user.isAnonymous) return;
    const checkPermissions = async () => {
      const pRef = doc(db, 'users', user.uid);
      const snap = await getDoc(pRef);
      const userRole = snap.data()?.role;
      
      let isWhitelisted = false;
      if (user.email) {
        const settingsRef = doc(db, 'settings', 'approvedEmails');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          const emails = settingsSnap.data().emails || [];
          isWhitelisted = emails.includes(user.email);
        }
      }

      const permitted = user.email === 'hashamcomp@gmail.com' || userRole === 'admin' || isWhitelisted;
      setCanUploadCloud(permitted);
      
      if (uploadMode === 'cloud' && !permitted) {
        setUploadMode('local');
      }
    };
    checkPermissions();
  }, [user, db, isOfflineMode, uploadMode]);

  useEffect(() => {
    const trimmed = title.trim();
    if (trimmed.length < 2) {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const filtered = allBooks.filter(b => 
      b.title.toLowerCase().includes(trimmed.toLowerCase())
    );
    setFilteredSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  }, [title, allBooks]);

  const handleSelectBook = (book: Suggestion) => {
    setTitle(book.title);
    setAuthor(book.author);
    setSelectedGenres(book.genre);
    setChapterNumber((book.totalChapters + 1).toString());
    setShowSuggestions(false);
    toast({
      title: "Volume Matched",
      description: `Preparing next chapter for "${book.title}".`
    });
  };

  const handleRequestAccess = async () => {
    if (!db || !user || user.isAnonymous) return;
    setIsRequestingAccess(true);
    try {
      await setDoc(doc(db, 'publishRequests', user.uid), {
        uid: user.uid,
        email: user.email,
        requestedAt: serverTimestamp(),
        status: 'pending'
      });
      toast({ title: 'Application Submitted', description: 'Admins will review your request shortly.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Submission Error' });
    } finally {
      setIsRequestingAccess(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim()) return;
    
    setLoading(true);
    setProgress(5);
    setLoadingMessage('Initializing...');
    
    try {
      const searchTitle = title.trim();
      const searchAuthor = author.trim();
      
      const existingBook = allBooks.find(b => 
        b.title.trim().toLowerCase() === searchTitle.toLowerCase() && 
        b.author.trim().toLowerCase() === searchAuthor.toLowerCase()
      );

      const bookId = existingBook?.id || `${Date.now()}_${searchTitle.replace(/\s+/g, '_')}`;
      
      let preParsedChapters: { title: string; content: string }[] | undefined = undefined;
      let manualContent: string | undefined = undefined;

      if (sourceMode === 'file' && selectedFile) {
        if (selectedFile.name.toLowerCase().endsWith('.epub')) {
          setLoadingMessage('Decompressing Archive...');
          setProgress(20);
          
          const formData = new FormData();
          formData.append('file', selectedFile);
          
          const parseRes = await fetch('/api/ingest', { 
            method: 'POST', 
            body: formData 
          });
          
          if (!parseRes.ok) {
            const errJson = await parseRes.json();
            throw new Error(errJson.error || "Digital parsing failed.");
          }
          
          const parseData = await parseRes.json();
          if (!parseData.chapters || parseData.chapters.length === 0) {
            throw new Error("The digital volume appears empty.");
          }
          
          preParsedChapters = parseData.chapters;
          setLoadingMessage('Content Structured...');
          setProgress(50);
        } else {
          manualContent = await selectedFile.text();
        }
      } else {
        manualContent = pastedText;
      }

      setLoadingMessage('Syncing with Lounge...');
      setProgress(80);

      if (uploadMode === 'cloud') {
        if (!canUploadCloud) throw new Error("Cloud publishing restricted.");
        await uploadBookToCloud({
          db: db!, storage: storage!, bookId,
          title: searchTitle, author: searchAuthor, genres: selectedGenres,
          rawContent: manualContent, 
          preParsedChapters,
          ownerId: user!.uid,
          manualChapterInfo: manualContent ? { number: parseInt(chapterNumber), title: chapterTitle } : undefined
        });
      } else {
        // Local Archive Path
        await saveLocalBook({ 
          id: bookId, title: searchTitle, author: searchAuthor, genre: selectedGenres, 
          isLocalOnly: true, totalChapters: preParsedChapters ? preParsedChapters.length : parseInt(chapterNumber)
        });

        if (preParsedChapters) {
          for (let i = 0; i < preParsedChapters.length; i++) {
            await saveLocalChapter({ 
              bookId, chapterNumber: i + 1, content: preParsedChapters[i].content, title: preParsedChapters[i].title 
            });
          }
        } else if (manualContent) {
          await saveLocalChapter({ 
            bookId, chapterNumber: parseInt(chapterNumber), content: manualContent, title: chapterTitle 
          });
        }
      }

      setProgress(100);
      toast({ title: 'Manuscript Secured', description: 'Volume successfully integrated into the library.' });
      router.push('/');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
    } finally {
      setLoading(false);
      setProgress(0);
      setLoadingMessage('');
    }
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-20">
      {!canUploadCloud && !user?.isAnonymous && !isOfflineMode && (
        <Alert className="bg-primary/5 border-primary/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <AlertTitle className="font-black text-primary">Contribute Globally</AlertTitle>
              <AlertDescription className="text-xs">Apply for cloud publishing privileges to share your library with everyone.</AlertDescription>
            </div>
            <Button size="sm" variant="outline" onClick={handleRequestAccess} disabled={isRequestingAccess} className="rounded-xl border-primary/30 text-primary hover:bg-primary/10">
              {isRequestingAccess ? <Loader2 className="h-3 w-3 animate-spin" /> : <CloudUpload className="h-3 w-3" />}
            </Button>
          </div>
        </Alert>
      )}

      <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl rounded-[2rem] overflow-hidden">
        <div className="h-2 bg-primary w-full" />
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-3xl font-headline font-black">Add Volume</CardTitle>
              <CardDescription>Expand your personal or global library.</CardDescription>
            </div>
            <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-xl">
              <Button 
                size="sm" 
                variant={uploadMode === 'cloud' ? 'default' : 'ghost'} 
                className="rounded-lg h-8 text-[10px] font-black uppercase px-3 transition-all"
                onClick={() => setUploadMode('cloud')}
                disabled={!canUploadCloud && !isOfflineMode}
              >
                <Globe className="h-3 w-3 mr-1.5" /> Cloud
              </Button>
              <Button 
                size="sm" 
                variant={uploadMode === 'local' ? 'default' : 'ghost'} 
                className="rounded-lg h-8 text-[10px] font-black uppercase px-3 transition-all"
                onClick={() => setUploadMode('local')}
              >
                <HardDrive className="h-3 w-3 mr-1.5" /> Archive
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleUpload} className="space-y-6">
            <div className="grid gap-4">
              <div className="space-y-2 relative" ref={suggestionRef}>
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Metadata</Label>
                <div className="relative">
                  <Input 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    onFocus={() => setShowSuggestions(filteredSuggestions.length > 0)}
                    placeholder="Novel Title" 
                    className="h-12 rounded-xl pl-10" 
                    required 
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                </div>

                {showSuggestions && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-card border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 border-b bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center justify-between">
                      <span>Matches Found</span>
                      <span>Target Ch</span>
                    </div>
                    <ScrollArea className="max-h-[240px]">
                      {filteredSuggestions.map((book) => (
                        <button
                          key={book.id}
                          type="button"
                          onClick={() => handleSelectBook(book)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-primary/5 text-left transition-colors border-b last:border-none"
                        >
                          <div className="bg-primary/10 p-2 rounded-lg">
                            <Book className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{book.title}</p>
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                              <User className="h-3 w-3" /> {book.author}
                            </p>
                          </div>
                          <div className="text-primary font-black text-sm pr-2">
                            {book.totalChapters + 1}
                          </div>
                        </button>
                      ))}
                    </ScrollArea>
                  </div>
                )}

                <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" className="h-12 rounded-xl" required />
              </div>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-12 rounded-xl text-muted-foreground">
                    <span className="truncate">{selectedGenres.length > 0 ? selectedGenres.join(', ') : 'Categories'}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0 rounded-2xl shadow-2xl border-none">
                  <ScrollArea className="h-60 p-3">
                    <div className="grid grid-cols-1 gap-1">
                      {GENRES.map(g => (
                        <button 
                          key={g} 
                          type="button" 
                          onClick={() => setSelectedGenres(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g])} 
                          className={`w-full flex items-center justify-between p-3 text-xs font-bold rounded-xl transition-colors ${selectedGenres.includes(g) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                        >
                          {g} {selectedGenres.includes(g) && <Check className="h-3 w-3" />}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            <Tabs value={sourceMode} onValueChange={v => setSourceMode(v as any)}>
              <TabsList className="grid w-full grid-cols-2 rounded-xl h-12 bg-muted/50 p-1">
                <TabsTrigger value="file" className="rounded-lg font-bold">Manuscript File</TabsTrigger>
                <TabsTrigger value="text" className="rounded-lg font-bold">Paste Text</TabsTrigger>
              </TabsList>
              <TabsContent value="file" className="p-10 border-2 border-dashed rounded-2xl text-center hover:bg-muted/30 transition-colors">
                <input 
                  type="file" 
                  className="hidden" 
                  id="file-upload" 
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) setSelectedFile(file);
                  }} 
                />
                <label htmlFor="file-upload" className="cursor-pointer space-y-3 block">
                  <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-sm font-black uppercase tracking-widest text-primary">{selectedFile ? selectedFile.name : 'Select EPUB or TXT'}</p>
                  <p className="text-[10px] text-muted-foreground opacity-60">Digital Volumes or Standard Text.</p>
                </label>
              </TabsContent>
              <TabsContent value="text" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Chapter #</Label>
                    <Input type="number" placeholder="1" value={chapterNumber} onChange={e => setChapterNumber(e.target.value)} className="rounded-xl h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Chapter Title</Label>
                    <Input placeholder="Enter Title" value={chapterTitle} onChange={e => setChapterTitle(e.target.value)} className="rounded-xl h-12" />
                  </div>
                </div>
                <Textarea value={pastedText} onChange={e => setPastedText(e.target.value)} placeholder="Enter manuscript content here..." className="min-h-[250px] rounded-2xl p-4 bg-muted/20 selection:bg-primary/20" />
              </TabsContent>
            </Tabs>

            <Button 
              type="submit" 
              className="w-full h-16 text-lg font-black rounded-2xl shadow-xl hover:scale-[1.01] active:scale-95 transition-all relative overflow-hidden group" 
              disabled={loading}
            >
              {loading && (
                <div 
                  className="absolute bottom-0 left-0 right-0 bg-[#1e293b] transition-all duration-700 ease-in-out z-0"
                  style={{ height: `${progress}%` }}
                >
                  <div className="absolute top-0 left-1/2 w-[250%] aspect-square -translate-x-1/2 -translate-y-[92%] rounded-[42%] bg-[#1e293b] animate-liquid-wave opacity-80" />
                  <div className="absolute top-0 left-1/2 w-[250%] aspect-square -translate-x-1/2 -translate-y-[88%] rounded-[38%] bg-[#334155] animate-liquid-wave-fast opacity-40" />
                </div>
              )}

              <div className="relative z-10 flex flex-col items-center justify-center">
                {loading ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5 mb-1" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{loadingMessage}</span>
                  </>
                ) : (
                  <div className="flex items-center">
                    <CloudUpload className="mr-2" />
                    {uploadMode === 'cloud' ? 'Publish Globally' : 'Secure to Archive'}
                  </div>
                )}
              </div>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
