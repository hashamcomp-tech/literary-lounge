import { doc, setDoc, serverTimestamp, Firestore, writeBatch, getDoc } from "firebase/firestore";
import { FirebaseStorage } from "firebase/storage";
import { uploadCoverImage } from "./upload-cover";

/**
 * Clean manuscript artifacts and normalize whitespace.
 * UPDATED: Now returns the raw text to preserve user formatting as requested.
 */
export function cleanContent(text: string): string {
  if (!text) return "";
  // Return the text exactly as provided to maintain absolute format fidelity
  return text;
}

/**
 * Uploads a book to the cloud.
 * Chapters saved to Firestore, Cover saved to Vercel Blob.
 */
export async function uploadBookToCloud({
  db, storage, bookId, title, author, genres, rawContent, coverFile, ownerId, manualChapterInfo, preParsedChapters
}: {
  db: Firestore;
  storage: FirebaseStorage;
  bookId: string;
  title: string;
  author: string;
  genres: string[];
  rawContent?: string;
  coverFile?: File | null;
  ownerId: string;
  manualChapterInfo?: { number: number; title: string };
  preParsedChapters?: { title: string; content: string }[];
}) {
  let chapters: { chapterNumber: number; title: string; content: string }[] = [];

  if (preParsedChapters && preParsedChapters.length > 0) {
    chapters = preParsedChapters.map((ch, i) => ({
      chapterNumber: i + 1,
      title: ch.title || `Chapter ${i + 1}`,
      content: cleanContent(ch.content)
    }));
  } else if (manualChapterInfo && rawContent) {
    chapters = [{
      chapterNumber: manualChapterInfo.number,
      title: manualChapterInfo.title,
      content: cleanContent(rawContent)
    }];
  }

  if (chapters.length === 0) throw new Error("No content detected.");

  const bookRef = doc(db, 'books', bookId);
  const existingSnap = await getDoc(bookRef);
  const existingData = existingSnap.exists() ? existingSnap.data() : null;
  
  const currentMax = existingData?.metadata?.info?.totalChapters || 0;
  const uploadMax = Math.max(...chapters.map(ch => ch.chapterNumber));
  const finalTotal = Math.max(currentMax, uploadMax);

  // Cover art synchronized to Vercel Blob
  let coverURL = existingData?.coverURL || null;
  let coverSize = existingData?.coverSize || 0;
  if (coverFile) {
    coverURL = await uploadCoverImage(storage, coverFile, bookId);
    coverSize = coverFile.size;
  }

  const metadataInfo = {
    author, bookTitle: title, totalChapters: finalTotal, genre: genres,
    coverURL, coverSize, lastUpdated: serverTimestamp()
  };

  const rootPayload = {
    title, titleLower: title.toLowerCase(),
    author, authorLower: author.toLowerCase(),
    genre: genres, views: existingData?.views || 0,
    isCloud: true, ownerId,
    createdAt: existingData?.createdAt || serverTimestamp(),
    lastUpdated: serverTimestamp(),
    coverURL, coverSize,
    metadata: { info: metadataInfo }
  };

  // Root metadata document in Firestore
  await setDoc(bookRef, rootPayload, { merge: true });

  // Structured chapter sub-collection in Firestore for fast lookup and buffering
  const batch = writeBatch(db);
  chapters.forEach((ch) => {
    const chRef = doc(db, "books", bookId, "chapters", ch.chapterNumber.toString());
    batch.set(chRef, {
      chapterNumber: ch.chapterNumber,
      content: ch.content,
      title: ch.title,
      ownerId, createdAt: serverTimestamp()
    });
  });

  await batch.commit();
  return { bookId, coverURL };
}
