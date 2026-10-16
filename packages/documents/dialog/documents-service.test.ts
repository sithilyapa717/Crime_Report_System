import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DocDataService, Session } from '../../shared/contract/src/index.ts';
import { DocumentGenerator } from '../generation/generate.ts';
import { InMemoryGenerationLog } from '../generation/log.ts';
import { TemplateRegistry, type TemplateEntry } from '../registry/registry.ts';
import { DocumentsService } from './documents-service.ts';

const ORIGINALS = join(import.meta.dirname, '..', 'templates', 'original');
const e = (id: string, family: TemplateEntry['family'], offenceCodes: string[], status: TemplateEntry['status'] = 'unconfirmed'): TemplateEntry => ({
  id,
  title: id.slice(id.indexOf('/') + 1).replace(/\.docx$/, ''),
  family,
  offenceCodes,
  variant: {},
  status,
});

const REGISTRY = new TemplateRegistry([
  e('REWARDS/REWARD  දඩ.docx', 'reward-voucher', []),
  e('PUDS/puds  බෝතලය.docx', 'plaint', ['PUDS'], 'current'),
  e('PUDS/puds කෑනය.docx', 'plaint', ['PUDS'], 'archived'),
  e('UPH/UPH.docx', 'plaint', ['UPH']),
]);

const FIELDS: Record<string, Record<string, string>> = {
  'cr-1': { CR_NO_2017: '12/2026', Offence: 'puds', Name_of_Accused: 'කේ. ඒ. සමන් කුමාර' },
};
const docData: DocDataService = {
  async buildFor(id) {
    const f = FIELDS[id];
    if (!f) throw new Error('not found');
    return f;
  },
};
const session = (): Session => ({ userId: 'u-1', username: 'oic', role: 'oic' });

function service(pdfExporter?: (p: string) => Promise<string>) {
  const log = new InMemoryGenerationLog();
  const generator = new DocumentGenerator({
    registry: REGISTRY,
    originalsDir: ORIGINALS,
    outputDir: mkdtempSync(join(tmpdir(), 'docs-dialog-')),
    log,
    ...(pdfExporter ? { pdfExporter } : {}),
  });
  return new DocumentsService({ docData, generator, registry: REGISTRY, log, session });
}

test('listFor: the CR offence plaints first, then general documents; archived and other offences hidden', async () => {
  const data = await service().listFor('cr-1');
  assert.equal(data.crNumber, '12/2026');
  assert.equal(data.offenceCode, 'PUDS');
  assert.deepEqual(
    data.groups.map((g) => [g.family, g.templates.map((t) => t.id)]),
    [
      ['plaint', ['PUDS/puds  බෝතලය.docx']],
      ['reward-voucher', ['REWARDS/REWARD  දඩ.docx']],
    ],
  );
  assert.equal(data.pdfAvailable, false);
  assert.deepEqual(data.history, []);
});

test('generate: uses the CR number and offence from the data service, logs the session user, codes the warnings', async () => {
  const svc = service();
  const first = await svc.generate('cr-1', 'REWARDS/REWARD  දඩ.docx');
  assert.equal(first.fileName, 'CR 12-2026 - REWARD දඩ.docx');
  assert.ok(first.warnings.some((w) => w.code === 'unconfirmed'));
  assert.ok(first.warnings.some((w) => w.code === 'empty_fields'));
  await svc.generate('cr-1', 'PUDS/puds  බෝතලය.docx');
  const history = await svc.history('cr-1');
  assert.equal(history.length, 2);
  assert.ok(history.every((h) => h.generatedBy === 'u-1'));
  assert.ok(history[0]!.generatedAt >= history[1]!.generatedAt, 'newest first');
});

test('generate: refuses a template for another offence; asks for a PDF when available', async () => {
  await assert.rejects(service().generate('cr-1', 'UPH/UPH.docx'), /not for offence PUDS/);
  const svc = service(async (p) => p.replace(/\.docx$/, '.pdf'));
  assert.equal((await svc.listFor('cr-1')).pdfAvailable, true);
  const r = await svc.generate('cr-1', 'PUDS/puds  බෝතලය.docx', { pdf: true });
  assert.equal(r.pdfPath, r.filePath.replace(/\.docx$/, '.pdf'));
});

test('a CR the data service cannot load is an error, not an empty dialog', async () => {
  await assert.rejects(service().listFor('missing'), /not found/);
});
