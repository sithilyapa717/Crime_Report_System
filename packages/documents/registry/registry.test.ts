import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { JsonTemplateSource, TemplateRegistry, type TemplateEntry } from './registry.ts';

const MANIFEST = join(import.meta.dirname, '..', 'templates', 'original', 'MANIFEST.json');
const frozen = (JSON.parse(readFileSync(MANIFEST, 'utf8')) as { files: { path: string }[] }).files.map((f) => f.path);
const FAMILIES = ['plaint', 'charge-sheet', 'reward-voucher', 'motion-sheet', 'warrant-extension', 'previous-record', 'production', 'other'];

test('templates.json lists every frozen template exactly once, and nothing else', async () => {
  const entries = await new JsonTemplateSource().list();
  assert.deepEqual(entries.map((e) => e.id).sort(), [...frozen].sort());
});

test('templates.json entries are valid', async () => {
  for (const e of await new JsonTemplateSource().list()) {
    assert.ok(FAMILIES.includes(e.family), `${e.id}: family ${e.family}`);
    assert.ok(['unconfirmed', 'current', 'archived'].includes(e.status), `${e.id}: status ${e.status}`);
    for (const code of e.offenceCodes) assert.match(code, /^[A-Z]{2,6}$/, `${e.id}: offence code ${code}`);
    assert.ok(e.title.length > 0, `${e.id}: title`);
  }
});

const entry = (id: string, offenceCodes: string[], status: TemplateEntry['status'] = 'unconfirmed'): TemplateEntry => ({
  id,
  title: id,
  family: 'plaint',
  offenceCodes,
  variant: {},
  status,
});

test('forOffence: offence templates and general ones, never archived, current first', () => {
  const r = new TemplateRegistry([
    entry('b-puds', ['PUDS']),
    entry('a-puds-current', ['PUDS'], 'current'),
    entry('puds-old', ['PUDS'], 'archived'),
    entry('uph', ['UPH']),
    { ...entry('general', []), family: 'reward-voucher' },
    entry('suds-puds', ['SUDS', 'PUDS']),
  ]);
  assert.deepEqual(
    r.forOffence('puds').map((e) => e.id),
    ['a-puds-current', 'b-puds', 'suds-puds', 'general'],
  );
  assert.equal(r.appliesTo(r.get('uph')!, 'PUDS'), false);
});

test('a plaint without offence codes is not offered for any offence; a general document is', () => {
  const r = new TemplateRegistry([
    { ...entry('cigarette-plaint', []), family: 'plaint' },
    { ...entry('voucher', []), family: 'reward-voucher' },
  ]);
  assert.deepEqual(r.forOffence('PUDS').map((e) => e.id), ['voucher']);
});

test('duplicate ids are rejected', () => {
  assert.throws(() => new TemplateRegistry([entry('x', []), entry('x', [])]), /duplicate/);
});
