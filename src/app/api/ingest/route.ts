import { NextRequest, NextResponse } from "next/server";
import fs from 'fs';
import { EPub } from 'epub';
import { JSDOM } from 'jsdom';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * @fileOverview Robust EPUB Reader API.
 * Extracts chapters from digital volumes and returns clean text.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: "No manuscript file detected." }, { status: 400 });
    }

    // Prepare temporary storage for the binary archive
    const buffer = Buffer.from(await file.arrayBuffer());
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `${uuidv4()}.epub`);
    fs.writeFileSync(tempFilePath, buffer);

    return new Promise((resolve) => {
      // Initialize the reader with the temporary path
      const epub = new EPub(tempFilePath);

      epub.on('error', (err) => {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        resolve(NextResponse.json({ error: 'Archive Error: ' + err.message }, { status: 500 }));
      });

      epub.on('end', async () => {
        try {
          // Wrap chapter extraction in a Promise.all to ensure completion
          const chapterPromises = epub.flow.map((item, i) => {
            return new Promise<{ title: string; content: string; order: number }>((res) => {
              epub.getChapter(item.id, (err, text) => {
                if (err) {
                  res({ title: `Chapter ${i + 1}`, content: '[Extraction Failed]', order: i });
                  return;
                }

                // Sanitize XHTML content using JSDOM
                const dom = new JSDOM(text);
                const chapterText = dom.window.document.body.textContent || '';

                res({
                  title: item.title || `Chapter ${i + 1}`,
                  content: chapterText.trim(),
                  order: i
                });
              });
            });
          });

          const results = await Promise.all(chapterPromises);
          
          // Sort results to match the book's intended sequence
          const sortedChapters = results
            .sort((a, b) => a.order - b.order)
            .map(({ title, content }) => ({ title, content }));

          // Cleanup temporary files immediately
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          
          resolve(NextResponse.json({ 
            success: true,
            chapters: sortedChapters 
          }));
        } catch (e: any) {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          resolve(NextResponse.json({ error: 'Parsing failure: ' + e.message }, { status: 500 }));
        }
      });

      // Execute parsing sequence
      epub.parse();
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Ingestion pipeline error: ' + err.message }, { status: 500 });
  }
}
