"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { initialReadingPreferenceSetup, InitialReadingPreferenceSetupOutput } from '@/ai/flows/initial-reading-preference-setup-flow';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function SetupPage() {
  const router = useRouter();
  const [preferences, setPreferences] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InitialReadingPreferenceSetupOutput | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preferences.trim()) return;

    setLoading(true);
    try {
      const output = await initialReadingPreferenceSetup({ preferences });
      setResult(output);
    } catch (error) {
      console.error("Setup failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-headline font-black mb-4">Set Your Preferences</h1>
            <p className="text-lg text-muted-foreground">
              Tell us what you love to read, and our AI will curate your personal lounge.
            </p>
          </div>

          {!result ? (
            <Card className="border-none shadow-xl bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Describe your ideal book
                </CardTitle>
                <CardDescription>
                  Mention genres, authors, themes, or moods you enjoy. Be as specific as you like!
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <Textarea
                    placeholder="e.g., I love fast-paced mystery novels set in historical cities, similar to Sherlock Holmes. I also enjoy dark, suspenseful thrillers about high-stakes technology..."
                    className="min-h-[150px] text-lg leading-relaxed p-4"
                    value={preferences}
                    onChange={(e) => setPreferences(e.target.value)}
                  />
                  <Button 
                    type="submit" 
                    className="w-full py-6 text-lg bg-primary hover:bg-primary/90 rounded-xl"
                    disabled={loading || !preferences.trim()}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Analyzing Preferences...
                      </>
                    ) : (
                      "Generate My Profile"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <Card className="border-primary/20 shadow-xl overflow-hidden">
                <div className="h-2 bg-primary w-full" />
                <CardHeader>
                  <div className="flex items-center gap-2 text-primary mb-2">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-bold uppercase tracking-widest text-xs">Profile Generated</span>
                  </div>
                  <CardTitle className="text-2xl font-headline font-bold">Your Reading DNA</CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preferred Genres</h3>
                      <div className="flex flex-wrap gap-2">
                        {result.genres.map((g, i) => <Badge key={i} variant="secondary">{g}</Badge>)}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target Mood</h3>
                      <Badge className="bg-accent text-white uppercase px-3 py-1">{result.mood}</Badge>
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Favorite Themes</h3>
                      <div className="flex flex-wrap gap-2">
                        {result.themes.map((t, i) => <Badge key={i} variant="outline" className="border-primary/30 text-primary">{t}</Badge>)}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preferred Length</h3>
                      <Badge variant="outline" className="capitalize">{result.preferredLength}</Badge>
                    </div>
                  </div>

                  <div className="pt-6 border-t">
                    <Button 
                      onClick={() => router.push('/')}
                      className="w-full py-6 text-lg bg-primary hover:bg-primary/90"
                    >
                      Start Reading
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => setResult(null)}
                      className="w-full mt-2 text-muted-foreground"
                    >
                      Redo Setup
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}