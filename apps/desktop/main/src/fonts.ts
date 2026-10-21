// Are the fonts the Word templates use installed on this PC? (REWRITE_PLAN §6.8; the list comes
// from D's template inventory.) A missing font does not change a document's wording, but Word
// shows that text in another font, so the printout can look different from the old one.
// The installer cannot know which PC will print, so the app checks and the OIC sees a warning.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface FontStatus {
  font: string;
  /** How many templates use it. */
  templates: number;
  installed: boolean;
}

/** Font family names from the Windows font registry (machine and user), lower-case. */
export async function windowsFonts(): Promise<Set<string> | null> {
  if (process.platform !== 'win32') return null;
  const script =
    "$k='HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts','HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';" +
    '$k | ForEach-Object { if (Test-Path $_) { (Get-ItemProperty $_).PSObject.Properties.Name } }';
  const { stdout } = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      windowsHide: true,
      timeout: 30_000,
    },
  );
  return parseFontNames(stdout);
}

/** "Iskoola Pota Bold (TrueType)", "Nirmala UI & Nirmala UI Bold (TrueType)" → family names. */
export function parseFontNames(registryNames: string): Set<string> {
  const names = new Set<string>();
  for (const line of registryNames.split(/\r?\n/)) {
    for (const part of line.replace(/\s*\((TrueType|OpenType|All res)\)\s*$/i, '').split('&')) {
      const name = part
        .trim()
        .replace(/\s+(Bold Italic|Bold|Italic|Regular|Light|Semilight|Semibold)$/i, '');
      if (name) names.add(name.toLowerCase());
    }
  }
  return names;
}

/** Fonts used by the templates (from template-inventory.json), most used first. */
export async function fontStatus(
  inventoryFile: string,
  installed: Set<string> | null,
): Promise<FontStatus[] | null> {
  if (!installed) return null;
  const inv = JSON.parse(await readFile(inventoryFile, 'utf8')) as {
    templates: { fonts: string[] }[];
  };
  const usage = new Map<string, number>();
  for (const t of inv.templates) for (const f of t.fonts) usage.set(f, (usage.get(f) ?? 0) + 1);
  return [...usage]
    .map(([font, templates]) => ({ font, templates, installed: installed.has(font.toLowerCase()) }))
    .sort((a, b) => b.templates - a.templates || a.font.localeCompare(b.font));
}
