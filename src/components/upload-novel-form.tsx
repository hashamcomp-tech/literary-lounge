'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Upload, BookPlus, Loader2, Book, ShieldCheck, HardDrive, Globe, ImageIcon, CloudUpload, FileType, CloudOff, Sparkles, X, ChevronDown, Check, FileText } from 'lucide-react';
import ePub from 'epubjs';
import { doc, getDoc } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { saveLocalBook, saveLocalChapter } from '@/lib/local-library';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GENRES } from '@/lib/genres';
import { uploadBookToCloud } from '@/lib/upload-book';
import { optimizeCoverImage } from '@/lib/image-utils';
import { identifyBookFromFilename } from '@/ai/flows/identify-book';
import { generateBookCover } from '@/ai/flows/generate-cover';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from '@/components/ui/scroll-area';

export function UploadNovelForm() {
  const router = useRouter();
  const { firestore: db, storage, user, isOfflineMode } = useFirebase();
  const { toast } = useToast();
  
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  
  const [isApprovedUser, setIsApprovedUser] = useState<boolean>(false);
  const [uploadMode, setUploadMode] = useState<'cloud' | 'local'>('cloud');

  const coverInputRef = useRef<HTMLInputElement>(null);
  const isSuperAdmin = user?.email === 'hashamcomp@gmail.com';

  useEffect(() => {
    if (isOfflineMode || !db || !user || user.isAnonymous) return;
    const checkApproval = async () => {
      const pRef = doc(db, 'users', user.uid);
      const snap = await getDoc(pRef);
      if (isSuperAdmin || snap.data()?.role === 'admin') {
        setIsApprovedUser(true);
      } else {
        const settingsRef = doc(db, 'settings', 'approvedEmails');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          const emails = settingsSnap.data().emails || [];
          setIsApprovedUser(emails.includes(user.email!));
        }
      }
    };
    checkApproval();
  }, [user, db, isOfflineMode, isSuperAdmin]);

  const handleAiAutoFill = async () => {
    if (!selectedFile) return;
    setIsIdentifying(true);
    try {
      const result = await identifyBookFromFilename(selectedFile.name);
      if (result.title) setTitle(result.title);
      if (result.author) setAuthor(result.author);
      if (result.genres) setSelectedGenres(result.genres.filter(g => GENRES.includes(g)));
      toast({ title: "Identity Matched", description: `Parsed as: ${result.title}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "AI Search Failed" });
    } finally {
      setIsIdentifying(false);
    }
  };

  const handleManualGenerateCover = async () => {
    if (!title || selectedGenres.length === 0) {
      toast({ variant: "destructive", title: "Missing Metadata", description: "Title and Genre required for AI cover." });
      return;
    }
    setIsGeneratingCover(true);
    try {
      const dataUri = await generateBookCover({ 
        title, 
        author: author || 'Anonymous', 
        genres: selectedGenres 
      });
      const resp = await fetch(dataUri);
      const blob = await resp.blob();
      setCoverFile(new File([blob], 'ai_cover.jpg', { type: 'image/jpeg' }));
      setCoverPreview(dataUri);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Design Failed" });
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return toast({ variant: 'destructive', title: 'Attach Manuscript' });
    if (selectedGenres.length === 0) return toast({ variant: 'destructive', title: 'Select Genres' });
    if (!db) return;

    setLoading(true);
    try {
      setLoadingStatus('Parsing Manuscript...');
      let fullText = "";
      
      if (selectedFile.name.endsWith('.epub')) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const book = ePub(arrayBuffer);
        await book.ready;
        const spine = book.spine;
        const textParts = [];
        // @ts-ignore
        for (const item of spine.items) {
          const chapterDoc = await book.load(item.href);
          // @ts-ignore
          textParts.push(chapterDoc.querySelector('body')?.innerText || "");
        }
        fullText = textParts.join('\n\n');
      } else {
        fullText = await selectedFile.text();
      }

      if (fullText.length < 500) throw new Error("Manuscript appears to be empty or corrupted.");

      setLoadingStatus('Optimizing Assets...');
      let optimizedCover = null;
      if (coverFile) {
        const blob = await optimizeCoverImage(coverFile);
        optimizedCover = new File([blob], coverFile.name, { type: 'image/jpeg' });
      }

      const slugify = (t: string) => t.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '_');
      const docId = `${slugify(author || 'anon')}_${slugify(title || 'book')}_${Date.now()}`;

      if (isApprovedUser && !isOfflineMode && uploadMode === 'cloud') {
        setLoadingStatus('AI Structural Slicing...');
        await uploadBookToCloud({
          db, 
          storage: storage!, 
          bookId: docId,
          title: title || selectedFile.name.replace(/\.[^/.]+$/, ""), 
          author: author || 'Anonymous', 
          genres: selectedGenres, 
          rawContent: fullText, 
          coverFile: optimizedCover, 
          ownerId: user!.uid
        });
        toast({ title: "Published to Cloud", description: "Manuscript divided and secured." });
      } else {
        setLoadingStatus('Archiving Locally...');
        const bookData = { id: docId, title: title || selectedFile.name, author: author || 'Anonymous', genre: selectedGenres, isLocalOnly: true };
        await saveLocalBook(bookData);
        await saveLocalChapter({ bookId: docId, chapterNumber: 1, content: fullText, title: "Private Archive" });
        toast({ title: "Local Archive Saved" });
      }
      router.push('/');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload Blocked", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {isOfflineMode ? (
        <Alert className="bg-amber-500/10 text-amber-700 rounded-xl p-4 border-amber-500/20">
          <CloudOff className="h-4 w-4" />
          <AlertTitle className="font-headline font-black text-sm uppercase tracking-tighter">Independent Mode</AlertTitle>
          <AlertDescription className="text-xs font-medium">Archive stored in your browser's private memory.</AlertDescription>
        </Alert>
      ) : isApprovedUser ? (
        <Alert className="bg-primary/10 text-primary rounded-xl p-4 border-primary/20">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <AlertTitle className="font-headline font-black text-sm uppercase tracking-tighter">Contributor Active</AlertTitle>
          <AlertDescription className="text-xs font-medium">AI-powered structural division and boilerplate purge enabled.</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl rounded-[2rem] overflow-hidden">
        <div className="h-2 bg-primary w-full" />
        <CardHeader className="pb-4">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl font-headline font-black">Publish Volume</CardTitle>
              <CardDescription className="text-xs uppercase tracking-widest font-bold text-muted-foreground mt-1">Lounge Submission Portal</CardDescription>
            </div>
            {selectedFile && (
              <Button size="sm" variant="outline" className="h-8 gap-2 bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 transition-all" onClick={handleAiAutoFill} disabled={isIdentifying}>
                {isIdentifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                <span className="text-[10px] font-black uppercase">AI Auto-Fill</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          <form onSubmit={handleUpload} className="space-y-6">
            {isApprovedUser && !isOfflineMode && (
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10 group transition-all hover:bg-primary/10">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-xl">
                    {uploadMode === 'cloud' ? <Globe className="h-5 w-5 text-primary" /> : <HardDrive className="h-5 w-5 text-primary" />}
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest">{uploadMode === 'cloud' ? 'Global Cloud' : 'Private Mode'}</p>
                    <p className="text-[10px] text-muted-foreground">Toggle publishing destination</p>
                  </div>
                </div>
                <Switch checked={uploadMode === 'cloud'} onCheckedChange={(c) => setUploadMode(c ? 'cloud' : 'local')} />
              </div>
            )}

            <div className="space-y-4">
              <div className="grid gap-4">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Novel Title" className="h-12 rounded-xl bg-background/50 border-none shadow-inner" />
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author Name" className="h-12 rounded-xl bg-background/50 border-none shadow-inner" />
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-12 rounded-xl bg-background/50 border-none shadow-inner text-sm font-medium">
                      <span className="truncate">{selectedGenres.length > 0 ? selectedGenres.join(', ') : 'Select Genres'}</span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0 rounded-2xl shadow-2xl border-none">
                    <ScrollArea className="h-[350px]">
                      <div className="p-3 space-y-1">
                        {GENRES.map((g) => (
                          <button key={g} type="button" onClick={() => setSelectedGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])} className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold rounded-xl transition-all ${selectedGenres.includes(g) ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                            {g} {selectedGenres.includes(g) && <Check className="h-3.5 w-3.5" />}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="pt-2">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block mb-3 ml-1">Visual Identity</Label>
              <div className="flex gap-5 items-center bg-muted/20 p-5 rounded-2xl border border-border/50">
                <div className="w-20 aspect-[2/3] bg-muted/40 rounded-xl overflow-hidden flex items-center justify-center shrink-0 shadow-lg border border-white/10">
                  {coverPreview ? <img src={coverPreview} className="w-full h-full object-cover" /> : <ImageIcon className="h-8 w-8 opacity-10" />}
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if(f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }}} />
                  <Button type="button" variant="outline" size="sm" className="h-10 rounded-xl font-bold border-primary/20" onClick={() => coverInputRef.current?.click()}>
                    Upload Art
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-10 rounded-xl bg-primary/5 text-primary font-bold border-primary/20 gap-2" onClick={handleManualGenerateCover} disabled={isGeneratingCover || !title || selectedGenres.length === 0}>
                    {isGeneratingCover ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI Design
                  </Button>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block mb-3 ml-1">Manuscript Source</Label>
              <div className={`relative border-2 border-dashed rounded-[1.5rem] p-10 transition-all text-center group cursor-pointer ${selectedFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5'}`}>
                <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".epub,.txt" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-3 animate-in zoom-in duration-300">
                    <div className="bg-primary/10 p-3 rounded-full"><FileText className="h-8 w-8 text-primary" /></div>
                    <div className="space-y-1">
                      <p className="text-sm font-black truncate max-w-[300px]">{selectedFile.name}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">{(selectedFile.size / 1024).toFixed(1)} KB Ready</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center opacity-40 gap-3 group-hover:opacity-100 transition-opacity">
                    <BookPlus className="h-10 w-10 text-primary" />
                    <div className="space-y-1">
                      <p className="text-xs font-black uppercase tracking-widest">Attach EPUB or Text</p>
                      <p className="text-[10px] font-medium">Direct ingestion enabled</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Button type="submit" className="w-full h-16 text-lg font-headline font-black rounded-2xl shadow-xl hover:scale-[1.01] transition-all active:scale-95" disabled={loading || !selectedFile}>
              {loading ? <><Loader2 className="mr-3 h-5 w-5 animate-spin" /> {loadingStatus}</> : (
                <span className="flex items-center gap-2">
                  <CloudUpload className="h-5 w-5" />
                  {uploadMode === 'cloud' ? 'Publish to Global Library' : 'Save to Private Archive'}
                </span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}