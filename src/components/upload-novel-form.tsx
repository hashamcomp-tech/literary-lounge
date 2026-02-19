"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Globe, HardDrive, FileText, ChevronDown, Check, CloudUpload, Loader2, Book, User, Search, Info, X, Sparkles } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { saveLocalBook, saveLocalChapter, getAllLocalBooks } from '@/lib/local-library';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GENRES } from '@/lib/genres';
import { uploadBookToCloud, cleanContent } from '@/lib/upload-book';
import { urlToFile } from '@/lib/image-utils';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import JSZip from 'jszip';

interface Suggestion {
  id: string;
  title: string;
  author: string;
  totalChapters: number;
  genre: string[];
}

/**
 * @fileOverview Universal Manuscript Ingestion Form.
 * Features Structure-First Paste Detection and High-Reliability EPUB Parsing.
 * Implements Lazy State Initialization for persistent upload settings.
 */
export function UploadNovelForm() {
  const router = useRouter();
  const { firestore: db, storage, user, isOfflineMode } = useFirebase();
  const { toast } = useToast();
  
  // Lazy State Initialization from localStorage
  const [uploadMode, setUploadMode] = useState<'cloud' | 'local'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem("lounge-upload-mode") as any) || 'local';
    return 'local';
  });
  
  const [sourceMode, setSourceMode] = useState<'file' | 'text'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem("lounge-source-mode") as any) || 'file';
    return 'file';
  });

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [chapterNumber, setChapterNumber] = useState('1');
  const [chapterTitle, setChapterTitle] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [canUploadCloud, setCanUploadCloud] = useState<boolean>(false);

  // Preview States
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [isExtractingPreview, setIsExtractingPreview] = useState(false);
  const [wasAutoFilled, setWasAutoFilled] = useState(false);

  // Autocomplete States
  const [allBooks, setAllBooks] = useState<Suggestion[]>([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);

  const handleSetUploadMode = (mode: 'cloud' | 'local') => {
    setUploadMode(mode);
    localStorage.setItem("lounge-upload-mode", mode);
  };

  const handleSetSourceMode = (mode: 'file' | 'text') => {
    setSourceMode(mode);
    localStorage.setItem("lounge-source-mode", mode);
  };

  /**
   * Structure-First Positional Parser
   * Only triggers if Line 1 matches a known book and Line 2 contains a Chapter pattern.
   */
  const handleAnalyzePastedText = (text: string) => {
    if (!text || text.length < 10) return;
    
    const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return;

    const potentialNovelName = lines[0].toLowerCase();
    const potentialChapterLine = lines[1];

    // Check for "Chapter X" pattern on Line 2
    const chapterRegex = /^(?:Chapter|Ch|CHAPTER|CH)?\s*(\d+)/i;
    if (!chapterRegex.test(potentialChapterLine)) {
      setWasAutoFilled(false);
      return; 
    }

    // Fuzzy match Line 1 against existing books
    let existing = allBooks.find(b => b.title.toLowerCase() === potentialNovelName);
    if (!existing) {
      existing = allBooks.find(b => 
        b.title.toLowerCase().includes(potentialNovelName) || 
        potentialNovelName.includes(b.title.toLowerCase())
      );
    }

    if (existing) {
      const match = potentialChapterLine.match(chapterRegex);
      const num = match![1];
      let titlePart = potentialChapterLine.substring(match![0].length).replace(/^[\s:\-\.]+\d*[\s:\-\.]*/, '').trim();

      setTitle(existing.title);
      setAuthor(existing.author);
      setSelectedGenres(existing.genre);
      setChapterNumber(num);
      setChapterTitle(titlePart || `Chapter ${num}`);
      setWasAutoFilled(true);
      toast({ title: "Series Match Detected", description: `Sequence synchronized for "${existing.title}".` });
    } else {
      setWasAutoFilled(false);
    }
  };

  /**
   * High-Reliability EPUB Metadata Extractor.
   * Uses Direct Archive Access to avoid replacements[i] errors.
   */
  useEffect(() => {
    if (!selectedFile || !selectedFile.name.toLowerCase().endsWith('.epub')) {
      setCoverPreview(null);
      return;
    }

    const extractMetadata = async () => {
      setIsExtractingPreview(true);
      try {
        const zip = await JSZip.loadAsync(selectedFile);
        const containerXml = await zip.file("META-INF/container.xml")?.async("string");
        if (!containerXml) throw new Error("Invalid Archive");

        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerXml, "text/xml");
        const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
        if (!opfPath) throw new Error("OPF missing");

        const opfXml = await zip.file(opfPath)?.async("string");
        const opfDoc = parser.parseFromString(opfXml || "", "text/xml");

        const titleText = opfDoc.querySelector("title")?.textContent || "";
        const authorText = opfDoc.querySelector("creator")?.textContent || "";
        
        if (titleText) setTitle(titleText);
        if (authorText) setAuthor(authorText);

        // Best-effort cover extraction
        const coverId = opfDoc.querySelector("meta[name='cover']")?.getAttribute("content") || 
                        opfDoc.querySelector("item[properties='cover-image']")?.getAttribute("id");
        
        if (coverId) {
          const coverItem = opfDoc.querySelector(`item[id='${coverId}']`);
          const coverHref = coverItem?.getAttribute("href");
          if (coverHref) {
            const fullPath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1) + coverHref;
            const coverData = await zip.file(fullPath)?.async("blob");
            if (coverData) setCoverPreview(URL.createObjectURL(coverData));
          }
        }
        setWasAutoFilled(true);
      } catch (e) {
        console.warn("EPUB metadata extraction failed", e);
      } finally {
        setIsExtractingPreview(false);
      }
    };
    extractMetadata();
  }, [selectedFile]);

  useEffect(() => {
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
      console.warn("Index fetch failed");
    }
  };

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

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev => 
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
  };

  const handleRequestAccess = async () => {
    if (!db || !user || user.isAnonymous) return;
    setIsRequestingAccess(true);
    try {
      await setDoc(doc(db, 'publishRequests', user.uid), {
        uid: user.uid, email: user.email, requestedAt: serverTimestamp(), status: 'pending'
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
      const existingBook = allBooks.find(b => b.title.trim().toLowerCase() === searchTitle.toLowerCase());
      const bookId = existingBook?.id || `${Date.now()}_${searchTitle.replace(/\s+/g, '_')}`;
      
      let preParsedChapters: { title: string; content: string }[] | undefined = undefined;
      let manualContent: string | undefined = undefined;
      let extractedCoverFile: File | null = null;

      if (sourceMode === 'file' && selectedFile) {
        if (selectedFile.name.toLowerCase().endsWith('.epub')) {
          setLoadingMessage('Parsing digital volume...');
          setProgress(30);
          
          const zip = await JSZip.loadAsync(selectedFile);
          const containerXml = await zip.file("META-INF/container.xml")?.async("string");
          const parser = new DOMParser();
          const containerDoc = parser.parseFromString(containerXml || "", "text/xml");
          const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
          const opfXml = await zip.file(opfPath || "")?.async("string");
          const opfDoc = parser.parseFromString(opfXml || "", "text/xml");

          // Extract spine and manifest for sequencing
          const manifest: Record<string, string> = {};
          opfDoc.querySelectorAll("manifest item").forEach(item => {
            manifest[item.getAttribute("id")!] = item.getAttribute("href")!;
          });

          const spineIds = Array.from(opfDoc.querySelectorAll("spine itemref")).map(i => i.getAttribute("idref")!);
          const chapters: { title: string; content: string }[] = [];

          for (let i = 0; i < spineIds.length; i++) {
            const href = manifest[spineIds[i]];
            if (href) {
              const fullPath = opfPath!.substring(0, opfPath!.lastIndexOf('/') + 1) + href;
              const content = await zip.file(fullPath)?.async("string");
              if (content) {
                const doc = parser.parseFromString(content, "text/html");
                const bodyText = doc.body.innerText || doc.body.textContent || "";
                if (bodyText.trim().length > 100) {
                  const heading = doc.querySelector("h1, h2, h3")?.textContent || `Chapter ${chapters.length + 1}`;
                  chapters.push({ title: heading, content: bodyText });
                }
              }
            }
          }
          preParsedChapters = chapters;
          if (coverPreview) extractedCoverFile = await urlToFile(coverPreview, `epub_cover_${bookId}.jpg`);
        } else {
          manualContent = await selectedFile.text();
        }
      } else {
        // Source is text
        let processedContent = pastedText;
        if (wasAutoFilled) {
          const lines = pastedText.split('\n');
          let skip = 0;
          let count = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim()) {
              count++;
              if (count === 2) { skip = i + 1; break; }
            }
          }
          processedContent = lines.slice(skip).join('\n').trim();
        }
        manualContent = processedContent;
      }

      setLoadingMessage('Securing to Lounge...');
      setProgress(80);

      if (uploadMode === 'cloud') {
        if (!canUploadCloud) throw new Error("Cloud publishing restricted.");
        await uploadBookToCloud({
          db: db!, storage: storage!, bookId,
          title: searchTitle, author: searchAuthor, genres: selectedGenres,
          rawContent: manualContent, preParsedChapters,
          coverFile: extractedCoverFile, ownerId: user!.uid,
          manualChapterInfo: manualContent ? { number: parseInt(chapterNumber), title: chapterTitle } : undefined
        });
      } else {
        await saveLocalBook({ 
          id: bookId, title: searchTitle, author: searchAuthor, genre: selectedGenres, 
          isLocalOnly: true, totalChapters: preParsedChapters ? preParsedChapters.length : parseInt(chapterNumber)
        });
        if (preParsedChapters) {
          for (let i = 0; i < preParsedChapters.length; i++) {
            await saveLocalChapter({ bookId, chapterNumber: i + 1, content: cleanContent(preParsedChapters[i].content), title: preParsedChapters[i].title });
          }
        } else if (manualContent) {
          await saveLocalChapter({ bookId, chapterNumber: parseInt(chapterNumber), content: cleanContent(manualContent), title: chapterTitle });
        }
      }

      setProgress(100);
      toast({ title: 'Volume Integrated', description: 'Manuscript secured successfully.' });
      router.push('/');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
    } finally {
      setLoading(false);
      setProgress(0);
      setLoadingMessage('');
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
          isWhitelisted = settingsSnap.data().emails?.includes(user.email);
        }
      }
      const permitted = user.email === 'hashamcomp@gmail.com' || userRole === 'admin' || isWhitelisted;
      setCanUploadCloud(permitted);
      if (uploadMode === 'cloud' && !permitted) handleSetUploadMode('local');
    };
    checkPermissions();
  }, [user, db, isOfflineMode, uploadMode]);

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
              <Button size="sm" variant={uploadMode === 'cloud' ? 'default' : 'ghost'} className="rounded-lg h-8 text-[10px] font-black uppercase px-3 transition-all" onClick={() => handleSetUploadMode('cloud')} disabled={!canUploadCloud && !isOfflineMode}>
                <Globe className="h-3 w-3 mr-1.5" /> Cloud
              </Button>
              <Button size="sm" variant={uploadMode === 'local' ? 'default' : 'ghost'} className="rounded-lg h-8 text-[10px] font-black uppercase px-3 transition-all" onClick={() => handleSetUploadMode('local')}>
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} onFocus={() => setShowSuggestions(filteredSuggestions.length > 0)} placeholder="Novel Title" className="h-12 rounded-xl pl-10" required />
                </div>
                {showSuggestions && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-card border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <ScrollArea className="max-h-[240px]">
                      {filteredSuggestions.map((book) => (
                        <button key={book.id} type="button" onClick={() => { setTitle(book.title); setAuthor(book.author); setSelectedGenres(book.genre); setChapterNumber((book.totalChapters + 1).toString()); setShowSuggestions(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-primary/5 text-left transition-colors border-b last:border-none">
                          <div className="bg-primary/10 p-2 rounded-lg"><Book className="h-4 w-4 text-primary" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{book.title}</p>
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><User className="h-3 w-3" /> {book.author}</p>
                          </div>
                          <div className="text-primary font-black text-sm pr-2">{book.totalChapters + 1}</div>
                        </button>
                      ))}
                    </ScrollArea>
                  </div>
                )}
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" className="h-12 rounded-xl" required />
              </div>
              
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center justify-between">
                  Categories
                  {wasAutoFilled && <span className="text-primary flex items-center gap-1 animate-pulse"><Sparkles className="h-2.5 w-2.5" /> Series Synced</span>}
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <div className="min-h-14 w-full cursor-pointer flex flex-wrap gap-2 p-3 border rounded-xl bg-background/50 hover:bg-muted/30 transition-colors">
                      {selectedGenres.length > 0 ? (
                        selectedGenres.map(g => (
                          <Badge key={g} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 transition-all gap-1.5 px-2 py-1 rounded-lg">
                            {g}
                            <span onClick={(e) => { e.stopPropagation(); toggleGenre(g); }} className="hover:text-destructive transition-colors"><X className="h-3 w-3" /></span>
                          </Badge>
                        ))
                      ) : (
                        <div className="flex items-center justify-between w-full text-muted-foreground">
                          <span className="text-sm font-medium">Select genre...</span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </div>
                      )}
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-[340px] p-0 rounded-2xl shadow-2xl border-none" align="start">
                    <ScrollArea className="h-72 p-3">
                      <div className="grid grid-cols-2 gap-2">
                        {GENRES.map(g => (
                          <button key={g} type="button" onClick={() => toggleGenre(g)} className={`w-full flex items-center justify-between p-3 text-[11px] font-bold rounded-xl transition-all ${selectedGenres.includes(g) ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted'}`}>
                            {g} {selectedGenres.includes(g) && <Check className="h-3 w-3" />}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <Tabs value={sourceMode} onValueChange={v => handleSetSourceMode(v as any)}>
              <TabsList className="grid w-full grid-cols-2 rounded-xl h-12 bg-muted/50 p-1">
                <TabsTrigger value="file" className="rounded-lg font-bold">Manuscript File</TabsTrigger>
                <TabsTrigger value="text" className="rounded-lg font-bold">Paste Text</TabsTrigger>
              </TabsList>
              <TabsContent value="file" className="p-10 border-2 border-dashed rounded-2xl text-center hover:bg-muted/30 transition-colors">
                <input type="file" className="hidden" id="file-upload" onChange={e => { const file = e.target.files?.[0]; if (file) setSelectedFile(file); }} />
                <label htmlFor="file-upload" className="cursor-pointer space-y-3 block">
                  {isExtractingPreview ? (
                    <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Loader2 className="h-8 w-8 text-primary animate-spin" /></div>
                  ) : coverPreview ? (
                    <div className="relative aspect-[2/3] w-32 mx-auto mb-4 rounded-lg overflow-hidden shadow-xl border-2 border-primary/20 animate-in fade-in zoom-in duration-500"><img src={coverPreview} alt="Cover" className="w-full h-full object-cover" /></div>
                  ) : (
                    <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><FileText className="h-8 w-8 text-primary" /></div>
                  )}
                  <p className="text-sm font-black uppercase tracking-widest text-primary">{selectedFile ? selectedFile.name : 'Select EPUB or TXT'}</p>
                </label>
              </TabsContent>
              <TabsContent value="text" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Chapter #</Label>
                    <Input type="number" value={chapterNumber} onChange={e => setChapterNumber(e.target.value)} className="rounded-xl h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Title</Label>
                    <Input placeholder="Enter Title" value={chapterTitle} onChange={e => setChapterTitle(e.target.value)} className="rounded-xl h-12" />
                  </div>
                </div>
                <Textarea 
                  value={pastedText} 
                  onChange={e => setPastedText(e.target.value)} 
                  onPaste={(e) => { const text = e.clipboardData.getData('text'); setTimeout(() => handleAnalyzePastedText(text), 50); }}
                  placeholder="Paste content... (Line 1: Novel Name, Line 2: Chapter Info)" 
                  className="min-h-[250px] rounded-2xl p-4 bg-muted/20" 
                />
              </TabsContent>
            </Tabs>

            <Button type="submit" className="w-full h-16 text-lg font-black rounded-2xl shadow-xl transition-all relative overflow-hidden group" disabled={loading || (!selectedFile && !pastedText.trim())}>
              {loading && (
                <div className="absolute bottom-0 left-0 right-0 bg-primary/20 transition-all duration-700 ease-in-out z-0" style={{ height: `${progress}%` }}>
                  <div className="absolute top-0 left-1/2 w-[250%] aspect-square -translate-x-1/2 -translate-y-[92%] rounded-[42%] bg-primary/30 animate-liquid-wave opacity-80" />
                </div>
              )}
              <div className="relative z-10 flex flex-col items-center justify-center">
                {loading ? (
                  <><Loader2 className="animate-spin h-5 w-5 mb-1" /><span className="text-[10px] font-black uppercase tracking-widest">{loadingMessage}</span></>
                ) : (
                  <div className="flex items-center"><CloudUpload className="mr-2" />{uploadMode === 'cloud' ? 'Publish Globally' : 'Secure to Archive'}</div>
                )}
              </div>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
