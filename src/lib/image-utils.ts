/**
 * @fileOverview Client-side utilities for processing and optimizing images.
 */

/**
 * Resizes an image to a maximum dimension while maintaining aspect ratio.
 */
export async function optimizeCoverImage(file: File | Blob, maxDimension: number = 1000, aspectRatio?: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = width;
        let sourceHeight = height;

        // Handle aspect ratio cropping
        if (aspectRatio && aspectRatio !== 'original') {
          const [targetWidthRatio, targetHeightRatio] = aspectRatio.split(':').map(Number);
          const targetRatio = targetWidthRatio / targetHeightRatio;
          const currentRatio = width / height;

          if (currentRatio > targetRatio) {
            // Image is too wide, crop width
            sourceWidth = height * targetRatio;
            sourceX = (width - sourceWidth) / 2;
          } else if (currentRatio < targetRatio) {
            // Image is too tall, crop height
            sourceHeight = width / targetRatio;
            sourceY = (height - sourceHeight) / 2;
          }
          // If ratios match, no cropping needed
        }

        // Calculate final dimensions
        let finalWidth = sourceWidth;
        let finalHeight = sourceHeight;

        if (finalWidth > maxDimension || finalHeight > maxDimension) {
          if (finalWidth > finalHeight) {
            finalHeight *= maxDimension / finalWidth;
            finalWidth = maxDimension;
          } else {
            finalWidth *= maxDimension / finalHeight;
            finalHeight = maxDimension;
          }
        }

        canvas.width = finalWidth;
        canvas.height = finalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context failed'));

        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, finalWidth, finalHeight);
        
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas to Blob failed'));
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

/**
 * High-Reliability URL-to-File converter.
 * Handles Blob, Data, and standard URLs safely.
 */
export async function urlToFile(url: string, filename: string): Promise<File> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
}

/**
 * Helper to convert a Data URL to a File object.
 */
export function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}
