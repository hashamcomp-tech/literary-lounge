import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import path from "path";

type ParsedChapter = {
  title: string;
  content: string;
};

function cleanText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolvePath(baseDir: string, href: string) {
  const joined = path.posix.join(baseDir, href);
  return joined.replace(/^\/+/, "");
}

function extractChapterTitle(
  doc: Document,
  fallbackIndex: number
) {
  const heading =
    doc.querySelector("h1")?.textContent?.trim() ||
    doc.querySelector("h2")?.textContent?.trim() ||
    doc.querySelector("h3")?.textContent?.trim() ||
    doc.querySelector("title")?.textContent?.trim();

  if (!heading || heading.length > 120) {
    return `Chapter ${fallbackIndex}`;
  }

  return heading;
}

function extractReadableText(doc: Document) {
  doc.querySelectorAll(
    "script, style, nav, footer, header, noscript, svg"
  ).forEach((el) => el.remove());

  const blocks = Array.from(
    doc.querySelectorAll(
      "p, div, article, section, blockquote, li"
    )
  );

  const lines: string[] = [];

  for (const block of blocks) {
    const text = block.textContent?.trim();

    if (!text) continue;

    if (text.length < 2) continue;

    if (lines.includes(text)) continue;

    lines.push(text);
  }

  if (lines.length > 0) {
    return cleanText(lines.join("\n\n"));
  }

  return cleanText(doc.body?.textContent || "");
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No EPUB file uploaded." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".epub")) {
      return NextResponse.json(
        { error: "Only EPUB files are supported." },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();

    const zip = await JSZip.loadAsync(buffer);

    const containerFile = zip.file("META-INF/container.xml");

    if (!containerFile) {
      throw new Error("container.xml missing.");
    }

    const containerXml = await containerFile.async("string");

    const containerDom = new JSDOM(containerXml, {
      contentType: "text/xml",
    });

    const opfPath =
      containerDom.window.document
        .querySelector("rootfile")
        ?.getAttribute("full-path");

    if (!opfPath) {
      throw new Error("Unable to locate OPF package.");
    }

    const opfFile = zip.file(opfPath);

    if (!opfFile) {
      throw new Error("OPF file missing from archive.");
    }

    const opfXml = await opfFile.async("string");

    const opfDom = new JSDOM(opfXml, {
      contentType: "text/xml",
    });

    const opfDoc = opfDom.window.document;

    const manifest = new Map<string, string>();

    opfDoc.querySelectorAll("manifest item").forEach((item) => {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");

      if (id && href) {
        manifest.set(id, href);
      }
    });

    const spine = Array.from(
      opfDoc.querySelectorAll("spine itemref")
    )
      .map((item) => item.getAttribute("idref"))
      .filter(Boolean) as string[];

    const baseDir = opfPath.includes("/")
      ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
      : "";

    const chapters: ParsedChapter[] = [];

    for (let i = 0; i < spine.length; i++) {
      const idref = spine[i];

      const href = manifest.get(idref);

      if (!href) continue;

      const resolvedPath = resolvePath(baseDir, href);

      const chapterFile = zip.file(resolvedPath);

      if (!chapterFile) continue;

      const rawHtml = await chapterFile.async("string");

      if (!rawHtml?.trim()) continue;

      const chapterDom = new JSDOM(rawHtml);

      const doc = chapterDom.window.document;

      const content = extractReadableText(doc);

      if (!content || content.length < 120) {
        continue;
      }

      const title = extractChapterTitle(
        doc,
        chapters.length + 1
      );

      chapters.push({
        title,
        content,
      });
    }

    if (chapters.length === 0) {
      return NextResponse.json(
        {
          error:
            "No readable chapters detected inside EPUB.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      totalChapters: chapters.length,
      chapters,
    });
  } catch (error: any) {
    console.error("EPUB parser failure:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unknown EPUB parsing failure.",
      },
      { status: 500 }
    );
  }
}