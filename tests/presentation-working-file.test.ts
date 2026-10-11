import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PresentationWorkingFiles } from '../server/computer/presentation-working-file';

const digest = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const signal = () => new AbortController().signal;
afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-working-'));
  const root = path.join(localDir, 'source'); await mkdir(root);
  const projectId = randomUUID(), cfg = { localDir, owner: 'working-file-test' };
  const store = new PresentationWorkingFiles(cfg);
  const input = { projectId, root, title: 'My presentation', signal: signal() };
  async function stage(revision: number, text: string) {
    const target = await store.prepare(input), file = store.stagePath(target, revision);
    await writeFile(file, text);
    return { target, staged: { path: file, sha256: digest(text) } };
  }
  return { localDir, root, projectId, cfg, store, input, stage };
}

describe('one working presentation with private immutable revisions', () => {
  it('runs final source validation after staging and rolls back metadata without publishing when it fails', async () => {
    const qa=await fixture(), first=await qa.stage(1,'original');
    const original=await qa.store.publish(first.target,first.staged,{revision:1},signal());
    const next=await qa.stage(2,'candidate');
    const beforePublish=vi.fn(()=>{throw Object.assign(new Error('Source changed'),{code:'stale_revision'});});
    await expect(qa.store.publish(next.target,next.staged,{revision:2},signal(),beforePublish)).rejects.toMatchObject({code:'stale_revision'});
    expect(beforePublish).toHaveBeenCalledTimes(1);
    expect(await readFile(first.target.file,'utf8')).toBe('original');
    expect(await qa.store.active()).toEqual(original);
    expect((await readdir(next.target.directory)).some(name=>name.includes('pending'))).toBe(false);
  });
  it('discovers the latest committed active project after restart and isolates owners', async () => {
    const qa = await fixture();
    expect(await qa.store.active()).toBeNull();
    const first = await qa.stage(1, 'first deck');
    const original = await qa.store.publish(first.target, first.staged, { revision: 1 }, signal());
    expect(await new PresentationWorkingFiles(qa.cfg).active()).toEqual(original);
    const next = await qa.stage(2, 'current deck');
    const current = await qa.store.publish(next.target, next.staged, { revision: 2 }, signal());
    expect(await new PresentationWorkingFiles(qa.cfg).active()).toEqual(current);
    expect(await new PresentationWorkingFiles({ ...qa.cfg, owner: 'another-owner' }).active()).toBeNull();
  });

  it('restores the previous active project when first publication of another project fails', async () => {
    const qa = await fixture(), first = await qa.stage(1, 'existing project');
    const original = await qa.store.publish(first.target, first.staged, { revision: 1 }, signal());
    const nextId = randomUUID();
    const target = await qa.store.prepare({ ...qa.input, projectId: nextId, title: 'New project' });
    const staged = { path: qa.store.stagePath(target, 1), sha256: digest('new project') };
    await writeFile(staged.path, 'new project');
    const atomic = (qa.store as any).atomicJson.bind(qa.store);
    vi.spyOn(qa.store as any, 'atomicJson').mockImplementation(async (file: any, data: any) => {
      if (String(file) === path.join(target.directory, 'working.json')) throw new Error('Commit record unavailable');
      return atomic(file, data);
    });
    await expect(qa.store.publish(target, staged, { revision: 1 }, signal())).rejects.toThrow('Commit record unavailable');
    expect(await new PresentationWorkingFiles(qa.cfg).active()).toEqual(original);
    expect(await qa.store.load(nextId)).toBeNull();
    await expect(readFile(target.file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(first.target.file, 'utf8')).toBe('existing project');
    expect(await readFile(staged.path, 'utf8')).toBe('new project');
  });

  it('reuses one filename through repeated revisions and keeps previous bytes privately', async () => {
    const qa = await fixture();
    const first = await qa.stage(1, 'original deck');
    await qa.store.publish(first.target, first.staged, { revision: 1 }, signal());
    const second = await qa.stage(2, 'revised slide two');
    const record = await qa.store.publish(second.target, second.staged, { revision: 2 }, signal());
    expect(second.target.filename).toBe(first.target.filename);
    expect(await readFile(second.target.file, 'utf8')).toBe('revised slide two');
    expect(await readFile(first.staged.path, 'utf8')).toBe('original deck');
    expect(record.working.path).toBe(first.target.file);
    expect(await new PresentationWorkingFiles(qa.cfg).load(qa.projectId)).toEqual(record);
    expect(await new PresentationWorkingFiles({ ...qa.cfg, owner: 'someone-else' }).load(qa.projectId)).toBeNull();
  });

  it('adopts an existing verified presentation instead of making a second visible filename', async () => {
    const qa = await fixture(), filename = 'existing-r4.pptx';
    await writeFile(path.join(qa.root, filename), 'existing');
    const target = await qa.store.prepare({ ...qa.input, adopt: { filename, sha256: digest('existing') } });
    const staged = { path: qa.store.stagePath(target, 5), sha256: digest('changed') };
    await writeFile(staged.path, 'changed');
    await qa.store.publish(target, staged, { revision: 5 }, signal());
    expect(target.filename).toBe(filename);
    expect(await readFile(path.join(target.directory, `previous-${digest('existing')}.pptx`), 'utf8')).toBe('existing');
  });

  it('refuses externally changed files and a different folder without overwriting either', async () => {
    const qa = await fixture(), first = await qa.stage(1, 'original');
    await qa.store.publish(first.target, first.staged, { revision: 1 }, signal());
    const next = await qa.stage(2, 'next');
    await writeFile(first.target.file, 'manual edit');
    await expect(qa.store.publish(next.target, next.staged, { revision: 2 }, signal())).rejects.toThrow('changed outside');
    expect(await readFile(first.target.file, 'utf8')).toBe('manual edit');
    const elsewhere = path.join(qa.localDir, 'other'); await mkdir(elsewhere);
    await expect(qa.store.prepare({ ...qa.input, root: elsewhere })).rejects.toThrow('different working folder');
  });

  it('rolls back exact bytes when publishing the commit manifest fails', async () => {
    const qa = await fixture(), first = await qa.stage(1, 'old');
    const original = await qa.store.publish(first.target, first.staged, { revision: 1 }, signal());
    const next = await qa.stage(2, 'new');
    const atomic = (qa.store as any).atomicJson.bind(qa.store);
    const spy = vi.spyOn(qa.store as any, 'atomicJson').mockImplementation(async (file: any, data: any) => {
      if (String(file).endsWith('working.json')) throw new Error('disk is full');
      return atomic(file, data);
    });
    await expect(qa.store.publish(next.target, next.staged, { revision: 2 }, signal())).rejects.toThrow('disk is full');
    spy.mockRestore();
    expect(await readFile(first.target.file, 'utf8')).toBe('old');
    expect(await qa.store.load(qa.projectId)).toEqual(original);
  });

  it('cancels before publication but completes a durable commit after the publication boundary', async () => {
    const qa = await fixture(), first = await qa.stage(1, 'old');
    await qa.store.publish(first.target, first.staged, { revision: 1 }, signal());
    const next = await qa.stage(2, 'new'), cancelled = new AbortController(); cancelled.abort();
    await expect(qa.store.publish(next.target, next.staged, { revision: 2 }, cancelled.signal)).rejects.toThrow();
    expect(await readFile(first.target.file, 'utf8')).toBe('old');
    const late = new AbortController(), atomic = (qa.store as any).atomicJson.bind(qa.store);
    const spy = vi.spyOn(qa.store as any, 'atomicJson').mockImplementation(async (file: any, data: any) => {
      if (String(file).endsWith('working.json')) late.abort();
      return atomic(file, data);
    });
    const result = await qa.store.publish(next.target, next.staged, { revision: 2 }, late.signal);
    spy.mockRestore();
    expect(result.revision).toBe(2);
    expect(await readFile(first.target.file, 'utf8')).toBe('new');
  });

  it('honors cancellation raised during final old-file verification before the atomic rename', async () => {
    const qa = await fixture(), first = await qa.stage(1, 'old');
    const original = await qa.store.publish(first.target, first.staged, { revision: 1 }, signal());
    const next = await qa.stage(2, 'new'), cancellation = new AbortController();
    const readVerified = qa.store.readVerified.bind(qa.store);
    let oldFileReads = 0;
    vi.spyOn(qa.store, 'readVerified').mockImplementation(async (file) => {
      const bytes = await readVerified(file);
      if (file.path === first.target.file && ++oldFileReads === 2)
        cancellation.abort(new Error('Cancelled during final verification'));
      return bytes;
    });
    await expect(qa.store.publish(next.target, next.staged, { revision: 2 }, cancellation.signal)).rejects.toThrow('Cancelled during final verification');
    expect(oldFileReads).toBe(2);
    expect(await readFile(first.target.file, 'utf8')).toBe('old');
    expect(await readFile(next.staged.path, 'utf8')).toBe('new');
    expect(await new PresentationWorkingFiles(qa.cfg).active()).toEqual(original);
    expect((await readdir(qa.root)).filter((file) => /\.(?:tmp|rollback)$/.test(file))).toEqual([]);
    await expect(readFile(path.join(first.target.directory, 'pending.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retains recovery evidence when rollback verification is blocked and recovers on the next start', async () => {
    const qa = await fixture(), first = await qa.stage(1, 'old');
    const original = await qa.store.publish(first.target, first.staged, { revision: 1 }, signal());
    const next = await qa.stage(2, 'new');
    const atomic = (qa.store as any).atomicJson.bind(qa.store);
    const readVerified = qa.store.readVerified.bind(qa.store);
    let publicationFailed = false;
    vi.spyOn(qa.store as any, 'atomicJson').mockImplementation(async (file: any, data: any) => {
      if (String(file).endsWith('working.json')) {
        publicationFailed = true;
        throw new Error('Commit record unavailable');
      }
      return atomic(file, data);
    });
    vi.spyOn(qa.store, 'readVerified').mockImplementation(async (file) => {
      if (publicationFailed && file.path === first.target.file)
        throw new Error('Working file temporarily locked');
      return readVerified(file);
    });
    await expect(qa.store.publish(next.target, next.staged, { revision: 2 }, signal())).rejects.toMatchObject({
      code: 'PUBLICATION_RECOVERY_REQUIRED', cause: { message: 'Working file temporarily locked' },
    });
    expect(await readFile(first.target.file, 'utf8')).toBe('new');
    const pending = JSON.parse(await readFile(path.join(first.target.directory, 'pending.json'), 'utf8'));
    expect(pending.previous).toEqual(original.working);
    expect(await readFile(pending.previousFile, 'utf8')).toBe('old');
    expect(await readFile(pending.next.archive.path, 'utf8')).toBe('new');
    const rollback = (await readdir(qa.root)).find((file) => file.endsWith('.rollback'));
    expect(rollback).toBeTruthy();
    expect(await readFile(path.join(qa.root, rollback!), 'utf8')).toBe('old');
    expect(pending.rollback).toEqual({ path: path.join(qa.root, rollback!), sha256: original.working.sha256 });
    vi.restoreAllMocks();
    const restarted = new PresentationWorkingFiles(qa.cfg);
    const verify = restarted.readVerified.bind(restarted);
    const reads = vi.spyOn(restarted, 'readVerified').mockImplementation(async (file) => {
      if (file.path === pending.previousFile) throw new Error('Recovery must use the prepared rollback instead of allocating a copy');
      return verify(file);
    });
    expect(await restarted.active()).toEqual(original);
    expect(reads).toHaveBeenCalledWith(pending.rollback);
    expect(await readFile(first.target.file, 'utf8')).toBe('old');
    await expect(readFile(pending.rollback.path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(qa.root)).filter((file) => file.endsWith('.recovery'))).toEqual([]);
    await expect(readFile(path.join(first.target.directory, 'pending.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves manual edits and all recovery bytes when rollback cannot safely replace the working file', async () => {
    const qa = await fixture(), first = await qa.stage(1, 'old');
    const original = await qa.store.publish(first.target, first.staged, { revision: 1 }, signal());
    const next = await qa.stage(2, 'new');
    const atomic = (qa.store as any).atomicJson.bind(qa.store);
    vi.spyOn(qa.store as any, 'atomicJson').mockImplementation(async (file: any, data: any) => {
      if (String(file).endsWith('working.json')) {
        await writeFile(first.target.file, 'manual edit after publication');
        throw new Error('Commit record unavailable');
      }
      return atomic(file, data);
    });
    await expect(qa.store.publish(next.target, next.staged, { revision: 2 }, signal())).rejects.toMatchObject({ code: 'PUBLICATION_RECOVERY_REQUIRED' });
    expect(await readFile(first.target.file, 'utf8')).toBe('manual edit after publication');
    const pending = JSON.parse(await readFile(path.join(first.target.directory, 'pending.json'), 'utf8'));
    expect(await readFile(pending.previousFile, 'utf8')).toBe('old');
    expect(await readFile(pending.next.archive.path, 'utf8')).toBe('new');
    expect(JSON.parse(await readFile(path.join(first.target.directory, 'working.json'), 'utf8'))).toEqual(original);
    await expect(new PresentationWorkingFiles(qa.cfg).active()).rejects.toMatchObject({ code: 'PUBLICATION_RECOVERY_REQUIRED' });
    expect(await readFile(first.target.file, 'utf8')).toBe('manual edit after publication');
    expect(await readFile(path.join(first.target.directory, 'pending.json'), 'utf8')).toBeTruthy();
  });

  it('reports unresolved active-pointer restoration and preserves both projects for recovery', async () => {
    const qa = await fixture(), first = await qa.stage(1, 'existing project');
    const original = await qa.store.publish(first.target, first.staged, { revision: 1 }, signal());
    const nextId = randomUUID();
    const target = await qa.store.prepare({ ...qa.input, projectId: nextId, title: 'New project' });
    const staged = { path: qa.store.stagePath(target, 1), sha256: digest('new project') };
    await writeFile(staged.path, 'new project');
    const atomic = (qa.store as any).atomicJson.bind(qa.store);
    vi.spyOn(qa.store as any, 'atomicJson').mockImplementation(async (file: any, data: any) => {
      if (String(file).endsWith('working.json')) throw new Error('Commit record unavailable');
      if (String(file).endsWith('active.json') && data.projectId === qa.projectId)
        throw new Error('Active pointer restoration unavailable');
      return atomic(file, data);
    });
    await expect(qa.store.publish(target, staged, { revision: 1 }, signal())).rejects.toMatchObject({
      code: 'PUBLICATION_RECOVERY_REQUIRED', cause: { message: 'Active pointer restoration unavailable' },
    });
    expect(await readFile(first.target.file, 'utf8')).toBe('existing project');
    expect(await qa.store.load(qa.projectId)).toEqual(original);
    expect(await readFile(staged.path, 'utf8')).toBe('new project');
    await expect(readFile(target.file)).rejects.toMatchObject({ code: 'ENOENT' });
    const pending = JSON.parse(await readFile(path.join(target.directory, 'pending.json'), 'utf8'));
    expect(pending.next.projectId).toBe(nextId);
    vi.restoreAllMocks();
    expect(await new PresentationWorkingFiles(qa.cfg).active()).toEqual(original);
    await expect(readFile(path.join(target.directory, 'pending.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers an interrupted publication from private bytes without promoting uncommitted output', async () => {
    const qa = await fixture(), first = await qa.stage(1, 'old');
    const original = await qa.store.publish(first.target, first.staged, { revision: 1 }, signal());
    const next = await qa.stage(2, 'new');
    const nextRecord = { ...original, revision: 2, working: { path: first.target.file, sha256: next.staged.sha256 }, archive: next.staged };
    const previousFile = path.join(first.target.directory, `previous-${original.working.sha256}.pptx`);
    await writeFile(previousFile, 'old');
    await writeFile(path.join(first.target.directory, 'pending.json'), JSON.stringify({ previous: original.working, previousFile, next: nextRecord }));
    await writeFile(first.target.file, 'new');
    expect(await new PresentationWorkingFiles(qa.cfg).load(qa.projectId)).toEqual(original);
    expect(await readFile(first.target.file, 'utf8')).toBe('old');
  });
});
