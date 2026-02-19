'use server';
/**
 * @fileOverview AI flow for parsing metadata from pasted manuscript snippets.
 * Identifies book title, chapter number, and chapter title from the first segment of text.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParsePastedChapterOutputSchema = z.object({
  bookTitle: z.string().describe('The identified title of the book.'),
  author: z.string().describe('The identified author name.'),
  chapterNumber: z.number().describe('The identified chapter sequence number.'),
  chapterTitle: z.string().describe('The identified title of this specific chapter.'),
  genres: z.array(z.string()).describe('The likely list of genres based on the text context.'),
  chapterContent: z.string().describe('The cleaned manuscript content, removing headers or boilerplate.'),
});

export type ParsePastedChapterOutput = z.infer<typeof ParsePastedChapterOutputSchema>;

const parsePrompt = ai.definePrompt({
  name: 'parsePastedChapter',
  input: { schema: z.object({ text: z.string() }) },
  output: { schema: ParsePastedChapterOutputSchema },
  prompt: `You are a professional literary parser for the "Literary Lounge". 
  The user has pasted a segment of text from a novel. Your task is to extract bibliographic metadata and clean the content.
  
  Instructions:
  1. Detect the Book Title from the text (check the first 100 words).
  2. Detect the Author name if present.
  3. Detect the Chapter Number and Chapter Title.
  4. Identify the likely genres/themes (e.g., "Fantasy", "Mystery", "History").
  5. Clean the "chapterContent" by removing any introductory boilerplate, headers, or redundant ISBN/copyright text that isn't part of the story prose.
  
  Format the response as a strict JSON object.
  
  Text to analyze:
  """{{text}}"""`,
});

export async function parsePastedChapter(text: string): Promise<ParsePastedChapterOutput> {
  const { output } = await parsePrompt({ text });
  if (!output) throw new Error('AI failed to parse the manuscript snippet.');
  return output;
}
