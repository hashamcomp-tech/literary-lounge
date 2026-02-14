import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import RecommendationsSection from '@/components/recommendations-section';
import { MOCK_NOVELS } from '@/lib/mock-data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Home() {
  const genres = Array.from(new Set(MOCK_NOVELS.map(n => n.genre)));

  return (
    <div className="min-h-screen pb-20">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-8">
        <section className="mb-12">
          <div className="bg-primary/10 rounded-3xl p-8 sm:p-12 mb-8 relative overflow-hidden group">
            <div className="max-w-2xl relative z-10">
              <h1 className="text-4xl sm:text-5xl font-headline font-black mb-4 leading-tight">
                Escape into a <span className="text-primary">new world</span> today.
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                Explore thousands of hand-picked novels across every genre. 
                Your next great adventure is just a chapter away.
              </p>
            </div>
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-accent/20 rounded-full blur-3xl group-hover:bg-accent/30 transition-colors duration-1000" />
            <div className="absolute right-10 top-10 opacity-10">
              <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
          </div>
        </section>

        <RecommendationsSection />

        <section className="space-y-8 mt-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-2xl font-headline font-bold">Browse Library</h2>
            <Tabs defaultValue="all" className="w-full sm:w-auto">
              <TabsList className="bg-muted/50 w-full sm:w-auto overflow-x-auto">
                <TabsTrigger value="all">All Genres</TabsTrigger>
                {genres.map(genre => (
                  <TabsTrigger key={genre} value={genre.toLowerCase()}>
                    {genre}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-8">
            {MOCK_NOVELS.map((novel) => (
              <NovelCard key={novel.id} novel={novel} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}