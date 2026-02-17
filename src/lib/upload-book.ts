import { doc, setDoc, serverTimestamp, Firestore, increment, updateDoc } from "firebase/firestore";
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
 * Handles the multi-step process of publishing a novel to the cloud.
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
    coverURL = await uploadCoverImage(storage, coverFile, bookId);
    coverSize = coverFile.size;
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
    genre,
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
    genre,
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
      content: ch.content,
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
    // Using setDoc with merge and increment ensures the doc is created if missing
    await setDoc(statsRef, { 
      storageBytesUsed: increment(coverSize) 
    }, { merge: true }).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: statsRef.path,
        operation: 'update',
        requestResourceData: { storageBytesUsed: increment(coverSize) },
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  }

  // 5. Set Chapters in subcollection
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