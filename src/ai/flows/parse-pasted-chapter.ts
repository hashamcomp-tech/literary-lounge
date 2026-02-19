'use server';
/**
 * @fileOverview AI flow for parsing metadata from pasted manuscript snippets.
 * Identifies book title, chapter number, and chapter title from the first segment of text.
 * Uses a "Librarian Detective" persona for higher accuracy on ambiguous snippets.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ParsePastedChapterOutputSchema = z.object({
  bookTitle: z.string().describe('The identified title of the book. Look for headers, copyright pages, or internal mentions.'),
  author: z.string().describe('The identified author name. Look for "By [Name]" or copyright info.'),
  chapterNumber: z.number().describe('The identified chapter sequence number.'),
  chapterTitle: z.string().describe('The identified title of this specific chapter.'),
  genres: z.array(z.string()).describe('The likely list of genres based on the text context and themes.'),
  chapterContent: z.string().describe('The cleaned manuscript content, removing headers, boilerplate, ISBNs, or copyright text.'),
});

export type ParsePastedChapterOutput = z.infer<typeof ParsePastedChapterOutputSchema>;

const parsePrompt = ai.definePrompt({
  name: 'parsePastedChapter',
  input: { schema: z.object({ text: z.string() }) },
  output: { schema: ParsePastedChapterOutputSchema },
  prompt: `You are a professional literary detective for "Literary Lounge". 
  The user has pasted a segment of a novel. Your task is to extract bibliographic metadata and clean the prose.
  
  TASK:
  1. Determine the overall BOOK TITLE. If not explicitly stated, look for repetition in headers or thematic mentions.
  2. Determine the AUTHOR. Check for "By...", "Written by...", or copyright notices.
  3. Determine the CHAPTER NUMBER and CHAPTER TITLE. 
  4. Identify GENRES/THEMES (e.g., "Fantasy", "Mystery", "History").
  5. Provide a "chapterContent" which is just the story text, stripped of ISBNs, copyright pages, or scanner noise.
  
  INSTRUCTIONS:
  - If the Title or Author is absolutely not present, make a professional guess based on the tone or set to "Unknown".
  - If multiple chapters are present, focus on the first one detected.
  
  Text to analyze:
  """{{text}}"""`,
});

export async function parsePastedChapter(text: string): Promise<ParsePastedChapterOutput> {
  const { output } = await parsePrompt({ text });
  if (!output) throw new Error('AI failed to parse the manuscript snippet.');
  return output;
}
