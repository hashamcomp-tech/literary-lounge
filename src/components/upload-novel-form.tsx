"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Globe, HardDrive, FileText, X, Sparkles, Book, Search, CloudUpload, Loader2 } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { saveLocalBook, saveLocalChapter, getAllLocalBooks } from '@/lib/local-library';
import { GENRES } from '@/lib/genres';
import { uploadBookToCloud, cleanContent } from '@/lib/upload-book';
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
 * Features a refined 3-line paste detection system.
 * Extracts Novel Title (line 1), Chapter Info (line 2), and Word Count (line 3).
 */
export function UploadNovelForm() {
  const router = useRouter();
  const { firestore: db, storage, user, isOfflineMode } = useFirebase();
  const { toast } = useToast();
  
  const [uploadMode, setUploadMode] = useState<'cloud' | 'local'>('local');
  const [sourceMode, setSourceMode] = useState<'file' | 'text'>('file');

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [chapterNumber, setChapterNumber] = useState('1');
  const [chapterTitle, setChapterTitle] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [canUploadCloud, setCanUploadCloud] = useState<boolean>(false);
  const [wasAutoFilled, setWasAutoFilled] = useState(false);

  const [allBooks, setAllBooks] = useState<Suggestion[]>([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);

  /**
   * Precise 3-Line Ingestion Engine.
   * Line 1: Novel Name (Match check)
   * Line 2: Chapter [Number] [Name]
   * Line 3: [ xxx words ]
   */
  const processManuscriptPaste = (rawText: string) => {
    const lines = rawText.split('\n');
    // Get non-empty indices
    const contentLines: { text: string; index: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) {
        contentLines.push({ text: lines[i].trim(), index: i });
        if (contentLines.length === 3) break;
      }
    }

    if (contentLines.length < 2) return;

    let linesToRemove: number[] = [];
    let autoFilled = false;

    // 1. Line 1: Novel Name check
    const possibleTitle = contentLines[0].text;
    const existing = allBooks.find(b => b.title.toLowerCase() === possibleTitle.toLowerCase());
    
    if (existing) {
      setTitle(existing.title);
      setAuthor(existing.author);
      setSelectedGenres(existing.genre);
      linesToRemove.push(contentLines[0].index);
      autoFilled = true;
    } else {
      // Still treat as title if it looks like one
      setTitle(possibleTitle);
      linesToRemove.push(contentLines[0].index);
      autoFilled = true;
    }

    // 2. Line 2: Chapter extraction
    if (contentLines.length >= 2) {
      const chRegex = /chapter\s+(\d+)\s*(.*)/i;
      const match = contentLines[1].text.match(chRegex);
      if (match) {
        setChapterNumber(match[1]);
        setChapterTitle(match[2].trim());
        linesToRemove.push(contentLines[1].index);
        autoFilled = true;
      }
    }

    // 3. Line 3: Word Count check
    if (contentLines.length >= 3) {
      const l3 = contentLines[2].text;
      if (l3.startsWith('[') && l3.toLowerCase().includes('words')) {
        linesToRemove.push(contentLines[2].index);
        autoFilled = true;
      }
    }

    if (autoFilled) {
      const cleanedBody = lines
        .filter((_, idx) => !linesToRemove.includes(idx))
        .join('\n')
        .trim();

      setPastedText(cleanedBody);
      setWasAutoFilled(true);
      toast({ 
        title: "Metadata Deciphered", 
        description: "Bibliographic lines extracted and purged from body." 
      });
    }
  };

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
    } catch (e) {}
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim()) return;
    
    setLoading(true);
    setLoadingMessage('Processing volume...');
    
    try {
      const searchTitle = title.trim();
      const existingBook = allBooks.find(b => b.title.trim().toLowerCase() === searchTitle.toLowerCase());
      const bookId = existingBook?.id || `${Date.now()}_${searchTitle.replace(/\s+/g, '_')}`;
      
      let preParsedChapters: { title: string; content: string }[] | undefined = undefined;
      let manualContent: string | undefined = undefined;

      if (sourceMode === 'file' && selectedFile) {
        if (selectedFile.name.toLowerCase().endsWith('.epub')) {
          setLoadingMessage('Parsing Archive...');
          const zip = await JSZip.loadAsync(selectedFile);
          const containerXml = await zip.file("META-INF/container.xml")?.async("string");
          const parser = new DOMParser();
          const containerDoc = parser.parseFromString(containerXml || "", "text/xml");
          const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
          const opfXml = await zip.file(opfPath || "")?.async("string");
          const opfDoc = parser.parseFromString(opfXml || "", "text/xml");

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
        } else {
          manualContent = await selectedFile.text();
        }
      } else {
        manualContent = pastedText;
      }

      if (uploadMode === 'cloud') {
        if (!canUploadCloud) throw new Error("Cloud publishing restricted.");
        await uploadBookToCloud({
          db: db!, storage: storage!, bookId,
          title: searchTitle, author: author.trim(), genres: selectedGenres,
          rawContent: manualContent, preParsedChapters,
          ownerId: user!.uid,
          manualChapterInfo: manualContent ? { number: parseInt(chapterNumber), title: chapterTitle } : undefined
        });
      } else {
        await saveLocalBook({ 
          id: bookId, title: searchTitle, author: author.trim(), genre: selectedGenres, 
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

      toast({ title: 'Success', description: 'Volume integrated into library.' });
      router.push('/');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOfflineMode || !db || !user || user.isAnonymous) return;
    const checkPermissions = async () => {
      const pRef = doc(db, 'users', user.uid);
      const snap = await getDoc(pRef);
      const permitted = user.email === 'hashamcomp@gmail.com' || snap.data()?.role === 'admin';
      setCanUploadCloud(permitted);
      if (uploadMode === 'cloud' && !permitted) setUploadMode('local');
    };
    checkPermissions();
  }, [user, db, isOfflineMode]);

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-20">
      <Card className="border-none shadow-2xl bg-card/80 backdrop-blur rounded-[2.5rem] overflow-hidden">
        <div className="h-2 bg-primary w-full" />
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-3xl font-headline font-black">Add Volume</CardTitle>
              <CardDescription>Expand your library collection.</CardDescription>
            </div>
            <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-xl">
              <Button size="sm" variant={uploadMode === 'cloud' ? 'default' : 'ghost'} className="rounded-lg h-8 text-[10px] font-black uppercase px-3" onClick={() => setUploadMode('cloud')} disabled={!canUploadCloud}>
                <Globe className="h-3 w-3 mr-1.5" /> Cloud
              </Button>
              <Button size="sm" variant={uploadMode === 'local' ? 'default' : 'ghost'} className="rounded-lg h-8 text-[10px] font-black uppercase px-3" onClick={() => setUploadMode('local')}>
                <HardDrive className="h-3 w-3 mr-1.5" /> Archive
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleUpload} className="space-y-6">
            <div className="grid gap-4">
              <div className="space-y-2 relative" ref={suggestionRef}>
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Series Metadata</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} onFocus={() => setShowSuggestions(filteredSuggestions.length > 0)} placeholder="Novel Title" className="h-12 rounded-xl pl-10" required />
                </div>
                {showSuggestions && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-card border rounded-2xl shadow-2xl overflow-hidden">
                    <ScrollArea className="max-h-[240px]">
                      {filteredSuggestions.map((book) => (
                        <button key={book.id} type="button" onClick={() => { setTitle(book.title); setAuthor(book.author); setSelectedGenres(book.genre); setChapterNumber((book.totalChapters + 1).toString()); setShowSuggestions(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-primary/5 text-left transition-colors border-b last:border-none">
                          <div className="bg-primary/10 p-2 rounded-lg"><Book className="h-4 w-4 text-primary" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{book.title}</p>
                            <p className="text-xs text-muted-foreground truncate">By {book.author}</p>
                          </div>
                          <div className="text-primary font-black text-sm pr-2">{book.totalChapters + 1}</div>
                        </button>
                      ))}
                    </ScrollArea>
                  </div>
                )}
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author Name" className="h-12 rounded-xl" required />
              </div>
              
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Categories</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <div className="min-h-14 w-full cursor-pointer flex flex-wrap gap-2 p-3 border rounded-xl bg-background/50">
                      {selectedGenres.length > 0 ? (
                        selectedGenres.map(g => (
                          <Badge key={g} variant="secondary" className="bg-primary/10 text-primary gap-1.5 px-2 py-1">
                            {g} <X className="h-3 w-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedGenres(p => p.filter(x => x !== g)); }} />
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Select genres...</span>
                      )}
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0 rounded-2xl overflow-hidden border-none shadow-2xl">
                    <ScrollArea className="h-72 p-2">
                      <div className="grid grid-cols-2 gap-1">
                        {GENRES.map(g => (
                          <button key={g} type="button" onClick={() => setSelectedGenres(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g])} className={`w-full text-left p-2 text-[10px] font-bold rounded-lg ${selectedGenres.includes(g) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                            {g}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <Tabs value={sourceMode} onValueChange={v => setSourceMode(v as any)}>
              <TabsList className="grid w-full grid-cols-2 rounded-xl h-12 bg-muted/50 p-1">
                <TabsTrigger value="file" className="rounded-lg font-bold">Upload File</TabsTrigger>
                <TabsTrigger value="text" className="rounded-lg font-bold">Paste Text</TabsTrigger>
              </TabsList>
              <TabsContent value="file" className="p-10 border-2 border-dashed rounded-2xl text-center">
                <input type="file" className="hidden" id="file-upload" onChange={e => { const file = e.target.files?.[0]; if (file) setSelectedFile(file); }} />
                <label htmlFor="file-upload" className="cursor-pointer space-y-3 block">
                  <FileText className="h-8 w-8 text-primary mx-auto opacity-40" />
                  <p className="text-sm font-black uppercase text-primary">{selectedFile ? selectedFile.name : 'Select EPUB or TXT'}</p>
                </label>
              </TabsContent>
              <TabsContent value="text" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Sequence</Label>
                    <Input type="number" value={chapterNumber} onChange={e => setChapterNumber(e.target.value)} placeholder="Ch #" className="rounded-xl h-12" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Chapter Name</Label>
                    <Input placeholder="e.g. Divine Chariot" value={chapterTitle} onChange={e => setChapterTitle(e.target.value)} className="rounded-xl h-12" />
                  </div>
                </div>
                <div className="relative">
                  <Textarea 
                    value={pastedText} 
                    onChange={e => setPastedText(e.target.value)} 
                    onPaste={(e) => { 
                      const text = e.clipboardData.getData('text'); 
                      setTimeout(() => processManuscriptPaste(text), 100); 
                    }}
                    placeholder="Paste novel content here... (Header metadata will be auto-parsed)" 
                    className="min-h-[250px] rounded-2xl p-4 bg-muted/20 resize-none font-body text-base" 
                  />
                  {wasAutoFilled && (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-md animate-in fade-in zoom-in duration-300">
                      <Sparkles className="h-3 w-3" />
                      <span className="text-[9px] font-black uppercase tracking-tighter">Auto-Parsed Metadata</span>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <Button type="submit" className="w-full h-16 text-lg font-black rounded-2xl shadow-xl transition-all hover:scale-[1.01]" disabled={loading || (!selectedFile && !pastedText.trim())}>
              {loading ? (
                <><Loader2 className="animate-spin h-5 w-5 mr-2" /> {loadingMessage || 'Processing...'}</>
              ) : (
                <><CloudUpload className="mr-2 h-5 w-5" />{uploadMode === 'cloud' ? 'Publish to Global Library' : 'Save to Archive'}</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
