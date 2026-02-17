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
 * Prevents Firestore size limit errors by storing chapter content only in subcollections.
 */
export async function uploadBookToCloud({
  db,
  storage,
  bookId,
  title,
  author,
  genre,
  chapters,
  coverFile,
  ownerId
}: {
  db: Firestore;
  storage: FirebaseStorage;
  bookId: string;
  title: string;
  author: string;
  genre: string;
  chapters: Chapter[];
  coverFile?: File | null;
  ownerId: string;
}) {
  if (!genre) throw new Error("Genre is required for cloud books.");
  if (!chapters || chapters.length === 0) throw new Error("Cannot publish a book with no chapters.");

  // 1. Upload cover to Storage (if provided)
  let coverURL = null;
  let coverSize = 0;
  
  if (coverFile) {
    try {
      coverURL = await uploadCoverImage(storage, coverFile, bookId);
      coverSize = coverFile.size;
    } catch (e) {
      console.warn("Cover image upload failed, proceeding without it:", e);
      // We don't throw here to ensure the manuscript still gets published even if storage is finicky
    }
  }

  // 2. Prepare Metadata
  // We keep the main document small by NOT storing full chapter content here.
  const metadataInfo = {
    author,
    authorLower: author.toLowerCase(),
    bookTitle: title,
    bookTitleLower: title.toLowerCase(),
    lastUpdated: serverTimestamp(),
    ownerId,
    totalChapters: chapters.length,
    genre,
    views: 0,
    coverURL,
    coverSize,
  };

  // 3. Set Root Document (Metadata and Table of Contents only)
  const bookRef = doc(db, 'books', bookId);
  const rootPayload = {
    title,
    titleLower: title.toLowerCase(),
    author,
    authorLower: author.toLowerCase(),
    genre,
    views: 0,
    isCloud: true,
    ownerId,
    createdAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
    coverURL,
    coverSize,
    metadata: { info: metadataInfo },
    // Important: We only store chapter list metadata here, NOT the 'content' string
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

  // 4. Update Global Storage Usage Stats (Atomic)
  if (coverSize > 0) {
    const statsRef = doc(db, 'stats', 'storageUsage');
    setDoc(statsRef, { 
      storageBytesUsed: increment(coverSize) 
    }, { merge: true }).catch(() => {
      // Stats failure shouldn't block the user
    });
  }

  // 5. Set Chapters in subcollection (This is where the actual content lives)
  // We use non-blocking calls to speed up the UI response
  for (const ch of chapters) {
    const chRef = doc(db, 'books', bookId, 'chapters', ch.chapterNumber.toString());
    const chData = {
      ...ch,
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
  }

  return { bookId, coverURL };
}