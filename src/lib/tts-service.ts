
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
 * Core chunking logic to divide text into digestible segments for the browser.
 */
function chunkText(text: string): string[] {
  if (!text) return [];
  // Split into paragraphs, clean HTML, and remove very short fragments
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

  // 1. Reset state and start a new session
  stopTextToSpeech();
  
  const sessionId = currentSessionId;
  const paragraphs = chunkText(fullText);
  if (paragraphs.length === 0) return;

  isSpeakingGlobal = true;

  // Use a slight delay to ensure the browser has processed the cancel() call
  setTimeout(() => {
    // If the session changed or global speaking flag was reset during the timeout, abort
    if (sessionId !== currentSessionId || !isSpeakingGlobal) return;

    paragraphs.forEach((para, index) => {
      const utterance = new SpeechSynthesisUtterance(para);
      
      // Configure Voice
      // Handle "system-default" or empty string as browser default
      if (options.voice && options.voice !== '' && options.voice !== 'system-default') {
        const voices = window.speechSynthesis.getVoices();
        const selected = voices.find(v => v.voiceURI === options.voice || v.name === options.voice);
        if (selected) utterance.voice = selected;
      }

      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;

      // Completion tracker
      utterance.onend = () => {
        // Only update global state if this callback belongs to the active session
        if (sessionId === currentSessionId && index === paragraphs.length - 1) {
          isSpeakingGlobal = false;
        }
      };

      utterance.onerror = (event) => {
        // Ignore expected errors during intentional cancellation
        const ignoreErrors = ['interrupted', 'canceled'];
        
        if (sessionId === currentSessionId) {
          if (!ignoreErrors.includes(event.error)) {
            console.error("Speech Synthesis Error:", event.error);
          }
          
          // Reset global flag on actual errors or end of sequence
          if (index === paragraphs.length - 1) {
            isSpeakingGlobal = false;
          }
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  }, 50);
}
