'use client';

import { useState, useEffect } from 'react';
import { Volume2, Globe, Play, Loader2 } from 'lucide-react';
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

const VOICES = [
  { label: 'Algenib (Neutral)', value: 'Algenib' },
  { label: 'Achernar (Deep)', value: 'Achernar' },
  { label: 'Hamal (Soft)', value: 'Hamal' },
  { label: 'Rigel (Commanding)', value: 'Rigel' },
  { label: 'Fenrir (Expressive)', value: 'Fenrir' },
];

export function VoiceSettingsPopover() {
  const { toast } = useToast();
  const [isTesting, setIsTesting] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings>({
    voice: 'Algenib',
  });

  useEffect(() => {
    const saved = localStorage.getItem('lounge-voice-settings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.warn("Could not parse saved voice settings");
      }
    }
  }, []);

  const updateSettings = (updates: Partial<VoiceSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem('lounge-voice-settings', JSON.stringify(newSettings));
  };

  const handleTestVoice = async () => {
    setIsTesting(true);
    try {
      await playTextToSpeech("Welcome to the Literary Lounge. This is your selected AI narration voice.", { voice: settings.voice });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Narration Unavailable",
        description: err.message || "Failed to initialize the AI voice."
      });
    } finally {
      setIsTesting(false);
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
              AI Voice Settings
            </h4>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
              Powered by Gemini Flash
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
                <SelectTrigger className="rounded-xl border-muted bg-muted/20">
                  <SelectValue placeholder="Select Voice" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {VOICES.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              variant="secondary" 
              className="w-full rounded-xl font-bold gap-2 mt-2" 
              onClick={handleTestVoice}
              disabled={isTesting}
            >
              {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Test Voice
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
