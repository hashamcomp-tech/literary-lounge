import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

/**
 * Uploads a profile photo for a user to Firebase Storage.
 */
const UPLOAD_TIMEOUT = 60000; // 60 seconds

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
