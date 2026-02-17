import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * @fileOverview Global Genkit initialization.
 * Uses the provided Google Gemini API key for server-side AI processing.
 */
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: 'AIzaSyCLn2M1ci_YkYegbORKnJiSBpCiCZhVz48',
    }),
  ],
  model: 'googleai/gemini-1.5-flash',
});
