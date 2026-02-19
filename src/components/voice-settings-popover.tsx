'use client';

import { useState, useEffect } from 'react';
import { Volume2, Globe, Play, RefreshCw, Settings, Gauge, MessageSquare, Plus, Trash2, Edit3, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { playTextToSpeech, PronunciationMap } from '@/lib/tts-service';
import { useToast } from '@/hooks/use-toast';

export interface VoiceSettings {
  voice: string;
  rate: number;
}

export function VoiceSettingsPopover() {
  const { toast } = useToast();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settings, setSettings] = useState<VoiceSettings>({
    voice: '',
    rate: 1.0,
  });

  // Pronunciation State
  const [pronunciations, setPronunciations] = useState<PronunciationMap>({});
  const [newWord, setNewWord] = useState('');
  const [newSoundsLike, setNewSoundsLike] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const loadVoices = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const available = window.speechSynthesis.getVoices();
      const targetNames = ['daniel', 'karen', 'rishi'];
      const filtered = available.filter(v => 
        targetNames.some(name => v.name.toLowerCase().includes(name))
      );
      const sortedVoices = filtered.sort((a, b) => a.name.localeCompare(b.name));
      setVoices(sortedVoices);

      const saved = localStorage.getItem('lounge-voice-settings');
      if (!saved && sortedVoices.length > 0) {
        const daniel = sortedVoices.find(v => v.name.toLowerCase().includes('daniel'));
        if (daniel) {
          const defaultSettings = { voice: daniel.voiceURI, rate: 1.0 };
          setSettings(defaultSettings);
          localStorage.setItem('lounge-voice-settings', JSON.stringify(defaultSettings));
        }
      }
    }
  };

  useEffect(() => {
    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    const saved = localStorage.getItem('lounge-voice-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({
          voice: parsed.voice || '',
          rate: parsed.rate || 1.0
        });
      } catch (e) {}
    }

    const savedPronunciations = localStorage.getItem('lounge-pronunciations');
    if (savedPronunciations) {
      try { setPronunciations(JSON.parse(savedPronunciations)); } catch (e) {}
    }
  }, []);

  const updateSettings = (updates: Partial<VoiceSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem('lounge-voice-settings', JSON.stringify(newSettings));
  };

  const handleTestVoice = async () => {
    try {
      await playTextToSpeech("Testing your selected reading speed and voice profiles in the Lounge.", { 
        voice: settings.voice,
        rate: settings.rate
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Voice Test Failed",
        description: "Browser speech engine is currently unavailable."
      });
    }
  };

  const handleAddPronunciation = () => {
    if (!newWord.trim() || !newSoundsLike.trim()) return;
    
    const updated = { ...pronunciations, [newWord.trim()]: newSoundsLike.trim() };
    setPronunciations(updated);
    localStorage.setItem('lounge-pronunciations', JSON.stringify(updated));
    setNewWord('');
    setNewSoundsLike('');
    setIsAdding(false);
    toast({ title: "Pronunciation Saved", description: `"${newWord}" will now sound like "${newSoundsLike}".` });
  };

  const handleRemovePronunciation = (word: string) => {
    const updated = { ...pronunciations };
    delete updated[word];
    setPronunciations(updated);
    localStorage.setItem('lounge-pronunciations', JSON.stringify(updated));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className="rounded-full text-muted-foreground border-border/50 hover:bg-muted shadow-sm"
          title="Narration Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] rounded-[2rem] shadow-2xl p-0 overflow-hidden border-none" align="end">
        <div className="bg-primary p-6 text-primary-foreground">
          <h4 className="font-headline font-black text-xl flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Audio Controls
          </h4>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70 mt-1">
            Personalize your listening experience
          </p>
        </div>

        <ScrollArea className="max-h-[500px]">
          <div className="p-6 space-y-8">
            {/* Voice & Speed */}
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-3 w-3" /> Voice Profile
                </Label>
                <Select value={settings.voice} onValueChange={(voice) => updateSettings({ voice })}>
                  <SelectTrigger className="rounded-xl border-muted bg-muted/20 text-xs h-11">
                    <SelectValue placeholder="Select Profile" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {voices.map((v) => (
                      <SelectItem key={v.voiceURI} value={v.voiceURI} className="text-xs font-bold">{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                    <Gauge className="h-3 w-3" /> Reading Speed
                  </Label>
                  <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                    {settings.rate.toFixed(2)}x
                  </span>
                </div>
                <Slider
                  value={[settings.rate]}
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  onValueChange={([val]) => updateSettings({ rate: val })}
                  className="py-2"
                />
              </div>
            </div>

            {/* Pronunciation Editor */}
            <div className="space-y-4 pt-6 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                  <MessageSquare className="h-3 w-3" /> Fix Pronunciation
                </Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[10px] font-black uppercase tracking-tighter text-primary hover:bg-primary/10"
                  onClick={() => setIsAdding(!isAdding)}
                >
                  {isAdding ? <X className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  {isAdding ? "Cancel" : "Add Word"}
                </Button>
              </div>

              {isAdding && (
                <div className="bg-primary/5 p-4 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2">
                  <Input 
                    placeholder="Word (e.g. Firebase)" 
                    value={newWord} 
                    onChange={e => setNewWord(e.target.value)}
                    className="h-9 text-xs rounded-lg border-primary/20"
                  />
                  <Input 
                    placeholder="Sounds like (e.g. Fire base)" 
                    value={newSoundsLike} 
                    onChange={e => setNewSoundsLike(e.target.value)}
                    className="h-9 text-xs rounded-lg border-primary/20"
                  />
                  <Button className="w-full h-9 rounded-lg text-xs font-bold" onClick={handleAddPronunciation}>
                    <Save className="h-3 w-3 mr-2" /> Save Mapping
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {Object.entries(pronunciations).map(([word, soundsLike]) => (
                  <div key={word} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl group hover:bg-muted/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black truncate">{word}</p>
                      <p className="text-[10px] text-muted-foreground italic truncate">Sounds like: {soundsLike}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemovePronunciation(word)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {Object.keys(pronunciations).length === 0 && !isAdding && (
                  <p className="text-[10px] text-center text-muted-foreground py-4 italic">No custom pronunciations added yet.</p>
                )}
              </div>
            </div>

            <Button 
              variant="secondary" 
              className="w-full h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-sm" 
              onClick={handleTestVoice}
            >
              <Play className="h-3 w-3 mr-2" />
              Test Config
            </Button>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
