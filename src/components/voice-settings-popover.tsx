
'use client';

import { useState, useEffect } from 'react';
import { Volume2, Globe, Play, RefreshCw, Settings, Gauge } from 'lucide-react';
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
import { playTextToSpeech } from '@/lib/tts-service';
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

  const loadVoices = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const available = window.speechSynthesis.getVoices();
      
      // Filter strictly for Daniel, Karen, and Rishi
      const targetNames = ['daniel', 'karen', 'rishi'];
      const filtered = available.filter(v => 
        targetNames.some(name => v.name.toLowerCase().includes(name))
      );
      
      const sortedVoices = filtered.sort((a, b) => a.name.localeCompare(b.name));
      setVoices(sortedVoices);

      // Default Logic: Set Daniel as default if no preference is currently saved
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
  }, []);

  const updateSettings = (updates: Partial<VoiceSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem('lounge-voice-settings', JSON.stringify(newSettings));
  };

  const handleTestVoice = async () => {
    try {
      await playTextToSpeech("This is your selected reading speed and voice in the Lounge.", { 
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
      <PopoverContent className="w-80 rounded-2xl shadow-2xl p-6" align="end">
        <div className="space-y-6">
          <div className="space-y-2">
            <h4 className="font-headline font-black text-lg flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-primary" />
              Narration Settings
            </h4>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
              Custom Reading Experience
            </p>
          </div>

          <div className="space-y-6 pt-4 border-t">
            {/* Voice Selection */}
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground">
                <Globe className="h-3 w-3" /> Voice Profile
              </Label>
              <Select 
                value={settings.voice} 
                onValueChange={(voice) => updateSettings({ voice })}
              >
                <SelectTrigger className="rounded-xl border-muted bg-muted/20 text-xs h-11">
                  <SelectValue placeholder="Select Profile" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-60">
                  {voices.map((v) => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI} className="text-xs font-bold">
                      {v.name}
                    </SelectItem>
                  ))}
                  {voices.length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground flex items-center gap-2">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Searching for profiles...
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Speed Control */}
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
              <div className="flex justify-between text-[9px] font-bold text-muted-foreground/50 uppercase tracking-tighter">
                <span>Slow</span>
                <span>Normal</span>
                <span>Fast</span>
              </div>
            </div>

            <Button 
              variant="secondary" 
              className="w-full h-12 rounded-xl font-bold gap-2 mt-2 shadow-sm" 
              onClick={handleTestVoice}
            >
              <Play className="h-4 w-4" />
              Test Configuration
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
