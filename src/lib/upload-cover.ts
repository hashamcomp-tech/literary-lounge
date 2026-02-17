import { ref, uploadBytesResumable, getDownloadURL, FirebaseStorage } from "firebase/storage";

/**
 * Uploads a cover image for a book to Firebase Storage using resumable uploads.
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

  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, `bookCovers/${bookId}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    const timeoutId = setTimeout(() => {
      uploadTask.cancel();
      reject(new Error("Cover upload timed out."));
    }, UPLOAD_TIMEOUT);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        // Optional: track progress here if needed
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`Upload is ${progress}% done`);
      },
      (error) => {
        clearTimeout(timeoutId);
        console.error("Cover upload task failed:", error);
        
        if (error.code === 'storage/unauthorized') {
          reject(new Error("Access denied. Ensure Storage is enabled and rules allow uploads."));
        } else if (error.code === 'storage/canceled') {
          reject(new Error("Upload was canceled due to timeout."));
        } else {
          reject(new Error(error.message || "Failed to upload cover art."));
        }
      },
      async () => {
        clearTimeout(timeoutId);
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        } catch (e: any) {
          reject(new Error("Failed to retrieve download URL."));
        }
      }
    );
  });
}
