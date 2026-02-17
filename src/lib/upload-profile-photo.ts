
import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";

/**
 * @fileOverview Utility for uploading user profile photos to Firebase Storage.
 * Improved with safety timeouts to prevent UI hangs.
 */

const UPLOAD_TIMEOUT = 60000; // 60 seconds

/**
 * Uploads a profile photo for a user to Firebase Storage and returns the download URL.
 * 
 * @param storage The Firebase Storage instance.
 * @param file The image file to upload.
 * @param userId The unique ID of the user.
 * @returns A promise that resolves to the download URL of the uploaded image.
 */
export async function uploadProfilePhoto(storage: FirebaseStorage, file: File, userId: string): Promise<string> {
  if (!file || !storage || !userId) {
    throw new Error("Missing required parameters for profile photo upload.");
  }

  let timeoutId: any;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Upload timed out. Please check your internet connection and Firebase Storage rules."));
    }, UPLOAD_TIMEOUT);
  });

  try {
    const photoRef = ref(storage, `profilePhotos/${userId}`);

    // Race the upload against our timeout
    await Promise.race([
      uploadBytes(photoRef, file),
      timeoutPromise
    ]);

    // Success - clear the timeout
    clearTimeout(timeoutId);

    // Retrieve the public URL
    const downloadURL = await getDownloadURL(photoRef);

    return downloadURL;
  } catch (error: any) {
    // Ensure timeout is cleared on error
    if (timeoutId) clearTimeout(timeoutId);
    
    console.warn("Firebase Storage Profile Photo Upload Error:", error);
    
    if (error.code === 'storage/unauthorized') {
      throw new Error("Permission denied. Ensure Firebase Storage is enabled and rules allow user uploads.");
    } else if (error.code === 'storage/retry-limit-exceeded') {
      throw new Error("The upload failed due to excessive retries. This often happens with CORS or network issues.");
    }
    
    throw new Error(error.message || "Failed to upload profile photo. Please try a smaller image or check your connection.");
  }
}
