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

/**
 * Uploads a raw manuscript file (EPUB/TXT) to temporary storage for server-side ingestion.
 */
export async function uploadManuscriptFile(storage: FirebaseStorage, file: File, bookId: string): Promise<string> {
  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("Authentication required to process manuscripts.");
  }

  const storageRef = ref(storage, `manuscripts/${bookId}_${file.name}`);
  
  try {
    const uploadTask = await uploadBytes(storageRef, file);
    return await getDownloadURL(uploadTask.ref);
  } catch (error: any) {
    console.error("Manuscript upload error:", error);
    throw new Error("Failed to prepare manuscript for cloud processing.");
  }
}

/**
 * Uploads a profile photo for a user to Firebase Storage.
 */
export async function uploadProfilePhoto(storage: FirebaseStorage, file: File, userId: string): Promise<string> {
  if (!file || !storage || !userId) {
    throw new Error("Missing required parameters for profile photo upload.");
  }

  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("You must be signed in to update your avatar.");
  }

  const storageRef = ref(storage, `profilePhotos/${userId}`);
  
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Upload timed out.")), UPLOAD_TIMEOUT)
  );

  try {
    const uploadPromise = uploadBytes(storageRef, file);
    await Promise.race([uploadPromise, timeoutPromise]);
    return await getDownloadURL(storageRef);
  } catch (error: any) {
    console.error("Photo upload error:", error);
    throw new Error(error.message || "Failed to upload profile photo.");
  }
}
