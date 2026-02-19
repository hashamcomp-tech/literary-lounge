import { NextResponse } from 'next/server';

/**
 * @fileOverview Legacy TTS API Route.
 * Deprecated in favor of the direct Genkit TTS Flow for higher reliability and no subscription costs.
 */
export async function POST() {
  return NextResponse.json({ 
    error: 'API Deprecated. Application now uses Genkit flows for secure AI narration.' 
  }, { status: 410 });
}
