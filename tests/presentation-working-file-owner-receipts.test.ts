import { describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PRESENTATION_RECEIPT_PROJECT_SCAN_LIMIT,
  PresentationWorkingFiles,
  type PresentationOperationCommit,
} from '../server/computer/presentation-working-file';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const signal = () => new AbortController().signal;
const operation = (
  baseRevision: number,
  turnId = randomUUID(),
  index = 0,
  count = 1,
): PresentationOperationCommit => ({
  operationId: randomUUID(),
  requestHash: digest(`operation-${index}`),
  baseRevision,
  changedSlideIds: ['slide-two'],
  turnId,
  turnRequestHash: digest(`turn-${turnId}`),
  operationIndex: index,
  operationCount: count,
});

async function fixture() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-owner-receipts-'));
  const root = path.join(localDir, 'output');
  await mkdir(root);
  const cfg = { localDir, owner: 'owner-lookup-test' },
    store = new PresentationWorkingFiles(cfg);
  async function commit(projectId: string, revision: number, op?: PresentationOperationCommit) {
    const target = await store.prepare({
      projectId,
      root,
      title: 'Receipt project',
      signal: signal(),
    });
    const bytes = `${projectId}:revision-${revision}`;
    const staged = { path: store.stagePath(target, revision), sha256: digest(bytes) };
    await writeFile(staged.path, bytes);
    const record = await store.publish(
      target,
      staged,
      { revision, ...(op ? { operation: op } : {}) },
      signal(),
    );
    return { target, staged, record };
  }
  return { localDir, root, cfg, store, commit };
}

