/**
 * @fileOverview Refined Sequential TTS Engine.
 * Handles long-form content by chunking text into paragraphs and playing them in a queue.
 * This bypasses the 1,000-character API limits and ensures the whole chapter is read.
 */

export interface TTSOptions {
  lang?: string;
  rate?: string;
}

let currentAudio: HTMLAudioElement | null = null;
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
  
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    if (currentAudio.src) {
      URL.revokeObjectURL(currentAudio.src);
    }
    currentAudio = null;
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
  if (!isSpeakingGlobal || index >= textQueue.length) {
    isSpeakingGlobal = false;
    return;
  }

  const text = textQueue[index];
  if (!text || text.trim().length === 0) {
    // Skip empty chunks
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
    
    // Cleanup previous audio if it exists
    if (currentAudio && currentAudio.src) {
      URL.revokeObjectURL(currentAudio.src);
    }

    const audio = new Audio(url);
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      playNextChunk();
    };

    audio.onerror = () => {
      console.warn("Audio playback error, attempting next chunk...");
      playNextChunk();
    };

    await audio.play();
  } catch (error) {
    console.error("Chunk playback error:", error);
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

  if (!fullText || fullText.trim().length === 0) return;

  // Prepare new session
  currentOptions = options;
  textQueue = chunkText(fullText);
  currentQueueIndex = 0;
  isSpeakingGlobal = true;

  if (textQueue.length === 0) {
    isSpeakingGlobal = false;
    return;
  }

  // Start the loop
  return playChunk(0);
}
