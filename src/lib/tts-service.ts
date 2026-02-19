/**
 * @fileOverview Native Browser Narration Engine.
 * Utilizes the Web Speech API (speechSynthesis) for zero-latency, unlimited narration.
 * Implements Sentence-Level Chunking for maximum reliability.
 */

export interface TTSOptions {
  voice?: string; // Voice URI or Name
  rate?: number;
  pitch?: number;
}

let isSpeakingGlobal = false;
let currentSessionId = 0;

/**
 * Instantly stops all browser narration and invalidates pending callbacks.
 */
export function stopTextToSpeech(): void {
  isSpeakingGlobal = false;
  currentSessionId++; // Invalidate any callbacks from previous sessions
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Global status check for the narration engine.
 */
export function isSpeaking(): boolean {
  return isSpeakingGlobal;
}

/**
 * Granular chunking logic to divide text into small sentence segments.
 * Smaller chunks prevent browser "speech hang" on long text blocks.
 */
function chunkText(text: string): string[] {
  if (!text) return [];
  
  // 1. Clean HTML and artifacts
  const clean = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>?/gm, '')
    .trim();

  // 2. Split by common sentence boundaries
  // This regex matches [.!?] followed by a space, keeping the punctuation attached to the preceding text
  const parts = clean.split(/([.!?]\s+)/);
  
  const chunks: string[] = [];
  let buffer = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    // If it's just punctuation/space, attach to previous
    if (/^[.!?]\s+$/.test(part)) {
      if (chunks.length > 0) {
        chunks[chunks.length - 1] += part.trim();
      } else {
        buffer += part.trim();
      }
    } else {
      chunks.push(part.trim());
    }
  }

  // Filter out any very short or empty chunks
  return chunks.filter(c => c.length > 1);
}

/**
 * Initiates the sequential narration process using native browser voices.
 */
export async function playTextToSpeech(fullText: string, options: TTSOptions = {}): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.warn("Speech Synthesis not supported in this browser.");
    return;
  }

  // 1. Reset state and start a new session
  stopTextToSpeech();
  
  const sessionId = currentSessionId;
  const sentences = chunkText(fullText);
  if (sentences.length === 0) return;

  isSpeakingGlobal = true;

  // Small delay to ensure the browser has processed the cancel() call from step 1
  setTimeout(() => {
    if (sessionId !== currentSessionId || !isSpeakingGlobal) return;

    sentences.forEach((sentence, index) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
      
      // Configure Voice from preferences
      if (options.voice && options.voice !== '' && options.voice !== 'system-default') {
        const voices = window.speechSynthesis.getVoices();
        const selected = voices.find(v => v.voiceURI === options.voice || v.name === options.voice);
        if (selected) utterance.voice = selected;
      }

      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;

      // Completion tracker for UI state synchronization
      utterance.onend = () => {
        // Only reset global state if this is the final chunk of the ACTIVE session
        if (sessionId === currentSessionId && index === sentences.length - 1) {
          isSpeakingGlobal = false;
        }
      };

      utterance.onerror = (event) => {
        // Ignore expected errors triggered by intentional cancellation (stop button)
        const expectedErrors = ['interrupted', 'canceled'];
        
        if (sessionId === currentSessionId) {
          if (!expectedErrors.includes(event.error)) {
            console.error("Speech Synthesis Error:", event.error);
          }
          
          // Reset global flag on actual errors or end of sequence
          if (index === sentences.length - 1) {
            isSpeakingGlobal = false;
          }
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  }, 50);
}
