import Link from 'next/link';
import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import RecommendationsSection from '@/components/recommendations-section';
import LocalLibrarySection from '@/components/local-library-section';
import { MOCK_NOVELS } from '@/lib/mock-data';
import { GENRES } from '@/lib/genres';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export default function Home() {
  const mockGenres = Array.from(new Set(MOCK_NOVELS.map(n => n.genre)));

  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-8">
        <section className="mb-12">
          <div className="bg-primary/5 rounded-[2.5rem] p-8 sm:p-16 mb-8 relative overflow-hidden group border border-primary/10">
            <div className="max-w-2xl relative z-10">
              <div className="flex items-center gap-2 mb-6">
                <span className="h-px w-8 bg-primary/40" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">Curation • Connection • Comfort</span>
              </div>
              <h1 className="text-5xl sm:text-7xl font-headline font-black mb-6 leading-[1.1]">
                Escape into a <span className="text-primary italic">new world</span> today.
              </h1>
              <p className="text-xl text-muted-foreground/80 mb-10 leading-relaxed font-medium">
                Explore a sanctuary of hand-picked literature. 
                Your next great chapter is waiting in the Lounge.
              </p>
              <div className="flex gap-4">
                <Link href="/search">
                  <button className="bg-primary text-primary-foreground px-8 py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all">
                    Explore Library
                  </button>
                </Link>
              </div>
            </div>
            <div className="absolute -right-20 -bottom-20 w-[40rem] h-[40rem] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute right-12 top-12 opacity-[0.03] pointer-events-none">
              <svg width="240" height="240" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
          </div>
        </section>

        {/* Dynamic Cloud Recommendations - Recently Added */}
        <RecommendationsSection 
          title="New Arrivals" 
          sortBy="createdAt" 
          limitCount={6} 
        />

        {/* Dynamic Cloud Recommendations - Trending */}
        <RecommendationsSection 
          title="Trending Now" 
          sortBy="views" 
          limitCount={6} 
        />

        {/* Browse by Genre Section */}
        <section className="my-20">
          <div className="flex flex-col items-center text-center mb-12">
            <h2 className="text-4xl font-headline font-black mb-4">The Genre Shelf</h2>
            <p className="text-muted-foreground max-w-md">Discovery through diverse perspectives and timeless themes.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-9 gap-4">
            {GENRES.map((genre) => (
              <Link 
                key={genre} 
                href={`/genre/${encodeURIComponent(genre)}`}
                className="group"
              >
                <div className="h-full px-4 py-8 bg-card border border-transparent hover:border-primary/20 hover:bg-primary/5 rounded-3xl transition-all duration-500 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-xl">
                  <span className="font-headline font-bold text-sm group-hover:text-primary transition-colors">
                    {genre}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Your Private Browser Library */}
        <LocalLibrarySection />

        <RecommendationsSection 
          title="Fantasy Favorites" 
          genre="Fantasy" 
          limitCount={3} 
        />

        {/* Curated Library */}
        <section className="space-y-12 mt-20 pt-20 border-t">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <h2 className="text-3xl font-headline font-black">Mock Collection</h2>
            <Tabs defaultValue="all" className="w-full sm:w-auto">
              <TabsList className="bg-muted/50 w-full sm:w-auto overflow-x-auto p-1 rounded-2xl">
                <TabsTrigger value="all" className="rounded-xl px-6">All</TabsTrigger>
                {mockGenres.map(genre => (
                  <TabsTrigger key={genre} value={genre.toLowerCase()} className="rounded-xl px-6">
                    {genre}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
            {MOCK_NOVELS.map((novel) => (
              <NovelCard key={novel.id} novel={novel} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}