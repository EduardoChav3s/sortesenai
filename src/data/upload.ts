// Image rules shared by every upload (card art, banner, suggestion photo).
// The buckets enforce the same limits; checking here gives a friendly message first.
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function checkImage(file: File): string | null {
  if (!TYPES[file.type]) return 'Use JPG, PNG ou WebP.';
  if (file.size > MAX_IMAGE_BYTES) return 'A imagem passa de 2 MB.';
  return null;
}

/** Storage path with a random name. `folder` is the user id for the profile and suggestions buckets. */
export function imagePath(file: File, folder?: string): string {
  const name = `${crypto.randomUUID()}.${TYPES[file.type] ?? 'bin'}`;
  return folder ? `${folder}/${name}` : name;
}
