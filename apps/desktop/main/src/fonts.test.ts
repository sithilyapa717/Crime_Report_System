import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fontStatus, parseFontNames } from './fonts.js';

describe('font check', () => {
  it('reads Windows registry font names as families', () => {
    expect([
      ...parseFontNames(
        'Iskoola Pota Bold (TrueType)\r\nNirmala UI & Nirmala UI Bold (TrueType)\nFMAbhaya (TrueType)',
      ),
    ]).toEqual(['iskoola pota', 'nirmala ui', 'fmabhaya']);
  });

  it('lists the templates’ fonts, most used first, marking the missing ones', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fonts-'));
    const inv = join(dir, 'inv.json');
    await writeFile(
      inv,
      JSON.stringify({
        templates: [{ fonts: ['Iskoola Pota', 'FMAbhaya'] }, { fonts: ['Iskoola Pota'] }],
      }),
    );
    expect(await fontStatus(inv, new Set(['iskoola pota']))).toEqual([
      { font: 'Iskoola Pota', templates: 2, installed: true },
      { font: 'FMAbhaya', templates: 1, installed: false },
    ]);
    expect(await fontStatus(inv, null)).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  it('the real inventory loads', async () => {
    const real = join(__dirname, '../../../../packages/documents/registry/template-inventory.json');
    const list = await fontStatus(real, new Set());
    expect(list!.length).toBeGreaterThan(5);
    expect(list![0]!.templates).toBeGreaterThan(50);
  });
});
