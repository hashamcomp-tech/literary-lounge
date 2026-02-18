'use server';
/**
 * @fileOverview AI flow for structural analysis of a manuscript.
 * Specifically identifies logical chapter boundaries based on the book's index.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const StructureBookInputSchema = z.object({
  text: z.string().describe('The first 100,000 characters of the manuscript (likely to contain the index).'),
});

const ChapterBoundarySchema = z.object({
  title: z.string().describe('The authentic title of the chapter from the index.'),
  startPhrase: z.string().describe('A unique opening phrase (first 10-15 words) of this chapter to help the system split the text accurately.'),
});

const StructureBookOutputSchema = z.object({
  chapters: z.array(ChapterBoundarySchema).describe('List of identified chapters in sequence.'),
});

export type StructureBookOutput = z.infer<typeof StructureBookOutputSchema>;

const structurePrompt = ai.definePrompt({
  name: 'structureBook',
  input: { schema: StructureBookInputSchema },
  output: { schema: StructureBookOutputSchema },
  prompt: `You are a professional literary analyst specializing in manuscript structure.
  
  TASK:
  Analyze the provided text slice from a book and identify its logical chapter divisions.
  
  INSTRUCTIONS:
  1. Locate the "Table of Contents", "Contents", or "Index" section.
  2. Map out every chapter listed in the index.
  3. For each chapter listed, locate its actual start in the subsequent text and provide a "startPhrase" consisting of the first 10 to 15 unique words of that chapter's content.
  4. Use the EXACT titles found in the index.
  5. If no index exists, use your best judgment to find logical chapter headers (e.g., "Chapter One", "Introduction") and provide their unique start phrases.
  
  TEXT:
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