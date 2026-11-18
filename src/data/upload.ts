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

// Music the admin uploads (sign-in page and rare-card songs).
const AUDIO: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/x-m4a': 'm4a',
};
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export function checkAudio(file: File): string | null {
  if (!AUDIO[file.type]) return 'Use um arquivo de música (MP3, OGG, WAV, M4A).';
  if (file.size > MAX_AUDIO_BYTES) return 'A música passa de 15 MB.';
  return null;
}

/** Storage path for a song: the slot folder plus a random name. */
export function audioPath(file: File, slot: string): string {
  return `${slot}/${crypto.randomUUID()}.${AUDIO[file.type] ?? 'mp3'}`;
}
