'use client';

import { useState } from 'react';
import Navbar from '@/components/navbar';
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  HelpCircle, 
  BookOpen, 
  Volume2, 
  Cloud, 
  HardDrive, 
  MousePointer2, 
  Mail, 
  MessageSquare, 
  ChevronRight,
  ShieldCheck,
  Zap,
  AlertTriangle,
  Loader2,
  X
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFirestore, useUser } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * @fileOverview Help & Support Center.
 * Provides a structured repository of knowledge for Lounge readers and contributors.
 * Includes a direct reporting feature for bug and feature tracking.
 */
export default function SupportPage() {
  const router = useRouter();
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("Bug");
  const [reportDescription, setReportDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendReport = async () => {
    if (!db || !reportDescription.trim()) return;
    
    setIsSubmitting(true);
    try {
      const reportsRef = collection(db, 'supportReports');
      await addDoc(reportsRef, {
        uid: user?.uid || 'anonymous',
        email: user?.email || 'Guest Reader',
        category: reportCategory,
        description: reportDescription.trim(),
        timestamp: serverTimestamp(),
        status: 'new'
      });

      toast({
        title: "Report Synchronized",
        description: "Your feedback has been sent to the Lounge admins."
      });
      
      setIsReportOpen(false);
      setReportDescription("");
    } catch (err) {
      // Permission errors handled by listener
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="container mx-auto px-4 pt-12">
        <div className="max-w-4xl mx-auto">
          {/* Header Section */}
          <header className="mb-12 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
              <div className="bg-primary/10 p-2.5 rounded-2xl">
                <HelpCircle className="h-6 w-6 text-primary" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Information Bureau</span>
            </div>
            <h1 className="text-5xl font-headline font-black mb-4">Lounge Support</h1>
            <p className="text-xl text-muted-foreground max-w-2xl">
              Navigate the corridors of our digital library with confidence. 
              Find guides on narration, storage, and cloud contribution.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Main FAQ Content */}
            <div className="md:col-span-2 space-y-8">
              <section>
                <h2 className="text-2xl font-headline font-bold mb-6 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Reading & Navigation
                </h2>
                <Accordion type="single" collapsible className="w-full space-y-4">
                  <AccordionItem value="item-1" className="border rounded-2xl px-6 bg-card/50">
                    <AccordionTrigger className="hover:no-underline font-bold text-lg py-6">
                      How does Scroll Restoration work?
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
                      The Lounge automatically tracks your vertical position in every manuscript. 
                      Whether you're in the Cloud Library or your Private Archive, returning to a 
                      book will instantly glide you back to the exact sentence you last read. 
                      No manual bookmarks required.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-2" className="border rounded-2xl px-6 bg-card/50">
                    <AccordionTrigger className="hover:no-underline font-bold text-lg py-6">
                      What is "Merge Next 10 Chapters"?
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
                      For a seamless reading experience, you can combine up to 10 subsequent chapters 
                      into a single scrolling view. This is ideal for long-form narration or continuous 
                      reading without interruption. You can find this button at the bottom of any 
                      active manuscript page.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-3" className="border rounded-2xl px-6 bg-card/50">
                    <AccordionTrigger className="hover:no-underline font-bold text-lg py-6">
                      Can I jump to specific words in narration?
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
                      Yes. Simply click or tap any word while narration is active. The Daniel, 
                      Karen, or Rishi voices will instantly sync to that location and continue 
                      reading from there. The highlighter will follow your lead.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </section>

              <section>
                <h2 className="text-2xl font-headline font-bold mb-6 flex items-center gap-2">
                  <Volume2 className="h-5 w-5 text-primary" />
                  Audio & Narration
                </h2>
                <Accordion type="single" collapsible className="w-full space-y-4">
                  <AccordionItem value="voice-1" className="border rounded-2xl px-6 bg-card/50">
                    <AccordionTrigger className="hover:no-underline font-bold text-lg py-6">
                      Who are the narrators?
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
                      We utilize high-fidelity browser synthesizer profiles named **Daniel**, 
                      **Karen**, and **Rishi**. You can select your preferred narrator profile 
                      via the Floating Audio Settings in the bottom-right corner of any chapter.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="voice-2" className="border rounded-2xl px-6 bg-card/50">
                    <AccordionTrigger className="hover:no-underline font-bold text-lg py-6">
                      How do I fix mispronounced words?
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
                      The Lounge features a personal **Pronunciation Editor**. Open the Audio 
                      Settings and click "Add Word" to map specific text (e.g., "Firebase") to a 
                      phonetic spelling (e.g., "Fire base"). Your settings are saved locally 
                      and apply immediately.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </section>

              <section>
                <h2 className="text-2xl font-headline font-bold mb-6 flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-primary" />
                  Storage & Privacy
                </h2>
                <Accordion type="single" collapsible className="w-full space-y-4">
                  <AccordionItem value="storage-1" className="border rounded-2xl px-6 bg-card/50">
                    <AccordionTrigger className="hover:no-underline font-bold text-lg py-6">
                      Cloud vs. Private Archive?
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
                      **Cloud** books are stored on our servers and available to all readers. 
                      **Private Archive** books are stored exclusively in your browser's memory 
                      (IndexedDB). If you use a different device or clear your browser data, 
                      Archive books will not be accessible unless you publish them to the Cloud.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="storage-2" className="border rounded-2xl px-6 bg-card/50">
                    <AccordionTrigger className="hover:no-underline font-bold text-lg py-6">
                      What is "Independent Mode"?
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
                      If the Lounge detects a loss of network or database connection, it 
                      automatically enters **Independent Mode**. In this state, you can still 
                      access your Private Archive and continue reading previously cached 
                      Cloud manuscripts.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </section>
            </div>

            {/* Side Sidebar - Contact & Reports */}
            <div className="space-y-6">
              <Card className="rounded-[2rem] border-none shadow-xl bg-primary text-primary-foreground overflow-hidden relative">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <AlertTriangle className="h-24 w-24" />
                </div>
                <CardHeader>
                  <CardTitle className="text-xl font-headline font-black">Report a Problem</CardTitle>
                  <CardDescription className="text-primary-foreground/70">Encountered a bug or content issue?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-relaxed">
                    Help us refine the Lounge. Submit a report directly to our technical admins.
                  </p>
                  <Button 
                    variant="secondary" 
                    className="w-full rounded-xl font-bold gap-2"
                    onClick={() => setIsReportOpen(true)}
                  >
                    <MessageSquare className="h-4 w-4" /> Submit Report
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-none shadow-xl bg-card/80 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-lg font-headline font-bold flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                    Security
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase text-muted-foreground">Encryption</span>
                      <span className="text-xs font-bold text-foreground">Cloud-Safe AES</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                    Your reading history and preferences are protected by multi-node 
                    authentication layers.
                  </p>
                </CardContent>
              </Card>

              <div className="p-6 border-2 border-dashed rounded-[2rem] text-center space-y-4">
                <MousePointer2 className="h-8 w-8 text-muted-foreground mx-auto opacity-20" />
                <p className="text-sm font-medium text-muted-foreground">
                  Looking for administrative tools?
                </p>
                <Link href="/admin">
                  <Button variant="ghost" size="sm" className="text-xs font-bold gap-1 text-primary">
                    Lounge Control <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Report Form Dialog */}
      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden max-w-lg">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-3xl font-headline font-black">Support Report</DialogTitle>
            <DialogDescription>Your feedback helps us maintain the Lounge's corridors.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Category</Label>
              <Select value={reportCategory} onValueChange={setReportCategory}>
                <SelectTrigger className="h-12 rounded-xl border-muted bg-muted/20">
                  <SelectValue placeholder="Select issue type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Bug">Bug Report</SelectItem>
                  <SelectItem value="Feature Request">Feature Request</SelectItem>
                  <SelectItem value="Content Issue">Content Issue</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Description</Label>
              <Textarea 
                placeholder="Describe the issue in detail..."
                className="min-h-[150px] rounded-2xl p-4 bg-muted/20 border-none resize-none"
                value={reportDescription}
                onChange={e => setReportDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t flex flex-col sm:flex-row gap-3">
            <Button 
              variant="ghost" 
              onClick={() => setIsReportOpen(false)}
              className="rounded-xl font-bold text-muted-foreground"
            >
              Cancel
            </Button>
            <Button 
              className="rounded-xl font-bold flex-1 h-12 shadow-lg"
              disabled={isSubmitting || !reportDescription.trim()}
              onClick={handleSendReport}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send to Admins"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
