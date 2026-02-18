'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Upload, BookPlus, Loader2, User, Book, ShieldCheck, HardDrive, Globe, ImageIcon, CloudUpload, FileType, CloudOff, Sparkles, X, ChevronDown, Check } from 'lucide-react';
import ePub from 'epubjs';
import { doc, getDoc } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { saveLocalBook, saveLocalChapter } from '@/lib/local-library';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GENRES } from '@/lib/genres';
import { uploadBookToCloud } from '@/lib/upload-book';
import { uploadCoverImage } from '@/lib/upload-cover';
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
  const [content, setContent] = useState('');
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
      toast({ title: "AI Identification Complete", description: `Matched: ${result.title}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "AI Search Failed" });
    } finally {
      setIsIdentifying(false);
    }
  };

  const handleManualGenerateCover = async () => {
    if (!title || selectedGenres.length === 0) return;
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
      toast({ variant: "destructive", title: "Generation Failed" });
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGenres.length === 0) return toast({ variant: 'destructive', title: 'Select Genres' });
    if (!db) return;

    setLoading(true);
    try {
      let fullText = content;
      if (selectedFile?.name.endsWith('.epub')) {
        setLoadingStatus('Parsing EPUB...');
        const arrayBuffer = await selectedFile.arrayBuffer();
        const book = ePub(arrayBuffer);
        await book.ready;
        const spine = book.spine;
        let textParts = [];
        // @ts-ignore
        for (const item of spine.items) {
          const chapterDoc = await book.load(item.href);
          // @ts-ignore
          textParts.push(chapterDoc.querySelector('body')?.innerHTML || "");
        }
        fullText = textParts.join('\n\n');
      }

      setLoadingStatus('Optimizing Cover...');
      let optimizedCover = null;
      if (coverFile) {
        const blob = await optimizeCoverImage(coverFile);
        optimizedCover = new File([blob], coverFile.name, { type: 'image/jpeg' });
      }

      const slugify = (t: string) => t.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '_');
      const docId = `${slugify(author || 'anon')}_${slugify(title)}_${Date.now()}`;

      if (isApprovedUser && !isOfflineMode && uploadMode === 'cloud') {
        setLoadingStatus('AI Chapter Slicing & Publishing...');
        await uploadBookToCloud({
          db, 
          storage: storage!, 
          bookId: docId,
          title, 
          author: author || 'Anonymous', 
          genres: selectedGenres, 
          rawContent: fullText, 
          coverFile: optimizedCover, 
          ownerId: user!.uid
        });
        toast({ title: "Cloud Published" });
      } else {
        setLoadingStatus('Saving Private Draft...');
        const bookData = { id: docId, title, author: author || 'Anonymous', genre: selectedGenres, isLocalOnly: true };
        await saveLocalBook(bookData);
        await saveLocalChapter({ bookId: docId, chapterNumber: 1, content: fullText, title: "Draft Volume" });
        toast({ title: "Local Draft Saved" });
      }
      router.push('/');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {isOfflineMode ? (
        <Alert className="bg-amber-500/10 text-amber-700 rounded-xl p-4">
          <CloudOff className="h-4 w-4" />
          <AlertTitle className="font-headline font-black text-sm">Independent Mode</AlertTitle>
          <AlertDescription className="text-xs">Saving locally to your browser.</AlertDescription>
        </Alert>
      ) : isApprovedUser ? (
        <Alert className="bg-primary/10 text-primary rounded-xl p-4">
          <CloudUpload className="h-4 w-4" />
          <AlertTitle className="font-headline font-black text-sm">Contributor Mode</AlertTitle>
          <AlertDescription className="text-xs">AI-powered automatic chapter slicing enabled.</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-none shadow-xl bg-card/80 backdrop-blur-xl rounded-[1.5rem] overflow-hidden">
        <div className="h-1.5 bg-primary w-full" />
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-xl font-headline font-black">Manuscript Portal</CardTitle>
              <CardDescription className="text-xs">Submit your volume for processing.</CardDescription>
            </div>
            {isSuperAdmin && selectedFile && (
              <Button size="sm" variant="outline" className="h-8 gap-2 bg-primary/5 text-primary border-primary/20" onClick={handleAiAutoFill} disabled={isIdentifying}>
                {isIdentifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                <span className="text-[10px] font-black uppercase">AI Match</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleUpload} className="space-y-6">
            {isApprovedUser && !isOfflineMode && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/10">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/10 p-1.5 rounded-md">
                    {uploadMode === 'cloud' ? <Globe className="h-4 w-4 text-primary" /> : <HardDrive className="h-4 w-4 text-primary" />}
                  </div>
                  <span className="text-[11px] font-bold uppercase">{uploadMode === 'cloud' ? 'Global Cloud' : 'Private'}</span>
                </div>
                <Switch checked={uploadMode === 'cloud'} onCheckedChange={(c) => setUploadMode(checked ? 'cloud' : 'local')} />
              </div>
            )}

            <div className="grid gap-4">
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author Name" />
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Novel Title" />
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-auto py-2.5 bg-background/50 border-none shadow-inner text-xs">
                    <span className="truncate">{selectedGenres.length > 0 ? selectedGenres.join(', ') : 'Select Genres'}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0 rounded-xl shadow-2xl border-none">
                  <ScrollArea className="h-[300px]">
                    <div className="p-2 space-y-1">
                      {GENRES.map((g) => (
                        <button key={g} type="button" onClick={() => setSelectedGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])} className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-lg ${selectedGenres.includes(g) ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                          {g} {selectedGenres.includes(g) && <Check className="h-3 w-3" />}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            <div className="pt-4 border-t border-border/50">
              <Label className="text-[9px] font-black uppercase tracking-widest block mb-3">Cover Identity</Label>
              <div className="flex gap-4 items-center bg-muted/10 p-4 rounded-xl border border-border/50">
                <div className="w-20 aspect-[2/3] bg-muted/20 rounded-md overflow-hidden flex items-center justify-center shrink-0">
                  {coverPreview ? <img src={coverPreview} className="w-full h-full object-cover" /> : <Book className="h-6 w-6 opacity-20" />}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if(f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }}} />
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => coverInputRef.current?.click()}>Upload File</Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg bg-primary/5 text-primary" onClick={handleManualGenerateCover} disabled={isGeneratingCover || !title || selectedGenres.length === 0}>
                    {isGeneratingCover ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI Design
                  </Button>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border/50">
              <Label className="text-[9px] font-black uppercase tracking-widest block mb-2">Manuscript File</Label>
              <div className={`relative border-2 border-dashed rounded-xl p-6 transition-all text-center ${selectedFile ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'}`}>
                <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".epub" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-1">
                    <FileType className="h-6 w-6 text-primary" />
                    <span className="text-xs font-bold truncate max-w-full">{selectedFile.name}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center opacity-30 gap-1">
                    <BookPlus className="h-6 w-6" />
                    <span className="text-[10px] font-black uppercase tracking-tighter">Attach EPUB</span>
                  </div>
                )}
              </div>
            </div>

            {!selectedFile && (
              <Textarea placeholder="Paste content here..." className="min-h-[150px] rounded-xl bg-background/50 border-none shadow-inner" value={content} onChange={(e) => setContent(e.target.value)} />
            )}

            <Button type="submit" className="w-full py-6 font-headline font-black rounded-xl shadow-lg" disabled={loading || (!title && !selectedFile)}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {loadingStatus || 'Processing...'}</> : 'Publish to Library'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
