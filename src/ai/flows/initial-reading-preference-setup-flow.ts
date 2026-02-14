'use server';
/**
 * @fileOverview This file defines a Genkit flow for processing a new user's initial reading preferences.
 * It takes natural language input and extracts structured preferences for personalized recommendations.
 *
 * - initialReadingPreferenceSetup - A function that handles the initial reading preference setup process.
 * - InitialReadingPreferenceSetupInput - The input type for the initialReadingPreferenceSetup function.
 * - InitialReadingPreferenceSetupOutput - The return type for the initialReadingPreferenceSetup function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const InitialReadingPreferenceSetupInputSchema = z.object({
  preferences: z
    .string()
    .describe('A natural language description of the user\'s reading preferences.'),
});
export type InitialReadingPreferenceSetupInput = z.infer<
  typeof InitialReadingPreferenceSetupInputSchema
>;

const InitialReadingPreferenceSetupOutputSchema = z.object({
  genres: z.array(z.string()).describe('A list of preferred literary genres.'),
  authors: z.array(z.string()).describe('A list of preferred authors.'),
  themes: z.array(z.string()).describe('A list of preferred literary themes or subjects.'),
  mood: z
    .string()
    .describe('The overall mood or tone the user prefers in novels (e.g., adventurous, calming, mysterious, thought-provoking).'),
  preferredLength: z
    .enum(['short', 'medium', 'long', 'any'])
    .describe('The preferred length of novels (short, medium, long, or any).'),
});
export type InitialReadingPreferenceSetupOutput = z.infer<
  typeof InitialReadingPreferenceSetupOutputSchema
>;

export async function initialReadingPreferenceSetup(
  input: InitialReadingPreferenceSetupInput
): Promise<InitialReadingPreferenceSetupOutput> {
  return initialReadingPreferenceSetupFlow(input);
}

const initialReadingPreferenceSetupPrompt = ai.definePrompt({
  name: 'initialReadingPreferenceSetupPrompt',
  input: { schema: InitialReadingPreferenceSetupInputSchema },
  output: { schema: InitialReadingPreferenceSetupOutputSchema },
  prompt: `You are an AI assistant designed to extract structured reading preferences from natural language descriptions.
Based on the user's preferences, identify and list their preferred genres, authors, themes, overall mood, and preferred novel length.

For 'mood', choose one from: adventurous, calming, mysterious, thought-provoking, romantic, dramatic, suspenseful, humorous, dark, uplifting, informative, reflective, inspiring. If none are explicitly mentioned, infer the most fitting one.
For 'preferredLength', choose one from: short, medium, long, any. If not specified, default to 'any'.

User Preferences: {{{preferences}}}
`,
});

const initialReadingPreferenceSetupFlow = ai.defineFlow(
  {
    name: 'initialReadingPreferenceSetupFlow',
    inputSchema: InitialReadingPreferenceSetupInputSchema,
    outputSchema: InitialReadingPreferenceSetupOutputSchema,
  },
  async (input) => {
    const { output } = await initialReadingPreferenceSetupPrompt(input);
    return output!;
  }
);
