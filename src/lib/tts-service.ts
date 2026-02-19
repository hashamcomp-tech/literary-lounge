/**
 * @fileOverview Sequential TTS Engine with Dual-Slot Pre-loading and Anticipatory Handoff.
 * Uses dual audio elements to trigger the next sentence 0.7s early.
 * Maintains a cache of the next 2 audio segments to eliminate network latency.
 * Handles AbortErrors caused by fast overlapping transitions.
 */

export interface TTSOptions {
  lang?: string;
  rate?: string;
}

// Persistent dual audio elements to allow overlapping/handoff logic
let audioElements: [HTMLAudioElement, HTMLAudioElement] | null = null;

if (typeof window !== 'undefined') {
  audioElements = [new Audio(), new Audio()];
}

let textQueue: string[] = [];
let currentQueueIndex = 0;
let isSpeakingGlobal = false;
let currentOptions: TTSOptions = {};
let activeAbortController: AbortController | null = null;

// Pre-loading state: Cache the next 2 audio blob URLs
const preloadedCache = new Map<number, string>();
const activePreloads = new Set<number>();

/**
 * Stops any currently playing TTS audio and clears the playback queue and cache.
 */
export function stopTextToSpeech(): void {
  isSpeakingGlobal = false;
  textQueue = [];
  currentQueueIndex = 0;
  
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }

  if (audioElements) {
    audioElements.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      audio.ontimeupdate = null;
      audio.onerror = null;
      audio.src = "";
    });
  }

  // Clear cache and revoke all URLs
  preloadedCache.forEach(url => URL.revokeObjectURL(url));
  preloadedCache.clear();
  activePreloads.clear();
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
async function fetchAudioBlobUrl(text: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      text: text.substring(0, 1000), 
      lang: currentOptions.lang || 'en-us',
      rate: currentOptions.rate || '0'
    }),
    signal
  });

  if (!response.ok) {
    throw new Error("TTS chunk request failed.");
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Look-ahead fetch for upcoming chunks in the queue.
 * Keeps the next 2 sentences buffered.
 */
async function preloadUpcomingChunks(currentIndex: number) {
  if (!isSpeakingGlobal) return;

  const targets = [currentIndex + 1, currentIndex + 2];

  for (const target of targets) {
    if (target >= textQueue.length || target < 0) continue;
    if (preloadedCache.has(target) || activePreloads.has(target)) continue;

    activePreloads.add(target);
    try {
      const text = textQueue[target];
      if (text && text.trim().length > 0) {
        const url = await fetchAudioBlobUrl(text, activeAbortController?.signal);
        preloadedCache.set(target, url);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.warn("Preload failed for index", target, e);
      }
    } finally {
      activePreloads.delete(target);
    }
  }

  // Cleanup old cache entries (anything before currentIndex)
  preloadedCache.forEach((url, index) => {
    if (index < currentIndex) {
      URL.revokeObjectURL(url);
      preloadedCache.delete(index);
    }
  });
}

/**
 * Internal helper to play a specific chunk using alternating audio slots.
 */
async function playChunk(index: number): Promise<void> {
  if (!isSpeakingGlobal || index >= textQueue.length || !audioElements) {
    isSpeakingGlobal = false;
    return;
  }

  currentQueueIndex = index;
  const text = textQueue[index];
  if (!text || text.trim().length === 0) {
    return playChunk(index + 1);
  }

  try {
    let url: string;
    if (preloadedCache.has(index)) {
      url = preloadedCache.get(index)!;
    } else {
      url = await fetchAudioBlobUrl(text, activeAbortController?.signal);
    }

    const audioSlot = index % 2;
    const currentAudio = audioElements[audioSlot];
    let nextTriggered = false;

    // Reset previous state
    currentAudio.src = url;
    currentAudio.ontimeupdate = null;
    currentAudio.onended = null;
    currentAudio.onerror = null;

    // ANTICIPATORY TRIGGER: Start next line 0.7s before current ends
    currentAudio.ontimeupdate = () => {
      if (currentAudio.duration > 0 && 
          currentAudio.currentTime >= currentAudio.duration - 0.7 && 
          !nextTriggered) {
        nextTriggered = true;
        playChunk(index + 1);
      }
    };

    currentAudio.onended = () => {
      if (!nextTriggered) {
        nextTriggered = true;
        playChunk(index + 1);
      }
    };

    currentAudio.onerror = () => {
      if (!nextTriggered) {
        nextTriggered = true;
        playChunk(index + 1);
      }
    };

    // ABANDON PREVIOUS AUDIO: Immediately silence the other slot 
    // to prevent overlapping voices when the next one starts.
    const otherSlot = (index + 1) % 2;
    const otherAudio = audioElements[otherSlot];
    otherAudio.pause();
    otherAudio.currentTime = 0;

    // Playback
    await currentAudio.play().catch(err => {
      // AbortError is expected when we pause/reset an element during handoff
      if (err.name === 'AbortError') return;
      console.error("Playback failed for index", index, err);
      if (!nextTriggered) {
        nextTriggered = true;
        playChunk(index + 1);
      }
    });

    // LOOK-AHEAD: Ensure next 2 are buffered
    preloadUpcomingChunks(index);

  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.error("Chunk processing failure for index", index, error);
      playChunk(index + 1);
    }
  }
}

/**
 * Splits text into individual lines and sentences for granular reading.
 */
function chunkText(text: string): string[] {
  const cleanText = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>?/gm, '')
    .trim();

  // Split by common sentence delimiters while keeping the delimiter
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
 * Initiates the multi-stream reading process with pre-loading and anticipatory handoff.
 */
export async function playTextToSpeech(fullText: string, options: TTSOptions = {}): Promise<void> {
  stopTextToSpeech();

  if (!fullText || fullText.trim().length === 0 || !audioElements) return;

  currentOptions = options;
  textQueue = chunkText(fullText);
  currentQueueIndex = 0;
  isSpeakingGlobal = true;
  activeAbortController = new AbortController();

  if (textQueue.length === 0) {
    isSpeakingGlobal = false;
    return;
  }

  // Pre-warm the elements
  const silentSrc = "data:audio/wav;base64,UklGRigAAABXQVZFRm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  for (const audio of audioElements) {
    audio.src = silentSrc;
    try {
      await audio.play();
    } catch (e) {}
  }

  // Seed the cache with the first few items
  preloadUpcomingChunks(-1);

  return playChunk(0);
}
