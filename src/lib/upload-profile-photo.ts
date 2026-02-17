import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";

/**
 * Uploads a profile photo for a user to Firebase Storage.
 * Includes a safety timeout to prevent the UI from hanging.
 * 
 * @param storage The Firebase Storage instance.
 * @param file The image file to upload.
 * @param userId The unique ID of the user.
 * @returns A promise that resolves to the download URL of the uploaded image.
 */
const UPLOAD_TIMEOUT = 60000; // 60 seconds

export async function uploadProfilePhoto(storage: FirebaseStorage, file: File, userId: string): Promise<string> {
  if (!file || !storage || !userId) {
    throw new Error("Missing required parameters for profile photo upload.");
  }

  const storageRef = ref(storage, `profilePhotos/${userId}`);
  
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Upload timed out. Please check your internet connection.")), UPLOAD_TIMEOUT)
  );

  try {
    const uploadPromise = uploadBytes(storageRef, file);
    await Promise.race([uploadPromise, timeoutPromise]);
    
    return await getDownloadURL(storageRef);
  } catch (error: any) {
    console.error("Photo upload error:", error);
    
    if (error.message === "Upload timed out. Please check your internet connection.") {
      throw error;
    }

    if (error.code === 'storage/unauthorized') {
      throw new Error("Permission denied. Ensure Firebase Storage rules allow user uploads.");
    }

    throw new Error(error.message || "Failed to upload profile photo.");
  }
}