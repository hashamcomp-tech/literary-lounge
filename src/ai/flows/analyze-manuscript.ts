'use server';
/**
 * @fileOverview AI flow for analyzing submitted manuscripts.
 * Provides summaries, themes, and safety assessments for administrators.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AnalyzeManuscriptInputSchema = z.object({
  title: z.string(),
  author: z.string(),
  content: z.string(),
});

const AnalyzeManuscriptOutputSchema = z.object({
  summary: z.string().describe('A 2-3 sentence summary of the chapter.'),
  themes: z.array(z.string()).describe('List of major themes identified.'),
  sentiment: z.string().describe('Tone assessment (e.g. Dark, Hopeful, Suspenseful).'),
  safetyRating: z.enum(['Safe', 'Questionable', 'Flagged']).describe('Safety status of the content.'),
  verdict: z.string().describe('Recommendation for the admin (e.g. "Ready for cloud promotion").'),
});

export type AnalyzeManuscriptOutput = z.infer<typeof AnalyzeManuscriptOutputSchema>;

const analyzePrompt = ai.definePrompt({
  name: 'analyzeManuscript',
  input: { schema: AnalyzeManuscriptInputSchema },
  output: { schema: AnalyzeManuscriptOutputSchema },
  prompt: `You are a professional literary editor for the "Literary Lounge" cloud library. 
  Analyze this manuscript submission and provide an editorial brief.
  
  Title: {{title}}
  Author: {{author}}
  Content: {{content}}
  
  Format the response as JSON containing:
  - summary: A clear summary of what happens.
  - themes: Key literary themes.
  - sentiment: The mood and atmosphere.
  - safetyRating: An assessment of whether it follows community guidelines.
  - verdict: A final recommendation on whether to promote this to the global library.`,
});

export async function analyzeManuscript(input: z.infer<typeof AnalyzeManuscriptInputSchema>): Promise<AnalyzeManuscriptOutput> {
  return analyzeManuscriptFlow(input);
}

const analyzeManuscriptFlow = ai.defineFlow(
  {
    name: 'analyzeManuscriptFlow',
    inputSchema: AnalyzeManuscriptInputSchema,
    outputSchema: AnalyzeManuscriptOutputSchema,
  },
  async (input) => {
    const { output } = await analyzePrompt(input);
    if (!output) throw new Error('AI analysis process failed.');
    return output;
  }
);
