
import { getAuth } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";
import { uploadToVercelBlob } from "@/app/actions/upload";

/**
 * @fileOverview Visual Storage Utility.
 * Covers: Directly to Vercel Blob for performance.
 * Manuscripts: Hybrid (Firebase primary, Vercel fallback).
 */

const MAX_FIREBASE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB threshold

/**
 * Uploads a cover image for a book directly to Vercel Blob.
 */
export async function uploadCoverImage(storage: FirebaseStorage, file: File | null | undefined, bookId: string): Promise<string | null> {
  if (!file) return null;

  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("Authentication required to sync Lounge assets.");
  }

  // Directly to Vercel as requested for covers
  return await uploadToVercelFallback(file, `bookCovers/${bookId}_${Date.now()}.jpg`);
}

/**
 * Uploads a raw manuscript file (EPUB/TXT) to the cloud.
 * Follows hybrid logic: Firebase first, Vercel fallback.
 */
export async function uploadManuscriptFile(storage: FirebaseStorage, file: File, bookId: string): Promise<string> {
  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("Authentication required to process manuscripts.");
  }

  const storageRef = ref(storage, `manuscripts/${bookId}_${Date.now()}_${file.name}`);

  try {
    // Check if the file is "Too Big" for standard Firebase management
    if (file.size > MAX_FIREBASE_SIZE_BYTES) {
      return await uploadToVercelFallback(file, `manuscripts/${bookId}_${Date.now()}_${file.name}`);
    }

    // Attempt Firebase Upload for manuscripts
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);

  } catch (error: any) {
    // Failover if Firebase is "Out of Storage" (Quota Exceeded)
    if (error.code === 'storage/quota-exceeded' || error.code === 'storage/retry-limit-exceeded') {
      return await uploadToVercelFallback(file, `manuscripts/${bookId}_${Date.now()}_${file.name}`);
    }
    
    throw new Error("Manuscript synchronization failed.");
  }
}

/**
 * Internal helper to trigger the Vercel Blob pipeline.
 */
async function uploadToVercelFallback(file: File, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const url = await uploadToVercelBlob(formData, filename);
    return url;
  } catch (err: any) {
    throw new Error(`Cloud sync failed on Vercel storage: ${err.message}`);
  }
}
