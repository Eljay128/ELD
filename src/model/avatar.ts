/**
 * Profile photos.
 *
 * The constraint that shapes everything here: a Pourfolio profile travels *as
 * its own share code*. There is no server to fetch an image from, so the photo
 * has to live inside the code itself. A 2 MB phone photo would produce a
 * 2.7 MB share string — unusable as a link, impossible as a QR.
 *
 * So a photo is centre-cropped to a square, downscaled to 128px, and re-encoded
 * at moderate quality before it is ever stored. The result is typically 3–6 KB,
 * which keeps a profile pasteable as a link while still being recognisably a
 * face at the sizes the app actually renders it (88px and below).
 */

/** Rendered avatar is 88px; 128 gives a sharp result on 2× displays. */
const SIZE = 128;
const QUALITY = 0.72;

/** Refuse anything implausible before decoding it. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export class AvatarError extends Error {}

export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new AvatarError('That file is not an image.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new AvatarError('That image is very large — try one under 25 MB.');
  }

  const bitmap = await decode(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AvatarError('This browser could not process the image.');

    // Centre-crop to a square so faces stay centred rather than squashed.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);

    // WebP is markedly smaller than JPEG at this size; fall back where absent.
    const webp = canvas.toDataURL('image/webp', QUALITY);
    const chosen = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', QUALITY);
    if (!chosen.startsWith('data:image/')) throw new AvatarError('The image could not be converted.');
    return chosen;
  } finally {
    if ('close' in bitmap) bitmap.close();
  }
}

/** `createImageBitmap` where available, an <img> everywhere else. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Some browsers reject formats they can still render in an <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new AvatarError('That image could not be opened.'));
      img.src = url;
    });
  } finally {
    // Revoking immediately is safe: the bitmap is already decoded into memory.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Rough encoded size of a data URI, for the share-size warning. */
export function avatarBytes(dataUri: string | undefined): number {
  if (!dataUri) return 0;
  const comma = dataUri.indexOf(',');
  if (comma < 0) return 0;
  return Math.floor(((dataUri.length - comma - 1) * 3) / 4);
}
