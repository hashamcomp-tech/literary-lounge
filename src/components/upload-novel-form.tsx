"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Upload, BookPlus, Loader2, Globe, HardDrive, Sparkles, Send, FileText, ChevronDown, Check, ImageIcon, CloudUpload, BrainCircuit } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { saveLocalBook, saveLocalChapter } from '@/lib/local-library';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GENRES } from '@/lib/genres';
import { uploadBookToCloud } from '@/lib/upload-book';
import { uploadManuscriptFile } from '@/lib/upload-cover';
import { parsePastedChapter } from '@/ai/flows/parse-pasted-chapter';
import { identifyBookFromFilename } from '@/ai/flows/identify-book';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

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
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  
  const [canUploadCloud, setCanUploadCloud] = useState<boolean>(false);
  const [uploadMode, setUploadMode] = useState<'cloud' | 'local'>('local');

  // Load persistent storage mode preference
  useEffect(() => {
    const savedMode = localStorage.getItem("lounge-upload-mode") as 'cloud' | 'local';
    if (savedMode === 'cloud' || savedMode === 'local') {
      setUploadMode(savedMode);
    }
  }, []);

  // Save storage mode preference on change
  useEffect(() => {
    localStorage.setItem("lounge-upload-mode", uploadMode);
  }, [uploadMode]);

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

  const handleFileChange = async (file: File) => {
    setSelectedFile(file);
    setIsIdentifying(true);
    try {
      // Trigger AI identification based on filename
      const result = await identifyBookFromFilename(file.name);
      if (result.title) setTitle(result.title);
      if (result.author) setAuthor(result.author);
      if (result.genres && result.genres.length > 0) {
        // Intersect identified genres with our supported list
        const validGenres = result.genres.filter(g => GENRES.includes(g));
        if (validGenres.length > 0) setSelectedGenres(validGenres);
      }
      toast({ 
        title: 'AI Librarian Active', 
        description: `Identified: ${result.title || 'Unknown Title'} by ${result.author || 'Unknown Author'}` 
      });
    } catch (err) {
      console.warn("AI Identification failed, proceeding with manual entry.");
    } finally {
      setIsIdentifying(false);
    }
  };

  const handleMagicAutoFill = async () => {
    if (!pastedText.trim()) return toast({ variant: 'destructive', title: 'Empty Content', description: 'Paste some text first.' });
    setIsAiAnalyzing(true);
    try {
      const result = await parsePastedChapter(pastedText.substring(0, 2000));
      setTitle(result.bookTitle);
      setChapterNumber(result.chapterNumber.toString());
      setChapterTitle(result.chapterTitle);
      toast({ title: 'AI Detection Complete', description: 'Metadata extracted from the manuscript.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'AI Detection Failed', description: 'Could not parse the text structure.' });
    } finally {
      setIsAiAnalyzing(false);
    }
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
      toast({ title: 'Request Sent', description: 'Admins will review your contributor application.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Request Failed' });
    } finally {
      setIsRequestingAccess(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const bookId = `${Date.now()}_${title.toLowerCase().replace(/\s+/g, '_')}`;
      const isEpub = selectedFile?.name.toLowerCase().endsWith('.epub');

      if (uploadMode === 'cloud') {
        if (!canUploadCloud) throw new Error("You don't have permission to publish to the cloud.");
        
        if (sourceMode === 'file' && selectedFile && isEpub) {
          // 1. Upload raw EPUB to temporary manuscript storage
          const fileUrl = await uploadManuscriptFile(storage!, selectedFile, bookId);
          
          // 2. Call server-side ingest API to parse and store clean chapters
          const response = await fetch('/api/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileUrl,
              ownerId: user!.uid,
              overrideMetadata: {
                title: title || undefined,
                author: author || undefined,
                genres: selectedGenres.length > 0 ? selectedGenres : undefined
              }
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.details || "Server-side ingestion failed.");
          }
          toast({ title: 'Cloud Processing Complete', description: 'Volume published to global library.' });
        } else {
          // Single chapter/Text mode
          const text = sourceMode === 'file' && selectedFile ? await selectedFile.text() : pastedText;
          await uploadBookToCloud({
            db: db!, storage: storage!, bookId,
            title, author, genres: selectedGenres,
            rawContent: text, ownerId: user!.uid,
            manualChapterInfo: sourceMode === 'text' ? { number: parseInt(chapterNumber), title: chapterTitle } : undefined
          });
          toast({ title: 'Published to Cloud', description: 'Available globally in the Lounge.' });
        }
      } else {
        // Local Archive Mode
        if (sourceMode === 'file' && selectedFile && isEpub) {
          // Use the server's EPUB parser but keep the result private
          const fileUrl = await uploadManuscriptFile(storage!, selectedFile, bookId);
          const response = await fetch('/api/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              fileUrl, 
              returnOnly: true, 
              overrideMetadata: { title, author, genres: selectedGenres } 
            })
          });

          if (!response.ok) throw new Error("Failed to parse EPUB for private archive.");
          
          const { book } = await response.json();
          await saveLocalBook({ 
            id: bookId, 
            title: book.title, 
            author: book.author, 
            genre: book.genres, 
            isLocalOnly: true,
            totalChapters: book.chapters.length
          });
          
          for (let i = 0; i < book.chapters.length; i++) {
            await saveLocalChapter({ 
              bookId, 
              chapterNumber: i + 1, 
              content: book.chapters[i].content, 
              title: book.chapters[i].title 
            });
          }
          toast({ title: 'Saved to Local Archive', description: `Volume parsed (${book.chapters.length} chapters) and archived privately.` });
        } else {
          // Single Chapter Local
          let fullText = sourceMode === 'file' && selectedFile ? await selectedFile.text() : pastedText;
          await saveLocalBook({ id: bookId, title, author, genre: selectedGenres, isLocalOnly: true, coverURL: coverPreview });
          await saveLocalChapter({ bookId, chapterNumber: parseInt(chapterNumber), content: fullText, title: chapterTitle });
          toast({ title: 'Saved to Local Archive', description: 'Private to this browser.' });
        }
      }
      router.push('/');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-20">
      {!canUploadCloud && !user?.isAnonymous && !isOfflineMode && (
        <Alert className="bg-primary/5 border-primary/20 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <AlertTitle className="font-black text-primary">Join the Contributors</AlertTitle>
              <AlertDescription className="text-xs">Apply for access to publish novels to the global cloud library.</AlertDescription>
            </div>
            <Button size="sm" variant="outline" onClick={handleRequestAccess} disabled={isRequestingAccess} className="rounded-xl border-primary/30 text-primary hover:bg-primary/10">
              {isRequestingAccess ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
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
              <CardDescription>Upload files or paste text snippets.</CardDescription>
            </div>
            <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-xl">
              <Button 
                size="sm" 
                variant={uploadMode === 'cloud' ? 'default' : 'ghost'} 
                className="rounded-lg h-8 text-[10px] font-black uppercase px-3"
                onClick={() => setUploadMode('cloud')}
                disabled={!canUploadCloud && !isOfflineMode}
              >
                <Globe className="h-3 w-3 mr-1.5" /> Cloud
              </Button>
              <Button 
                size="sm" 
                variant={uploadMode === 'local' ? 'default' : 'ghost'} 
                className="rounded-lg h-8 text-[10px] font-black uppercase px-3"
                onClick={() => setUploadMode('local')}
              >
                <HardDrive className="h-3 w-3 mr-1.5" /> Local
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleUpload} className="space-y-6">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Metadata</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Novel Title" className="h-12 rounded-xl" required />
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author Name" className="h-12 rounded-xl" required />
              </div>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-12 rounded-xl text-muted-foreground">
                    <span className="truncate">{selectedGenres.length > 0 ? selectedGenres.join(', ') : 'Select Genres'}</span>
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
                <TabsTrigger value="file" className="rounded-lg font-bold">EPUB/Text File</TabsTrigger>
                <TabsTrigger value="text" className="rounded-lg font-bold">Paste Text</TabsTrigger>
              </TabsList>
              <TabsContent value="file" className="p-10 border-2 border-dashed rounded-2xl text-center hover:bg-muted/30 transition-colors">
                <input 
                  type="file" 
                  className="hidden" 
                  id="file-upload" 
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileChange(file);
                  }} 
                />
                <label htmlFor="file-upload" className="cursor-pointer space-y-3 block">
                  {isIdentifying ? (
                    <div className="py-4 space-y-4">
                      <div className="relative mx-auto w-16 h-16">
                        <Loader2 className="h-16 w-16 animate-spin text-primary opacity-20 absolute inset-0" />
                        <BrainCircuit className="h-10 w-10 text-primary absolute inset-3 animate-pulse" />
                      </div>
                      <p className="text-sm font-black uppercase tracking-widest text-primary animate-pulse">AI Examining Manuscript...</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText className="h-8 w-8 text-primary" />
                      </div>
                      <p className="text-sm font-black uppercase tracking-widest text-primary">{selectedFile ? selectedFile.name : 'Choose Manuscript'}</p>
                      <p className="text-[10px] text-muted-foreground">EPUBs are auto-parsed; TXTs are read as single chapters</p>
                    </>
                  )}
                </label>
              </TabsContent>
              <TabsContent value="text" className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Chapter Details</Label>
                  <Button 
                    type="button" 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 gap-2 bg-primary/5 text-primary rounded-lg hover:bg-primary/10" 
                    onClick={handleMagicAutoFill} 
                    disabled={isAiAnalyzing || !pastedText.trim()}
                  >
                    {isAiAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    <span className="text-[10px] font-black uppercase">Magic Auto-Fill</span>
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input type="number" placeholder="Ch #" value={chapterNumber} onChange={e => setChapterNumber(e.target.value)} className="rounded-xl h-12" />
                  <Input placeholder="Chapter Title" value={chapterTitle} onChange={e => setChapterTitle(e.target.value)} className="rounded-xl h-12" />
                </div>
                <Textarea value={pastedText} onChange={e => setPastedText(e.target.value)} placeholder="Paste manuscript snippet here..." className="min-h-[250px] rounded-2xl p-4 bg-muted/20" />
              </TabsContent>
            </Tabs>

            <Button type="submit" className="w-full h-16 text-lg font-black rounded-2xl shadow-xl hover:scale-[1.01] transition-all" disabled={loading || isIdentifying}>
              {loading ? <Loader2 className="animate-spin mr-2" /> : <CloudUpload className="mr-2" />}
              {uploadMode === 'cloud' ? 'Publish to Global Cloud' : 'Save to Private Archive'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
