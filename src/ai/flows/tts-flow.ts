'use server';
/**
 * @fileOverview AI flow for Text-to-Speech using Gemini via Genkit.
 * Converts text segments into high-quality audio data URIs.
 */
import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';
import wav from 'wav';

const TTSInputSchema = z.object({
  text: z.string().describe('The text segment to narrate.'),
  voice: z.string().optional().default('Algenib').describe('The prebuilt voice name to use.'),
});

/**
 * Converts raw PCM audio data to a WAV Base64 string.
 * Essential for browser compatibility as Gemini returns raw PCM.
 */
async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    let bufs = [] as any[];
    writer.on('error', reject);
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}

/**
 * Wrapper for the TTS flow to be called from client components.
 */
export async function generateAudio(text: string, voice?: string) {
  return ttsFlow({ text, voice });
}

const ttsFlow = ai.defineFlow(
  {
    name: 'ttsFlow',
    inputSchema: TTSInputSchema,
    outputSchema: z.object({
      audioDataUri: z.string(),
    }),
  },
  async (input) => {
    // 1. Generate speech using Gemini Flash
    const { media } = await ai.generate({
      model: googleAI.model('gemini-2.5-flash-preview-tts'),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: input.voice },
          },
        },
      },
      prompt: input.text,
    });

    if (!media || !media.url) {
      throw new Error('AI failed to generate audio stream.');
    }

    // 2. Extract PCM from Data URI
    const audioBuffer = Buffer.from(
      media.url.substring(media.url.indexOf(',') + 1),
      'base64'
    );

    // 3. Wrap in WAV container for high-reliability browser playback
    const wavBase64 = await toWav(audioBuffer);
    
    return {
      audioDataUri: `data:audio/wav;base64,${wavBase64}`,
    };
  }
);
