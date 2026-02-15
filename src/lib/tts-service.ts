/**
 * @fileOverview Utility for converting text to speech using VoiceRSS.
 */

export async function playTextToSpeech(text: string): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_VOICERSS_API_KEY;
  
  if (!apiKey) {
    console.error("VoiceRSS API key is missing. Please set NEXT_PUBLIC_VOICERSS_API_KEY in your environment.");
    return;
  }

  try {
    const response = await fetch('https://api.voicerss.org/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        key: apiKey,
        hl: 'en-us',
        src: text.substring(0, 3000), // VoiceRSS has limit, we take first 3000 chars for a preview
        c: 'MP3',
        f: '44khz_16bit_stereo'
      })
    });

    if (!response.ok) throw new Error("TTS request failed");

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await audio.play();
  } catch (error) {
    console.error("TTS Error:", error);
  }
}
