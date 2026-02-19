/**
 * @fileOverview Native Browser Narration Engine.
 * Utilizes the Web Speech API (speechSynthesis) for zero-latency, unlimited narration.
 * Implements Sentence-Level Chunking, Progress Persistence, and Custom Pronunciation.
 */

export interface PronunciationMap {
  [word: string]: string;
}

export interface TTSOptions {
  voice?: string; 
  rate?: number;
  pitch?: number;
  contextId?: string; 
}

let isSpeakingGlobal = false;
let currentSessionId = 0;

/**
 * Instantly stops all browser narration.
 */
export function stopTextToSpeech(resetProgress = false, contextId?: string): void {
  isSpeakingGlobal = false;
  currentSessionId++; 
  
  if (typeof window !== 'undefined') {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    if (resetProgress && contextId) {
      localStorage.removeItem(`lounge-audio-progress-${contextId}`);
    }
  }
}

export function isSpeaking(): boolean {
  return isSpeakingGlobal;
}

/**
 * Applies user-defined pronunciations to text.
 */
function applyPronunciations(text: string): string {
  try {
    const saved = localStorage.getItem('lounge-pronunciations');
    if (!saved) return text;
    
    const map: PronunciationMap = JSON.parse(saved);
    let processed = text;

    // Sort keys by length descending to prevent partial matches 
    // (e.g. replacing "fire" before "firebase")
    const words = Object.keys(map).sort((a, b) => b.length - a.length);

    for (const word of words) {
      const soundsLike = map[word];
      if (!word || !soundsLike) continue;
      
      // Use word boundary regex for precise matching
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      processed = processed.replace(regex, soundsLike);
    }

    return processed;
  } catch (e) {
    return text;
  }
}

/**
 * Granular chunking logic to divide text into small sentence segments.
 */
function chunkText(text: string): string[] {
  if (!text) return [];
  
  const clean = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>?/gm, '')
    .trim();

  // Split by sentence boundaries but keep the punctuation
  const parts = clean.split(/([.!?]\s+)/);
  
  const chunks: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    if (/^[.!?]\s+$/.test(part)) {
      if (chunks.length > 0) {
        chunks[chunks.length - 1] += part.trim();
      }
    } else {
      chunks.push(part.trim());
    }
  }

  return chunks.filter(c => c.length > 1);
}

function getTextHash(text: string): string {
  return text.substring(0, 50) + text.length;
}

/**
 * Initiates the sequential narration process.
 */
export async function playTextToSpeech(fullText: string, options: TTSOptions = {}): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  stopTextToSpeech(false);
  
  const sessionId = currentSessionId;
  const processedText = applyPronunciations(fullText);
  const sentences = chunkText(processedText);
  if (sentences.length === 0) return;

  const contextKey = options.contextId ? `lounge-audio-progress-${options.contextId}` : null;
  let startIndex = 0;

  if (contextKey) {
    const saved = localStorage.getItem(contextKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.textHash === getTextHash(processedText)) {
          startIndex = parsed.index;
        }
      } catch (e) {}
    }
  }

  isSpeakingGlobal = true;

  setTimeout(() => {
    if (sessionId !== currentSessionId || !isSpeakingGlobal) return;

    sentences.forEach((sentence, index) => {
      if (index < startIndex) return;

      const utterance = new SpeechSynthesisUtterance(sentence);
      
      const voices = window.speechSynthesis.getVoices();
      const selected = voices.find(v => v.voiceURI === options.voice || v.name === options.voice);
      if (selected) utterance.voice = selected;

      // Real-time check: fetch latest rate from settings for each utterance
      const savedSettings = localStorage.getItem('lounge-voice-settings');
      let currentRate = options.rate || 1.0;
      if (savedSettings) {
        try { currentRate = JSON.parse(savedSettings).rate || currentRate; } catch (e) {}
      }

      utterance.rate = currentRate;
      utterance.pitch = options.pitch || 1.0;

      utterance.onstart = () => {
        if (sessionId === currentSessionId && contextKey) {
          localStorage.setItem(contextKey, JSON.stringify({
            index,
            textHash: getTextHash(processedText)
          }));
        }
      };

      utterance.onend = () => {
        if (sessionId === currentSessionId && index === sentences.length - 1) {
          isSpeakingGlobal = false;
          if (contextKey) localStorage.removeItem(contextKey);
        }
      };

      utterance.onerror = (event) => {
        if (sessionId === currentSessionId && index === sentences.length - 1) {
          isSpeakingGlobal = false;
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  }, 50);
}
