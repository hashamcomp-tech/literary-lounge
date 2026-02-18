
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, limit, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseConfig } from "@/firebase/config";
import EPub from "epub2";
import fs from "fs";
import path from "path";

// Initialize Firebase for server-side usage
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
 * Preserves semantic paragraph spacing and headers.
 */
function htmlToReadableText(html: string): string {
  if (!html) return "";
  
  // Replace block tags with newlines to preserve paragraph structure
  let text = html
    .replace(/<(p|div|h[1-6]|li|section|article)[^>]*>/gi, '\n')
    .replace(/<\/ (p|div|h[1-6]|li|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  
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
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');

  // Normalize whitespace: remove triple+ newlines and trim each line
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n\n');
}

/**
 * Remove common ebook artifacts and watermarks.
 */
function removeCredits(text: string) {
  const patterns = [
    /Project Gutenberg.*?\n/gi,
    /©.*?\n/gi,
    /All rights reserved.*?\n/gi,
    /Converted by.*?\n/gi,
    /This ebook.*?is for.*?\n/gi,
    /http[s]?:\/\/\S+/gi // Remove URLs
  ];
  let cleaned = text;
  patterns.forEach(p => { cleaned = cleaned.replace(p, ""); });
  return cleaned.trim();
}

/**
 * Split chapters for pasted text fallback.
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
 * Download file from URL using native fetch.
 */
async function downloadFile(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Parse EPUB buffer into metadata + clean text chapters.
 */
async function parseEpubFromBuffer(buffer: Buffer): Promise<any> {
  const tmpPath = path.join('/tmp', `${Date.now()}_upload.epub`);
  fs.writeFileSync(tmpPath, buffer);

  return new Promise((resolve, reject) => {
    try {
      const epub = new EPub(tmpPath);
      
      const timeout = setTimeout(() => {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        reject(new Error("EPUB parsing timed out. The file might be too complex or corrupt."));
      }, 45000);

      epub.on("end", async function () {
        clearTimeout(timeout);
        try {
          const chapters = [];
          // Flow contains the ordered list of items to be read
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
          
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          
          if (chapters.length === 0) {
            reject(new Error("No readable text content found in the EPUB."));
            return;
          }

          resolve({
            title: epub.metadata.title || "Unknown Title",
            author: epub.metadata.creator || "Unknown Author",
            chapters
          });
        } catch (err) {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          reject(err);
        }
      });

      epub.on("error", (err) => {
        clearTimeout(timeout);
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        reject(err);
      });

      epub.parse();
    } catch (e) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      reject(e);
    }
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

    const finalTitle = (overrideMetadata?.title || parsedBook.title || "Untitled").trim();
    const finalAuthor = (overrideMetadata?.author || parsedBook.author || "Anonymous").trim();
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

    // 1. Check if book exists
    const bookQuery = query(
      collection(db, "books"),
      where("titleLower", "==", finalTitle.toLowerCase()),
      limit(1)
    );
    const existingBookSnap = await getDocs(bookQuery);

    let bookId;
    let currentMaxChapter = 0;
    let existingData = null;

    if (!existingBookSnap.empty) {
      const docSnap = existingBookSnap.docs[0];
      bookId = docSnap.id;
      existingData = docSnap.data();
      currentMaxChapter = existingData.metadata?.info?.totalChapters || 0;
    } else {
      const newBookRef = doc(collection(db, "books"));
      bookId = newBookRef.id;
    }

    // 2. Insert Chapters
    let ingestMaxChapter = 0;
    for (let i = 0; i < parsedBook.chapters.length; i++) {
      const chap = parsedBook.chapters[i];
      const chapterNumber = i + 1;
      const chRef = doc(db, "books", bookId, "chapters", chapterNumber.toString());
      
      await setDoc(chRef, {
        chapterNumber: chapterNumber, 
        title: chap.title,
        content: chap.content,
        createdAt: serverTimestamp(),
        ownerId: ownerId || 'system'
      });
      ingestMaxChapter = Math.max(ingestMaxChapter, chapterNumber);
    }

    // 3. Update parent metadata
    const finalTotalChapters = Math.max(currentMaxChapter, ingestMaxChapter);
    const bookRef = doc(db, "books", bookId);
    
    await setDoc(bookRef, {
      title: finalTitle,
      titleLower: finalTitle.toLowerCase(),
      author: finalAuthor,
      authorLower: finalAuthor.toLowerCase(),
      createdAt: existingData?.createdAt || serverTimestamp(),
      lastUpdated: serverTimestamp(),
      isCloud: true,
      ownerId: existingData?.ownerId || ownerId || 'system',
      views: existingData?.views || 0,
      genre: finalGenres,
      coverURL: existingData?.coverURL || null,
      coverSize: existingData?.coverSize || 0,
      metadata: { info: { 
        author: finalAuthor, 
        bookTitle: finalTitle, 
        totalChapters: finalTotalChapters, 
        genre: finalGenres, 
        coverURL: existingData?.coverURL || null,
        coverSize: existingData?.coverSize || 0,
        lastUpdated: serverTimestamp() 
      } }
    }, { merge: true });

    return Response.json({ success: true, bookId, chaptersAdded: ingestMaxChapter });

  } catch (err: any) {
    console.error("Ingest API Error:", err);
    return Response.json({ error: "Processing failed", details: err.message }, { status: 500 });
  }
}
