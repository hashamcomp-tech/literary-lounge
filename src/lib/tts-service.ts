/**
 * @fileOverview Refined Sequential TTS Engine with Autoplay Policy handling.
 * Handles long-form content by chunking text and playing them in a queue.
 * Reuses a single audio element to maintain "unlocked" status from user gestures.
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
        text: text.substring(0, 1000), // Safety cap for API reliability
        lang: currentOptions.lang || 'en-us',
        rate: currentOptions.rate || '0'
      })
    });

    if (!response.ok) {
      throw new Error("TTS chunk request failed.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    // Revoke previous blob if applicable to keep memory clean
    const oldSrc = globalAudio.src;
    
    globalAudio.src = url;

    // Use global handlers to avoid duplicate event listeners on the persistent element
    globalAudio.onended = () => {
      if (oldSrc.startsWith('blob:')) URL.revokeObjectURL(oldSrc);
      playNextChunk();
    };

    globalAudio.onerror = () => {
      console.warn("Audio playback error, attempting next chunk...");
      if (oldSrc.startsWith('blob:')) URL.revokeObjectURL(oldSrc);
      playNextChunk();
    };

    // Since globalAudio was "unlocked" in playTextToSpeech (sync with user click),
    // subsequent source changes and play() calls are permitted by the browser.
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
 * Splits long text into meaningful chunks (by paragraph then by sentence if needed).
 */
function chunkText(text: string): string[] {
  // 1. Clean HTML artifacts
  const cleanText = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>?/gm, '')
    .trim();

  // 2. Split by paragraphs
  const paragraphs = cleanText.split(/\n\n+/);
  const finalChunks: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= 1000) {
      finalChunks.push(para.trim());
    } else {
      // 3. If a paragraph is too long, split by sentences (period followed by space)
      const sentences = para.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [para];
      let currentSentenceChunk = "";
      
      for (const sentence of sentences) {
        if ((currentSentenceChunk + sentence).length < 1000) {
          currentSentenceChunk += sentence + " ";
        } else {
          finalChunks.push(currentSentenceChunk.trim());
          currentSentenceChunk = sentence + " ";
        }
      }
      if (currentSentenceChunk) finalChunks.push(currentSentenceChunk.trim());
    }
  }

  return finalChunks.filter(c => c.length > 0);
}

/**
 * Initiates the multi-chunk reading process.
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
  // with a silent source to satisfy Autoplay policies.
  // This must happen in the same execution context as the user's click.
  globalAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFRm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  try {
    await globalAudio.play();
  } catch (e) {
    // Proceed regardless of silent play success; playChunk will attempt the first real segment.
  }

  // Start the actual content queue
  return playChunk(0);
}
