
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
  chapterContent: z.string().describe('The cleaned manuscript content.'),
});

export type ParsePastedChapterOutput = z.infer<typeof ParsePastedChapterOutputSchema>;

const parsePrompt = ai.definePrompt({
  name: 'parsePastedChapter',
  input: { schema: z.object({ text: z.string() }) },
  output: { schema: ParsePastedChapterOutputSchema },
  prompt: `You are a professional literary parser. The user will paste a chapter from a novel. 
  Your task is to extract the metadata and return strict JSON.
  
  Instructions:
  1. Detect the book title from the text (often found at the very beginning).
  2. Detect the author name if present.
  3. Detect the chapter number and chapter title.
  4. If metadata is missing, make a reasonable guess based on the context.
  5. Clean the "chapterContent" by removing any header boilerplate.
  
  Text to analyze:
  """{{text}}"""`,
});

export async function parsePastedChapter(text: string): Promise<ParsePastedChapterOutput> {
  const { output } = await parsePrompt({ text });
  if (!output) throw new Error('AI failed to parse the manuscript snippet.');
  return output;
}
