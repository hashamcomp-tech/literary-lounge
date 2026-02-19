import { getAuth } from "firebase/auth";
import { FirebaseStorage } from "firebase/storage";

/**
 * @fileOverview Profile Photo Utility.
 * Directly to Vercel Blob via API Route using ArrayBuffer for high-reliability cloud sync.
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
    
    // Process as ArrayBuffer to resolve Vercel "disturbed or locked" stream errors
    const buffer = await file.arrayBuffer();
    
    const response = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
      method: 'POST',
      body: buffer,
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
