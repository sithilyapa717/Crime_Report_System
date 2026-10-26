// Text size chosen from the top bar (normal → large → larger), kept on this PC. The page is scaled
// as a whole (CSS `zoom` on <html>), so fields, tables and buttons grow together and stay aligned.

export const TEXT_SIZES = ['normal', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

const KEY = 'excise.textSize';

export function storedTextSize(): TextSize {
  try {
    const v = localStorage.getItem(KEY);
    return (TEXT_SIZES as readonly string[]).includes(v ?? '') ? (v as TextSize) : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyTextSize(size: TextSize): void {
  document.documentElement.dataset.textSize = size;
  try {
    localStorage.setItem(KEY, size);
  } catch {
    // storage not available: the size lasts until the app closes
  }
}

export function nextTextSize(size: TextSize): TextSize {
  return TEXT_SIZES[(TEXT_SIZES.indexOf(size) + 1) % TEXT_SIZES.length]!;
}
