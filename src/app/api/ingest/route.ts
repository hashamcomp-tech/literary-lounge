
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
 * Robust HTML to Text conversion for EPUB content.
 * Preserves semantic paragraph spacing and headers while stripping all noise.
 */
function htmlToReadableText(html: string): string {
  if (!html) return "";
  
  // 1. Replace block tags with double newlines to maintain paragraph structure
  let text = html
    .replace(/<(p|div|h[1-6]|section|article|li)[^>]*>/gi, '\n\n')
    .replace(/<\/ (p|div|h[1-6]|section|article|li)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n');
  
  // 2. Remove all remaining tags (scripts, styles, etc.)
  text = text.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
  text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");
  text = text.replace(/<[^>]*>/g, ' ');
  
  // 3. Decode common HTML entities
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

  // 4. Normalize whitespace: trim lines and remove excessive gaps
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n\n');
}

/**
 * Remove common ebook artifacts and watermarks.
 */
function cleanManuscriptText(text: string) {
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
 * Sequential processing of EPUB chapters to ensure stability.
 */
async function processEpubChapters(epub: EPub): Promise<any[]> {
  const chapters = [];
  // flow is the ordered list of IDs to read
  for (let item of epub.flow) {
    if (!item.id) continue;
    
    // Safety: ignore non-text assets
    const manifestItem = epub.manifest[item.id];
    const mediaType = manifestItem?.['media-type'] || '';
    if (mediaType && !mediaType.includes('xml') && !mediaType.includes('html') && !mediaType.includes('text')) {
      continue;
    }

    try {
      const rawData = await new Promise<any>((res, rej) => {
        epub.getChapter(item.id, (err, txt) => (err ? rej(err) : res(txt || "")));
      });
      
      const html = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : rawData;
      const cleanBody = htmlToReadableText(html);
      const finalContent = cleanManuscriptText(cleanBody);
      
      // Only keep chapters with significant content
      if (finalContent.length > 100) {
        chapters.push({
          title: item.title || manifestItem?.['title'] || "Untitled Chapter",
          content: finalContent
        });
      }
    } catch (err) {
      console.warn(`Skipping chapter ${item.id} due to parse error`);
    }
  }
  return chapters;
}

/**
 * Main API Route Handler.
 */
export async function POST(req: Request) {
  const tmpPath = path.join('/tmp', `${Date.now()}_upload.epub`);
  
  try {
    const { fileUrl, ownerId, overrideMetadata, returnOnly } = await req.json();
    
    if (!fileUrl) {
      return Response.json({ error: "No file URL provided" }, { status: 400 });
    }

    // Download to disk for EPub parser
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Failed to download manuscript: ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(tmpPath, Buffer.from(arrayBuffer));

    const parsedBook = await new Promise<any>((resolve, reject) => {
      const epub = new EPub(tmpPath);
      const timeout = setTimeout(() => reject(new Error("EPUB parsing timed out")), 45000);

      epub.on("end", async () => {
        clearTimeout(timeout);
        try {
          const chapters = await processEpubChapters(epub);
          resolve({
            title: epub.metadata.title || "Unknown Title",
            author: epub.metadata.creator || "Unknown Author",
            chapters
          });
        } catch (err) { reject(err); }
      });

      epub.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      epub.parse();
    });

    // Cleanup disk
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

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

    // Cloud Logic
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

    // Insert Chapters
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

    // Update parent metadata
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
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    console.error("Ingest API Error:", err);
    return Response.json({ error: "Processing failed", details: err.message }, { status: 500 });
  }
}
