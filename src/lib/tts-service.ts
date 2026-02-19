/**
 * @fileOverview Native Browser Narration Engine.
 * Utilizes the Web Speech API (speechSynthesis) for zero-latency, unlimited narration.
 * Eliminates cloud subscription dependencies and network latency.
 */

export interface TTSOptions {
  voice?: string; // Voice URI or Name
  rate?: number;
  pitch?: number;
}

let isSpeakingGlobal = false;

/**
 * Instantly stops all browser narration.
 */
export function stopTextToSpeech(): void {
  isSpeakingGlobal = false;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Global status check for the narration engine.
 */
export function isSpeaking(): boolean {
  // We check our internal flag because speechSynthesis.speaking can 
  // stay true during pauses or between utterances.
  return isSpeakingGlobal;
}

/**
 * Core chunking logic to divide text into digestible segments for the browser.
 */
function chunkText(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>?/gm, '')
    .split(/\n\n/)
    .map(p => p.trim())
    .filter(p => p.length > 1);
}

/**
 * Initiates the sequential narration process using native browser voices.
 */
export async function playTextToSpeech(fullText: string, options: TTSOptions = {}): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.warn("Speech Synthesis not supported in this browser.");
    return;
  }

  // 1. Reset state
  stopTextToSpeech();

  const paragraphs = chunkText(fullText);
  if (paragraphs.length === 0) return;

  isSpeakingGlobal = true;

  // 2. Queue up paragraphs
  // Browser handles the queue natively via .speak()
  paragraphs.forEach((para, index) => {
    const utterance = new SpeechSynthesisUtterance(para);
    
    // Configure Voice
    if (options.voice) {
      const voices = window.speechSynthesis.getVoices();
      const selected = voices.find(v => v.voiceURI === options.voice || v.name === options.voice);
      if (selected) utterance.voice = selected;
    }

    utterance.rate = options.rate || 1.0;
    utterance.pitch = options.pitch || 1.0;

    // Last paragraph cleanup
    if (index === paragraphs.length - 1) {
      utterance.onend = () => {
        isSpeakingGlobal = false;
      };
    }

    utterance.onerror = (event) => {
      if (event.error !== 'interrupted') {
        console.error("Speech Synthesis Error:", event);
      }
      isSpeakingGlobal = false;
    };

    window.speechSynthesis.speak(utterance);
  });
}
