
'use server';
/**
 * @fileOverview AI flow for generating book covers using Imagen 4.
 * Creates professional-grade cover art based on book metadata and identified context.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateCoverInputSchema = z.object({
  title: z.string(),
  author: z.string(),
  genres: z.array(z.string()),
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
    const genreStr = input.genres.join(', ');
    
    const prompt = `Create a professional and authentic book cover for the ${genreStr} novel titled "${input.title}" by ${input.author}.
    
    Context: ${input.description || 'A unique work of literature.'}
    
    Instructions:
    1. If this is a known literary work (classic or modern), utilize your internal knowledge of its iconic cover aesthetics, historic symbols, and traditional artistic styles to generate a faithful yet high-definition reimagining.
    2. If the work is new, use the genre and description to create an evocative, thematic masterpiece.
    3. Style: Cinematic, high-quality, illustrative, with minimalist and elegant typography for the title and author name only.
    4. Avoid: Gibberish text, cluttered layouts, or unrelated imagery.
    
    Mood: ${input.genres.includes('Fantasy') ? 'Magical and epic' : input.genres.includes('Mystery') ? 'Dark and moody' : input.genres.includes('History') ? 'Sophisticated and classic' : 'Evocative and clean'}.`;

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
