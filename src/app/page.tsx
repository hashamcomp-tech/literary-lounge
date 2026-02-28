
import Link from 'next/link';
import Navbar from '@/components/navbar';
import RecommendationsSection from '@/components/recommendations-section';
import LocalLibrarySection from '@/components/local-library-section';
import ContinueReadingSection from '@/components/continue-reading-section';
import HeroSection from '@/components/hero-section';
import { Button } from '@/components/ui/button';
import { Compass } from 'lucide-react';

/**
 * @fileOverview Landing Page for Literary Lounge.
 * Curates a sequence of dynamic cloud content, personalized progress, and local browser storage.
 */
export default function Home() {
  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-8">
        {/* Dynamic Display Panel - Curated by Admins */}
        <HeroSection />

        {/* Simplified Discovery Trigger */}
        <div className="flex justify-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
          <Link href="/explore">
            <Button 
              size="lg" 
              className="rounded-full h-16 px-10 text-lg font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 transition-all group"
            >
              <Compass className="mr-2 h-6 w-6 group-hover:rotate-45 transition-transform duration-500" />
              Explore Library
            </Button>
          </Link>
        </div>

        {/* User's personalized progress across Cloud and Archive */}
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

        {/* Your Private Browser Library - Independent of Cloud */}
        <LocalLibrarySection />
      </main>
    </div>
  );
}
