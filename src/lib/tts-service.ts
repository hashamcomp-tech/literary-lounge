/**
 * @fileOverview Utility for converting text to speech using VoiceRSS via an internal API route.
 * Manages a singleton audio instance to allow interrupting playback.
 */

export interface TTSOptions {
  lang?: string;
  rate?: string;
}

let currentAudio: HTMLAudioElement | null = null;

/**
 * Stops any currently playing TTS audio.
 */
export function stopTextToSpeech(): void {
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
 * Sends text to the internal TTS API and plays the returned audio.
 * Automatically stops previous playback if a new request is made.
 */
export async function playTextToSpeech(text: string, options: TTSOptions = {}): Promise<void> {
  try {
    // Stop previous audio if any
    stopTextToSpeech();

    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        text: text.substring(0, 1000), // VoiceRSS limits
        lang: options.lang || 'en-us',
        rate: options.rate || '0'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "VoiceRSS TTS request failed.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    
    currentAudio = audio;

    // Play the generated audio
    await audio.play();
    
    // Cleanup the URL after playback
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) {
        currentAudio = null;
      }
    };
  } catch (error: any) {
    console.error("TTS Service Error:", error);
    throw error;
  }
}
