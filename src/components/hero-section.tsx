
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useFirestore, useUser, useDoc, useMemoFirebase, useStorage } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Edit3, Loader2, ImagePlus, Save, X, Sparkles } from 'lucide-react';
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

/**
 * @fileOverview Dynamic Landing Page Hero.
 * Allows administrators to customize the welcome experience in real-time.
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
  const { data: heroData, isLoading } = useDoc(heroRef);

  const [form, setForm] = useState({
    headline: '',
    subheadline: '',
    tagline: '',
    buttonText: '',
    backgroundImageURL: ''
  });

  useEffect(() => {
    if (heroData) {
      setForm({
        headline: heroData.headline || '',
        subheadline: heroData.subheadline || '',
        tagline: heroData.tagline || '',
        buttonText: heroData.buttonText || '',
        backgroundImageURL: heroData.backgroundImageURL || ''
      });
    }
  }, [heroData]);

  // Admin Check
  const profileRef = useMemoFirebase(() => (db && user && !user.isAnonymous) ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile } = useDoc(profileRef);
  const isAdmin = user?.email === 'hashamcomp@gmail.com' || profile?.role === 'admin';

  const handleSave = async () => {
    if (!db) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'hero'), {
        ...form,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      toast({ title: "Display Updated", description: "The Lounge's welcome identity has been synchronized." });
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
      const optimizedBlob = await optimizeCoverImage(file, 1920); // Higher res for hero
      const optimizedFile = new File([optimizedBlob], `hero_bg_${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      // Reusing cover upload logic for hero assets
      const url = await uploadCoverImage(storage, optimizedFile, 'global_hero');
      if (!url) throw new Error("Cloud rejection.");

      setForm(prev => ({ ...prev, backgroundImageURL: url }));
      toast({ title: "Image Prepared", description: "Preview loaded. Click Save to publish globally." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const display = {
    headline: heroData?.headline || "Escape into a <span class='text-primary italic'>new world</span> today.",
    subheadline: heroData?.subheadline || "Explore a sanctuary of hand-picked literature. Your next great chapter is waiting in the Lounge.",
    tagline: heroData?.tagline || "Curation • Connection • Comfort",
    buttonText: heroData?.buttonText || "Explore Library",
    backgroundImageURL: heroData?.backgroundImageURL || ""
  };

  if (isLoading) {
    return <div className="h-[400px] w-full bg-muted/20 animate-pulse rounded-[2.5rem] mb-12" />;
  }

  return (
    <section className="mb-12 group relative">
      {isAdmin && (
        <Button 
          variant="outline" 
          size="icon" 
          className="absolute top-4 right-4 z-20 rounded-full bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => setIsEditing(true)}
        >
          <Edit3 className="h-4 w-4" />
        </Button>
      )}

      <div className="bg-primary/5 rounded-[2.5rem] p-8 sm:p-16 mb-8 relative overflow-hidden border border-primary/10 min-h-[400px] flex items-center">
        {display.backgroundImageURL && (
          <div className="absolute inset-0 z-0">
            <Image 
              src={display.backgroundImageURL} 
              alt="Lounge Background" 
              fill 
              className="object-cover opacity-20 transition-opacity duration-1000"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
          </div>
        )}

        <div className="max-w-2xl relative z-10">
          <div className="flex items-center gap-2 mb-6">
            <span className="h-px w-8 bg-primary/40" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">
              {display.tagline}
            </span>
          </div>
          <h1 
            className="text-5xl sm:text-7xl font-headline font-black mb-6 leading-[1.1]"
            dangerouslySetInnerHTML={{ __html: display.headline }}
          />
          <p className="text-xl text-muted-foreground/80 mb-10 leading-relaxed font-medium">
            {display.subheadline}
          </p>
          <div className="flex gap-4">
            <Link href="/explore">
              <button className="bg-primary text-primary-foreground px-8 py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all">
                {display.buttonText}
              </button>
            </Link>
          </div>
        </div>

        {/* Dynamic Decor Icons */}
        {!display.backgroundImageURL && (
          <>
            <div className="absolute -right-20 -bottom-20 w-[40rem] h-[40rem] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute right-12 top-12 opacity-[0.03] pointer-events-none">
              <svg width="240" height="240" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
          </>
        )}
      </div>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-2xl rounded-[2.5rem] border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-3xl font-headline font-black">Lounge Identity</DialogTitle>
            <DialogDescription>Modify the landing page display for all readers.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Headline (HTML Allowed)</Label>
              <Input 
                value={form.headline} 
                onChange={e => setForm(p => ({ ...p, headline: e.target.value }))}
                placeholder="Escape into a new world..."
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Subheadline</Label>
              <Textarea 
                value={form.subheadline} 
                onChange={e => setForm(p => ({ ...p, subheadline: e.target.value }))}
                placeholder="Describe the experience..."
                className="min-h-[80px] rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Tagline</Label>
                <Input 
                  value={form.tagline} 
                  onChange={e => setForm(p => ({ ...p, tagline: e.target.value }))}
                  placeholder="Curation • Connection..."
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Button Label</Label>
                <Input 
                  value={form.buttonText} 
                  onChange={e => setForm(p => ({ ...p, buttonText: e.target.value }))}
                  placeholder="Explore Library"
                  className="h-12 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Atmosphere Image</Label>
              <div className="flex items-center gap-4">
                {form.backgroundImageURL ? (
                  <div className="relative h-20 w-32 rounded-xl overflow-hidden shadow-inner group/img">
                    <img src={form.backgroundImageURL} className="object-cover h-full w-full" alt="Hero Background" />
                    <button 
                      className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                      onClick={() => setForm(p => ({ ...p, backgroundImageURL: '' }))}
                    >
                      <X className="h-5 w-5 text-white" />
                    </button>
                  </div>
                ) : (
                  <div 
                    className="h-20 w-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5 opacity-30" />}
                    <span className="text-[8px] font-black uppercase mt-1 opacity-40">Upload</span>
                  </div>
                )}
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onFileChange} />
                <div className="flex-1">
                  <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                    Choose a high-definition image to set the mood of the Lounge. 
                    The background will be subtly faded to ensure readability.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t flex gap-3">
            <Button variant="ghost" onClick={() => setIsEditing(false)} className="rounded-xl font-bold text-muted-foreground">Cancel</Button>
            <Button 
              className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8 shadow-lg"
              disabled={isSaving || isUploading}
              onClick={handleSave}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Publish Display
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
