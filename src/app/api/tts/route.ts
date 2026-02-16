
import { NextRequest, NextResponse } from 'next/server';

/**
 * @fileOverview API Route for VoiceRSS Text-to-Speech conversion.
 * Proxies requests to VoiceRSS to keep the API key secure.
 * Now supports dynamic language and rate parameters.
 */
export async function POST(req: NextRequest) {
  try {
    const { text, lang, rate } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const apiKey = 'f31ab5bc5aab4e578b3e2f57c800cb7d';

    const params = new URLSearchParams({
      key: apiKey,
      hl: lang || 'en-us',
      r: rate || '0', // Speech rate, from -10 to 10
      src: text.substring(0, 1000), // VoiceRSS has character limits based on plan
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

    return new Response(audioBlob, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error: any) {
    console.error('VoiceRSS TTS Error:', error);
    return NextResponse.json(
      { error: error.message || 'TTS conversion failed' },
      { status: 500 }
    );
  }
}
