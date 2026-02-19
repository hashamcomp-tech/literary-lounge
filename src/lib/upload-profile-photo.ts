
import { getAuth } from "firebase/auth";
import { FirebaseStorage } from "firebase/storage";
import { uploadToVercelBlob } from "@/app/actions/upload";

/**
 * @fileOverview Profile Photo Utility.
 * Directly to Vercel Blob for high performance and global edge delivery.
 */

export async function uploadProfilePhoto(storage: FirebaseStorage, file: File, userId: string): Promise<string> {
  if (!file || !userId) {
    throw new Error("Missing required parameters for profile photo upload.");
  }

  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("You must be signed in to update your avatar.");
  }

  const formData = new FormData();
  formData.append('file', file);
  
  try {
    // Directly upload to Vercel Blob
    const url = await uploadToVercelBlob(formData, `profilePhotos/${userId}_${Date.now()}.jpg`);
    return url;
  } catch (vercelErr: any) {
    console.error("Vercel Profile Sync Error:", vercelErr);
    throw new Error("Avatar sync failed on the cloud node.");
  }
}
