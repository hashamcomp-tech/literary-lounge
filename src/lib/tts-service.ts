/**
 * @fileOverview Native Browser Narration Engine.
 * Utilizes the Web Speech API (speechSynthesis) for zero-latency, unlimited narration.
 * Implements Sentence-Level Chunking and Progress Persistence.
 */

export interface TTSOptions {
  voice?: string; // Voice URI or Name
  rate?: number;
  pitch?: number;
  contextId?: string; // Unique identifier to save/resume progress (e.g. "cloud-123-ch-1")
}

let isSpeakingGlobal = false;
let currentSessionId = 0;

/**
 * Instantly stops all browser narration and invalidates pending callbacks.
 * @param resetProgress If true, clears the saved index for the provided contextId.
 */
export function stopTextToSpeech(resetProgress = false, contextId?: string): void {
  isSpeakingGlobal = false;
  currentSessionId++; // Invalidate any callbacks from previous sessions
  
  if (typeof window !== 'undefined') {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    if (resetProgress && contextId) {
      localStorage.removeItem(`lounge-audio-progress-${contextId}`);
    }
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
 */
function chunkText(text: string): string[] {
  if (!text) return [];
  
  const clean = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>?/gm, '')
    .trim();

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

/**
 * Helper to create a simple hash of a string to verify if text has changed.
 */
function getTextHash(text: string): string {
  return text.substring(0, 50) + text.length;
}

/**
 * Initiates the sequential narration process with progress persistence.
 */
export async function playTextToSpeech(fullText: string, options: TTSOptions = {}): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.warn("Speech Synthesis not supported in this browser.");
    return;
  }

  // 1. Reset state and start a new session
  // We don't reset progress here because we might be resuming
  stopTextToSpeech(false);
  
  const sessionId = currentSessionId;
  const sentences = chunkText(fullText);
  if (sentences.length === 0) return;

  const contextKey = options.contextId ? `lounge-audio-progress-${options.contextId}` : null;
  let startIndex = 0;

  // 2. Resume logic
  if (contextKey) {
    const saved = localStorage.getItem(contextKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only resume if the content seems to be the same
        if (parsed.textHash === getTextHash(fullText)) {
          startIndex = parsed.index;
        }
      } catch (e) {}
    }
  }

  isSpeakingGlobal = true;

  // Small safety delay for the browser to clear the previous cancel()
  setTimeout(() => {
    if (sessionId !== currentSessionId || !isSpeakingGlobal) return;

    sentences.forEach((sentence, index) => {
      // Skip sentences if we are resuming
      if (index < startIndex) return;

      const utterance = new SpeechSynthesisUtterance(sentence);
      
      if (options.voice && options.voice !== '') {
        const voices = window.speechSynthesis.getVoices();
        const selected = voices.find(v => v.voiceURI === options.voice || v.name === options.voice);
        if (selected) utterance.voice = selected;
      }

      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;

      utterance.onstart = () => {
        if (sessionId === currentSessionId && contextKey) {
          localStorage.setItem(contextKey, JSON.stringify({
            index,
            textHash: getTextHash(fullText)
          }));
        }
      };

      utterance.onend = () => {
        // If this was the last sentence, cleanup progress
        if (sessionId === currentSessionId && index === sentences.length - 1) {
          isSpeakingGlobal = false;
          if (contextKey) localStorage.removeItem(contextKey);
        }
      };

      utterance.onerror = (event) => {
        const expectedErrors = ['interrupted', 'canceled'];
        if (sessionId === currentSessionId) {
          if (!expectedErrors.includes(event.error)) {
            console.error("Speech Synthesis Error:", event.error);
          }
          if (index === sentences.length - 1) {
            isSpeakingGlobal = false;
          }
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  }, 50);
}
