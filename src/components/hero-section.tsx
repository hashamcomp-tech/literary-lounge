'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useFirestore, useUser, useDoc, useMemoFirebase, useStorage, useCollection } from '@/firebase';
import { doc, setDoc, serverTimestamp, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Edit3, Loader2, ImagePlus, Save, X, Sparkles, Video, Plus, Trash2, Book, Info, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { optimizeCoverImage } from '@/lib/image-utils';
import { uploadCoverImage } from '@/lib/upload-cover';
import Image from 'next/image';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from '@/components/ui/badge';

interface HeroSlide {
  id: string;
  headline: string;
  subheadline: string;
  tagline: string;
  buttonText: string;
  backgroundImageURL: string;
  mediaType: 'image' | 'video';
  bookId?: string;
  bookTitle?: string; // Cache for display during editing
}

/**
 * @fileOverview Dynamic Landing Page Hero Carousel.
 * Allows administrators to curate multiple display panels in real-time.
 * Features Slide Deletion and Name-Based Novel Linking.
 */
export default function HeroSection() {
  const db = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const heroRef = useMemoFirebase(() => db ? doc(db, 'settings', 'hero') : null, [db]);
  const { data: heroConfig, isLoading } = useDoc(heroRef);

  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  // Novel Search State
  const [bookSearch, setBookSearch] = useState('');
  const [bookSuggestions, setBookSuggestions] = useState<any[]>([]);
  const [isSearchingBooks, setIsSearchingBooks] = useState(false);

  useEffect(() => {
    if (heroConfig?.slides && heroConfig.slides.length > 0) {
      setSlides(heroConfig.slides);
    } else {
      setSlides([{
        id: 'default',
        headline: "Escape into a <span class='text-primary italic'>new world</span> today.",
        subheadline: "Explore a sanctuary of hand-picked literature. Your next great chapter is waiting in the Lounge.",
        tagline: "Curation • Connection • Comfort",
        buttonText: "Explore Library",
        backgroundImageURL: "",
        mediaType: 'image'
      }]);
    }
  }, [heroConfig]);

  // Admin Check
  const profileRef = useMemoFirebase(() => (db && user && !user.isAnonymous) ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile } = useDoc(profileRef);
  const isAdmin = user?.email === 'hashamcomp@gmail.com' || profile?.role === 'admin';

  const handleSave = async () => {
    if (!db) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'hero'), {
        slides: slides,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      toast({ title: "Lounge Identity Updated", description: "The multi-display rotation has been synchronized." });
      setIsEditing(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update Failed", description: "Permissions restricted." });
    } finally {
      setIsSaving(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !db || !storage) return;

    setIsUploading(true);
    try {
      const isVideo = file.type.startsWith('video/');
      let fileToUpload: File;

      if (isVideo) {
        fileToUpload = file;
      } else {
        const optimizedBlob = await optimizeCoverImage(file, 1920);
        fileToUpload = new File([optimizedBlob], `hero_bg_${Date.now()}.jpg`, { type: 'image/jpeg' });
      }
      
      const url = await uploadCoverImage(storage, fileToUpload, `hero_slide_${Date.now()}`);
      if (!url) throw new Error("Cloud rejection.");

      const updatedSlides = [...slides];
      updatedSlides[activeSlideIndex] = {
        ...updatedSlides[activeSlideIndex],
        backgroundImageURL: url,
        mediaType: isVideo ? 'video' : 'image'
      };
      setSlides(updatedSlides);
      
      toast({ 
        title: isVideo ? "Video Ready" : "Image Ready", 
        description: "Visual assets staged. Click Publish to save globally." 
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const addSlide = () => {
    const newSlide: HeroSlide = {
      id: `slide_${Date.now()}`,
      headline: "New Featured <span class='text-primary italic'>Story</span>",
      subheadline: "Describe why this novel deserves the reader's attention.",
      tagline: "New Arrival",
      buttonText: "Read Now",
      backgroundImageURL: "",
      mediaType: 'image'
    };
    setSlides([...slides, newSlide]);
    setActiveSlideIndex(slides.length);
  };

  const removeSlide = (index: number) => {
    if (slides.length <= 1) {
      toast({ variant: "destructive", title: "Action Blocked", description: "The Lounge requires at least one display panel." });
      return;
    }
    const updated = slides.filter((_, i) => i !== index);
    setSlides(updated);
    setActiveSlideIndex(Math.max(0, index - 1));
  };

  const updateActiveSlide = (key: keyof HeroSlide, value: any) => {
    const updated = [...slides];
    updated[activeSlideIndex] = { ...updated[activeSlideIndex], [key]: value };
    setSlides(updated);
  };

  // Novel Search Logic
  useEffect(() => {
    if (bookSearch.length < 2 || !db) {
      setBookSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingBooks(true);
      try {
        const q = query(
          collection(db, 'books'),
          where('titleLower', '>=', bookSearch.toLowerCase()),
          where('titleLower', '<=', bookSearch.toLowerCase() + '\uf8ff'),
          limit(5)
        );
        const snap = await getDocs(q);
        setBookSuggestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Book search failed", e);
      } finally {
        setIsSearchingBooks(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [bookSearch, db]);

  if (isLoading) {
    return <div className="h-[400px] w-full bg-muted/20 animate-pulse rounded-[2.5rem] mb-12" />;
  }

  const autoplayPlugin = Autoplay({ delay: 6000, stopOnInteraction: true });

  return (
    <section className="mb-12 group relative">
      {isAdmin && (
        <Button 
          variant="outline" 
          size="icon" 
          className="absolute top-4 right-4 z-20 rounded-full bg-background/80 backdrop-blur md:opacity-0 md:group-hover:opacity-100 transition-opacity shadow-lg border-primary/20"
          onClick={() => setIsEditing(true)}
          title="Edit Display Panels"
        >
          <Edit3 className="h-4 w-4 text-primary" />
        </Button>
      )}

      <Carousel 
        plugins={[autoplayPlugin]}
        className="w-full"
        opts={{
          loop: true,
        }}
      >
        <CarouselContent>
          {slides.map((slide) => (
            <CarouselItem key={slide.id}>
              <div className="bg-primary/5 rounded-[2.5rem] p-8 sm:p-16 relative overflow-hidden border border-primary/10 min-h-[450px] flex items-center">
                {slide.backgroundImageURL && (
                  <div className="absolute inset-0 z-0">
                    {slide.mediaType === 'video' ? (
                      <video 
                        src={slide.backgroundImageURL} 
                        autoPlay 
                        loop 
                        muted 
                        playsInline 
                        className="object-cover w-full h-full opacity-20"
                      />
                    ) : (
                      <Image 
                        src={slide.backgroundImageURL} 
                        alt="Background" 
                        fill 
                        className="object-cover opacity-20"
                        priority
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
                  </div>
                )}

                <div className="max-w-2xl relative z-10">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="h-px w-8 bg-primary/40" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">
                      {slide.tagline}
                    </span>
                  </div>
                  <h1 
                    className="text-5xl sm:text-7xl font-headline font-black mb-6 leading-[1.1]"
                    dangerouslySetInnerHTML={{ __html: slide.headline }}
                  />
                  <p className="text-xl text-muted-foreground/80 mb-10 leading-relaxed font-medium">
                    {slide.subheadline}
                  </p>
                  <div className="flex gap-4">
                    <Link href={slide.bookId ? `/pages/${slide.bookId}/1` : '/explore'}>
                      <button className="bg-primary text-primary-foreground px-8 py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all">
                        {slide.buttonText}
                      </button>
                    </Link>
                  </div>
                </div>

                {!slide.backgroundImageURL && (
                  <>
                    <div className="absolute -right-20 -bottom-20 w-[40rem] h-[40rem] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
                    <div className="absolute right-12 top-12 opacity-[0.03] pointer-events-none">
                      <Book className="h-60 w-60" />
                    </div>
                  </>
                )}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {slides.length > 1 && (
          <div className="hidden sm:block">
            <CarouselPrevious className="left-4 bg-background/50 backdrop-blur-sm border-none h-12 w-12" />
            <CarouselNext className="right-4 bg-background/50 backdrop-blur-sm border-none h-12 w-12" />
          </div>
        )}
      </Carousel>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-3xl rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
          <div className="flex flex-col h-[85vh]">
            <div className="bg-primary p-8 text-primary-foreground">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-3xl font-headline font-black">Multi-Display Control</DialogTitle>
                    <DialogDescription className="text-primary-foreground/70">
                      Curate featured novels and atmospheric backgrounds for all readers.
                    </DialogDescription>
                  </div>
                  <Button onClick={addSlide} className="bg-white text-primary hover:bg-white/90 rounded-xl font-bold gap-2">
                    <Plus className="h-4 w-4" /> Add Panel
                  </Button>
                </div>
              </DialogHeader>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar: Slide List */}
              <div className="w-64 border-r bg-muted/20 flex flex-col">
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-2">
                    {slides.map((s, i) => (
                      <div key={s.id} className="relative group/sidebar-item">
                        <button
                          onClick={() => setActiveSlideIndex(i)}
                          className={`w-full text-left p-4 pr-10 rounded-2xl border transition-all flex flex-col gap-1 ${activeSlideIndex === i ? 'bg-primary border-primary text-white shadow-lg' : 'bg-card border-transparent hover:border-primary/20'}`}
                        >
                          <span className={`text-[10px] font-black uppercase tracking-widest ${activeSlideIndex === i ? 'text-white/60' : 'text-muted-foreground'}`}>Panel {i + 1}</span>
                          <span className="font-bold text-xs truncate" dangerouslySetInnerHTML={{ __html: s.headline.replace(/<[^>]*>?/gm, '') }} />
                        </button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className={`absolute top-1/2 -translate-y-1/2 right-2 h-7 w-7 text-red-500 hover:bg-red-500/20 rounded-lg opacity-0 group-hover/sidebar-item:opacity-100 transition-opacity ${activeSlideIndex === i ? 'text-white hover:bg-white/20' : ''}`}
                          onClick={(e) => { e.stopPropagation(); removeSlide(i); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Main Content: Slide Editor */}
              <div className="flex-1 overflow-y-auto p-8">
                <div className="space-y-6">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Headline (HTML Allowed)</Label>
                      <Input 
                        value={slides[activeSlideIndex]?.headline || ''} 
                        onChange={e => updateActiveSlide('headline', e.target.value)}
                        placeholder="Featured Novel..."
                        className="h-12 rounded-xl"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Subheadline</Label>
                      <Textarea 
                        value={slides[activeSlideIndex]?.subheadline || ''} 
                        onChange={e => updateActiveSlide('subheadline', e.target.value)}
                        placeholder="Tell the readers why this story matters..."
                        className="min-h-[80px] rounded-xl resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Atmosphere Tag</Label>
                        <Input 
                          value={slides[activeSlideIndex]?.tagline || ''} 
                          onChange={e => updateActiveSlide('tagline', e.target.value)}
                          placeholder="Trending Now"
                          className="h-12 rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Button Label</Label>
                        <Input 
                          value={slides[activeSlideIndex]?.buttonText || ''} 
                          onChange={e => updateActiveSlide('buttonText', e.target.value)}
                          placeholder="Read Now"
                          className="h-12 rounded-xl"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Featured Novel (Link by Title)</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-40" />
                        <Input 
                          value={bookSearch} 
                          onChange={e => setBookSearch(e.target.value)}
                          placeholder={slides[activeSlideIndex]?.bookTitle || "Search titles to link..."}
                          className="h-12 rounded-xl pl-10"
                        />
                        {isSearchingBooks && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
                      </div>
                      
                      {bookSuggestions.length > 0 && (
                        <div className="bg-card border rounded-xl shadow-xl overflow-hidden mt-1 animate-in fade-in zoom-in-95">
                          {bookSuggestions.map(book => (
                            <button
                              key={book.id}
                              onClick={() => {
                                updateActiveSlide('bookId', book.id);
                                updateActiveSlide('bookTitle', book.title || book.metadata?.info?.bookTitle);
                                setBookSearch('');
                                setBookSuggestions([]);
                                toast({ title: "Novel Linked", description: `Linked to "${book.title || book.metadata?.info?.bookTitle}"` });
                              }}
                              className="w-full text-left p-3 hover:bg-primary/5 flex items-center gap-3 transition-colors border-b last:border-none"
                            >
                              <Book className="h-4 w-4 text-primary opacity-40" />
                              <div className="flex-1">
                                <p className="text-sm font-bold">{book.title || book.metadata?.info?.bookTitle}</p>
                                <p className="text-[10px] text-muted-foreground">By {book.author || book.metadata?.info?.author}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {slides[activeSlideIndex]?.bookId && (
                        <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/10">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-3 w-3 text-primary" />
                            <span className="text-[11px] font-bold text-primary truncate max-w-[200px]">
                              Linked: {slides[activeSlideIndex].bookTitle || "Volume Active"}
                            </span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-red-500"
                            onClick={() => {
                              updateActiveSlide('bookId', '');
                              updateActiveSlide('bookTitle', '');
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between ml-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Atmosphere Media</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground opacity-40 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="text-[10px] max-w-[200px] p-2 rounded-xl">
                              Select a high-resolution image (JPG/PNG) or a short cinematic video (MP4) to play behind the text.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      
                      <div className="flex items-center gap-4 p-4 bg-muted/20 rounded-2xl border-2 border-dashed border-muted group/upload">
                        {slides[activeSlideIndex]?.backgroundImageURL ? (
                          <div className="relative h-24 w-40 rounded-xl overflow-hidden shadow-inner group/img bg-muted/20 flex items-center justify-center">
                            {slides[activeSlideIndex]?.mediaType === 'video' ? (
                              <div className="flex flex-col items-center justify-center">
                                <Video className="h-6 w-6 text-primary" />
                                <span className="text-[8px] font-black uppercase">Video Active</span>
                              </div>
                            ) : (
                              <img src={slides[activeSlideIndex].backgroundImageURL} className="object-cover h-full w-full" alt="Preview" />
                            )}
                            <button 
                              className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                              onClick={() => updateActiveSlide('backgroundImageURL', '')}
                            >
                              <X className="h-5 w-5 text-white" />
                            </button>
                          </div>
                        ) : (
                          <div 
                            className="h-24 w-40 rounded-xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center bg-background cursor-pointer hover:bg-primary/5 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {isUploading ? (
                              <div className="flex flex-col items-center">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                <span className="text-[8px] font-black uppercase mt-1 text-primary">Uploading...</span>
                              </div>
                            ) : (
                              <>
                                <ImagePlus className="h-5 w-5 opacity-30 text-primary" />
                                <span className="text-[8px] font-black uppercase mt-1 opacity-40">Upload Media</span>
                              </>
                            )}
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                            Click the box to upload. Media will be displayed with a subtle overlay behind the text content.
                          </p>
                        </div>
                      </div>
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={onFileChange} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t bg-card flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsEditing(false)} className="rounded-xl font-bold text-muted-foreground">Cancel</Button>
              <Button 
                className="rounded-xl font-black uppercase text-[10px] tracking-widest px-10 h-12 shadow-lg"
                disabled={isSaving || isUploading}
                onClick={handleSave}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Publish Displays
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
