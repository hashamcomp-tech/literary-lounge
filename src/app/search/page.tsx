import Navbar from '@/components/navbar';
import NovelCard from '@/components/novel-card';
import { searchNovels } from '@/lib/mock-data';
import { Search } from 'lucide-react';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q || '';
  const results = searchNovels(query);

  return (
    <div className="min-h-screen pb-20">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-muted p-2 rounded-lg">
            <Search className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-headline font-bold">Search Results</h1>
            <p className="text-muted-foreground">
              {results.length} results found for &quot;{query}&quot;
            </p>
          </div>
        </div>

        {results.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-8">
            {results.map((novel) => (
              <NovelCard key={novel.id} novel={novel} />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="bg-muted w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="h-10 w-10 text-muted-foreground opacity-20" />
            </div>
            <h2 className="text-xl font-bold mb-2">No novels found</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              We couldn&apos;t find any novels matching your search. Try different keywords or browse our library.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}