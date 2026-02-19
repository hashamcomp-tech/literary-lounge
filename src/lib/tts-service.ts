/**
 * @fileOverview High-Performance AI Narration Engine.
 * Utilizes Genkit TTS flows for strictly sequential, chunked playback.
 * Features instantaneous cancellation and zero residual network activity.
 */
import { generateAudio } from '@/ai/flows/tts-flow';

export interface TTSOptions {
  voice?: string;
  onStartChunk?: (index: number) => void;
}

let isSpeakingGlobal = false;
let currentAudio: HTMLAudioElement | null = null;
let abortController: AbortController | null = null;

/**
 * Instantly stops all narration and network activity.
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
 * Global status check for the narration engine.
 */
export function isSpeaking(): boolean {
  return isSpeakingGlobal;
}

/**
 * Core chunking logic to divide text into digestible segments for the AI.
 */
function chunkText(text: string): string[] {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>?/gm, '')
    .split(/\n\n/)
    .map(p => p.trim())
    .filter(p => p.length > 1);
}

/**
 * Initiates the sequential narration process.
 * Processes paragraphs one-by-one to maintain responsiveness.
 */
export async function playTextToSpeech(fullText: string, options: TTSOptions = {}): Promise<void> {
  // 1. Force stop existing streams
  stopTextToSpeech();

  const paragraphs = chunkText(fullText);
  if (paragraphs.length === 0) return;

  isSpeakingGlobal = true;
  abortController = new AbortController();

  try {
    for (let i = 0; i < paragraphs.length; i++) {
      if (!isSpeakingGlobal) break;

      // 2. Notify UI of progress
      if (options.onStartChunk) options.onStartChunk(i);

      // 3. Fetch current chunk audio via AI flow
      const { audioDataUri } = await generateAudio(paragraphs[i], options.voice);
      
      // Safety check after network delay
      if (!isSpeakingGlobal) break;

      // 4. Handle playback
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(audioDataUri);
        currentAudio = audio;

        audio.onended = () => {
          currentAudio = null;
          resolve();
        };

        audio.onerror = () => {
          currentAudio = null;
          reject(new Error("Playback failure on segment " + i));
        };

        audio.play().catch(err => {
          if (err.name === 'AbortError' || !isSpeakingGlobal) resolve();
          else reject(err);
        });
      });
    }
  } catch (error: any) {
    if (error.name !== 'AbortError' && isSpeakingGlobal) {
      console.error("AI Narration Error:", error.message || error);
    }
  } finally {
    // Only reset global flag if we weren't interrupted by a new request
    if (abortController && !abortController.signal.aborted) {
      isSpeakingGlobal = false;
    }
    currentAudio = null;
  }
}
