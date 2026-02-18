import { doc, setDoc, serverTimestamp, Firestore, increment } from "firebase/firestore";
import { FirebaseStorage } from "firebase/storage";
import { uploadCoverImage } from "./upload-cover";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface Chapter {
  chapterNumber: number;
  content: string;
  title?: string;
}

/**
 * Hardened regex patterns to strip index entries, watermarks, and legal boilerplate.
 */
function cleanManuscriptContent(text: string): string {
  if (!text) return "";
  
  return text
    // 1. Strip common index patterns (e.g., "About.com, 286")
    .replace(/^[A-Z][a-zA-Z0-9\s.-]+,\s\d+(?:–\d+)?\s*$/gm, "")
    // 2. Strip ISBN and technical metadata
    .replace(/ISBN\s*(?:-13|-10)?[:\s]+[0-9-]{10,17}/gi, "")
    // 3. Strip publisher address blocks
    .replace(/^[0-9]+\s+[A-Z][a-zA-Z\s.-]+,\s*[A-Z]{2}\s*\d{5}.*$/gm, "")
    // 4. Strip legal assertions
    .replace(/.*asserted (his|her|their) right to be identified.*/gi, "")
    .replace(/All rights reserved\. No part of this (book|work|text).*/gi, "")
    // 5. Strip digital distribution signatures
    .replace(/Published by .* imprint of .*/gi, "")
    .replace(/A CIP catalogue record for this book is available from .*/gi, "")
    // 6. Cleanup empty lines left by removal
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @fileOverview Refined multi-step process for publishing novels.
 * Prevents Firestore size limit errors and implements resilient image uploading.
 */
export async function uploadBookToCloud({
  db,
  storage,
  bookId,
  title,
  author,
  genres,
  chapters,
  coverFile,
  ownerId
}: {
  db: Firestore;
  storage: FirebaseStorage;
  bookId: string;
  title: string;
  author: string;
  genres: string[];
  chapters: Chapter[];
  coverFile?: File | null;
  ownerId: string;
}) {
  if (!genres || genres.length === 0) throw new Error("At least one genre is required for cloud books.");
  if (!chapters || chapters.length === 0) throw new Error("Cannot publish a book with no chapters.");

  // 1. Resilient cover upload
  let coverURL = null;
  let coverSize = 0;
  
  if (coverFile && storage) {
    try {
      coverURL = await uploadCoverImage(storage, coverFile, bookId);
      coverSize = coverFile.size;
    } catch (e) {
      console.warn("Cover art failed to upload, continuing with manuscript publishing:", e);
    }
  }

  // 2. Prepare Metadata
  const metadataInfo = {
    author,
    authorLower: author.toLowerCase(),
    bookTitle: title,
    bookTitleLower: title.toLowerCase(),
    lastUpdated: serverTimestamp(),
    ownerId,
    totalChapters: chapters.length,
    genre: genres,
    views: 0,
    coverURL,
    coverSize,
  };

  // 3. Set Root Document (Non-blocking)
  const bookRef = doc(db, 'books', bookId);
  const rootPayload = {
    title,
    titleLower: title.toLowerCase(),
    author,
    authorLower: author.toLowerCase(),
    genre: genres,
    views: 0,
    isCloud: true,
    ownerId,
    createdAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
    coverURL,
    coverSize,
    metadata: { info: metadataInfo },
    chapters: chapters.map(ch => ({
      chapterNumber: ch.chapterNumber,
      title: ch.title || `Chapter ${ch.chapterNumber}`
    }))
  };

  setDoc(bookRef, rootPayload, { merge: true }).catch(async (serverError) => {
    const permissionError = new FirestorePermissionError({
      path: bookRef.path,
      operation: 'write',
      requestResourceData: rootPayload,
    });
    errorEmitter.emit('permission-error', permissionError);
  });

  // 4. Global Stats Update: Accumulate the exact bytes used
  if (coverSize > 0 && coverURL) {
    const statsRef = doc(db, 'stats', 'storageUsage');
    setDoc(statsRef, { 
      storageBytesUsed: increment(coverSize) 
    }, { merge: true }).catch(() => {});
  }

  // 5. Parallel Non-Blocking Chapter Uploads
  chapters.forEach((ch) => {
    const chRef = doc(db, 'books', bookId, 'chapters', ch.chapterNumber.toString());
    const cleanedContent = cleanManuscriptContent(ch.content);
    
    const chData = {
      chapterNumber: ch.chapterNumber,
      content: cleanedContent,
      title: ch.title || `Chapter ${ch.chapterNumber}`,
      ownerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    setDoc(chRef, chData, { merge: true }).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: chRef.path,
        operation: 'write',
        requestResourceData: chData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  });

  return { bookId, coverURL };
}
