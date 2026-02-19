import { doc, setDoc, serverTimestamp, Firestore, increment, writeBatch, getDoc } from "firebase/firestore";
import { FirebaseStorage } from "firebase/storage";
import { uploadCoverImage } from "./upload-cover";

/**
 * Clean manuscript artifacts and normalize whitespace.
 * Removes common noise like ISBNs, page numbers, and word counts.
 * Handles formatted numbers like [1,473 words].
 */
function cleanContent(text: string): string {
  if (!text) return "";
  return text
    .replace(/ISBN\s*(?:-13|-10)?[:\s]+[0-9-]{10,17}/gi, "")
    .replace(/Page\s+\d+\s+of\s+\d+/gi, "")
    .replace(/\[\s*[\d,.\s]+\s*words\s*\]/gi, "") // REMOVE: formatted word counts like [1,473 words]
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Legacy Fallback: Parses full manuscript text into chapters using regex if structured chapters aren't provided.
 */
function parseBookWithChapters(text: string): { title: string; chapters: { number: number; title: string; content: string }[] } {
  const lines = text.split(/\r?\n/);
  const bookTitle = lines.find(line => line.trim().length > 0)?.trim() || 'Untitled Manuscript';
  const chapterRegex = /^(Chapter|CHAPTER)[\s]*([0-9IVXLCDM]+)\s*(?:[:-]\s*(.*))?$/i;

  let chapters: any[] = [];
  let currentChapter: any = null;

  for (let line of lines) {
    let match = line.match(chapterRegex);
    if (match) {
      if (currentChapter) chapters.push(currentChapter);
      let numStr = match[2];
      let number = /^[0-9]+$/.test(numStr) ? parseInt(numStr) : 1; 
      let title = match[3] ? match[3].trim() : `Chapter ${number}`;
      currentChapter = { number, title, content: "" };
    } else {
      if (currentChapter) currentChapter.content += line + "\n";
    }
  }
  if (currentChapter) chapters.push(currentChapter);
  
  if (chapters.length === 0) {
    chapters = [{ number: 1, title: 'Full Volume', content: text }];
  }

  return { title: bookTitle, chapters };
}

/**
 * Uploads a book to the cloud. Supports both raw text and pre-parsed chapter arrays.
 */
export async function uploadBookToCloud({
  db,
  storage,
  bookId,
  title,
  author,
  genres,
  rawContent,
  coverFile,
  ownerId,
  manualChapterInfo,
  preParsedChapters
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
  let detectedTitle = title;

  // 1. Determine Chapter Structure Logic
  if (preParsedChapters && preParsedChapters.length > 0) {
    // High-fidelity structured path (from EPUB Ingest API)
    chapters = preParsedChapters.map((ch, i) => ({
      chapterNumber: i + 1,
      title: ch.title || `Chapter ${i + 1}`,
      content: cleanContent(ch.content)
    }));
  } else if (manualChapterInfo && rawContent) {
    // Manual single chapter entry path
    chapters = [{
      chapterNumber: manualChapterInfo.number,
      title: manualChapterInfo.title,
      content: cleanContent(rawContent)
    }];
  } else if (rawContent) {
    // Legacy fallback path (regex splitting)
    const parsed = parseBookWithChapters(rawContent);
    chapters = parsed.chapters.map(ch => ({
      ...ch,
      chapterNumber: ch.number,
      content: cleanContent(ch.content)
    }));
    detectedTitle = title || parsed.title;
  }

  if (chapters.length === 0) {
    throw new Error("No readable manuscript content detected.");
  }

  // 2. Build Metadata & Sync Storage
  const bookRef = doc(db, 'books', bookId);
  const existingSnap = await getDoc(bookRef);
  const existingData = existingSnap.exists() ? existingSnap.data() : null;
  
  const currentMaxChapter = existingData?.metadata?.info?.totalChapters || 0;
  const uploadMaxChapter = Math.max(...chapters.map(ch => ch.chapterNumber));
  const finalTotalChapters = Math.max(currentMaxChapter, uploadMaxChapter);

  let coverURL = existingData?.coverURL || null;
  let coverSize = existingData?.coverSize || 0;
  if (coverFile && storage) {
    coverURL = await uploadCoverImage(storage, coverFile, bookId);
    coverSize = coverFile.size;
  }

  const metadataInfo = {
    author,
    bookTitle: detectedTitle,
    totalChapters: finalTotalChapters,
    genre: genres,
    coverURL,
    coverSize,
    lastUpdated: serverTimestamp()
  };

  const rootPayload = {
    title: detectedTitle,
    titleLower: detectedTitle.toLowerCase(),
    author,
    authorLower: author.toLowerCase(),
    genre: genres,
    views: existingData?.views || 0,
    isCloud: true,
    ownerId,
    createdAt: existingData?.createdAt || serverTimestamp(),
    lastUpdated: serverTimestamp(),
    coverURL,
    coverSize,
    metadata: { info: metadataInfo }
  };

  // 3. Batch Transaction for Integrity
  await setDoc(bookRef, rootPayload, { merge: true });

  const batch = writeBatch(db);
  chapters.forEach((ch) => {
    const chRef = doc(db, "books", bookId, "chapters", ch.chapterNumber.toString());
    batch.set(chRef, {
      chapterNumber: ch.chapterNumber,
      content: ch.content,
      title: ch.title,
      ownerId,
      createdAt: serverTimestamp()
    });
  });

  await batch.commit();
  return { bookId, coverURL };
}
