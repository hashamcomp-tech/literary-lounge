'use server';
/**
 * @fileOverview AI flow for generating book covers using Imagen 4.
 * Creates professional-grade cover art based on book metadata.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateCoverInputSchema = z.object({
  title: z.string(),
  author: z.string(),
  genre: z.string(),
  description: z.string().optional(),
});

export type GenerateCoverInput = z.infer<typeof GenerateCoverInputSchema>;

/**
 * Generates a book cover image using Imagen 4.
 * Returns a data URI of the generated image.
 */
export async function generateBookCover(input: GenerateCoverInput): Promise<string> {
  return generateCoverFlow(input);
}

const generateCoverFlow = ai.defineFlow(
  {
    name: 'generateCoverFlow',
    inputSchema: GenerateCoverInputSchema,
    outputSchema: z.string(),
  },
  async (input) => {
    const prompt = `A professional book cover for a ${input.genre} novel titled "${input.title}" by ${input.author}. 
    Style: Cinematic, high-quality, illustrative, minimalist typography if any. 
    Mood: ${input.genre === 'Fantasy' ? 'Magical and epic' : input.genre === 'Mystery' ? 'Dark and moody' : 'Evocative and clean'}.
    Do not include any gibberish text other than the title and author name if possible.`;

    const { media } = await ai.generate({
      model: 'googleai/imagen-4.0-fast-generate-001',
      prompt: prompt,
    });

    if (!media || !media.url) {
      throw new Error('Image generation failed.');
    }

    return media.url;
  }
);
