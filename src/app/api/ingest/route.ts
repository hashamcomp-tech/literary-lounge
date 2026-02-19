import { NextRequest, NextResponse } from "next/server";
import fs from 'fs';
import { EPub } from 'epub2';
import { JSDOM } from 'jsdom';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * @fileOverview High-reliability EPUB Extraction API.
 * Extracts structured chapters and preserves intended headings and paragraph spacing.
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
          // 3. Create a lookup map for TOC titles to preserve publisher's naming
          const tocTitles: Record<string, string> = {};
          if (epub.toc) {
            epub.toc.forEach((item: any) => {
              if (item.href) {
                // Strip anchor and normalize path
                const baseHref = item.href.split('#')[0];
                tocTitles[baseHref] = item.title;
              }
            });
          }

          // 4. Sequentially extract chapters to maintain order and fidelity
          const chapterPromises = epub.flow.map((item, i) => {
            return new Promise<{ title: string; content: string; order: number }>((res) => {
              epub.getChapter(item.id, (err, text) => {
                if (err || !text) {
                  res({ title: item.title || `Chapter ${i + 1}`, content: '', order: i });
                  return;
                }

                // 5. Sanitize XHTML and Preserve Intended Paragraphs
                const dom = new JSDOM(text);
                const doc = dom.window.document;
                
                // Remove style and script elements that might contain hidden text
                doc.querySelectorAll('style, script').forEach(el => el.remove());

                // 6. Strategy: Identify the publisher's intended chapter heading
                let detectedTitle = item.title || tocTitles[item.href] || '';
                
                // If title is missing or a generic placeholder, scan the content for headers
                if (!detectedTitle || /^chapter\s+\d+$/i.test(detectedTitle.trim())) {
                  const header = doc.querySelector('h1, h2, h3, h4');
                  if (header && header.textContent?.trim()) {
                    detectedTitle = header.textContent.trim();
                  }
                }

                // Final fallback
                detectedTitle = detectedTitle || `Chapter ${i + 1}`;

                // Strategy: Identify the publisher's intended paragraph tags (<p>)
                const pTags = doc.querySelectorAll('p');
                let chapterText = '';

                if (pTags.length > 5) {
                  chapterText = Array.from(pTags)
                    .map(p => p.textContent?.trim())
                    .filter(Boolean)
                    .join('\n\n');
                } else {
                  doc.querySelectorAll('br').forEach(br => {
                    const textNode = doc.createTextNode('\n');
                    br.parentNode?.replaceChild(textNode, br);
                  });

                  const blockElements = doc.querySelectorAll('div, h1, h2, h3, h4, h5, h6, li');
                  if (blockElements.length > 0) {
                    chapterText = Array.from(blockElements)
                      .map(el => el.textContent?.trim())
                      .filter(Boolean)
                      .join('\n\n');
                  } else {
                    chapterText = doc.body.textContent || '';
                  }
                }

                res({
                  title: detectedTitle,
                  content: chapterText.trim(),
                  order: i
                });
              });
            });
          });

          const results = await Promise.all(chapterPromises);
          
          // 7. Sort results to match intended reading sequence
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