describe('owner-scoped turn lookup before selecting an active project', () => {
  it('finds an old project edit after switching to a same-revision project and restarting', async () => {
    const qa = await fixture(),
      projectA = randomUUID(),
      projectB = randomUUID();
    await qa.commit(projectA, 1);
    const edit = operation(1),
      savedA = await qa.commit(projectA, 2, edit);
    const savedB = await qa.commit(projectB, 1);
    const restarted = new PresentationWorkingFiles(qa.cfg);
    expect((await restarted.active())?.projectId).toBe(projectB);
    const receipts = await restarted.lookupOwnerTurn({
      turnId: edit.turnId!,
      requestHash: edit.turnRequestHash!,
      projectId: projectB,
      baseRevision: 1,
    });
    expect(receipts).toEqual(savedA.record.operationReceipts);
    expect(receipts[0]).toMatchObject({
      projectId: projectA,
      baseRevision: 1,
      committedRevision: 2,
    });
    expect(await restarted.load(projectB)).toEqual(savedB.record);
    expect(await readFile(savedB.target.file, 'utf8')).toBe(`${projectB}:revision-1`);
    expect(
      await new PresentationWorkingFiles({ ...qa.cfg, owner: 'another-owner' }).lookupOwnerTurn({
        turnId: edit.turnId!,
        requestHash: edit.turnRequestHash!,
      }),
    ).toEqual([]);
  });

  it('finds a lost creation result even when the request captured the previous active project', async () => {
    const qa = await fixture(),
      previousProject = randomUUID(),
      createdProject = randomUUID();
    await qa.commit(previousProject, 1);
    await qa.commit(previousProject, 2);
    const creation = operation(0),
      created = await qa.commit(createdProject, 1, creation);
    const restarted = new PresentationWorkingFiles(qa.cfg);
    expect(
      await restarted.lookupOwnerTurn({
        turnId: creation.turnId!,
        requestHash: creation.turnRequestHash!,
        projectId: previousProject,
        baseRevision: 2,
      }),
    ).toEqual(created.record.operationReceipts);
    expect(
      await restarted.lookupOwnerTurn({
        turnId: creation.turnId!,
        requestHash: creation.turnRequestHash!,
      }),
    ).toEqual(created.record.operationReceipts);
    await expect(
      restarted.lookupOwnerTurn({
        turnId: creation.turnId!,
        requestHash: digest('changed instructions'),
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_ID_CONFLICT' });
  });

  it('accepts old adopted records without receipts and uses their base revision to refuse unknown stale requests', async () => {
    const qa = await fixture(),
      projectId = randomUUID(),
      filename = 'existing-presentation.pptx';
    await writeFile(path.join(qa.root, filename), 'old file');
    const target = await qa.store.prepare({
      projectId,
      root: qa.root,
      title: 'Adopted',
      signal: signal(),
      adopt: { filename, sha256: digest('old file') },
    });
    const staged = { path: qa.store.stagePath(target, 5), sha256: digest('adopted revision') };
    await writeFile(staged.path, 'adopted revision');
    await qa.store.publish(target, staged, { revision: 5 }, signal());
    const unknown = operation(5);
    expect(
      await qa.store.lookupOwnerTurn({
        turnId: unknown.turnId!,
        requestHash: unknown.turnRequestHash!,
        projectId,
        baseRevision: 5,
      }),
    ).toEqual([]);
    await expect(
      qa.store.lookupOwnerTurn({
        turnId: unknown.turnId!,
        requestHash: unknown.turnRequestHash!,
        projectId,
        baseRevision: 4,
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_RECEIPT_EXPIRED' });
    const saved = await qa.commit(projectId, 6, unknown);
    expect(
      await new PresentationWorkingFiles(qa.cfg).lookupOwnerTurn({
        turnId: unknown.turnId!,
        requestHash: unknown.turnRequestHash!,
        projectId,
        baseRevision: 5,
      }),
    ).toEqual(saved.record.operationReceipts);
    expect(saved.target.filename).toBe(filename);
  });

  it('orders a turn spanning projects and refuses duplicated operation positions across projects', async () => {
    const qa = await fixture(),
      turnId = randomUUID();
    const first = operation(0, turnId, 0, 2),
      second = operation(0, turnId, 1, 2);
    const a = await qa.commit(randomUUID(), 1, first),
      b = await qa.commit(randomUUID(), 1, second);
    expect(await qa.store.lookupOwnerTurn({ turnId, requestHash: first.turnRequestHash! })).toEqual(
      [a.record.operationReceipts![0], b.record.operationReceipts![0]],
    );
    await qa.commit(randomUUID(), 1, operation(0, turnId, 1, 2));
    await expect(
      qa.store.lookupOwnerTurn({ turnId, requestHash: first.turnRequestHash! }),
    ).rejects.toMatchObject({ code: 'OPERATION_ID_CONFLICT' });
  });

  it('rejects redirected project directories rather than following another owner or returning an empty match', async () => {
    const qa = await fixture(),
      outside = path.join(qa.localDir, 'unrelated');
    await mkdir(outside);
    const sentinel = path.join(outside, 'working.json');
    await writeFile(sentinel, 'unrelated content');
    const directory = qa.store.directory(randomUUID());
    await mkdir(path.dirname(directory), { recursive: true });
    await symlink(outside, directory, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(
      qa.store.lookupOwnerTurn({ turnId: randomUUID(), requestHash: digest('request') }),
    ).rejects.toMatchObject({ code: 'OPERATION_LOOKUP_UNAVAILABLE' });
    expect(await readFile(sentinel, 'utf8')).toBe('unrelated content');
  });

  it('fails closed on malformed owned records instead of misclassifying a retry as new', async () => {
    const qa = await fixture(),
      directory = qa.store.directory(randomUUID());
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'working.json'), '{incomplete');
    await expect(
      qa.store.lookupOwnerTurn({ turnId: randomUUID(), requestHash: digest('request') }),
    ).rejects.toMatchObject({ code: 'OPERATION_LOOKUP_UNAVAILABLE' });
  });

  it('bounds the number of project directories and refuses to return a false empty result when exceeded', async () => {
    const qa = await fixture();
    await Promise.all(
      Array.from({ length: PRESENTATION_RECEIPT_PROJECT_SCAN_LIMIT + 1 }, () =>
        mkdir(qa.store.directory(randomUUID()), { recursive: true }),
      ),
    );
    await expect(
      qa.store.lookupOwnerTurn({ turnId: randomUUID(), requestHash: digest('request') }),
    ).rejects.toMatchObject({ code: 'OPERATION_LOOKUP_UNAVAILABLE' });
  });
});
