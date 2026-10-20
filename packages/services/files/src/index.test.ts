import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Session } from '@excise/contract';
import { createMemoryRepositories, sampleCrInput, seedReferences } from '@excise/mocks';
import type { Role } from '@excise/schemas';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanOrphanFiles, DefaultFileService, FileStoreError } from './index.js';

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'excise-files-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const session =
  (role: Role): (() => Session) =>
  () => ({ userId: 'u', username: 'u', role, mustChangePassword: false });

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function setup(role: Role = 'detecting') {
  const repos = createMemoryRepositories();
  const refs = seedReferences(repos.store);
  const cr = await repos.crs.insert(sampleCrInput(refs));
  const store = join(tmp, 'store');
  const svc = new DefaultFileService(repos.files, repos.crs, store, session(role), repos.audit);
  const src = join(tmp, 'Scene photo.PNG');
  await writeFile(src, PNG);
  return { repos, cr, svc, store, src };
}

describe('FileService', () => {
  it('copies the file under a new name, lists it and previews pictures', async () => {
    const { svc, cr, store, src, repos } = await setup();
    const f = await svc.attach(cr.id, src);
    expect(f).toMatchObject({ originalName: 'Scene photo.PNG', mimeType: 'image/png' });
    expect(await readdir(store)).toEqual([`${f.id}.png`]);
    expect(await svc.list(cr.id)).toEqual([f]);
    expect(await svc.preview(f.id)).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(await svc.pathOf(f.id)).toBe(join(store, `${f.id}.png`));
    expect(repos.store.audit.map((e) => e.action)).toEqual(['file_attach']);
    expect(JSON.stringify(repos.store.audit)).not.toContain(tmp);
  });

  it('refuses other types, empty files and deleted CRs', async () => {
    const { svc, cr, repos } = await setup();
    const exe = join(tmp, 'x.exe');
    await writeFile(exe, 'MZ');
    await expect(svc.attach(cr.id, exe)).rejects.toMatchObject({ code: 'bad_type' });
    const empty = join(tmp, 'e.jpg');
    await writeFile(empty, '');
    await expect(svc.attach(cr.id, empty)).rejects.toMatchObject({ code: 'empty' });
    await repos.crs.setDeleted(cr.id, true);
    await expect(svc.attach(cr.id, join(tmp, 'Scene photo.PNG'))).rejects.toBeInstanceOf(
      FileStoreError,
    );
  });

  it('read-only roles can view but not attach or remove', async () => {
    const { svc, cr, src, repos, store } = await setup();
    const f = await svc.attach(cr.id, src);
    const viewer = new DefaultFileService(
      repos.files,
      repos.crs,
      store,
      session('observation'),
      repos.audit,
    );
    await expect(viewer.list(cr.id)).resolves.toHaveLength(1);
    await expect(viewer.attach(cr.id, src)).rejects.toThrow(/lacks permission/);
    await expect(viewer.remove(f.id)).rejects.toThrow(/lacks permission/);
  });

  it('remove hides the file; the orphan clean-up deletes it from disk later', async () => {
    const { svc, cr, src, repos, store } = await setup();
    const keep = await svc.attach(cr.id, src);
    const gone = await svc.attach(cr.id, src);
    await svc.remove(gone.id);
    expect((await svc.list(cr.id)).map((f) => f.id)).toEqual([keep.id]);
    await expect(svc.pathOf(gone.id)).rejects.toMatchObject({ code: 'not_found' });
    expect(await readdir(store)).toHaveLength(2);
    expect(await cleanOrphanFiles(repos.files, store)).toEqual([`${gone.id}.png`]);
    expect(await readdir(store)).toEqual([`${keep.id}.png`]);
  });
});
