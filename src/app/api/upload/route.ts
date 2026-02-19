
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

/**
 * @fileOverview Universal Vercel Blob Upload API Route.
 * Streams the raw request body directly to the cloud for high-performance asset storage.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  if (!filename) {
    return NextResponse.json({ error: "Missing filename parameter" }, { status: 400 });
  }

  // Ensure we have a token available
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Vercel Blob token is missing in the environment." }, { status: 500 });
  }

  try {
    // Stream the binary data directly from the request body to Vercel
    const blob = await put(filename, request.body!, {
      access: 'public',
      token: token,
    });

    return NextResponse.json(blob);
  } catch (err: any) {
    console.error("Vercel Blob API Error:", err);
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
  }
}
