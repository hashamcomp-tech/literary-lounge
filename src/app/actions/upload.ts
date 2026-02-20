
'use server';

import { put, del } from '@vercel/blob';

/**
 * @fileOverview Server Actions for managing files in Vercel Blob storage.
 * Handles the secure transmission and removal of binary data from the cloud.
 */

export async function uploadToVercelBlob(formData: FormData, filename: string) {
  const file = formData.get('file') as File;
  
  if (!file) {
    throw new Error('No binary data detected for upload.');
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    throw new Error('Vercel Blob token is missing. Please add BLOB_READ_WRITE_TOKEN to your environment variables.');
  }

  try {
    const blob = await put(filename, file, {
      access: 'public',
      token: token,
    });

    return blob.url;
  } catch (error: any) {
    console.error("Vercel Blob Put Error:", error);
    
    if (error.message?.includes('Access denied')) {
      throw new Error("Vercel Blob: Access denied. Please verify that your BLOB_READ_WRITE_TOKEN is valid.");
    }
    
    throw new Error(`Upload to Vercel failed: ${error.message}`);
  }
}

/**
 * Permanently removes a file from Vercel Blob storage.
 * @param url The public URL of the blob to delete.
 */
export async function deleteFromVercelBlob(url: string) {
  if (!url || !url.includes('vercel-storage.com')) return;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn("Vercel Blob token missing. Skipping deletion.");
    return;
  }

  try {
    await del(url, { token });
  } catch (error) {
    console.error("Vercel Blob Deletion Error:", error);
    // We don't throw here to avoid blocking parent UI operations if cleanup fails
  }
}
