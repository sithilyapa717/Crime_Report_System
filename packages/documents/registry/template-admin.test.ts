import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TemplateEntry } from './registry.ts';
import { addTemplate } from './template-admin.ts';

const ORIGINALS = join(import.meta.dirname, '..', 'templates', 'original');
const PUDS = 'PUDS/puds  බෝතලය.docx';

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'docs-admin-'));
  const originalsDir = join(dir, 'original');
  const registryFile = join(dir, 'templates.json');
  // an empty starting point with one existing entry
  mkdirSync(originalsDir);
  writeFileSync(join(originalsDir, 'MANIFEST.json'), JSON.stringify({ source: 'x', files: [] }));
  const old: TemplateEntry = { id: 'PUDS/old.docx', title: 'old', family: 'plaint', offenceCodes: ['PUDS'], variant: {}, status: 'current' };
  writeFileSync(registryFile, JSON.stringify({ about: 'a', templates: [old] }));
  return { dir, paths: { originalsDir, registryFile } };
}

test('adds a new version: copied read-only, in the manifest, registered, old version archived', () => {
  const { paths } = sandbox();
  const { entry, archived } = addTemplate(paths, {
    source: join(ORIGINALS, PUDS),
    targetPath: 'PUDS/puds බෝතලය 2027.docx',
    replaces: 'PUDS/old.docx',
  });
  const copy = join(paths.originalsDir, 'PUDS', 'puds බෝතලය 2027.docx');
  assert.ok(readFileSync(copy).equals(readFileSync(join(ORIGINALS, PUDS))));
  assert.equal(statSync(copy).mode & 0o222, 0, 'the copy is read-only');
  const manifest = JSON.parse(readFileSync(join(paths.originalsDir, 'MANIFEST.json'), 'utf8'));
  assert.equal(manifest.files[0].path, 'PUDS/puds බෝතලය 2027.docx');
  assert.match(manifest.files[0].sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(entry.offenceCodes, ['PUDS']);
  assert.equal(entry.variant.container, 'bottle');
  assert.equal(entry.status, 'unconfirmed');
  assert.match(entry.notes ?? '', /replaces PUDS\/old\.docx/);
  assert.equal(archived?.status, 'archived');
  const registry = JSON.parse(readFileSync(paths.registryFile, 'utf8'));
  assert.deepEqual(registry.templates.map((e: TemplateEntry) => [e.id, e.status]), [
    ['PUDS/old.docx', 'archived'],
    ['PUDS/puds බෝතලය 2027.docx', 'unconfirmed'],
  ]);
});

test('never overwrites an existing original', () => {
  const { paths } = sandbox();
  addTemplate(paths, { source: join(ORIGINALS, PUDS), targetPath: 'PUDS/a.docx' });
  assert.throws(() => addTemplate(paths, { source: join(ORIGINALS, PUDS), targetPath: 'PUDS/a.docx' }), /never overwritten/);
});

test('refuses files that are not Word documents, paths outside the folder, and unknown replacements', () => {
  const { dir, paths } = sandbox();
  const junk = join(dir, 'junk.docx');
  writeFileSync(junk, 'not a zip');
  assert.throws(() => addTemplate(paths, { source: junk, targetPath: 'PUDS/j.docx' }), /not a valid \.docx/);
  assert.throws(() => addTemplate(paths, { source: join(ORIGINALS, PUDS), targetPath: '../x.docx' }), /inside templates\/original/);
  assert.throws(() => addTemplate(paths, { source: join(ORIGINALS, PUDS), targetPath: 'PUDS/x.pdf' }), /\.docx/);
  assert.throws(
    () => addTemplate(paths, { source: join(ORIGINALS, PUDS), targetPath: 'PUDS/x.docx', replaces: 'nope' }),
    /unknown template to replace/,
  );
});

test('explicit family, offence codes and "current" override what the name suggests', () => {
  const { dir, paths } = sandbox();
  const source = join(dir, 'beedi.docx');
  copyFileSync(join(ORIGINALS, 'GOLD LEAF', 'beedi.docx'), source);
  const { entry } = addTemplate(paths, { source, targetPath: 'GOLD LEAF/beedi 2027.docx', offenceCodes: ['pumb'], current: true });
  assert.deepEqual(entry.offenceCodes, ['PUMB']);
  assert.equal(entry.status, 'current');
  assert.throws(() => addTemplate(paths, { source, targetPath: 'GOLD LEAF/b2.docx', offenceCodes: ['P-1'] }), /looks wrong/);
});
