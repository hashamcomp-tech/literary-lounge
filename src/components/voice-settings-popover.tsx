
'use client';

import { useState, useEffect } from 'react';
import { Volume2, Globe, Play, RefreshCw } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { playTextToSpeech } from '@/lib/tts-service';
import { useToast } from '@/hooks/use-toast';

export interface VoiceSettings {
  voice: string;
}

export function VoiceSettingsPopover() {
  const { toast } = useToast();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settings, setSettings] = useState<VoiceSettings>({
    voice: '', // Initialized empty, will be set to Daniel by default logic if needed
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
          const defaultSettings = { voice: daniel.voiceURI };
          setSettings(defaultSettings);
          localStorage.setItem('lounge-voice-settings', JSON.stringify(defaultSettings));
        }
      }
    }
  };

  useEffect(() => {
    loadVoices();
    // Some browsers load voices asynchronously
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    const saved = localStorage.getItem('lounge-voice-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings(parsed);
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
      await playTextToSpeech("This is your selected reading voice in the Lounge.", { voice: settings.voice });
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
          title="Voice Settings"
        >
          <Volume2 className="h-4 w-4" />
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
              Exclusive Voice Profiles
            </p>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                <Globe className="h-3 w-3" /> Voice Profile
              </Label>
              <Select 
                value={settings.voice} 
                onValueChange={(voice) => updateSettings({ voice })}
              >
                <SelectTrigger className="rounded-xl border-muted bg-muted/20 text-xs">
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

            <Button 
              variant="secondary" 
              className="w-full rounded-xl font-bold gap-2 mt-2" 
              onClick={handleTestVoice}
            >
              <Play className="h-4 w-4" />
              Test Voice
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
