import { NextRequest, NextResponse } from "next/server";
import fs from 'fs';
import { EPub } from 'epub2';
import { JSDOM } from 'jsdom';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * @fileOverview High-reliability EPUB Extraction API.
 * Extracts structured chapters from digital volumes using server-side decompression.
 */
export async function POST(req: NextRequest) {
  let tempFilePath: string | null = null;
  
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: "No digital volume detected." }, { status: 400 });
    }

    // 1. Prepare secure temporary storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `lounge_${uuidv4()}.epub`);
    fs.writeFileSync(tempFilePath, buffer);

    // 2. Wrap EPUB parser in a Promise lifecycle
    return new Promise((resolve) => {
      const epub = new EPub(tempFilePath!);

      epub.on('error', (err) => {
        if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        resolve(NextResponse.json({ error: 'Archive Corruption: ' + err.message }, { status: 500 }));
      });

      epub.on('end', async () => {
        try {
          // 3. Sequentially extract chapters to maintain order and fidelity
          const chapterPromises = epub.flow.map((item, i) => {
            return new Promise<{ title: string; content: string; order: number }>((res) => {
              epub.getChapter(item.id, (err, text) => {
                if (err || !text) {
                  res({ title: `Chapter ${i + 1}`, content: '[Empty or Encrypted Content]', order: i });
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
          
          // 4. Sort results to match intended reading sequence
          const sortedChapters = results
            .sort((a, b) => a.order - b.order)
            .map(({ title, content }) => ({ title, content }));

          // Cleanup
          if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          
          resolve(NextResponse.json({ 
            success: true,
            chapters: sortedChapters 
          }));
        } catch (e: any) {
          if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          resolve(NextResponse.json({ error: 'Extraction Failure: ' + e.message }, { status: 500 }));
        }
      });

      epub.parse();
    });
  } catch (err: any) {
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    return NextResponse.json({ error: 'System Error: ' + err.message }, { status: 500 });
  }
}
