
import { getAuth } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";

/**
 * @fileOverview Visual Storage Utility.
 * Covers: Directly to Vercel Blob via API route for performance.
 * Manuscripts: Hybrid (Firebase primary, Vercel fallback via API route).
 */

const MAX_FIREBASE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB threshold

/**
 * Uploads a cover image for a book directly to Vercel Blob using the API route pattern.
 */
export async function uploadCoverImage(storage: FirebaseStorage, file: File | null | undefined, bookId: string): Promise<string | null> {
  if (!file) return null;

  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("Authentication required to sync Lounge assets.");
  }

  // Route directly to Vercel for visuals
  return await uploadToVercel(file, `bookCovers/${bookId}_${Date.now()}.jpg`);
}

/**
 * Uploads a raw manuscript file (EPUB/TXT) to the cloud.
 * Follows hybrid logic: Firebase first, Vercel fallback via API route.
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
      return await uploadToVercel(file, `manuscripts/${bookId}_${Date.now()}_${file.name}`);
    }

    // Attempt Firebase Upload for manuscripts
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);

  } catch (error: any) {
    // Failover if Firebase is "Out of Storage" (Quota Exceeded)
    if (error.code === 'storage/quota-exceeded' || error.code === 'storage/retry-limit-exceeded') {
      return await uploadToVercel(file, `manuscripts/${bookId}_${Date.now()}_${file.name}`);
    }
    
    throw new Error(`Manuscript synchronization failed: ${error.message}`);
  }
}

/**
 * Internal helper to trigger the Vercel Blob pipeline via our API Route.
 * Uses the preferred raw body fetch pattern.
 */
async function uploadToVercel(file: File, filename: string): Promise<string> {
  try {
    const response = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
      method: 'POST',
      body: file,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Vercel upload node rejected the stream.");
    }

    const blob = await response.json();
    return blob.url;
  } catch (err: any) {
    throw new Error(`Cloud sync failed on Vercel storage: ${err.message}`);
  }
}
