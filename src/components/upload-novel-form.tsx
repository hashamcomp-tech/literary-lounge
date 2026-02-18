
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Upload, BookPlus, Loader2, Globe, HardDrive, Sparkles, Send, FileText, ChevronDown, Check, ImageIcon, CloudUpload } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { saveLocalBook, saveLocalChapter } from '@/lib/local-library';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GENRES } from '@/lib/genres';
import { uploadBookToCloud } from '@/lib/upload-book';
import { optimizeCoverImage } from '@/lib/image-utils';
import { parsePastedChapter } from '@/ai/flows/parse-pasted-chapter';
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
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [uploadMode, setUploadMode] = useState<'cloud' | 'local'>('local');

  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOfflineMode || !db || !user || user.isAnonymous) return;
    const checkAdmin = async () => {
      const pRef = doc(db, 'users', user.uid);
      const snap = await getDoc(pRef);
      const isSystemAdmin = user.email === 'hashamcomp@gmail.com' || snap.data()?.role === 'admin';
      setIsAdmin(isSystemAdmin);
      setUploadMode(isSystemAdmin ? 'cloud' : 'local');
    };
    checkAdmin();
  }, [user, db, isOfflineMode]);

  const handleMagicAutoFill = async () => {
    if (!pastedText.trim()) return toast({ variant: 'destructive', title: 'Empty Content', description: 'Paste some text first.' });
    setIsAiAnalyzing(true);
    try {
      const result = await parsePastedChapter(pastedText.substring(0, 2000));
      setTitle(result.bookTitle);
      setAuthor(result.author);
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
      let fullText = sourceMode === 'file' && selectedFile 
        ? await selectedFile.text() 
        : pastedText;

      let optimizedCover = null;
      if (coverFile) {
        const blob = await optimizeCoverImage(coverFile);
        optimizedCover = new File([blob], coverFile.name, { type: 'image/jpeg' });
      }

      const bookId = `${Date.now()}_${title.toLowerCase().replace(/\s+/g, '_')}`;

      if (isAdmin && uploadMode === 'cloud') {
        await uploadBookToCloud({
          db: db!, storage: storage!, bookId,
          title, author, genres: selectedGenres,
          rawContent: fullText, coverFile: optimizedCover,
          ownerId: user!.uid,
          manualChapterInfo: sourceMode === 'text' ? { number: parseInt(chapterNumber), title: chapterTitle } : undefined
        });
        toast({ title: 'Published to Cloud', description: 'Available globally in the Lounge.' });
      } else {
        await saveLocalBook({ id: bookId, title, author, genre: selectedGenres, isLocalOnly: true, coverURL: coverPreview });
        await saveLocalChapter({ bookId, chapterNumber: parseInt(chapterNumber), content: fullText, title: chapterTitle });
        toast({ title: 'Saved to Local Archive', description: 'Private to this browser.' });
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
      {!isAdmin && !user?.isAnonymous && !isOfflineMode && (
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
            {isAdmin && (
              <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-xl">
                <Button 
                  size="sm" 
                  variant={uploadMode === 'cloud' ? 'default' : 'ghost'} 
                  className="rounded-lg h-8 text-[10px] font-black uppercase px-3"
                  onClick={() => setUploadMode('cloud')}
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
            )}
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
                <input type="file" className="hidden" id="file-upload" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
                <label htmlFor="file-upload" className="cursor-pointer space-y-3 block">
                  <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-sm font-black uppercase tracking-widest text-primary">{selectedFile ? selectedFile.name : 'Choose Manuscript'}</p>
                  <p className="text-[10px] text-muted-foreground">Chapters will be auto-indexed</p>
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

            <Button type="submit" className="w-full h-16 text-lg font-black rounded-2xl shadow-xl hover:scale-[1.01] transition-all" disabled={loading}>
              {loading ? <Loader2 className="animate-spin mr-2" /> : <CloudUpload className="mr-2" />}
              {isAdmin && uploadMode === 'cloud' ? 'Publish to Global Cloud' : 'Save to Private Archive'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
