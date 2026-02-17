
import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";

/**
 * Uploads a cover image for a book to Firebase Storage and returns the download URL.
 * Includes a safety timeout to prevent the UI from hanging on slow connections.
 * 
 * @param storage The Firebase Storage instance.
 * @param file The image file to upload.
 * @param bookId The unique ID of the book.
 * @returns A promise that resolves to the download URL of the uploaded image, or null if no file.
 */
const UPLOAD_TIMEOUT = 25000; // 25 seconds for covers

export async function uploadCoverImage(storage: FirebaseStorage, file: File | null | undefined, bookId: string) {
  if (!file || !storage) return null;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Cover upload timed out.")), UPLOAD_TIMEOUT)
  );

  try {
    const coverRef = ref(storage, `bookCovers/${bookId}`);

    // Perform the upload with a safety timeout
    await Promise.race([
      uploadBytes(coverRef, file),
      timeoutPromise
    ]);

    // Retrieve the public URL
    const downloadURL = await getDownloadURL(coverRef);

    return downloadURL;
  } catch (error: any) {
    console.error("Firebase Storage Cover Upload Error:", error);
    
    if (error.code === 'storage/unauthorized') {
      throw new Error("Access denied to Storage. Please check your security rules.");
    }
    
    throw new Error(error.message || "Failed to upload cover art.");
  }
}
