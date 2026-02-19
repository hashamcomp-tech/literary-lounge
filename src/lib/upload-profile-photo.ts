
import { getAuth } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";
import { uploadToVercelBlob } from "@/app/actions/upload";

/**
 * @fileOverview Profile Photo Hybrid Utility.
 * Primary: Firebase Storage.
 * Fallback: Vercel Blob for large avatars or when Firebase is full.
 */

export async function uploadProfilePhoto(storage: FirebaseStorage, file: File, userId: string): Promise<string> {
  if (!file || !userId) {
    throw new Error("Missing required parameters for profile photo upload.");
  }

  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("You must be signed in to update your avatar.");
  }

  const firebaseRef = ref(storage, `profilePhotos/${userId}/${Date.now()}.jpg`);

  try {
    // Attempt Firebase first (standard avatar size < 10MB)
    if (file.size < 10 * 1024 * 1024) {
      const snapshot = await uploadBytes(firebaseRef, file);
      return await getDownloadURL(snapshot.ref);
    } else {
      // Direct to Vercel if unusually large
      const formData = new FormData();
      formData.append('file', file);
      return await uploadToVercelBlob(formData, `profilePhotos/${userId}_${Date.now()}.jpg`);
    }
  } catch (error: any) {
    // Fallback to Vercel on any Firebase error (quota, permissions, etc.)
    const formData = new FormData();
    formData.append('file', file);
    try {
      return await uploadToVercelBlob(formData, `profilePhotos/${userId}_${Date.now()}.jpg`);
    } catch (vercelErr: any) {
      throw new Error("Avatar sync failed across all cloud providers.");
    }
  }
}
