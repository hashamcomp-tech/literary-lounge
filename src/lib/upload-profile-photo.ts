
import { getAuth } from "firebase/auth";
import { uploadToVercelBlob } from "@/app/actions/upload";

/**
 * @fileOverview Profile Photo Utility.
 * Migrated to Vercel Blob Storage for global edge delivery.
 */

export async function uploadProfilePhoto(_storage: any, file: File, userId: string): Promise<string> {
  if (!file || !userId) {
    throw new Error("Missing required parameters for profile photo upload.");
  }

  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("You must be signed in to update your avatar.");
  }

  const formData = new FormData();
  formData.append('file', file);
  
  // Append timestamp to ensure fresh avatar loads
  const filename = `profilePhotos/${userId}_${Date.now()}.jpg`;

  try {
    const url = await uploadToVercelBlob(formData, filename);
    return url;
  } catch (error: any) {
    console.error("Vercel Blob Profile Upload Error:", error);
    throw new Error(error.message || "Failed to upload profile photo.");
  }
}
