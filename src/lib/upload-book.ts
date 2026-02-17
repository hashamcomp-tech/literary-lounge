
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
    genre: genres, // Saved as array
    views: 0,
    coverURL,
    coverSize,
  };

  // 3. Set Root Document
  const bookRef = doc(db, 'books', bookId);
  const rootPayload = {
    title,
    titleLower: title.toLowerCase(),
    author,
    authorLower: author.toLowerCase(),
    genre: genres, // Saved as array for array-contains queries
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

  await setDoc(bookRef, rootPayload, { merge: true }).catch(async (serverError) => {
    const permissionError = new FirestorePermissionError({
      path: bookRef.path,
      operation: 'write',
      requestResourceData: rootPayload,
    });
    errorEmitter.emit('permission-error', permissionError);
    throw serverError;
  });

  // 4. Global Stats Update (only if cover actually uploaded)
  if (coverSize > 0 && coverURL) {
    const statsRef = doc(db, 'stats', 'storageUsage');
    setDoc(statsRef, { 
      storageBytesUsed: increment(coverSize) 
    }, { merge: true }).catch(() => {});
  }

  // 5. Parallel Chapter Uploads
  const chapterPromises = chapters.map(async (ch) => {
    const chRef = doc(db, 'books', bookId, 'chapters', ch.chapterNumber.toString());
    const chData = {
      ...ch,
      title: ch.title || `Chapter ${ch.chapterNumber}`,
      ownerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    return setDoc(chRef, chData, { merge: true }).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: chRef.path,
        operation: 'write',
        requestResourceData: chData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  });

  await Promise.all(chapterPromises);

  return { bookId, coverURL };
}
