
import Link from 'next/link';
import Navbar from '@/components/navbar';
import RecommendationsSection from '@/components/recommendations-section';
import LocalLibrarySection from '@/components/local-library-section';
import ContinueReadingSection from '@/components/continue-reading-section';
import HeroSection from '@/components/hero-section';

export default function Home() {
  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-8">
        {/* Dynamic Display Panel */}
        <HeroSection />

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
      </main>
    </div>
  );
}
