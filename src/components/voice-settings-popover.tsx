
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
    voice: '', // Default to empty string (System Default)
  });

  const loadVoices = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const available = window.speechSynthesis.getVoices();
      
      // Shorten the list to the most used English variants for literature
      const commonLocales = ['en-US', 'en-GB', 'en-AU', 'en-IN', 'en-CA'];
      const filtered = available.filter(v => 
        commonLocales.some(locale => v.lang.startsWith(locale))
      );
      
      setVoices(filtered.sort((a, b) => a.name.localeCompare(b.name)));
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
              Powered by Browser Native Voice
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
                  <SelectValue placeholder="System Default" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-60">
                  <SelectItem value="system-default" className="text-xs font-bold">
                    System Default
                  </SelectItem>
                  {voices.map((v) => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI} className="text-xs">
                      {v.name} ({v.lang})
                    </SelectItem>
                  ))}
                  {voices.length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground flex items-center gap-2">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Loading common voices...
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
