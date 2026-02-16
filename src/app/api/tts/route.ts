
import { NextRequest, NextResponse } from 'next/server';
import { ElevenLabsClient } from 'elevenlabs';

/**
 * @fileOverview API Route for ElevenLabs Text-to-Speech conversion.
 * Handles server-side TTS processing to protect API keys and stream audio efficiently.
 */
export async function POST(req: NextRequest) {
  try {
    const { text, voiceId = 'JBFqnCBsd6RMkjVDRZzb' } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ElevenLabs API key is missing. Please set ELEVENLABS_API_KEY in your environment.' },
        { status: 500 }
      );
    }

    const elevenlabs = new ElevenLabsClient({ apiKey });

    // Convert text to speech using ElevenLabs
    // The SDK returns a readable stream in Node.js environments
    const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
      text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
    });

    // Return the audio stream directly to the client as a Response
    return new Response(audioStream as any, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    console.error('ElevenLabs TTS Error:', error);
    return NextResponse.json(
      { error: error.message || 'TTS conversion failed' },
      { status: 500 }
    );
  }
}
