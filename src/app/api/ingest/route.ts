import { NextRequest, NextResponse } from "next/server";
import fs from 'fs';
import { EPub } from 'epub';
import { JSDOM } from 'jsdom';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * @fileOverview EPUB Ingestion Engine.
 * Replaced with the requested reader logic to extract chapters from digital volumes.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `${uuidv4()}.epub`);
    fs.writeFileSync(tempFilePath, buffer);

    return new Promise((resolve) => {
      // Initialize the EPUB reader with the temp file path
      const epub = new EPub(tempFilePath);

      epub.on('error', (err) => {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        resolve(NextResponse.json({ error: 'EPUB Error: ' + err.message }, { status: 500 }));
      });

      epub.on('end', async () => {
        try {
          const chapters: { title: string; content: string; order: number }[] = [];

          // Map flow items to chapter content promises
          const chapterPromises = epub.flow.map((item, i) => {
            return new Promise<void>((res) => {
              epub.getChapter(item.id, (err, text) => {
                if (err) {
                  console.error('Chapter error:', err);
                  res();
                  return;
                }

                // Parse XHTML properly to get clean text using JSDOM
                const dom = new JSDOM(text);
                const chapterText = dom.window.document.body.textContent || '';

                chapters.push({
                  title: item.title || `Chapter ${i + 1}`,
                  content: chapterText.trim(),
                  order: i,
                });
                res();
              });
            });
          });

          // Wait for all chapters to be extracted and cleaned
          await Promise.all(chapterPromises);
          
          // Sort chapters to maintain the book's intended order
          chapters.sort((a, b) => a.order - b.order);

          // Cleanup temporary storage
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          
          resolve(NextResponse.json({ 
            message: 'All chapters extracted successfully!',
            chapters: chapters.map(({ title, content }) => ({ title, content }))
          }));
        } catch (e: any) {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          resolve(NextResponse.json({ error: 'Processing error: ' + e.message }, { status: 500 }));
        }
      });

      // Execute parsing
      epub.parse();
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
