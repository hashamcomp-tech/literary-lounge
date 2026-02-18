import { doc, setDoc, serverTimestamp, Firestore, increment } from "firebase/firestore";
import { FirebaseStorage } from "firebase/storage";
import { uploadCoverImage } from "./upload-cover";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { structureBook } from '@/ai/flows/structure-book';

interface Chapter {
  chapterNumber: number;
  content: string;
  title?: string;
}

/**
 * Aggressively strips index entries, watermarks, and legal boilerplate.
 */
function cleanManuscriptContent(text: string): string {
  if (!text) return "";
  
  return text
    // 1. Strip index patterns (e.g., "About.com, 286" or "Topic ... 123")
    .replace(/^[A-Z][a-zA-Z0-9\s.-]+,?\s\.+\s\d+\s*$/gm, "")
    .replace(/^[A-Z][a-zA-Z0-9\s.-]+,\s\d+(?:–\d+)?\s*$/gm, "")
    // 2. Strip ISBN and technical metadata
    .replace(/ISBN\s*(?:-13|-10)?[:\s]+[0-9-]{10,17}/gi, "")
    // 3. Strip publisher address blocks and signatures
    .replace(/^[0-9]+\s+[A-Z][a-zA-Z\s.-]+,\s*[A-Z]{2}\s*\d{5}.*$/gm, "")
    .replace(/Published by .* imprint of .*/gi, "")
    .replace(/A CIP catalogue record for this book is available from .*/gi, "")
    // 4. Strip legal assertions
    .replace(/.*asserted (his|her|their) right to be identified.*/gi, "")
    .replace(/All rights reserved\. No part of this (book|work|text).*/gi, "")
    .replace(/This ebook is copyright material.*/gi, "")
    // 5. Cleanup artifacts
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Automatically segments a large body of text into chapters using AI structural clues.
 */
function segmentTextIntoChapters(fullText: string, structure: any): Chapter[] {
  const chapters: Chapter[] = [];
  let remainingText = fullText;

  for (let i = 0; i < structure.chapters.length; i++) {
    const current = structure.chapters[i];
    const next = structure.chapters[i + 1];
    
    const startIndex = remainingText.indexOf(current.startPhrase);
    if (startIndex === -1) continue;

    let endIndex = remainingText.length;
    if (next) {
      const nextIndex = remainingText.indexOf(next.startPhrase, startIndex + current.startPhrase.length);
      if (nextIndex !== -1) {
        endIndex = nextIndex;
      }
    }

    const content = remainingText.substring(startIndex, endIndex).trim();
    chapters.push({
      chapterNumber: i + 1,
      title: current.title,
      content: content
    });
  }

  // Fallback: If AI couldn't find boundaries, treat as one chapter
  if (chapters.length === 0) {
    chapters.push({
      chapterNumber: 1,
      title: "Full Manuscript",
      content: fullText
    });
  }

  return chapters;
}

/**
 * Refined process for publishing novels with automatic AI chapter division.
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
  ownerId
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
}) {
  if (!genres || genres.length === 0) throw new Error("At least one genre is required.");
  if (!rawContent) throw new Error("Manuscript content is empty.");

  // 1. AI Structural Analysis
  const analysisResult = await structureBook({ text: rawContent.substring(0, 100000) });
  const chapters = segmentTextIntoChapters(rawContent, analysisResult);

  // 2. Resilient cover upload
  let coverURL = null;
  let coverSize = 0;
  if (coverFile && storage) {
    try {
      coverURL = await uploadCoverImage(storage, coverFile, bookId);
      coverSize = coverFile.size;
    } catch (e) {
      console.warn("Cover upload failed, continuing without art.");
    }
  }

  // 3. Prepare Metadata
  const metadataInfo = {
    author,
    authorLower: author.toLowerCase(),
    bookTitle: title,
    bookTitleLower: title.toLowerCase(),
    lastUpdated: serverTimestamp(),
    ownerId,
    totalChapters: chapters.length,
    genre: genres,
    views: 0,
    coverURL,
    coverSize,
  };

  // 4. Set Root Document
  const bookRef = doc(db, 'books', bookId);
  const rootPayload = {
    title,
    titleLower: title.toLowerCase(),
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
      title: ch.title || `Chapter ${ch.chapterNumber}`
    }))
  };

  setDoc(bookRef, rootPayload, { merge: true }).catch(async (serverError) => {
    errorEmitter.emit('permission-error', new FirestorePermissionError({
      path: bookRef.path,
      operation: 'write',
      requestResourceData: rootPayload,
    }));
  });

  // 5. Global Stats
  if (coverSize > 0) {
    const statsRef = doc(db, 'stats', 'storageUsage');
    setDoc(statsRef, { storageBytesUsed: increment(coverSize) }, { merge: true }).catch(() => {});
  }

  // 6. Chapter Uploads
  chapters.forEach((ch) => {
    const chRef = doc(db, 'books', bookId, 'chapters', ch.chapterNumber.toString());
    const cleaned = cleanManuscriptContent(ch.content);
    
    const chData = {
      chapterNumber: ch.chapterNumber,
      content: cleaned,
      title: ch.title || `Chapter ${ch.chapterNumber}`,
      ownerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    setDoc(chRef, chData, { merge: true }).catch(async (serverError) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: chRef.path,
        operation: 'write',
        requestResourceData: chData,
      }));
    });
  });

  return { bookId, coverURL };
}
