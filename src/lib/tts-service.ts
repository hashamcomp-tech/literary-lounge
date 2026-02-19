/**
 * @fileOverview Sequential TTS Engine with Anticipatory Handoff and Pre-loading.
 * Uses dual audio elements to trigger the next sentence 0.7s early.
 * When the next audio starts, the previous one is immediately abandoned.
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
  
  if (audioElements) {
    audioElements.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      audio.ontimeupdate = null;
      audio.onerror = null;
      if (audio.src && audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
      }
      audio.src = "";
    });
  }

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
      text: text.substring(0, 1000), 
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
  if (preloadedIndex === index) return;

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
    if (preloadedIndex === index && preloadedUrl) {
      url = preloadedUrl;
      preloadedUrl = null;
      preloadedIndex = -1;
    } else {
      url = await fetchAudioBlobUrl(text);
    }

    const audioSlot = index % 2;
    const currentAudio = audioElements[audioSlot];
    let nextTriggered = false;

    const oldSrc = currentAudio.src;
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
        // The next chunk will start and stop this one via the abandonment logic below
        playChunk(index + 1);
      }
    };

    currentAudio.onended = () => {
      if (oldSrc.startsWith('blob:')) URL.revokeObjectURL(oldSrc);
      if (!nextTriggered) {
        nextTriggered = true;
        playChunk(index + 1);
      }
    };

    currentAudio.onerror = () => {
      if (oldSrc.startsWith('blob:')) URL.revokeObjectURL(oldSrc);
      if (!nextTriggered) {
        nextTriggered = true;
        playChunk(index + 1);
      }
    };

    // Playback
    await currentAudio.play().catch(err => {
      console.error("Playback failed for index", index, err);
      if (!nextTriggered) {
        nextTriggered = true;
        playChunk(index + 1);
      }
    });

    // ABANDON PREVIOUS AUDIO: Now that the current one has successfully started,
    // immediately silence the other slot to prevent overlapping voices.
    const otherSlot = (index + 1) % 2;
    const otherAudio = audioElements[otherSlot];
    otherAudio.pause();
    otherAudio.currentTime = 0;

    // LOOK-AHEAD: Preload the next required resource
    const preloadTarget = nextTriggered ? index + 2 : index + 1;
    preloadNextChunk(preloadTarget);

  } catch (error) {
    console.error("Chunk processing failure for index", index, error);
    playChunk(index + 1);
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

  if (textQueue.length === 0) {
    isSpeakingGlobal = false;
    return;
  }

  const silentSrc = "data:audio/wav;base64,UklGRigAAABXQVZFRm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  for (const audio of audioElements) {
    audio.src = silentSrc;
    try {
      await audio.play();
    } catch (e) {}
  }

  return playChunk(0);
}
