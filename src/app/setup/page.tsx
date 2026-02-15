
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SlidersHorizontal, Loader2, CheckCircle2 } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [preferences, setPreferences] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preferences.trim()) return;

    setLoading(true);
    // Simulate saving preferences locally
    setTimeout(() => {
      setLoading(false);
      setResult(true);
    }, 1000);
  };

  return (
    <div className="min-h-screen pb-20 bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-headline font-black mb-4">Reading Profile</h1>
            <p className="text-lg text-muted-foreground">
              Define your interests to help us tailor your experience in the Lounge.
            </p>
          </div>

          {!result ? (
            <Card className="border-none shadow-xl bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5 text-primary" />
                  What do you love to read?
                </CardTitle>
                <CardDescription>
                  Share your favorite genres, authors, or narrative themes. This helps us suggest more of what you enjoy.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <Textarea
                    placeholder="e.g., I enjoy historical fiction set in the 19th century, particularly mystery and character-driven dramas..."
                    className="min-h-[150px] text-lg leading-relaxed p-4 rounded-xl border-muted bg-background/50"
                    value={preferences}
                    onChange={(e) => setPreferences(e.target.value)}
                  />
                  <Button 
                    type="submit" 
                    className="w-full py-6 text-lg bg-primary hover:bg-primary/90 rounded-xl font-bold shadow-lg shadow-primary/10"
                    disabled={loading || !preferences.trim()}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Saving Preferences...
                      </>
                    ) : (
                      "Save Profile"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
              <Card className="border-primary/20 shadow-xl overflow-hidden bg-card/80 backdrop-blur">
                <div className="h-2 bg-primary w-full" />
                <CardHeader>
                  <div className="flex items-center justify-center gap-2 text-primary mb-2">
                    <CheckCircle2 className="h-6 w-6" />
                    <span className="font-black uppercase tracking-widest text-xs">Profile Updated</span>
                  </div>
                  <CardTitle className="text-3xl font-headline font-black">Preferences Saved</CardTitle>
                  <CardDescription>Your reading journey is now personalized to your tastes.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <Button 
                    onClick={() => router.push('/')}
                    className="w-full py-6 text-lg bg-primary hover:bg-primary/90 rounded-xl font-bold"
                  >
                    Return to Library
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={() => setResult(false)}
                    className="w-full mt-4 text-muted-foreground hover:text-primary"
                  >
                    Edit Profile Again
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
