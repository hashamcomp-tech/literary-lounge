import { getAuth } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";

/**
 * @fileOverview Visual Storage Utility.
 * Uses ArrayBuffer processing to resolve Vercel "disturbed or locked" stream errors.
 */

/**
 * Uploads a cover image for a book directly to Vercel Blob.
 */
export async function uploadCoverImage(storage: FirebaseStorage, file: File | null | undefined, bookId: string): Promise<string | null> {
  if (!file) return null;

  const auth = getAuth();
  if (!auth.currentUser) throw new Error("Authentication required.");

  return await uploadToVercel(file, `bookCovers/${bookId}_${Date.now()}.jpg`);
}

/**
 * Internal helper to trigger the Vercel Blob pipeline using ArrayBuffer.
 */
async function uploadToVercel(file: File, filename: string): Promise<string> {
  try {
    // Consume body as ArrayBuffer to prevent stream locking issues
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
