import { NextRequest, NextResponse } from "next/server";
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';

/**
 * @fileOverview Pure JS EPUB Metadata & Visual Extraction API.
 * Uses JSZip and JSDOM to avoid native module conflicts in serverless environments.
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

    // 1. Locate root OPF file
    const containerXml = await zip.file("META-INF/container.xml")?.async("string");
    if (!containerXml) throw new Error("Invalid Archive: container.xml missing.");

    const dom = new JSDOM(containerXml, { contentType: 'text/xml' });
    const opfPath = dom.window.document.querySelector("rootfile")?.getAttribute("full-path");
    if (!opfPath) throw new Error("Invalid Archive: OPF path not found.");

    // 2. Parse OPF for Metadata
    const opfXml = await zip.file(opfPath)?.async("string");
    if (!opfXml) throw new Error("Invalid Archive: OPF content missing.");

    const opfDom = new JSDOM(opfXml, { contentType: 'text/xml' });
    const metadata = opfDom.window.document.querySelector("metadata");
    
    const title = metadata?.querySelector("title")?.textContent || "Untitled";
    const author = metadata?.querySelector("creator")?.textContent || "Unknown Author";
    
    const rawSubjects = Array.from(metadata?.querySelectorAll("subject") || []);
    const genres = rawSubjects.flatMap(s => 
      (s.textContent || "").split(/[,;/]/).map(part => part.trim())
    ).filter(Boolean);

    // 3. Identify Cover Image
    let coverHref: string | null = null;
    const coverMeta = metadata?.querySelector("meta[name='cover']");
    const coverId = coverMeta?.getAttribute("content");

    if (coverId) {
      const coverItem = opfDom.window.document.querySelector(`item[id='${coverId}']`);
      coverHref = coverItem?.getAttribute("href") || null;
    }

    if (!coverHref) {
      const coverItem = opfDom.window.document.querySelector("item[properties='cover-image']");
      coverHref = coverItem?.getAttribute("href") || null;
    }

    if (!coverHref) {
      // Fallback: search for keywords in manifest
      const items = Array.from(opfDom.window.document.querySelectorAll("item"));
      const keywords = ['cover', 'thumb', 'front', 'jacket'];
      const fallback = items.find(item => 
        keywords.some(k => (item.getAttribute('id') || '').toLowerCase().includes(k))
      );
      coverHref = fallback?.getAttribute('href') || null;
    }

    let dataUri: string | null = null;
    if (coverHref) {
      const baseDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
      const fullCoverPath = baseDir + coverHref;
      const coverFile = zip.file(fullCoverPath);
      
      if (coverFile) {
        const coverBuffer = await coverFile.async("nodebuffer");
        const mimeType = coverHref.endsWith('.png') ? 'image/png' : 'image/jpeg';
        dataUri = `data:${mimeType};base64,${coverBuffer.toString('base64')}`;
      }
    }

    return NextResponse.json({
      success: true,
      title,
      author,
      genres,
      dataUri,
      message: dataUri ? 'Visual identity extracted.' : 'Bibliographic data found, no cover detected.'
    });

  } catch (err: any) {
    console.error("EPUB Extraction Failure:", err);
    return NextResponse.json({ error: 'Archive Processing Error: ' + err.message }, { status: 500 });
  }
}
