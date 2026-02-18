
'use server';
/**
 * @fileOverview AI flow for identifying book details from filenames and content snippets.
 * Uses Gemini's internal knowledge to match data to known literary works.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const IdentifyBookInputSchema = z.object({
  filename: z.string().describe('The name of the uploaded file.'),
  textSnippet: z.string().optional().describe('A snippet of text from the beginning of the manuscript.'),
});

const IdentifyBookOutputSchema = z.object({
  title: z.string().nullable().describe('The identified book title.'),
  author: z.string().nullable().describe('The identified author name.'),
  genres: z.array(z.string()).describe('The likely list of genres based on known data.'),
  summary: z.string().nullable().describe('A brief summary if known.'),
});

export type IdentifyBookOutput = z.infer<typeof IdentifyBookOutputSchema>;

/**
 * Uses AI to analyze a filename and snippet to extract metadata.
 */
export async function identifyBookFromFilename(input: z.infer<typeof IdentifyBookInputSchema>): Promise<IdentifyBookOutput> {
  const { output } = await ai.generate({
    prompt: `You are a professional librarian with deep knowledge of global literature. 
    Analyze the following filename and text snippet from a manuscript to determine the most likely Book Title and Author.
    
    Filename: "${input.filename}"
    Snippet: """${input.textSnippet || 'No snippet provided.'}"""
    
    INSTRUCTIONS:
    1. If you recognize this book from your internal knowledge, provide the authentic Title and Author.
    2. Provide the likely genres (multiple if applicable) from a standard literary list.
    3. If the filename contains underscores, hyphens, or file extensions, clean them up.
    4. If the metadata is not clear, make your best professional guess.
    
    Format the response as a JSON object.`,
    output: { schema: IdentifyBookOutputSchema }
  });
  
  if (!output) throw new Error('AI failed to identify the book.');
  return output;
}
