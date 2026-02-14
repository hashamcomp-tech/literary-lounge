"use client";

import { useEffect, useState } from 'react';
// AI generation disabled
// import { personalizedNovelRecommendations, PersonalizedNovelRecommendationsOutput } from '@/ai/flows/personalized-novel-recommendations-flow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, BookOpen } from 'lucide-react';
import Link from 'next/link';

export default function RecommendationsSection() {
  const [recommendations, setRecommendations] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false); // Set to false since we aren't fetching

  useEffect(() => {
    // AI generation disabled
    /*
    async function fetchRecs() {
      try {
        const result = await personalizedNovelRecommendations({
          readingHistory: [
            { title: "The Whispering Woods", author: "Elena Vance", genre: "Fantasy" }
          ],
          preferredGenres: ["Mystery", "Sci-Fi"],
          preferredAuthors: ["Julian Black"]
        });
        setRecommendations(result.recommendations);
      } catch (error) {
        console.error("Failed to fetch recommendations", error);
      } finally {
        setLoading(false);
      }
    }
    fetchRecs();
    */
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="h-5 w-5 text-accent" />
          <h2 className="text-2xl font-headline font-bold">Recommended for You</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!recommendations || recommendations.length === 0) return null;

  return (
    <div className="py-8">
      <div className="flex items-center gap-2 mb-6">
        <Sparkles className="h-5 w-5 text-accent animate-pulse" />
        <h2 className="text-2xl font-headline font-bold">Personalized Picks</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {recommendations.map((rec, i) => (
          <Card key={i} className="bg-card/50 border-none shadow-sm hover:shadow-md transition-all duration-300 group">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start gap-2">
                <CardTitle className="text-lg font-headline font-bold group-hover:text-primary transition-colors">
                  {rec.title}
                </CardTitle>
                <div className="bg-accent/10 p-1 rounded">
                  <BookOpen className="h-4 w-4 text-accent" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground font-medium">{rec.author}</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm line-clamp-3 text-muted-foreground mb-4 leading-relaxed">
                {rec.summary}
              </p>
              <div className="flex items-center justify-between mt-auto">
                <span className="text-[10px] uppercase font-bold text-accent tracking-tighter bg-accent/5 px-2 py-0.5 rounded-full border border-accent/10">
                  {rec.genre}
                </span>
                <Link href={`/search?q=${encodeURIComponent(rec.title)}`} className="text-xs font-bold text-primary hover:underline">
                  Find in library
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
