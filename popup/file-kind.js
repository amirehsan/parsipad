/**
 * Which translator a file belongs to, for the single drop zone in Doc & Image.
 * The browser's MIME type decides when it is one we accept; a file it could
 * not type (empty or application/octet-stream) is judged by its extension.
 */

const BY_TYPE = Object.freeze({
  'text/plain': 'document',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image'
});

const BY_EXTENSION = Object.freeze({
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
});

const UNTYPED = new Set(['', 'application/octet-stream']);

/** What the file picker offers: the same files the drop zone takes. */
export const FILE_INPUT_ACCEPT = ['.txt', ...Object.keys(BY_TYPE)].join(',');

/**
 * @param {{ name: string, type: string } | null | undefined} file
 * @returns {{ kind: 'document' | 'image', mimeType: string } | null}
 */
export function classifyFile(file) {
  if (!file) return null;
  const type = (file.type || '').toLowerCase();
  if (BY_TYPE[type]) return { kind: BY_TYPE[type], mimeType: type };
  if (!UNTYPED.has(type)) return null;

  const extension = /\.([^.]+)$/.exec(file.name || '')?.[1]?.toLowerCase();
  const mimeType = extension && BY_EXTENSION[extension];
  return mimeType ? { kind: BY_TYPE[mimeType], mimeType } : null;
}
