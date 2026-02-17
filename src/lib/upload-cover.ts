import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";

/**
 * Uploads a cover image for a book to Firebase Storage and returns the download URL.
 * Includes basic validation and returns null if no file is provided.
 * 
 * @param storage The Firebase Storage instance.
 * @param file The image file to upload.
 * @param bookId The unique ID of the book.
 * @returns A promise that resolves to the download URL of the uploaded image, or null if no file.
 */
export async function uploadCoverImage(storage: FirebaseStorage, file: File | null | undefined, bookId: string) {
  if (!file || !storage) return null;

  try {
    // Generate a unique path for the cover art
    const coverRef = ref(storage, `bookCovers/${bookId}`);

    // Perform the upload
    await uploadBytes(coverRef, file);

    // Retrieve the public URL
    const downloadURL = await getDownloadURL(coverRef);

    return downloadURL;
  } catch (error) {
    console.error("Firebase Storage Upload Error:", error);
    throw new Error("Failed to upload cover art. Please check your connection and try again.");
  }
}