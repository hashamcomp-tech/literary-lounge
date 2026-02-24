
import { getAuth } from "firebase/auth";
import { FirebaseStorage } from "firebase/storage";

/**
 * @fileOverview Visual Storage Utility.
 * Uses ArrayBuffer processing to resolve Vercel "disturbed or locked" stream errors.
 */

/**
 * Uploads a cover image or video for a book directly to Vercel Blob.
 * Preserves the file extension for correct media playback.
 */
export async function uploadCoverImage(storage: FirebaseStorage, file: File | null | undefined, bookId: string): Promise<string | null> {
  if (!file) return null;

  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Authentication required.");

  const extension = file.name.split('.').pop() || (file.type.startsWith('video/') ? 'mp4' : 'jpg');
  return await uploadToVercel(file, `bookCovers/${bookId}_${Date.now()}.${extension}`);
}

/**
 * Internal helper to trigger the Vercel Blob pipeline using ArrayBuffer.
 */
async function uploadToVercel(file: File, filename: string): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    
    const response = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
      method: 'POST',
      body: buffer,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Vercel upload rejected.");
    }

    const blob = await response.json();
    return blob.url;
  } catch (err: any) {
    throw new Error(`Cloud sync failed: ${err.message}`);
  }
}
