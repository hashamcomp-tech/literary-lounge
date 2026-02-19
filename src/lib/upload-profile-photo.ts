
import { getAuth } from "firebase/auth";
import { FirebaseStorage } from "firebase/storage";

/**
 * @fileOverview Profile Photo Utility.
 * Directly to Vercel Blob via API Route for high performance.
 */

export async function uploadProfilePhoto(storage: FirebaseStorage, file: File, userId: string): Promise<string> {
  if (!file || !userId) {
    throw new Error("Missing required parameters for profile photo upload.");
  }

  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("You must be signed in to update your avatar.");
  }

  try {
    const filename = `profilePhotos/${userId}_${Date.now()}.jpg`;
    
    // Upload using the Vercel Blob API route pattern
    const response = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
      method: 'POST',
      body: file,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Avatar sync rejected by the cloud node.");
    }

    const blob = await response.json();
    return blob.url;
  } catch (vercelErr: any) {
    console.error("Vercel Profile Sync Error:", vercelErr);
    throw new Error(`Avatar sync failed: ${vercelErr.message}`);
  }
}
