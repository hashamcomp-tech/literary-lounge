import { NextRequest, NextResponse } from "next/server";
import fs from 'fs';
import { EPub } from 'epub2';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * @fileOverview API Route for extracting the cover image from an EPUB file.
 * Uses the EPub metadata manifest to find the designated cover resource.
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
      const epub = new EPub(tempFilePath!);

      epub.on('error', (err) => {
        if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        resolve(NextResponse.json({ error: 'Archive Corruption: ' + err.message }, { status: 500 }));
      });

      epub.on('end', () => {
        try {
          // 3. Locate the cover ID in the manifest
          const coverId = epub.metadata.cover;
          
          if (!coverId) {
            if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            resolve(NextResponse.json({ error: 'No designated cover resource found in this EPUB manifest.' }, { status: 404 }));
            return;
          }

          // 4. Extract the binary image resource
          epub.getImage(coverId, (err, data, mimeType) => {
            // Cleanup temp file regardless of result
            if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

            if (err || !data) {
              resolve(NextResponse.json({ error: 'Failed to extract cover image resource.' }, { status: 500 }));
              return;
            }

            // 5. Return as a Data URI for client-side processing
            const base64 = data.toString('base64');
            resolve(NextResponse.json({ 
              success: true, 
              dataUri: `data:${mimeType};base64,${base64}` 
            }));
          });
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
