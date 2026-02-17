import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";

/**
 * Uploads a cover image for a book to Firebase Storage.
 * Includes a safety timeout to prevent the UI from hanging on slow connections.
 * 
 * @param storage The Firebase Storage instance.
 * @param file The image file to upload.
 * @param bookId The unique ID of the book.
 * @returns A promise that resolves to the download URL of the uploaded image, or null if no file.
 */
const UPLOAD_TIMEOUT = 60000; // 60 seconds

export async function uploadCoverImage(storage: FirebaseStorage, file: File | null | undefined, bookId: string): Promise<string | null> {
  if (!file || !storage) return null;

  const storageRef = ref(storage, `bookCovers/${bookId}`);
  
  // Create a timeout promise
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Cover upload timed out.")), UPLOAD_TIMEOUT)
  );

  try {
    // Race the upload against the timeout
    const uploadPromise = uploadBytes(storageRef, file);
    await Promise.race([uploadPromise, timeoutPromise]);
    
    // Get and return the download URL
    return await getDownloadURL(storageRef);
  } catch (error: any) {
    console.error("Cover upload error:", error);
    
    // Explicitly handle timeout or permission errors for better debugging
    if (error.message === "Cover upload timed out.") {
      throw new Error("Cover upload timed out. Please check your connection or try a smaller image.");
    }
    
    if (error.code === 'storage/unauthorized') {
      throw new Error("Access denied. Please ensure you are signed in and storage rules allow uploads.");
    }

    throw error;
  }
}