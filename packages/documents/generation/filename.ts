// Output file names: "CR 12-2026 - <template title>.docx".
// The CR number comes first so files sort by CR in a folder; Sinhala template titles are kept.

/** Characters Windows does not allow in file names (control characters are handled separately). */
const INVALID = /[<>:"/\\|?*]/g;

export function safeFilePart(text: string): string {
  return [...text]
    .map((c) => (c.charCodeAt(0) < 32 ? '-' : c))
    .join('')
    .replace(INVALID, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, ''); // Windows drops trailing dots and spaces
}

/** File name for a CR number ("12/2026") and template title, without a collision suffix. */
export function documentFileName(crNumber: string, templateTitle: string, extension = 'docx'): string {
  return `CR ${safeFilePart(crNumber)} - ${safeFilePart(templateTitle)}.${extension}`;
}

/** "name.docx" → "name (2).docx", "name (3).docx", … */
export function withCopyNumber(fileName: string, n: number): string {
  if (n <= 1) return fileName;
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? `${fileName} (${n})` : `${fileName.slice(0, dot)} (${n})${fileName.slice(dot)}`;
}
