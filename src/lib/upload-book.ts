import { doc, setDoc, serverTimestamp, Firestore } from "firebase/firestore";
import { FirebaseStorage } from "firebase/storage";
import { uploadCoverImage } from "./upload-cover";

interface Chapter {
  chapterNumber: number;
  content: string;
  title?: string;
}

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
  const coverImage = await uploadCoverImage(storage, coverFile, bookId);

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
    coverImage,
  };

  // 3. Set Root Document (for search and discovery)
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
    coverImage,
    metadata: { info: metadataInfo }
  };

  await setDoc(bookRef, rootPayload, { merge: true });

  // 4. Set Detailed Metadata
  const infoRef = doc(db, 'books', bookId, 'metadata', 'info');
  await setDoc(infoRef, metadataInfo, { merge: true });

  // 5. Set Chapters
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

  return { bookId, coverImage };
}
