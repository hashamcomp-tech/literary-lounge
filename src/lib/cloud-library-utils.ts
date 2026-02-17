import { doc, deleteDoc, getDoc, updateDoc, increment, collection, getDocs, writeBatch, Firestore } from "firebase/firestore";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * Handles the complete removal of a cloud novel and its associated data.
 * This includes cleaning up subcollections and updating global statistics.
 * 
 * @param db The Firestore instance.
 * @param bookId The unique ID of the book to delete.
 */
export async function deleteCloudBook(db: Firestore, bookId: string) {
  const bookRef = doc(db, 'books', bookId);
  const bookSnap = await getDoc(bookRef);
  
  if (!bookSnap.exists()) {
    throw new Error("Cloud manuscript not found.");
  }
  
  const data = bookSnap.data();
  const coverSize = data.coverSize || 0;

  // 1. Prepare for cleanup of chapters subcollection
  const chaptersRef = collection(db, 'books', bookId, 'chapters');
  const chaptersSnap = await getDocs(chaptersRef);
  const batch = writeBatch(db);
  
  // 2. Stage deletions for all chapters
  chaptersSnap.forEach(snap => {
    batch.delete(snap.ref);
  });
  
  // 3. Stage deletion for metadata info
  batch.delete(doc(db, 'books', bookId, 'metadata', 'info'));
  
  // 4. Stage deletion for the root document
  batch.delete(bookRef);
  
  // 5. Commit the batch
  await batch.commit().catch(async (serverError) => {
    const permissionError = new FirestorePermissionError({
      path: bookRef.path,
      operation: 'delete',
    });
    errorEmitter.emit('permission-error', permissionError);
    throw serverError;
  });

  // 6. Update Global Storage Usage Stats (Decrement)
  if (coverSize > 0) {
    const statsRef = doc(db, 'stats', 'storageUsage');
    updateDoc(statsRef, { 
      storageBytesUsed: increment(-coverSize) 
    }).catch(async (err) => {
      // Background update failure is logged but doesn't block deletion success
    });
  }
}

/**
 * Deletes a specific chapter from a cloud book.
 * Updates both the chapters subcollection and the root document's cached chapters array.
 */
export async function deleteCloudChapter(db: Firestore, bookId: string, chapterNumber: number) {
  const bookRef = doc(db, 'books', bookId);
  const chapterRef = doc(db, 'books', bookId, 'chapters', chapterNumber.toString());
  
  // Get current book data to update the cached array
  const bookSnap = await getDoc(bookRef);
  if (!bookSnap.exists()) {
    throw new Error("Parent manuscript not found.");
  }

  const data = bookSnap.data();
  const currentChapters = data.chapters || [];
  const updatedChapters = currentChapters.filter((ch: any) => Number(ch.chapterNumber) !== chapterNumber);
  
  const batch = writeBatch(db);
  
  // Remove from subcollection
  batch.delete(chapterRef);
  
  // Update root document cache and total count
  batch.update(bookRef, { 
    chapters: updatedChapters,
    'metadata.info.totalChapters': updatedChapters.length,
    lastUpdated: new Date().toISOString()
  });

  // Update metadata/info document as well for consistency
  const infoRef = doc(db, 'books', bookId, 'metadata', 'info');
  batch.update(infoRef, {
    totalChapters: updatedChapters.length,
    lastUpdated: new Date().toISOString()
  });

  return batch.commit().catch(async (serverError) => {
    const permissionError = new FirestorePermissionError({
      path: chapterRef.path,
      operation: 'delete',
    });
    errorEmitter.emit('permission-error', permissionError);
    throw serverError;
  });
}
