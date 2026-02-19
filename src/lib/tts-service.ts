/**
 * @fileOverview Refined Sequential TTS Engine with Autoplay Policy handling.
 * Handles long-form content by chunking text into individual lines/sentences 
 * and playing them in a queue for maximum responsiveness.
 */

export interface TTSOptions {
  lang?: string;
  rate?: string;
}

// Reuse a single audio element to maintain "unlocked" status from user gestures
let globalAudio: HTMLAudioElement | null = null;

if (typeof window !== 'undefined') {
  globalAudio = new Audio();
}

let textQueue: string[] = [];
let currentQueueIndex = 0;
let isSpeakingGlobal = false;
let currentOptions: TTSOptions = {};

/**
 * Stops any currently playing TTS audio and clears the playback queue.
 */
export function stopTextToSpeech(): void {
  isSpeakingGlobal = false;
  textQueue = [];
  currentQueueIndex = 0;
  
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.currentTime = 0;
    // Cleanup blob URLs to prevent memory leaks
    if (globalAudio.src && globalAudio.src.startsWith('blob:')) {
      URL.revokeObjectURL(globalAudio.src);
    }
    globalAudio.src = "";
  }
}

/**
 * Checks if the service is currently active.
 */
export function isSpeaking(): boolean {
  return isSpeakingGlobal;
}

/**
 * Internal helper to fetch and play a specific chunk.
 */
async function playChunk(index: number): Promise<void> {
  if (!isSpeakingGlobal || index >= textQueue.length || !globalAudio) {
    isSpeakingGlobal = false;
    return;
  }

  const text = textQueue[index];
  if (!text || text.trim().length === 0) {
    return playNextChunk();
  }

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        text: text.substring(0, 1000), // API reliability cap
        lang: currentOptions.lang || 'en-us',
        rate: currentOptions.rate || '0'
      })
    });

    if (!response.ok) {
      throw new Error("TTS chunk request failed.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    // Revoke previous blob if applicable
    const oldSrc = globalAudio.src;
    
    globalAudio.src = url;

    globalAudio.onended = () => {
      if (oldSrc.startsWith('blob:')) URL.revokeObjectURL(oldSrc);
      playNextChunk();
    };

    globalAudio.onerror = () => {
      console.warn("Audio playback error, attempting next chunk...");
      if (oldSrc.startsWith('blob:')) URL.revokeObjectURL(oldSrc);
      playNextChunk();
    };

    // Playback is permitted because we unlocked the element in the initial click handler
    await globalAudio.play().catch(err => {
      console.error("Playback failed after source swap:", err);
      isSpeakingGlobal = false;
    });

  } catch (error) {
    console.error("Chunk playback processing error:", error);
    isSpeakingGlobal = false;
  }
}

function playNextChunk() {
  currentQueueIndex++;
  playChunk(currentQueueIndex);
}

/**
 * Splits text into individual lines and sentences.
 * This ensures the engine loads "one line at a time" as requested.
 */
function chunkText(text: string): string[] {
  // 1. Clean HTML artifacts
  const cleanText = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>?/gm, '')
    .trim();

  // 2. Split by sentences and line breaks
  // This matches periods, question marks, and exclamation points followed by space or newline
  const sentences = cleanText.split(/([.!?]+(?:\s+|\n+|$))/);
  
  const finalUnits: string[] = [];
  let currentUnit = "";

  for (const part of sentences) {
    if (part.match(/[.!?]/)) {
      // It's a delimiter, attach to current unit and finish it
      currentUnit += part;
      if (currentUnit.trim()) finalUnits.push(currentUnit.trim());
      currentUnit = "";
    } else {
      // It's text, or newline
      if (part.includes('\n')) {
        // If there's a hard newline, break the current unit if it exists
        if (currentUnit.trim()) finalUnits.push(currentUnit.trim());
        currentUnit = part.replace(/\n/g, ' '); // Keep the newline text for splitting but normalize space
      } else {
        currentUnit += part;
      }
    }
  }
  
  if (currentUnit.trim()) finalUnits.push(currentUnit.trim());

  // Filter out empty strings and items that are just whitespace
  return finalUnits.filter(u => u.trim().length > 0);
}

/**
 * Initiates the line-by-line reading process.
 */
export async function playTextToSpeech(fullText: string, options: TTSOptions = {}): Promise<void> {
  // Stop any existing session
  stopTextToSpeech();

  if (!fullText || fullText.trim().length === 0 || !globalAudio) return;

  // Prepare new session
  currentOptions = options;
  textQueue = chunkText(fullText);
  currentQueueIndex = 0;
  isSpeakingGlobal = true;

  if (textQueue.length === 0) {
    isSpeakingGlobal = false;
    return;
  }

  // UNLOCK: Call play() immediately on the persistent audio element 
  // with a silent source to satisfy browser Autoplay policies.
  globalAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFRm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  try {
    await globalAudio.play();
  } catch (e) {
    // Proceed; playChunk will attempt the first real segment.
  }

  // Start the actual queue
  return playChunk(0);
}
