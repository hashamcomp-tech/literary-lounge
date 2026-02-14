'use server';
/**
 * @fileOverview A Genkit flow for generating personalized novel recommendations.
 *
 * - personalizedNovelRecommendations - A function that handles the personalized novel recommendation process.
 * - PersonalizedNovelRecommendationsInput - The input type for the personalizedNovelRecommendations function.
 * - PersonalizedNovelRecommendationsOutput - The return type for the personalizedNovelRecommendations function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const PersonalizedNovelRecommendationsInputSchema = z.object({
  readingHistory: z
    .array(
      z.object({
        title: z.string().describe('The title of the novel.'),
        author: z.string().describe('The author of the novel.'),
        genre: z.string().describe('The genre of the novel.'),
      })
    )
    .describe('A list of novels the user has previously read.'),
  preferredGenres: z
    .array(z.string())
    .describe('A list of genres the user explicitly prefers.'),
  preferredAuthors: z
    .array(z.string())
    .describe('A list of authors the user explicitly prefers.'),
});
export type PersonalizedNovelRecommendationsInput = z.infer<
  typeof PersonalizedNovelRecommendationsInputSchema
>;

const PersonalizedNovelRecommendationsOutputSchema = z.object({
  recommendations: z
    .array(
      z.object({
        title: z.string().describe('The title of the recommended novel.'),
        author: z.string().describe('The author of the recommended novel.'),
        genre: z.string().describe('The genre of the recommended novel.'),
        summary: z.string().describe('A brief summary of the recommended novel.'),
      })
    )
    .describe('A list of personalized novel recommendations.'),
});
export type PersonalizedNovelRecommendationsOutput = z.infer<
  typeof PersonalizedNovelRecommendationsOutputSchema
>;

export async function personalizedNovelRecommendations(
  input: PersonalizedNovelRecommendationsInput
): Promise<PersonalizedNovelRecommendationsOutput> {
  return personalizedNovelRecommendationsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'personalizedNovelRecommendationsPrompt',
  input: { schema: PersonalizedNovelRecommendationsInputSchema },
  output: { schema: PersonalizedNovelRecommendationsOutputSchema },
  prompt: `You are an expert literary assistant tasked with providing personalized novel recommendations. Your recommendations should be based on the user's past reading history and their explicit preferences.
Aim to suggest books that the user is highly likely to enjoy, considering their taste in authors and genres.

User's Reading History:
{{#if readingHistory}}
  {{#each readingHistory}}
  - Title: {{{title}}}, Author: {{{author}}}, Genre: {{{genre}}}
  {{/each}}
{{else}}
  No reading history provided.
{{/if}}

User's Preferred Genres:
{{#if preferredGenres}}
  {{#each preferredGenres}}
  - {{{this}}}
  {{/each}}
{{else}}
  No preferred genres provided.
{{/if}}

User's Preferred Authors:
{{#if preferredAuthors}}
  {{#each preferredAuthors}}
  - {{{this}}}
  {{/each}}
{{else}}
  No preferred authors provided.
{{/if}}

Based on the above information, recommend a list of novels. For each recommendation, provide the title, author, genre, and a brief summary. Focus on quality recommendations over quantity. Do not recommend books that are already in the user's reading history. If no specific preferences or history are provided, offer a diverse set of well-regarded novels.
`,
});

const personalizedNovelRecommendationsFlow = ai.defineFlow(
  {
    name: 'personalizedNovelRecommendationsFlow',
    inputSchema: PersonalizedNovelRecommendationsInputSchema,
    outputSchema: PersonalizedNovelRecommendationsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
