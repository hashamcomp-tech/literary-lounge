import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";

/**
 * Uploads a cover image for a book to Firebase Storage and returns the download URL.
 * 
 * @param storage The Firebase Storage instance.
 * @param file The image file to upload.
 * @param bookId The unique ID of the book.
 * @returns A promise that resolves to the download URL of the uploaded image, or null if no file.
 */
export async function uploadCoverImage(storage: FirebaseStorage, file: File | null | undefined, bookId: string) {
  if (!file) return null;

  const coverRef = ref(storage, `bookCovers/${bookId}`);

  await uploadBytes(coverRef, file);

  const downloadURL = await getDownloadURL(coverRef);

  return downloadURL;
}
