import Link from 'next/link';
import Navbar from '@/components/navbar';
import RecommendationsSection from '@/components/recommendations-section';
import LocalLibrarySection from '@/components/local-library-section';
import ContinueReadingSection from '@/components/continue-reading-section';
import HeroSection from '@/components/hero-section';
import ExploreBar from '@/components/explore-bar';

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

        {/* Slim Discovery Bar */}
        <ExploreBar />

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
