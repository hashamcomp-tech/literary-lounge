import { doc, deleteDoc, getDoc, updateDoc, increment, collection, getDocs, writeBatch, Firestore } from "firebase/firestore";

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
  await batch.commit();

  // 6. Update Global Storage Usage Stats (Decrement)
  if (coverSize > 0) {
    const statsRef = doc(db, 'stats', 'storageUsage');
    updateDoc(statsRef, { 
      storageBytesUsed: increment(-coverSize) 
    }).catch((err) => {
      console.warn("Failed to update storage stats during deletion:", err);
    });
  }
}
