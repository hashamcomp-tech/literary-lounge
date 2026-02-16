
'use client';

import { useState, useEffect } from 'react';
import { Settings2, Volume2, Globe, Gauge } from 'lucide-react';
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

export interface VoiceSettings {
  lang: string;
  rate: string;
}

const LANGUAGES = [
  { label: 'English (US)', value: 'en-us' },
  { label: 'English (UK)', value: 'en-gb' },
  { label: 'English (AU)', value: 'en-au' },
  { label: 'English (CA)', value: 'en-ca' },
  { label: 'Spanish (ES)', value: 'es-es' },
  { label: 'French (FR)', value: 'fr-fr' },
];

export function VoiceSettingsPopover() {
  const [settings, setSettings] = useState<VoiceSettings>({
    lang: 'en-us',
    rate: '0',
  });

  useEffect(() => {
    const saved = localStorage.getItem('lounge-voice-settings');
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  const updateSettings = (updates: Partial<VoiceSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem('lounge-voice-settings', JSON.stringify(newSettings));
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
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 rounded-2xl shadow-2xl p-6" align="end">
        <div className="space-y-6">
          <div className="space-y-2">
            <h4 className="font-headline font-black text-lg flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-primary" />
              Voice Settings
            </h4>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
              Customize your reading voice
            </p>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                <Globe className="h-3 w-3" /> Language & Accent
              </Label>
              <Select 
                value={settings.lang} 
                onValueChange={(lang) => updateSettings({ lang })}
              >
                <SelectTrigger className="rounded-xl border-muted bg-muted/20">
                  <SelectValue placeholder="Select Language" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                  <Gauge className="h-3 w-3" /> Speech Rate
                </Label>
                <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {settings.rate}
                </span>
              </div>
              <Slider
                value={[parseInt(settings.rate)]}
                min={-10}
                max={10}
                step={1}
                onValueChange={([val]) => updateSettings({ rate: val.toString() })}
                className="py-4"
              />
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest opacity-40">
                <span>Slow</span>
                <span>Normal</span>
                <span>Fast</span>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
