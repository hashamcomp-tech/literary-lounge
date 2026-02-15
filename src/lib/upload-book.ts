import { doc, setDoc, serverTimestamp, Firestore, increment, getDoc, updateDoc } from "firebase/firestore";
import { FirebaseStorage } from "firebase/storage";
import { uploadCoverImage } from "./upload-cover";

interface Chapter {
  chapterNumber: number;
  content: string;
  title?: string;
}

/**
 * Handles the multi-step process of publishing a novel to the cloud.
 * 1. Uploads cover image to Storage.
 * 2. Sets searchable root document with full chapters array for fast reading.
 * 3. Sets detailed metadata.
 * 4. Updates global storage stats.
 * 5. Uploads individual chapters to subcollection for scalability.
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
  coverFile: File;
  ownerId: string;
}) {
  if (!genre) throw new Error("Genre is required for cloud books.");
  if (!coverFile) throw new Error("Cover image is required for cloud books.");

  // 1. Upload cover to Storage
  const coverURL = await uploadCoverImage(storage, coverFile, bookId);
  const coverSize = coverFile.size;

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
    coverSize, // Tracking usage
  };

  // 3. Set Root Document (for search and discovery + fast chapter loading)
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
    // Store chapters array in root doc for simplified fast fetching in the reader
    chapters: chapters.map(ch => ({
      ...ch,
      title: ch.title || `Chapter ${ch.chapterNumber}`
    }))
  };

  await setDoc(bookRef, rootPayload, { merge: true });

  // 4. Set Detailed Metadata
  const infoRef = doc(db, 'books', bookId, 'metadata', 'info');
  await setDoc(infoRef, metadataInfo, { merge: true });

  // 5. Update Global Storage Usage Stats
  const statsRef = doc(db, 'stats', 'storageUsage');
  const snap = await getDoc(statsRef);
  if (!snap.exists()) {
    await setDoc(statsRef, { storageBytesUsed: 0 });
  }
  await updateDoc(statsRef, { 
    storageBytesUsed: increment(coverSize) 
  });

  // 6. Set Chapters in subcollection (Maintains scalability for very large books)
  for (const ch of chapters) {
    const chRef = doc(db, 'books', bookId, 'chapters', ch.chapterNumber.toString());
    await setDoc(chRef, {
      ...ch,
      title: ch.title || `Chapter ${ch.chapterNumber}`,
      ownerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  return { bookId, coverURL };
}
