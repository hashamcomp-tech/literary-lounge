import { NextRequest, NextResponse } from "next/server";
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';

/**
 * @fileOverview Pure JS High-Reliability EPUB Ingestion API.
 * Uses JSZip and JSDOM to extract structured chapters without native binary dependencies.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: "No digital volume detected." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    // 1. Locate OPF
    const containerXml = await zip.file("META-INF/container.xml")?.async("string");
    const containerDom = new JSDOM(containerXml || "", { contentType: 'text/xml' });
    const opfPath = containerDom.window.document.querySelector("rootfile")?.getAttribute("full-path");
    if (!opfPath) throw new Error("Invalid EPUB: OPF path not found.");

    // 2. Parse OPF Manifest and Spine
    const opfXml = await zip.file(opfPath)?.async("string");
    const opfDom = new JSDOM(opfXml || "", { contentType: 'text/xml' });
    const opfDoc = opfDom.window.document;

    const manifest: Record<string, string> = {};
    opfDoc.querySelectorAll("manifest item").forEach(item => {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      if (id && href) manifest[id] = href;
    });

    const spineIds = Array.from(opfDoc.querySelectorAll("spine itemref")).map(ref => ref.getAttribute("idref"));
    const baseDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

    // 3. Extract Chapters sequentially
    const chapters: { title: string; content: string }[] = [];

    for (let i = 0; i < spineIds.length; i++) {
      const id = spineIds[i];
      if (!id) continue;
      const href = manifest[id];
      if (!href) continue;

      const fullPath = baseDir + href;
      const htmlContent = await zip.file(fullPath)?.async("string");
      if (!htmlContent) continue;

      const chapterDom = new JSDOM(htmlContent);
      const chapterDoc = chapterDom.window.document;

      // Sanitize
      chapterDoc.querySelectorAll('style, script, link').forEach(el => el.remove());

      // Identify Title
      let title = chapterDoc.querySelector('h1, h2, h3')?.textContent?.trim();
      if (!title || /^chapter\s+\d+$/i.test(title)) {
        title = `Chapter ${chapters.length + 1}`;
      }

      // Extract text content with paragraph preservation
      const pTags = Array.from(chapterDoc.querySelectorAll('p, div, blockquote'));
      let bodyText = "";

      if (pTags.length > 5) {
        bodyText = pTags
          .map(p => p.textContent?.trim())
          .filter(Boolean)
          .join('\n\n');
      } else {
        bodyText = chapterDoc.body.textContent?.trim() || "";
      }

      if (bodyText.length > 100) {
        chapters.push({ title, content: bodyText });
      }
    }

    return NextResponse.json({
      success: true,
      chapters: chapters.map(ch => ({
        title: ch.title,
        content: ch.content.replace(/\n{3,}/g, "\n\n")
      }))
    });

  } catch (err: any) {
    console.error("EPUB Ingestion Failure:", err);
    return NextResponse.json({ error: 'Archive Processing Error: ' + err.message }, { status: 500 });
  }
}
