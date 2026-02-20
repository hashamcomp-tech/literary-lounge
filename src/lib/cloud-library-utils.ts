
import { doc, deleteDoc, getDoc, updateDoc, increment, collection, getDocs, writeBatch, Firestore, serverTimestamp, setDoc } from "firebase/firestore";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { deleteFromVercelBlob } from "@/app/actions/upload";

/**
 * Handles the complete removal of a cloud novel and its associated data.
 * Purges Firestore documents and removes binary assets from cloud storage.
 */
export async function deleteCloudBook(db: Firestore, bookId: string) {
  const bookRef = doc(db, 'books', bookId);
  const bookSnap = await getDoc(bookRef);
  
  if (!bookSnap.exists()) {
    throw new Error("Cloud manuscript not found.");
  }
  
  const data = bookSnap.data();
  const coverURL = data.coverURL || data.metadata?.info?.coverURL;
  const coverSize = data.coverSize || data.metadata?.info?.coverSize || 0;

  const chaptersRef = collection(db, 'books', bookId, 'chapters');
  const chaptersSnap = await getDocs(chaptersRef);
  const batch = writeBatch(db);
  
  chaptersSnap.forEach(snap => {
    batch.delete(snap.ref);
  });
  
  batch.delete(doc(db, 'books', bookId, 'metadata', 'info'));
  batch.delete(bookRef);
  
  await batch.commit().catch(async (serverError) => {
    const permissionError = new FirestorePermissionError({
      path: bookRef.path,
      operation: 'delete',
    });
    errorEmitter.emit('permission-error', permissionError);
    throw serverError;
  });

  // 1. Cleanup Visual Assets from Cloud Storage
  if (coverURL) {
    await deleteFromVercelBlob(coverURL);
  }

  // 2. Update Global Storage Usage Stats (Decrement)
  if (coverSize > 0) {
    const statsRef = doc(db, 'stats', 'storageUsage');
    setDoc(statsRef, { 
      storageBytesUsed: increment(-coverSize) 
    }, { merge: true }).catch(() => {});
  }
}

/**
 * Updates or adds a cover to an existing cloud book.
 * Automatically purges the old cover from storage to prevent bloat.
 */
export async function updateCloudBookCover(
  db: Firestore, 
  bookId: string, 
  coverURL: string, 
  coverSize: number
) {
  const bookRef = doc(db, 'books', bookId);
  const bookSnap = await getDoc(bookRef);
  
  if (!bookSnap.exists()) throw new Error("Manuscript not found.");
  
  const oldData = bookSnap.data();
  const oldCoverURL = oldData.coverURL || oldData.metadata?.info?.coverURL;
  const oldSize = oldData.coverSize || oldData.metadata?.info?.coverSize || 0;

  const updatePayload = {
    coverURL,
    coverSize,
    'metadata.info.coverURL': coverURL,
    'metadata.info.coverSize': coverSize,
    lastUpdated: serverTimestamp()
  };

  await updateDoc(bookRef, updatePayload).catch(async (err) => {
    errorEmitter.emit('permission-error', new FirestorePermissionError({
      path: bookRef.path,
      operation: 'update',
      requestResourceData: updatePayload
    }));
    throw err;
  });

  // 1. Cleanup the old cover if it's different and stored in the cloud
  if (oldCoverURL && oldCoverURL !== coverURL) {
    await deleteFromVercelBlob(oldCoverURL);
  }

  // 2. Update Global Stats: Subtract old size and add new size
  const statsRef = doc(db, 'stats', 'storageUsage');
  const sizeDiff = coverSize - oldSize;
  
  if (sizeDiff !== 0) {
    await setDoc(statsRef, { 
      storageBytesUsed: increment(sizeDiff) 
    }, { merge: true }).catch(() => {});
  }
}

/**
 * Updates basic bibliographic metadata for a cloud novel.
 */
export async function updateCloudBookMetadata(
  db: Firestore, 
  bookId: string, 
  updates: { title: string, author: string }
) {
  const bookRef = doc(db, 'books', bookId);
  const payload = {
    title: updates.title,
    titleLower: updates.title.toLowerCase(),
    author: updates.author,
    authorLower: updates.author.toLowerCase(),
    'metadata.info.bookTitle': updates.title,
    'metadata.info.author': updates.author,
    lastUpdated: serverTimestamp()
  };

  await updateDoc(bookRef, payload).catch(async (err) => {
    errorEmitter.emit('permission-error', new FirestorePermissionError({
      path: bookRef.path,
      operation: 'update',
      requestResourceData: payload
    }));
    throw err;
  });
}
