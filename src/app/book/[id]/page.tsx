"use client";

import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { doc, setDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import Navbar from '@/components/navbar';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  BookOpen, 
  User, 
  Layers, 
  Eye, 
  Clock, 
  Star, 
  Share2, 
  Facebook, 
  Twitter, 
  MessageCircle, 
  Bookmark, 
  MessageSquare,
  Crown,
  PlayCircle,
  Loader2
} from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

/**
 * @fileOverview Novel Details Page.
 * Styled to match high-traffic web novel portals.
 * Features cinematic header, metadata grid, and social share actions.
 */
export default function BookDetailsPage() {
  const { id } = useParams() as { id: string };
  const { user } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const bookRef = useMemoFirebase(() => id ? doc(db, 'books', id) : null, [db, id]);
  const { data: book, isLoading } = useDoc(bookRef);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen bg-background text-center py-20">
        <Navbar />
        <h1 className="text-2xl font-bold">Volume not found in the Lounge.</h1>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/')}>Back Home</Button>
      </div>
    );
  }

  const genres = Array.isArray(book.genre) ? book.genre : [book.genre];
  const coverImg = book.coverURL || book.metadata?.info?.coverURL || `https://picsum.photos/seed/${id}/400/600`;

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-6xl mx-auto">
          <Breadcrumbs 
            items={[
              { label: 'Novel', href: '/explore' },
              { label: genres[0] || 'General', href: `/explore?genre=${genres[0]}` },
              { label: book.title }
            ]} 
          />

          {/* Cinematic Header */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
            {/* Column 1: Vertical Cover */}
            <div className="lg:col-span-3">
              <div className="relative aspect-[150/220] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 group">
                <Image 
                  src={coverImg} 
                  alt={book.title} 
                  fill 
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  priority
                />
                <div className="absolute top-4 left-4">
                  <Badge className="bg-amber-500 text-amber-950 font-black px-3 py-1 gap-1 border-none shadow-lg">
                    <Crown className="h-3 w-3" /> RANK 1
                  </Badge>
                </div>
              </div>
            </div>

            {/* Column 2: Metadata & Info */}
            <div className="lg:col-span-9 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {genres.map((g: string) => (
                    <Badge key={g} variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-bold uppercase text-[10px] tracking-widest px-3">
                      {g}
                    </Badge>
                  ))}
                </div>
                
                <h1 className="text-5xl font-headline font-black mb-2 leading-tight">{book.title}</h1>
                <p className="text-xl text-muted-foreground italic mb-8">By {book.author || 'Anonymous Author'}</p>

                {/* Info Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div className="bg-card/50 border rounded-2xl p-4 text-center">
                    <div className="text-[10px] font-black uppercase text-muted-foreground/60 mb-1 tracking-widest">Chapters</div>
                    <div className="text-xl font-headline font-black text-foreground">{book.metadata?.info?.totalChapters || 1}</div>
                  </div>
                  <div className="bg-card/50 border rounded-2xl p-4 text-center">
                    <div className="text-[10px] font-black uppercase text-muted-foreground/60 mb-1 tracking-widest">Views</div>
                    <div className="text-xl font-headline font-black text-foreground">{book.views?.toLocaleString() || 0}</div>
                  </div>
                  <div className="bg-card/50 border rounded-2xl p-4 text-center">
                    <div className="text-[10px] font-black uppercase text-muted-foreground/60 mb-1 tracking-widest">Bookmarks</div>
                    <div className="text-xl font-headline font-black text-foreground">1.2k</div>
                  </div>
                  <div className="bg-card/50 border rounded-2xl p-4 text-center">
                    <div className="text-[10px] font-black uppercase text-muted-foreground/60 mb-1 tracking-widest">Status</div>
                    <div className="text-xl font-headline font-black text-green-600">On Going</div>
                  </div>
                </div>

                {/* Rating Bar */}
                <div className="flex items-center gap-4 mb-8 py-4 border-y">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="h-5 w-5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div className="text-sm font-bold">4.92 <span className="text-muted-foreground font-normal">(128 Votes)</span></div>
                </div>
              </div>

              {/* Action Stack */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={() => router.push(`/pages/${id}/1`)} 
                  className="flex-1 h-16 rounded-2xl text-lg font-black uppercase tracking-widest shadow-xl shadow-primary/20 gap-2"
                >
                  <PlayCircle className="h-6 w-6" /> Start Reading
                </Button>
                <Button 
                  variant="outline" 
                  className="h-16 px-10 rounded-2xl font-black uppercase tracking-widest border-primary/20 text-primary bg-primary/5 hover:bg-primary/10 gap-2"
                >
                  <Bookmark className="h-5 w-5" /> Add to Library
                </Button>
              </div>
            </div>
          </div>

          {/* Summary Section */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-8 space-y-10">
              <div className="space-y-6">
                <h2 className="text-2xl font-headline font-black flex items-center gap-3">
                  <div className="h-8 w-1.5 bg-primary rounded-full" />
                  Synopsis
                </h2>
                <div className="prose prose-slate dark:prose-invert max-w-none text-lg leading-relaxed text-muted-foreground font-medium italic bg-card/30 p-8 rounded-3xl border">
                  {book.summary || book.metadata?.info?.summary || "The Lounge's administrative panel has not yet synchronized a narrative overview for this volume. Explore the chapters to discover the secrets within."}
                </div>
              </div>

              {/* Social Interaction Bar */}
              <div className="flex flex-wrap items-center gap-4 p-6 bg-muted/30 rounded-[2rem] border border-dashed">
                <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mr-2 flex items-center gap-2">
                  <Share2 className="h-4 w-4" /> Share Story
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="rounded-full h-10 w-10 p-0 bg-[#1877F2] border-none text-white hover:bg-[#1877F2]/90"><Facebook className="h-4 w-4 fill-current" /></Button>
                  <Button variant="outline" size="sm" className="rounded-full h-10 w-10 p-0 bg-[#1DA1F2] border-none text-white hover:bg-[#1DA1F2]/90"><Twitter className="h-4 w-4 fill-current" /></Button>
                  <Button variant="outline" size="sm" className="rounded-full h-10 w-10 p-0 bg-[#FF4500] border-none text-white hover:bg-[#FF4500]/90"><div className="font-black text-[10px]">RED</div></Button>
                  <Button variant="outline" size="sm" className="rounded-full h-10 w-10 p-0 bg-[#0088CC] border-none text-white hover:bg-[#0088CC]/90"><MessageCircle className="h-4 w-4 fill-current" /></Button>
                </div>
              </div>
            </div>

            {/* Sidebar: Sub-info */}
            <div className="lg:col-span-4 space-y-8">
              <div className="bg-card/50 border rounded-[2.5rem] p-8 space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  Network Discussion
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Connect with other readers currently exploring this volume in our live chat corridors.
                </p>
                <Link href={`/chat/${id}`} className="block">
                  <Button variant="outline" className="w-full h-14 rounded-2xl font-bold gap-2 border-primary/20 text-primary">
                    <MessageSquare className="h-4 w-4" /> Join Discussion Lounge
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
