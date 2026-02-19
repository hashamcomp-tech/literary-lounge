import { NextRequest, NextResponse } from 'next/server';

/**
 * @fileOverview API Route for VoiceRSS Text-to-Speech conversion.
 * Proxies requests to VoiceRSS and validates the response content.
 */
export async function POST(req: NextRequest) {
  try {
    const { text, lang, rate } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const apiKey = 'f31ab5bc5aab4e578b3e2f57c800cb7d';

    // VoiceRSS API Parameters
    const params = new URLSearchParams({
      key: apiKey,
      hl: lang || 'en-us',
      r: rate || '0', 
      src: text.trim(),
      c: 'MP3',
      f: '44khz_16bit_stereo'
    });

    const response = await fetch('https://api.voicerss.org/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error('VoiceRSS API request failed');
    }

    const audioBlob = await response.blob();

    // Check if the API returned an error message in plain text instead of audio
    if (audioBlob.type.includes('text') || audioBlob.size < 100) {
      const errorText = await audioBlob.text();
      if (errorText.startsWith('ERROR')) {
        return NextResponse.json({ error: errorText }, { status: 400 });
      }
    }

    return new Response(audioBlob, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error: any) {
    console.error('VoiceRSS TTS Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'TTS conversion failed' },
      { status: 500 }
    );
  }
}
