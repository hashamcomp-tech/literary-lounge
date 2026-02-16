/**
 * @fileOverview Utility for converting text to speech using VoiceRSS via an internal API route.
 */

export interface TTSOptions {
  lang?: string;
  rate?: string;
}

/**
 * Sends text to the internal TTS API and plays the returned audio.
 */
export async function playTextToSpeech(text: string, options: TTSOptions = {}): Promise<void> {
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        text: text.substring(0, 1000),
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
    
    // Play the generated audio
    await audio.play();
    
    // Cleanup the URL after playback
    audio.onended = () => URL.revokeObjectURL(url);
  } catch (error: any) {
    console.error("TTS Service Error:", error);
    throw error;
  }
}
