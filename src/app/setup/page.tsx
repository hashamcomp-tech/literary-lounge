"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function SetupPage() {
  const router = useRouter();
  const [preferences, setPreferences] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preferences.trim()) return;

    setLoading(true);
    try {
      // AI generation has been removed
      alert("AI Preference analysis is currently unavailable.");
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
              Tell us what you love to read, and we'll help curate your personal lounge.
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
                    placeholder="e.g., I love fast-paced mystery novels set in historical cities, similar to Sherlock Holmes..."
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
                      "Submit Preferences"
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
                    <span className="font-bold uppercase tracking-widest text-xs">Profile Saved</span>
                  </div>
                  <CardTitle className="text-2xl font-headline font-bold">Your Reading Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
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
                      Update Setup
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
