
import { getAuth } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";
import { uploadToVercelBlob } from "@/app/actions/upload";

/**
 * @fileOverview Hybrid Visual Storage Utility.
 * Primary: Firebase Storage (5GB Free tier).
 * Fallback: Vercel Blob (For files > 10MB or when Firebase quota is reached).
 */

const MAX_FIREBASE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB threshold for "too big"

/**
 * Uploads a cover image for a book.
 * Tries Firebase Storage first, falls back to Vercel Blob on failure or large size.
 */
export async function uploadCoverImage(storage: FirebaseStorage, file: File | null | undefined, bookId: string): Promise<string | null> {
  if (!file) return null;

  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("Authentication required to sync Lounge assets.");
  }

  // Path for Firebase Storage
  const firebasePath = `bookCovers/${bookId}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, firebasePath);

  try {
    // 1. Check if the file is "Too Big" for standard Firebase management
    if (file.size > MAX_FIREBASE_SIZE_BYTES) {
      console.info("File exceeds Firebase optimization threshold. Routing to Vercel Blob.");
      return await uploadToVercelFallback(file, `bookCovers/${bookId}_${Date.now()}.jpg`);
    }

    // 2. Attempt Firebase Upload
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);

  } catch (error: any) {
    // 3. Failover if Firebase is "Out of Storage" (Quota Exceeded) or other sync error
    if (error.code === 'storage/quota-exceeded' || error.code === 'storage/retry-limit-exceeded') {
      console.warn("Firebase Storage capacity reached. Utilizing Vercel Backup.");
      return await uploadToVercelFallback(file, `bookCovers/${bookId}_${Date.now()}.jpg`);
    }
    
    console.error("Firebase Storage Sync Error:", error);
    throw new Error("Visual synchronization failed. Please check your connection.");
  }
}

/**
 * Uploads a raw manuscript file (EPUB/TXT) to the cloud.
 */
export async function uploadManuscriptFile(storage: FirebaseStorage, file: File, bookId: string): Promise<string> {
  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("Authentication required to process manuscripts.");
  }

  const storageRef = ref(storage, `manuscripts/${bookId}_${Date.now()}_${file.name}`);

  try {
    if (file.size > MAX_FIREBASE_SIZE_BYTES) {
      return await uploadToVercelFallback(file, `manuscripts/${bookId}_${Date.now()}_${file.name}`);
    }
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  } catch (error: any) {
    // Failover to Vercel for manuscripts as well
    return await uploadToVercelFallback(file, `manuscripts/${bookId}_${Date.now()}_${file.name}`);
  }
}

/**
 * Internal helper to trigger the Vercel Blob fallback pipeline.
 */
async function uploadToVercelFallback(file: File, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const url = await uploadToVercelBlob(formData, filename);
    return url;
  } catch (err: any) {
    throw new Error(`Cloud sync failed on both primary and backup nodes: ${err.message}`);
  }
}
