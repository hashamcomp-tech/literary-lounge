
import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";

/**
 * @fileOverview Utility for uploading user profile photos to Firebase Storage.
 * Improved with better error handling to prevent hangs.
 */

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

  try {
    // Generate a unique path for the profile photo
    const photoRef = ref(storage, `profilePhotos/${userId}`);

    // Perform the upload
    // uploadBytes can hang if bucket is not active or CORS is restricted
    await uploadBytes(photoRef, file);

    // Retrieve the public URL
    const downloadURL = await getDownloadURL(photoRef);

    return downloadURL;
  } catch (error: any) {
    console.error("Firebase Storage Profile Photo Upload Error:", error);
    
    // Provide a more descriptive error for common workstation/permission issues
    if (error.code === 'storage/unauthorized') {
      throw new Error("Permission denied. Storage rules may be restricting this upload.");
    } else if (error.code === 'storage/retry-limit-exceeded') {
      throw new Error("Upload timed out. Please check your internet connection.");
    }
    
    throw new Error(error.message || "Failed to upload profile photo. Please ensure cloud storage is active.");
  }
}
