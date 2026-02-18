import { doc, setDoc, serverTimestamp, Firestore, increment, collection, getDocs, writeBatch } from "firebase/firestore";
import { FirebaseStorage } from "firebase/storage";
import { uploadCoverImage } from "./upload-cover";

/**
 * Converts Roman numerals to numbers for chapter indexing.
 */
function romanToInt(roman: string): number {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let num = 0, prev = 0;
  roman = roman.toUpperCase();
  for (let i = roman.length - 1; i >= 0; i--) {
    let val = map[roman[i]] || 0;
    if (val < prev) num -= val; else num += val;
    prev = val;
  }
  return num;
}

/**
 * Parses full manuscript text into chapters using regex.
 * Also detects book title from the first non-empty line.
 */
function parseBookWithChapters(text: string): { title: string; chapters: { number: number; title: string; content: string }[] } {
  const lines = text.split(/\r?\n/);
  
  // 1. Detect book title: first non-empty line
  const bookTitle = lines.find(line => line.trim().length > 0)?.trim() || 'Untitled Manuscript';

  const chapterRegex = /^(Chapter|CHAPTER)[\s]*([0-9IVXLCDM]+)\s*(?:[:-]\s*(.*))?$/i;

  let chapters: any[] = [];
  let currentChapter: any = null;

  for (let line of lines) {
    let match = line.match(chapterRegex);
    if (match) {
      if (currentChapter) chapters.push(currentChapter);
      let numStr = match[2];
      let number = /^[0-9]+$/.test(numStr) ? parseInt(numStr) : romanToInt(numStr);
      let title = match[3] ? match[3].trim() : `Chapter ${number}`;
      currentChapter = { number, title, content: "" };
    } else {
      if (currentChapter) currentChapter.content += line + "\n";
    }
  }
  if (currentChapter) chapters.push(currentChapter);
  
  // Fallback if no chapters detected
  if (chapters.length === 0) {
    chapters = [{ number: 1, title: 'Full Volume', content: text }];
  }

  return { title: bookTitle, chapters };
}

/**
 * Aggressively cleans manuscript artifacts.
 */
function cleanContent(text: string): string {
  return text
    .replace(/ISBN\s*(?:-13|-10)?[:\s]+[0-9-]{10,17}/gi, "")
    .replace(/Page\s+\d+\s+of\s+\d+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
  manualChapterInfo 
}: {
  db: Firestore;
  storage: FirebaseStorage;
  bookId: string;
  title: string;
  author: string;
  genres: string[];
  rawContent: string;
  coverFile?: File | null;
  ownerId: string;
  manualChapterInfo?: { number: number; title: string };
}) {
  let chapters: any[] = [];
  let detectedTitle = title;

  if (manualChapterInfo) {
    // Paste Mode: Preserves as single undivided chapter exactly as requested
    chapters = [{
      chapterNumber: manualChapterInfo.number,
      title: manualChapterInfo.title,
      content: cleanContent(rawContent)
    }];
  } else {
    // File Mode: Regex segmentation + title detection
    const parsed = parseBookWithChapters(rawContent);
    chapters = parsed.chapters.map(ch => ({
      ...ch,
      chapterNumber: ch.number,
      content: cleanContent(ch.content)
    }));
    // Use manually entered title if provided, otherwise fallback to detected
    detectedTitle = title || parsed.title;
  }

  // Cover Upload
  let coverURL = null;
  let coverSize = 0;
  if (coverFile && storage) {
    coverURL = await uploadCoverImage(storage, coverFile, bookId);
    coverSize = coverFile.size;
  }

  const bookRef = doc(db, 'books', bookId);
  const metadataInfo = {
    author,
    bookTitle: detectedTitle,
    totalChapters: chapters.length,
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
      title: ch.title
    }))
  };

  await setDoc(bookRef, rootPayload, { merge: true });

  if (coverSize > 0) {
    const statsRef = doc(db, 'stats', 'storageUsage');
    setDoc(statsRef, { storageBytesUsed: increment(coverSize) }, { merge: true }).catch(() => {});
  }

  const batch = writeBatch(db);
  chapters.forEach((ch) => {
    const chRef = doc(db, 'books', bookId, 'chapters', ch.chapterNumber.toString());
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
