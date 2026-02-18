import { doc, setDoc, serverTimestamp, Firestore, increment, writeBatch, getDoc } from "firebase/firestore";
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
 * Parses full manuscript text into chapters using regex if structured chapters aren't provided.
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
      let number = /^[0-9]+$/.test(numStr) ? parseInt(numStr) : romanToInt(numStr);
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
 * Clean manuscript artifacts.
 */
function cleanContent(text: string): string {
  if (!text) return "";
  return text
    .replace(/ISBN\s*(?:-13|-10)?[:\s]+[0-9-]{10,17}/gi, "")
    .replace(/Page\s+\d+\s+of\s+\d+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Uploads a book to the cloud with optional pre-parsed chapters.
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
  let chapters: any[] = [];
  let detectedTitle = title;

  // 1. Determine Chapter Structure
  if (preParsedChapters && preParsedChapters.length > 0) {
    // Use high-fidelity chapters from the Ingest API
    chapters = preParsedChapters.map((ch, i) => ({
      chapterNumber: i + 1,
      title: ch.title || `Chapter ${i + 1}`,
      content: cleanContent(ch.content)
    }));
  } else if (manualChapterInfo && rawContent) {
    // Use manual single chapter entry
    chapters = [{
      chapterNumber: manualChapterInfo.number,
      title: manualChapterInfo.title,
      content: cleanContent(rawContent)
    }];
  } else if (rawContent) {
    // Fallback to legacy regex splitting
    const parsed = parseBookWithChapters(rawContent);
    chapters = parsed.chapters.map(ch => ({
      ...ch,
      chapterNumber: ch.number,
      content: cleanContent(ch.content)
    }));
    detectedTitle = title || parsed.title;
  }

  if (chapters.length === 0) {
    throw new Error("No manuscript content detected for upload.");
  }

  // 2. Fetch/Create Metadata
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

  // 3. Commit to Firestore
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
