
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, limit, doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { firebaseConfig } from "@/firebase/config";
import EPub from "epub2";
import fetch from "node-fetch";
import fs from "fs";

// Initialize Firebase for server-side usage using the centralized config
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Remove UI artifacts and zero-width characters.
 */
function cleanText(text: string) {
  return text
    .replace(/Restore scroll position.*?\n?/gi, "")
    .replace(/\u200B/g, "")
    .trim();
}

/**
 * Robust HTML to Text conversion for EPUB content.
 * Preserves semantic paragraph spacing.
 */
function htmlToReadableText(html: string): string {
  // Replace block tags with newlines to preserve structure
  let text = html
    .replace(/<(p|div|h[1-6]|li|br|section|article)[^>]*>/gi, '\n')
    .replace(/<\/ (p|div|h[1-6]|li|section|article)>/gi, '\n');
  
  // Remove all other tags
  text = text.replace(/<[^>]*>/g, ' ');
  
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"');

  // Clean up whitespace and ensure double-newlines for paragraphs
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n\n');
}

/**
 * Remove legal-safe credits/watermarks.
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
 * Deterministic chapter splitting using regex for pasted text.
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
 * Download file from URL.
 */
async function downloadFile(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file: ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer);
}

/**
 * Parse EPUB buffer into metadata + clean text chapters.
 */
async function parseEpubFromBuffer(buffer: Buffer): Promise<any> {
  const tmpPath = `/tmp/${Date.now()}.epub`;
  fs.writeFileSync(tmpPath, buffer);

  return new Promise((resolve, reject) => {
    const epub = new EPub(tmpPath);
    
    const timeout = setTimeout(() => {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      reject(new Error("EPUB parsing timed out after 30 seconds."));
    }, 30000);

    epub.on("end", async function () {
      clearTimeout(timeout);
      try {
        const chapters = [];
        for (let item of epub.flow) {
          if (!item.id) continue;
          
          // Only process text items
          const manifestItem = epub.manifest[item.id];
          const mediaType = manifestItem?.['media-type'] || '';
          if (mediaType && !mediaType.includes('xml') && !mediaType.includes('html') && !mediaType.includes('text')) {
            continue;
          }

          const rawData = await new Promise<any>((res, rej) => {
            epub.getChapter(item.id, (err, txt) => (err ? rej(err) : res(txt || "")));
          });
          
          // Handle both string and Buffer output
          const html = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : rawData;
          const cleanBody = htmlToReadableText(html);
          const finalContent = removeCredits(cleanText(cleanBody));
          
          if (finalContent.length > 50) {
            chapters.push({
              title: item.title || "Untitled Chapter",
              content: finalContent
            });
          }
        }
        resolve({
          title: epub.metadata.title || "Unknown Title",
          author: epub.metadata.creator || "Unknown Author",
          chapters
        });
      } catch (err) {
        reject(err);
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
    });

    epub.on("error", (err) => {
      clearTimeout(timeout);
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      reject(err);
    });

    epub.parse();
  });
}

/**
 * Main API Route Handler.
 */
export async function POST(req: Request) {
  try {
    const { fileUrl, pastedText, ownerId, overrideMetadata, returnOnly } = await req.json();
    let parsedBook;

    if (fileUrl) {
      const buffer = await downloadFile(fileUrl);
      parsedBook = await parseEpubFromBuffer(buffer);
    } else if (pastedText) {
      const clean = removeCredits(cleanText(pastedText));
      parsedBook = {
        title: overrideMetadata?.title || "Pasted Manuscript",
        author: overrideMetadata?.author || "Anonymous",
        chapters: splitChapters(clean)
      };
    } else {
      return Response.json({ error: "No file or text provided" }, { status: 400 });
    }

    const finalTitle = overrideMetadata?.title || parsedBook.title;
    const finalAuthor = overrideMetadata?.author || parsedBook.author;
    const finalGenres = overrideMetadata?.genres || ['Ingested'];

    // If client just wants the parsed data (e.g. for Private Archive)
    if (returnOnly) {
      return Response.json({ 
        success: true, 
        book: {
          title: finalTitle,
          author: finalAuthor,
          genres: finalGenres,
          chapters: parsedBook.chapters
        }
      });
    }

    // 1. Check if book exists, or create it
    const bookQuery = query(
      collection(db, "books"),
      where("titleLower", "==", finalTitle.toLowerCase()),
      limit(1)
    );
    const existingBook = await getDocs(bookQuery);

    let bookId;
    let currentMaxChapter = 0;
    if (!existingBook.empty) {
      bookId = existingBook.docs[0].id;
      const data = existingBook.docs[0].data();
      currentMaxChapter = data.metadata?.info?.totalChapters || 0;
    } else {
      const newBookRef = doc(collection(db, "books"));
      bookId = newBookRef.id;
      
      await setDoc(newBookRef, {
        title: finalTitle,
        titleLower: finalTitle.toLowerCase(),
        author: finalAuthor,
        authorLower: finalAuthor.toLowerCase(),
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        isCloud: true,
        ownerId: ownerId || 'system',
        views: 0,
        genre: finalGenres,
        metadata: { info: { 
          author: finalAuthor, 
          bookTitle: finalTitle, 
          totalChapters: 0, 
          genre: finalGenres, 
          lastUpdated: serverTimestamp() 
        } }
      });
    }

    // 2. Insert Chapters into subcollection
    let chapterIndex = 1;
    let ingestMaxChapter = 0;
    for (const chap of parsedBook.chapters) {
      const chRef = doc(db, "books", bookId, "chapters", chapterIndex.toString());
      await setDoc(chRef, {
        chapterNumber: chapterIndex, 
        title: chap.title,
        content: chap.content,
        createdAt: serverTimestamp(),
        ownerId: ownerId || 'system'
      });
      ingestMaxChapter = chapterIndex;
      chapterIndex++;
    }

    // 3. Update parent metadata with correct max count
    const finalTotalChapters = Math.max(currentMaxChapter, ingestMaxChapter);
    await setDoc(doc(db, "books", bookId), {
      'metadata.info.totalChapters': finalTotalChapters,
      'lastUpdated': serverTimestamp()
    }, { merge: true });

    return Response.json({ success: true, bookId, chaptersAdded: ingestMaxChapter });

  } catch (err: any) {
    console.error("Ingest API Error:", err);
    return Response.json({ error: "Processing failed", details: err.message }, { status: 500 });
  }
}
