import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

/**
 * Uploads a cover image for a book to Firebase Storage.
 */
const UPLOAD_TIMEOUT = 60000; // 60 seconds

export async function uploadCoverImage(storage: FirebaseStorage, file: File | null | undefined, bookId: string): Promise<string | null> {
  if (!file || !storage) return null;

  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("Authentication required to upload assets.");
  }

  const storageRef = ref(storage, `bookCovers/${bookId}`);
  
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Upload timed out.")), UPLOAD_TIMEOUT)
  );

  try {
    const uploadPromise = uploadBytes(storageRef, file);
    await Promise.race([uploadPromise, timeoutPromise]);
    return await getDownloadURL(storageRef);
  } catch (error: any) {
    console.error("Cover upload error:", error);
    throw error;
  }
}
