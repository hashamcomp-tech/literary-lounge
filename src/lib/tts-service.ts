/**
 * @fileOverview Refined Sequential TTS Engine.
 * Provides a robust start/stop mechanism for chapter narration.
 * Handles chunking, network fetching, and sequential playback with clear error reporting.
 */

export interface TTSOptions {
  lang?: string;
  rate?: string;
}

let isSpeakingGlobal = false;
let currentAudio: HTMLAudioElement | null = null;
let abortController: AbortController | null = null;

/**
 * Stops any currently playing TTS audio and clears the playback queue.
 */
export function stopTextToSpeech(): void {
  isSpeakingGlobal = false;
  
  if (abortController) {
    abortController.abort();
    abortController = null;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
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
 * Internal helper to fetch audio for a specific text chunk.
 */
async function fetchAudioBlobUrl(text: string, options: TTSOptions, signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      text: text.substring(0, 1000), 
      lang: options.lang || 'en-us',
      rate: options.rate || '0'
    }),
    signal
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: 'TTS request failed' }));
    throw new Error(errData.error || "TTS chunk request failed.");
  }

  const blob = await response.blob();
  if (blob.size < 100) {
    throw new Error("Received invalid audio data from server.");
  }
  
  return URL.createObjectURL(blob);
}

/**
 * Splits text into manageable sentences.
 */
function chunkText(text: string): string[] {
  const cleanText = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>?/gm, '')
    .trim();

  if (!cleanText) return [];

  // Split by punctuation but keep it, then filter out empty/short bits
  return cleanText
    .split(/([.!?]+(?:\s+|\n+|$))/)
    .reduce((acc: string[], part, i) => {
      if (i % 2 === 0) {
        if (part.trim()) acc.push(part.trim());
      } else {
        if (acc.length > 0) acc[acc.length - 1] += part.trim();
      }
      return acc;
    }, [])
    .filter(s => s.length > 1);
}

/**
 * Initiates the sequential reading process.
 */
export async function playTextToSpeech(fullText: string, options: TTSOptions = {}): Promise<void> {
  // If already speaking, stop first
  stopTextToSpeech();

  const textQueue = chunkText(fullText);
  if (textQueue.length === 0) return;

  isSpeakingGlobal = true;
  abortController = new AbortController();

  try {
    for (let i = 0; i < textQueue.length; i++) {
      if (!isSpeakingGlobal) break;

      const url = await fetchAudioBlobUrl(textQueue[i], options, abortController.signal);
      
      await new Promise<void>((resolve, reject) => {
        if (!isSpeakingGlobal) {
          URL.revokeObjectURL(url);
          return resolve();
        }

        const audio = new Audio(url);
        currentAudio = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };

        audio.onerror = () => {
          const mediaError = audio.error;
          URL.revokeObjectURL(url);
          const errorMsg = mediaError 
            ? `Audio Error ${mediaError.code}: ${mediaError.message || 'Source not supported'}` 
            : 'Unknown playback error';
          reject(new Error(errorMsg));
        };

        audio.play().catch(err => {
          URL.revokeObjectURL(url);
          if (err.name === 'AbortError') resolve();
          else reject(err);
        });
      });
    }
  } catch (error: any) {
    if (error.name !== 'AbortError' && isSpeakingGlobal) {
      console.error("TTS Playback Error:", error.message || error);
    }
  } finally {
    // Only reset global flag if we weren't interrupted by a new request
    if (abortController && !abortController.signal.aborted) {
      isSpeakingGlobal = false;
    }
    currentAudio = null;
  }
}
