import Link from 'next/link';
import Navbar from '@/components/navbar';
import RecommendationsSection from '@/components/recommendations-section';
import LocalLibrarySection from '@/components/local-library-section';
import ContinueReadingSection from '@/components/continue-reading-section';

export default function Home() {
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
                <Link href="/explore">
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

        {/* User's personalized progress */}
        <ContinueReadingSection />

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

        {/* Your Private Browser Library */}
        <LocalLibrarySection />

        <RecommendationsSection 
          title="Fantasy Favorites" 
          genre="Fantasy" 
          limitCount={3} 
        />
      </main>
    </div>
  );
}
