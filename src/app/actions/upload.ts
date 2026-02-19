
'use server';

import { put } from '@vercel/blob';

/**
 * @fileOverview Server Action for uploading files to Vercel Blob storage.
 * Handles the secure transmission of binary data to the cloud.
 */

export async function uploadToVercelBlob(formData: FormData, filename: string) {
  const file = formData.get('file') as File;
  
  if (!file) {
    throw new Error('No binary data detected for upload.');
  }

  // Defensive check for the Vercel Blob Token
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Vercel Blob token is missing. Please add BLOB_READ_WRITE_TOKEN to your environment variables.');
  }

  try {
    // Upload to Vercel Blob with public access
    const blob = await put(filename, file, {
      access: 'public',
    });

    return blob.url;
  } catch (error: any) {
    console.error("Vercel Blob Put Error:", error);
    throw new Error(`Upload to Vercel failed: ${error.message}`);
  }
}
