
'use server';
/**
 * @fileOverview AI flow for identifying book details from filenames.
 * Uses Gemini's internal knowledge to match filenames to known literary works.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const IdentifyBookOutputSchema = z.object({
  title: z.string().nullable().describe('The identified book title.'),
  author: z.string().nullable().describe('The identified author name.'),
  genres: z.array(z.string()).describe('The likely list of genres based on known data.'),
  summary: z.string().nullable().describe('A brief summary if known.'),
});

export type IdentifyBookOutput = z.infer<typeof IdentifyBookOutputSchema>;

/**
 * Uses AI to analyze a filename and extract metadata.
 * Simulates an online search using the model's parametric knowledge.
 */
export async function identifyBookFromFilename(filename: string): Promise<IdentifyBookOutput> {
  const { output } = await ai.generate({
    prompt: `You are a professional librarian with deep knowledge of global literature. 
    Analyze the following filename and determine the most likely Book Title and Author.
    
    Filename: "${filename}"
    
    If you recognize this book from your internal knowledge (simulating an online search), please also provide the likely genres (multiple if applicable) and a 1-sentence summary.
    If the filename contains underscores, hyphens, or file extensions, clean them up to find the true title.
    
    Format the response as a JSON object.`,
    output: { schema: IdentifyBookOutputSchema }
  });
  
  if (!output) throw new Error('AI failed to identify the book.');
  return output;
}
