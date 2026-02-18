import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";

/* -------------------------------
  Helper: Split chapters by heading
---------------------------------*/
function splitChapters(rawText: string) {
  const chapterRegex = /^(chapter\s+\d+.*)$/gim;
  const matches = [...rawText.matchAll(chapterRegex)];

  if (!matches.length) return [{ title: "Chapter 1", content: rawText }];

  const chapters = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : rawText.length;
    const title = matches[i][0].trim();
    const content = rawText.slice(start, end).trim();
    chapters.push({ title, content });
  }
  return chapters;
}

/* -------------------------------
  Helper: Create XHTML per chapter
---------------------------------*/
function createXHTML(title: string, body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${title}</title>
  <meta charset="utf-8"/>
</head>
<body>
<h1>${title}</h1>
${body.split("\n\n").map(p => `<p>${p.trim()}</p>`).join("\n")}
</body>
</html>`;
}

/* -------------------------------
  API Route
---------------------------------*/
export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { title, author, text } = data;

    const zip = new JSZip();
    const bookId = uuidv4();

    // Required: mimetype uncompressed first
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    const metaInf = zip.folder("META-INF");
    metaInf?.file(
      "container.xml",
      `<?xml version="1.0"?>
<container version="1.0"
 xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
 <rootfiles>
   <rootfile full-path="OEBPS/content.opf"
     media-type="application/oebps-package+xml"/>
 </rootfiles>
</container>`
    );

    const oebps = zip.folder("OEBPS");

    const chapters = splitChapters(text);

    // Add chapter files
    chapters.forEach((chapter, i) => {
      const filename = `chapter${i + 1}.xhtml`;
      oebps?.file(filename, createXHTML(chapter.title, chapter.content));
    });

    // Create nav.xhtml
    const navItems = chapters
      .map((c, i) => `<li><a href="chapter${i + 1}.xhtml">${c.title}</a></li>`)
      .join("\n");

    const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>Navigation</title></head>
<body>
<nav epub:type="toc"><ol>${navItems}</ol></nav>
</body>
</html>`;

    oebps?.file("nav.xhtml", navXhtml);

    // content.opf
    const manifestItems = chapters
      .map((_, i) => `<item id="chapter${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`)
      .join("\n");

    const spineItems = chapters.map((_, i) => `<itemref idref="chapter${i + 1}"/>`).join("\n");

    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${bookId}</dc:identifier>
<dc:title>${title}</dc:title>
<dc:creator>${author}</dc:creator>
<dc:language>en</dc:language>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}
</manifest>
<spine>
${spineItems}
</spine>
</package>`;

    oebps?.file("content.opf", opf);

    // Generate EPUB
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    // Optional: save on server (or return as download)
    const outputPath = path.join(process.cwd(), "book.epub");
    fs.writeFileSync(outputPath, buffer);

    return NextResponse.json({ message: "EPUB generated", path: outputPath });
  } catch (err) {
    return NextResponse.json({ error: (err as any).message });
  }
}