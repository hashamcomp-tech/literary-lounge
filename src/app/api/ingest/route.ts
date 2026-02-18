
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc, query, where, getDocs, orderBy, limit, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseConfig } from "@/firebase/config";
import EPub from "epub2";
import fetch from "node-fetch";
import fs from "fs";

// Initialize Firebase for server-side usage
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Remove UI artifacts and zero-width characters
 */
function cleanText(text: string) {
  return text
    .replace(/Restore scroll position.*?\n?/gi, "")
    .replace(/\u200B/g, "")
    .trim();
}

/**
 * Remove legal-safe credits/watermarks
 */
function removeCredits(text: string) {
  const patterns = [
    /Project Gutenberg.*?\n/gi,
    /©.*?\n/gi,
    /All rights reserved.*?\n/gi,
    /Converted by.*?\n/gi,
    /This ebook.*?is for.*?\n/gi
  ];
  let cleaned = text;
  patterns.forEach(p => { cleaned = cleaned.replace(p, ""); });
  return cleaned.trim();
}

/**
 * Split large text into chunks
 */
function chunkText(text: string, size = 15000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

/**
 * Deterministic chapter splitting
 */
function splitChapters(text: string) {
  const chapterRegex = /(chapter\s+\d+|chapter\s+[ivxlcdm]+|\n\d+\.)/gi;
  const matches = [...text.matchAll(chapterRegex)];
  if (!matches.length) return [{ title: "Full Volume", content: text }];

  const chapters = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = matches[i + 1]?.index || text.length;
    chapters.push({
      title: matches[i][0].trim(),
      content: text.slice(start, end).trim()
    });
  }
  return chapters;
}

/**
 * Download file from URL
 */
async function downloadFile(url: string) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer);
}

/**
 * Parse EPUB buffer
 */
async function parseEpubFromBuffer(buffer: Buffer): Promise<any> {
  const tmpPath = `/tmp/${Date.now()}.epub`;
  fs.writeFileSync(tmpPath, buffer);

  return new Promise((resolve, reject) => {
    const epub = new EPub(tmpPath);
    epub.on("end", async function () {
      const chapters = [];
      for (let item of epub.flow) {
        const text = await new Promise<string>((res, rej) => {
          epub.getChapter(item.id, (err, txt) => (err ? rej(err) : res(cleanText(txt))));
        });
        chapters.push({
          title: item.title || "Untitled",
          content: removeCredits(text)
        });
      }
      resolve({
        title: epub.metadata.title || "Unknown Title",
        author: epub.metadata.creator || "Unknown Author",
        chapters
      });
    });
    epub.on("error", reject);
    epub.parse();
  });
}

/**
 * Main API Route Handler
 */
export async function POST(req: Request) {
  try {
    const { fileUrl, pastedText, ownerId } = await req.json();
    let parsedBook;

    if (fileUrl) {
      const buffer = await downloadFile(fileUrl);
      parsedBook = await parseEpubFromBuffer(buffer);
    } else if (pastedText) {
      const clean = removeCredits(cleanText(pastedText));
      parsedBook = {
        title: "Pasted Manuscript",
        author: "Anonymous",
        chapters: splitChapters(clean)
      };
    } else {
      return Response.json({ error: "No file or text provided" }, { status: 400 });
    }

    // 1. Check/Create Book
    const bookQuery = query(
      collection(db, "books"),
      where("title", "==", parsedBook.title),
      limit(1)
    );
    const existingBook = await getDocs(bookQuery);

    let bookId;
    if (!existingBook.empty) {
      bookId = existingBook.docs[0].id;
    } else {
      const newBookRef = doc(collection(db, "books"));
      bookId = newBookRef.id;
      await setDoc(newBookRef, {
        title: parsedBook.title,
        titleLower: parsedBook.title.toLowerCase(),
        author: parsedBook.author,
        authorLower: parsedBook.author.toLowerCase(),
        createdAt: serverTimestamp(),
        isCloud: true,
        ownerId: ownerId || 'system',
        views: 0,
        genre: ['Ingested']
      });
    }

    // 2. Insert Chapters
    let chapterIndex = 1;
    for (const chap of parsedBook.chapters) {
      const chunks = chunkText(chap.content);
      for (const chunk of chunks) {
        const chRef = doc(db, "books", bookId, "chapters", chapterIndex.toString());
        await setDoc(chRef, {
          chapterNumber: chapterIndex,
          title: chap.title,
          content: chunk,
          createdAt: serverTimestamp(),
          ownerId: ownerId || 'system'
        });
        chapterIndex++;
      }
    }

    // 3. Update total chapters
    await setDoc(doc(db, "books", bookId), {
      'metadata.info.totalChapters': chapterIndex - 1
    }, { merge: true });

    return Response.json({ success: true, bookId, chaptersAdded: chapterIndex - 1 });

  } catch (err: any) {
    console.error(err);
    return Response.json({ error: "Processing failed", details: err.message }, { status: 500 });
  }
}
