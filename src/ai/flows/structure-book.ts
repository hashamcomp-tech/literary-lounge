'use server';
/**
 * @fileOverview AI flow for structural analysis of a manuscript.
 * Identifies chapter boundaries and titles based on the book's index/contents.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const StructureBookInputSchema = z.object({
  text: z.string().describe('A significant slice of the manuscript (first 50k characters).'),
});

const ChapterBoundarySchema = z.object({
  title: z.string().describe('The authentic title of the chapter.'),
  startPhrase: z.string().describe('A unique opening phrase of this chapter to help locate the boundary.'),
});

const StructureBookOutputSchema = z.object({
  chapters: z.array(ChapterBoundarySchema).describe('List of identified chapters in sequence.'),
});

export type StructureBookOutput = z.infer<typeof StructureBookOutputSchema>;

const structurePrompt = ai.definePrompt({
  name: 'structureBook',
  input: { schema: StructureBookInputSchema },
  output: { schema: StructureBookOutputSchema },
  prompt: `You are a professional literary editor and structural analyst.
  Your task is to analyze the provided text from a book and identify its logical chapter divisions.
  
  Instructions:
  1. Locate the "Table of Contents" or "Contents" index if it exists in the text.
  2. Use the titles found in the index to map out the chapters.
  3. For each chapter, identify a unique "startPhrase" (the first 5-10 words of the actual chapter content) so the system can split the text accurately.
  4. Ensure you identify as many chapters as possible from the provided text slice.
  
  Text:
  {{text}}`,
});

/**
 * Analyzes book structure to provide chapter titles and split points.
 */
export async function structureBook(input: z.infer<typeof StructureBookInputSchema>): Promise<StructureBookOutput> {
  const { output } = await structurePrompt(input);
  if (!output) throw new Error('AI structural analysis failed.');
  return output;
}
