import { NextRequest, NextResponse } from "next/server";
import fs from 'fs';
import { EPub } from 'epub2';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * @fileOverview Robust EPUB Metadata & Visual Extraction API.
 * Identifies bibliographic info, genres, and locates the best available cover image.
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
    tempFilePath = path.join(tempDir, `extract_${uuidv4()}.epub`);
    fs.writeFileSync(tempFilePath, buffer);

    // 2. Wrap EPUB parser in a Promise lifecycle
    return new Promise((resolve) => {
      try {
        const epub = new EPub(tempFilePath!);

        epub.on('error', (err) => {
          if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          resolve(NextResponse.json({ error: 'Archive Corruption: ' + err.message }, { status: 500 }));
        });

        epub.on('end', () => {
          try {
            // 3. Robust Bibliographic Extraction
            const title = epub.metadata.title || '';
            
            // Handle various author field structures
            let author = '';
            if (epub.metadata.creator) {
              if (Array.isArray(epub.metadata.creator)) {
                author = epub.metadata.creator
                  .map(c => typeof c === 'string' ? c : (c as any).name || (c as any)._ || 'Unknown')
                  .join(', ');
              } else if (typeof epub.metadata.creator === 'string') {
                author = epub.metadata.creator;
              } else if ((epub.metadata.creator as any).name) {
                author = (epub.metadata.creator as any).name;
              } else if ((epub.metadata.creator as any)._) {
                author = (epub.metadata.creator as any)._;
              }
            }

            // 4. Genre / Subject Extraction
            // Aggressively split by common delimiters to get granular tags
            let genres: string[] = [];
            if (epub.metadata.subject) {
              const rawSubjects = Array.isArray(epub.metadata.subject) 
                ? epub.metadata.subject 
                : [String(epub.metadata.subject)];
              
              genres = rawSubjects.flatMap(s => 
                String(s).split(/[,;/]/).map(part => part.trim())
              ).filter(Boolean);
            }

            // 5. Intelligent Cover Identification
            let coverId = epub.metadata.cover;
            
            if (!coverId) {
              const manifest = epub.manifest;
              const keywords = ['cover', 'thumb', 'front', 'jacket'];
              
              for (const id in manifest) {
                if (manifest[id].properties === 'cover-image') {
                  coverId = id;
                  break;
                }
              }
              
              if (!coverId) {
                for (const id in manifest) {
                  if (keywords.some(k => id.toLowerCase().includes(k))) {
                    coverId = id;
                    break;
                  }
                }
              }
            }
            
            if (!coverId) {
              if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
              resolve(NextResponse.json({ 
                success: true, 
                title, 
                author,
                genres,
                dataUri: null,
                message: 'Bibliographic data found, but no cover resource detected.' 
              }));
              return;
            }

            // 6. Extract Binary Resource
            epub.getImage(coverId, (err, data, mimeType) => {
              if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

              if (err || !data) {
                resolve(NextResponse.json({ 
                  success: true, 
                  title, 
                  author,
                  genres,
                  dataUri: null,
                  message: 'Visual asset extraction failed.' 
                }));
                return;
              }

              const base64 = data.toString('base64');
              resolve(NextResponse.json({ 
                success: true, 
                title,
                author,
                genres,
                dataUri: `data:${mimeType || 'image/jpeg'};base64,${base64}` 
              }));
            });
          } catch (e: any) {
            if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            resolve(NextResponse.json({ error: 'Manifest Parsing Failure: ' + e.message }, { status: 500 }));
          }
        });

        epub.parse();
      } catch (parseErr: any) {
        if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        resolve(NextResponse.json({ error: 'Parser Initialization Error: ' + parseErr.message }, { status: 500 }));
      }
    });
  } catch (err: any) {
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    return NextResponse.json({ error: 'Server Subsystem Failure: ' + err.message }, { status: 500 });
  }
}