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

  // Upload to Vercel Blob with public access
  const blob = await put(filename, file, {
    access: 'public',
  });

  return blob.url;
}