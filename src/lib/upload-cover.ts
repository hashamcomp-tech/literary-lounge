import { getAuth } from "firebase/auth";
import { uploadToVercelBlob } from "@/app/actions/upload";

/**
 * @fileOverview Refined Image Upload Utility.
 * Now exclusively uses Vercel Blob Storage for all visual assets.
 */

const UPLOAD_TIMEOUT = 60000; // 60 seconds

/**
 * Uploads a cover image for a book to Vercel Blob.
 * The 'storage' parameter is maintained for interface compatibility but ignored.
 */
export async function uploadCoverImage(_storage: any, file: File | null | undefined, bookId: string): Promise<string | null> {
  if (!file) return null;

  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("Authentication required to upload Lounge assets.");
  }

  const formData = new FormData();
  formData.append('file', file);
  
  // Create a unique, timestamped filename for Vercel Blob
  const filename = `bookCovers/${bookId}_${Date.now()}.jpg`;

  try {
    const url = await uploadToVercelBlob(formData, filename);
    return url;
  } catch (error: any) {
    console.error("Vercel Blob Cover Upload Error:", error);
    throw new Error(error.message || "Visual sync failed.");
  }
}

/**
 * Uploads a raw manuscript file (EPUB/TXT) to Vercel Blob.
 */
export async function uploadManuscriptFile(_storage: any, file: File, bookId: string): Promise<string> {
  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error("Authentication required to process manuscripts.");
  }

  const formData = new FormData();
  formData.append('file', file);
  
  const filename = `manuscripts/${bookId}_${Date.now()}_${file.name}`;
  
  try {
    return await uploadToVercelBlob(formData, filename);
  } catch (error: any) {
    console.error("Vercel Blob Manuscript Upload Error:", error);
    throw new Error("Failed to prepare manuscript for cloud processing.");
  }
}

/**
 * Uploads a profile photo for a user to Vercel Blob.
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
  
  const filename = `profilePhotos/${userId}_${Date.now()}.jpg`;

  try {
    return await uploadToVercelBlob(formData, filename);
  } catch (error: any) {
    console.error("Vercel Blob Photo Upload Error:", error);
    throw new Error(error.message || "Failed to upload profile photo.");
  }
}