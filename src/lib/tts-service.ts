
/**
 * @fileOverview Utility for converting text to speech using ElevenLabs via an internal API route.
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
        // Truncate to a reasonable preview length if necessary
        text: text.substring(0, 5000) 
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "ElevenLabs TTS request failed.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    
    // Play the generated audio
    await audio.play();
    
    // Cleanup the URL after playback or if needed later
    audio.onended = () => URL.revokeObjectURL(url);
  } catch (error: any) {
    console.error("TTS Service Error:", error);
    throw error;
  }
}
