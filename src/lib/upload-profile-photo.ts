import { ref, uploadBytesResumable, getDownloadURL, FirebaseStorage } from "firebase/storage";

/**
 * @fileOverview Utility for uploading user profile photos to Firebase Storage using resumable uploads.
 * Improved with safety timeouts and better task management.
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

  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, `profilePhotos/${userId}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    const timeoutId = setTimeout(() => {
      uploadTask.cancel();
      reject(new Error("Upload timed out. Please check your internet connection."));
    }, UPLOAD_TIMEOUT);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        // Optional: Progress monitoring
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`Avatar upload is ${progress}% done`);
      },
      (error) => {
        clearTimeout(timeoutId);
        console.warn("Firebase Storage Profile Photo Upload Error:", error);
        
        if (error.code === 'storage/unauthorized') {
          reject(new Error("Permission denied. Ensure Firebase Storage rules allow user uploads."));
        } else if (error.code === 'storage/canceled') {
          reject(new Error("Upload timed out or was canceled by user."));
        } else {
          reject(new Error(error.message || "Failed to upload profile photo."));
        }
      },
      async () => {
        clearTimeout(timeoutId);
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        } catch (e: any) {
          reject(new Error("Failed to finalize upload."));
        }
      }
    );
  });
}
