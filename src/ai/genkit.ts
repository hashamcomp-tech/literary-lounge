import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Global Genkit initialization.
 * Uses the environment variable for secure AI operations in production.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.VERCEL_API_KEY || 'AIzaSyCLn2M1ci_YkYegbORKnJiSBpCiCZhVz48',
    }),
  ],
  model: 'googleai/gemini-1.5-flash',
});
