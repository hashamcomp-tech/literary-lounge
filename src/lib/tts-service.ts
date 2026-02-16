
/**
 * @fileOverview Utility for converting text to speech using VoiceRSS via an internal API route.
 * This ensures API keys are kept secure on the server.
 */

export async function playTextToSpeech(text: string): Promise<void> {
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        // Truncate for optimal VoiceRSS performance
        text: text.substring(0, 1000) 
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
