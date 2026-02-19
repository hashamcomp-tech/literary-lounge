
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

  // Explicitly fetch the token from the environment
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    throw new Error('Vercel Blob token is missing. Please add BLOB_READ_WRITE_TOKEN to your environment variables.');
  }

  try {
    // Upload to Vercel Blob with public access, explicitly passing the token
    const blob = await put(filename, file, {
      access: 'public',
      token: token,
    });

    return blob.url;
  } catch (error: any) {
    console.error("Vercel Blob Put Error:", error);
    
    // Provide a more descriptive error if the token is rejected
    if (error.message?.includes('Access denied')) {
      throw new Error("Vercel Blob: Access denied. Please verify that your BLOB_READ_WRITE_TOKEN is valid and has active permissions.");
    }
    
    throw new Error(`Upload to Vercel failed: ${error.message}`);
  }
}
