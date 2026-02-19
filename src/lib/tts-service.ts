/**
 * @fileOverview Refined Sequential TTS Engine with Look-Ahead Pre-loading.
 * Handles long-form content by chunking text into individual lines/sentences 
 * and pre-fetching the next segment while the current one plays.
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

// Pre-loading state
let preloadedUrl: string | null = null;
let preloadedIndex = -1;
let isPreloading = false;

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

  // Cleanup pre-loaded resource
  if (preloadedUrl) {
    URL.revokeObjectURL(preloadedUrl);
    preloadedUrl = null;
    preloadedIndex = -1;
  }
}

/**
 * Checks if the service is currently active.
 */
export function isSpeaking(): boolean {
  return isSpeakingGlobal;
}

/**
 * Internal helper to fetch audio for a specific text chunk.
 */
async function fetchAudioBlobUrl(text: string): Promise<string> {
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
  return URL.createObjectURL(blob);
}

/**
 * Look-ahead fetch for the next chunk in the queue.
 */
async function preloadNextChunk(index: number) {
  if (index >= textQueue.length || isPreloading || !isSpeakingGlobal) return;
  
  // If we already have this index preloaded, skip
  if (preloadedIndex === index) return;

  // Cleanup old preloaded URL if it wasn't used
  if (preloadedUrl) {
    URL.revokeObjectURL(preloadedUrl);
    preloadedUrl = null;
  }

  isPreloading = true;
  try {
    const text = textQueue[index];
    if (text && text.trim().length > 0) {
      preloadedUrl = await fetchAudioBlobUrl(text);
      preloadedIndex = index;
    }
  } catch (e) {
    console.warn("Preload failed for index", index, e);
  } finally {
    isPreloading = false;
  }
}

/**
 * Internal helper to play a specific chunk.
 */
async function playChunk(index: number): Promise<void> {
  if (!isSpeakingGlobal || index >= textQueue.length || !globalAudio) {
    isSpeakingGlobal = false;
    return;
  }

  const text = textQueue[index];
  if (!text || text.trim().length === 0) {
    currentQueueIndex++;
    return playChunk(currentQueueIndex);
  }

  try {
    let url: string;

    // Use pre-loaded URL if available
    if (preloadedIndex === index && preloadedUrl) {
      url = preloadedUrl;
      preloadedUrl = null;
      preloadedIndex = -1;
    } else {
      // Fetch immediately if not pre-loaded
      url = await fetchAudioBlobUrl(text);
    }

    const oldSrc = globalAudio.src;
    globalAudio.src = url;

    globalAudio.onended = () => {
      if (oldSrc.startsWith('blob:')) URL.revokeObjectURL(oldSrc);
      currentQueueIndex++;
      playChunk(currentQueueIndex);
    };

    globalAudio.onerror = () => {
      console.warn("Audio playback error, attempting next chunk...");
      if (oldSrc.startsWith('blob:')) URL.revokeObjectURL(oldSrc);
      currentQueueIndex++;
      playChunk(currentQueueIndex);
    };

    // Playback is permitted because we unlocked the element in the initial click handler
    await globalAudio.play().catch(err => {
      console.error("Playback failed after source swap:", err);
      isSpeakingGlobal = false;
    });

    // While current is playing, trigger preload for NEXT
    preloadNextChunk(index + 1);

  } catch (error) {
    console.error("Chunk playback processing error:", error);
    isSpeakingGlobal = false;
  }
}

/**
 * Splits text into individual lines and sentences.
 */
function chunkText(text: string): string[] {
  const cleanText = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>?/gm, '')
    .trim();

  // Split by sentences and line breaks
  const sentences = cleanText.split(/([.!?]+(?:\s+|\n+|$))/);
  
  const finalUnits: string[] = [];
  let currentUnit = "";

  for (const part of sentences) {
    if (part.match(/[.!?]/)) {
      currentUnit += part;
      if (currentUnit.trim()) finalUnits.push(currentUnit.trim());
      currentUnit = "";
    } else {
      if (part.includes('\n')) {
        if (currentUnit.trim()) finalUnits.push(currentUnit.trim());
        currentUnit = part.replace(/\n/g, ' '); 
      } else {
        currentUnit += part;
      }
    }
  }
  
  if (currentUnit.trim()) finalUnits.push(currentUnit.trim());

  return finalUnits.filter(u => u.trim().length > 0);
}

/**
 * Initiates the line-by-line reading process with pre-loading.
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
