import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

/**
 * Uploads a cover image for a book to Firebase Storage.
 * includes an explicit check for authentication state to prevent production hangs.
 */
const UPLOAD_TIMEOUT = 60000; // 60 seconds

export async function uploadCoverImage(storage: FirebaseStorage, file: File | null | undefined, bookId: string): Promise<string | null> {
  if (!file || !storage) return null;

  // DIAGNOSTIC: Ensure user is authenticated before attempting upload
  const auth = getAuth();
  if (!auth.currentUser) {
    console.error("Upload attempted without active Firebase Auth session.");
    throw new Error("Authentication required. Please wait for the Lounge to sync your session.");
  }

  const storageRef = ref(storage, `bookCovers/${bookId}`);
  
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Cover upload timed out. This usually indicates a CORS block or network restriction.")), UPLOAD_TIMEOUT)
  );

  try {
    // Perform the upload
    const uploadPromise = uploadBytes(storageRef, file);
    
    // Race against timeout
    await Promise.race([uploadPromise, timeoutPromise]);
    
    // Get download URL
    return await getDownloadURL(storageRef);
  } catch (error: any) {
    console.error("Firebase Storage Production Error:", error);
    
    if (error.message.includes("timed out")) {
      throw new Error("Connection timed out. If this is production, please verify CORS settings on your Firebase Storage bucket.");
    }
    
    if (error.code === 'storage/unauthorized') {
      throw new Error("Permission denied. Ensure your storage.rules allow writes for authenticated users.");
    }

    throw error;
  }
}
