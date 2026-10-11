import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PRESENTATION_OPERATION_RECEIPT_LIMIT,
  PresentationOperationAlreadyCommittedError,
  PresentationWorkingFiles,
  type PresentationOperationCommit,
} from '../server/computer/presentation-working-file';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const signal = () => new AbortController().signal;
const operation = (
  baseRevision: number,
  overrides: Partial<PresentationOperationCommit> = {},
): PresentationOperationCommit => ({
  operationId: randomUUID(),
  requestHash: digest(`request-${baseRevision}`),
  baseRevision,
  changedSlideIds: ['slide-two'],
  summary: 'Updated slide two.',
  ...overrides,
});
afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-receipts-'));
  const root = path.join(localDir, 'output');
  await mkdir(root);
  const projectId = randomUUID(),
    cfg = { localDir, owner: 'receipt-owner' };
  const store = new PresentationWorkingFiles(cfg);
  async function stage(revision: number, text = `revision-${revision}`) {
    const target = await store.prepare({
      projectId,
      root,
      title: 'Receipt test',
      signal: signal(),
    });
    const staged = { path: store.stagePath(target, revision), sha256: digest(text) };
    await writeFile(staged.path, text);
    return { target, staged };
  }
  async function commit(op: PresentationOperationCommit, text?: string) {
    const staged = await stage(op.baseRevision + 1, text);
    const record = await store.publish(
      staged.target,
      staged.staged,
      { revision: op.baseRevision + 1, operation: op },
      signal(),
    );
    return { ...staged, record };
  }
  return { localDir, root, projectId, cfg, store, stage, commit };
}

describe('durable presentation operation receipts', () => {
  it('persists the exact validated slide diff with the file commit and rejects contradictory diffs', async () => {
    const qa = await fixture();
    await qa.commit(operation(0));
    const changes: NonNullable<PresentationOperationCommit['changes']> = [
      {
        slideId: 'slide-two',
        beforeIndex: 2,
        afterIndex: 3,
        title: 'Audience',
        changes: ['moved', 'content'],
      },
      {
        slideId: 'slide-three',
        beforeIndex: 3,
        afterIndex: 2,
        title: 'Review',
        changes: ['moved'],
      },
    ];
    const op = operation(1, { changedSlideIds: ['slide-two', 'slide-three'], changes });
    const saved = await qa.commit(op);
    const restarted = new PresentationWorkingFiles(qa.cfg);
    const receipt = await restarted.lookupOperation(qa.projectId, op);
    expect(receipt?.changes).toEqual(changes);
    expect(receipt?.outputSha256).toBe(saved.record.working.sha256);
    expect(receipt).not.toHaveProperty('native');
    expect(receipt).not.toHaveProperty('cloud');
    const candidate = await qa.stage(3);
    for (const invalid of [
      operation(2, { changes }),
      operation(2, {
        changes: [
          {
            slideId: 'slide-two',
            beforeIndex: 2,
            afterIndex: 2,
            title: 'Audience',
            changes: ['moved'],
          },
        ],
      }),
    ]) {
      await expect(
        qa.store.publish(
          candidate.target,
          candidate.staged,
          { revision: 3, operation: invalid },
          signal(),
        ),
      ).rejects.toThrow();
    }
    expect(await restarted.load(qa.projectId)).toEqual(saved.record);
    expect(await readFile(candidate.target.file, 'utf8')).toBe('revision-2');
  });

  it('returns the committed result after restart or lost response without publishing the retry candidate', async () => {
    const qa = await fixture(),
      op = operation(0);
    expect(await qa.store.lookupOperation(qa.projectId, op)).toBeNull();
    const first = await qa.commit(op, 'first committed bytes');
    const receipt = first.record.operationReceipts![0];
    expect(receipt).toMatchObject({
      ...op,
      projectId: qa.projectId,
      committedRevision: 1,
      outputSha256: first.staged.sha256,
    });
    const restarted = new PresentationWorkingFiles(qa.cfg);
    expect(await restarted.lookupOperation(qa.projectId, op)).toEqual(receipt);
    const beforeFiles = await readdir(first.target.directory);
    const beforeRecord = await readFile(path.join(first.target.directory, 'working.json'));
    // Even an absent retry candidate must not be read or replace the already committed file.
    const candidate = {
      path: path.join(first.target.directory, 'not-exported.pptx'),
      sha256: digest('different candidate'),
    };
    const read = vi.spyOn(restarted, 'readVerified');
    const error = await restarted
      .publish(first.target, candidate, { revision: 1, operation: op }, signal())
      .catch((value) => value);
    expect(error).toBeInstanceOf(PresentationOperationAlreadyCommittedError);
    expect(error.receipt).toEqual(receipt);
    expect(read).not.toHaveBeenCalled();
    expect(await readFile(first.target.file, 'utf8')).toBe('first committed bytes');
    expect(await readFile(path.join(first.target.directory, 'working.json'))).toEqual(beforeRecord);
    expect(await readdir(first.target.directory)).toEqual(beforeFiles);
  });

  it('retains receipts across later ordinary commits and isolates another owner or project', async () => {
    const qa = await fixture(),
      op = operation(0),
      first = await qa.commit(op);
    const second = await qa.stage(2);
    await qa.store.publish(second.target, second.staged, { revision: 2 }, signal());
    const restarted = new PresentationWorkingFiles(qa.cfg);
    expect(await restarted.lookupOperation(qa.projectId, op)).toEqual(
      first.record.operationReceipts![0],
    );
    expect(
      await new PresentationWorkingFiles({ ...qa.cfg, owner: 'other-owner' }).lookupOperation(
        qa.projectId,
        op,
      ),
    ).toBeNull();
    expect(await restarted.lookupOperation(randomUUID(), op)).toBeNull();
    // A matching retry remains historical: it never reverts the newer output.
    await expect(
      restarted.publish(first.target, first.staged, { revision: 1, operation: op }, signal()),
    ).rejects.toMatchObject({ code: 'OPERATION_ALREADY_COMMITTED' });
    expect(await readFile(second.target.file, 'utf8')).toBe('revision-2');
  });

  it('refuses conflicting operation identity, malformed turn metadata and stale or future base revisions', async () => {
    const qa = await fixture(),
      op = operation(0),
      first = await qa.commit(op);
    await expect(
      qa.store.lookupOperation(qa.projectId, { ...op, requestHash: digest('another request') }),
    ).rejects.toMatchObject({ code: 'OPERATION_ID_CONFLICT' });
    await expect(
      qa.store.lookupOperation(qa.projectId, { ...op, baseRevision: 1 }),
    ).rejects.toMatchObject({ code: 'OPERATION_ID_CONFLICT' });
    await expect(qa.store.lookupOperation(qa.projectId, operation(0))).rejects.toMatchObject({
      code: 'OPERATION_RECEIPT_EXPIRED',
    });
    await expect(qa.store.lookupOperation(qa.projectId, operation(4))).rejects.toMatchObject({
      code: 'OPERATION_RECEIPT_EXPIRED',
    });
    const next = await qa.stage(2);
    await expect(
      qa.store.publish(
        next.target,
        next.staged,
        { revision: 2, operation: { ...op, changedSlideIds: ['wrong-slide'] } },
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_ID_CONFLICT' });
    await expect(
      qa.store.publish(
        next.target,
        next.staged,
        { revision: 2, operation: operation(1, { turnId: randomUUID() }) },
        signal(),
      ),
    ).rejects.toThrow();
    await expect(
      qa.store.publish(
        next.target,
        next.staged,
        { revision: 3, operation: operation(1) },
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_RECEIPT_EXPIRED' });
    expect(await qa.store.load(qa.projectId)).toEqual(first.record);
    expect(await readFile(first.target.file, 'utf8')).toBe('revision-1');
  });

  it('returns only the completed operations of a turn in execution order and checks turn conflicts', async () => {
    const qa = await fixture(),
      turnId = randomUUID(),
      turnRequestHash = digest('revise slide two, then add summary, then theme');
    const shared = { turnId, turnRequestHash, operationCount: 3 };
    const first = await qa.commit(operation(0, { ...shared, operationIndex: 0 }));
    expect(
      await qa.store.lookupTurn(qa.projectId, {
        turnId,
        requestHash: turnRequestHash,
        baseRevision: 0,
      }),
    ).toEqual(first.record.operationReceipts);
    const second = await qa.commit(
      operation(1, { ...shared, operationIndex: 1, changedSlideIds: ['summary-slide'] }),
    );
    const restarted = new PresentationWorkingFiles(qa.cfg);
    const receipts = await restarted.lookupTurn(qa.projectId, {
      turnId,
      requestHash: turnRequestHash,
      baseRevision: 0,
    });
    expect(receipts).toEqual(second.record.operationReceipts);
    expect(receipts.map((receipt) => receipt.operationIndex)).toEqual([0, 1]);
    expect(receipts.every((receipt) => receipt.operationCount === 3)).toBe(true);
    await expect(
      restarted.lookupTurn(qa.projectId, { turnId, requestHash: digest('different transcript') }),
    ).rejects.toMatchObject({ code: 'OPERATION_ID_CONFLICT' });
    const next = await qa.stage(3);
    for (const changes of [
      { operationIndex: 1 },
      { operationCount: 4 },
      { turnRequestHash: digest('changed transcript') },
    ]) {
      await expect(
        qa.store.publish(
          next.target,
          next.staged,
          { revision: 3, operation: operation(2, { ...shared, operationIndex: 2, ...changes }) },
          signal(),
        ),
      ).rejects.toMatchObject({ code: 'OPERATION_ID_CONFLICT' });
    }
    expect(await readFile(next.target.file, 'utf8')).toBe('revision-2');
  });

  it('bounds retained history and refuses an evicted retry rather than treating it as a new change', { timeout: 15_000 }, async () => {
    const qa = await fixture(),
      firstOp = operation(0, {
        turnId: randomUUID(),
        turnRequestHash: digest('old turn'),
        operationIndex: 0,
        operationCount: 1,
      });
    await qa.commit(firstOp);
    let latest = firstOp;
    for (
      let baseRevision = 1;
      baseRevision <= PRESENTATION_OPERATION_RECEIPT_LIMIT;
      baseRevision++
    ) {
      latest = operation(baseRevision);
      await qa.commit(latest);
    }
    const restarted = new PresentationWorkingFiles(qa.cfg),
      record = await restarted.load(qa.projectId);
    expect(record?.operationReceipts).toHaveLength(PRESENTATION_OPERATION_RECEIPT_LIMIT);
    expect(record?.operationReceipts?.[0].committedRevision).toBe(2);
    expect((await restarted.lookupOperation(qa.projectId, latest))?.committedRevision).toBe(
      PRESENTATION_OPERATION_RECEIPT_LIMIT + 1,
    );
    await expect(restarted.lookupOperation(qa.projectId, firstOp)).rejects.toMatchObject({
      code: 'OPERATION_RECEIPT_EXPIRED',
    });
    await expect(
      restarted.lookupTurn(qa.projectId, {
        turnId: firstOp.turnId!,
        requestHash: firstOp.turnRequestHash!,
        baseRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_RECEIPT_EXPIRED' });
  });

  it('serializes simultaneous same-ID publications across store instances and commits just once', async () => {
    const qa = await fixture(),
      op = operation(0);
    const a = await qa.stage(1, 'candidate A'),
      b = await qa.stage(1, 'candidate B');
    const results = await Promise.allSettled([
      qa.store.publish(a.target, a.staged, { revision: 1, operation: op }, signal()),
      new PresentationWorkingFiles(qa.cfg).publish(
        b.target,
        b.staged,
        { revision: 1, operation: op },
        signal(),
      ),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ code: 'OPERATION_ALREADY_COMMITTED' });
    const saved = await qa.store.load(qa.projectId);
    expect(saved?.revision).toBe(1);
    expect(saved?.operationReceipts).toHaveLength(1);
    expect(digest(await readFile(a.target.file, 'utf8'))).toBe(
      saved?.operationReceipts?.[0].outputSha256,
    );
    expect(await readdir(qa.root)).toEqual([a.target.filename]);
  });

  it('does not persist a cancelled receipt before the publication boundary', async () => {
    const qa = await fixture(),
      first = await qa.commit(operation(0)),
      op = operation(1);
    const next = await qa.stage(2),
      abort = new AbortController();
    const atomic = (qa.store as any).atomicJson.bind(qa.store);
    vi.spyOn(qa.store as any, 'atomicJson').mockImplementation(async (file: any, data: unknown) => {
      await atomic(file, data);
      if (file.endsWith('pending.json')) abort.abort(new Error('stopped'));
    });
    await expect(
      qa.store.publish(next.target, next.staged, { revision: 2, operation: op }, abort.signal),
    ).rejects.toThrow('stopped');
    expect(await qa.store.lookupOperation(qa.projectId, op)).toBeNull();
    expect(await qa.store.load(qa.projectId)).toEqual(first.record);
    expect(await readFile(next.target.file, 'utf8')).toBe('revision-1');
  });

  it('rolls back an uncommitted receipt through the same prepared crash-recovery journal as the file', async () => {
    const qa = await fixture(),
      first = await qa.commit(operation(0)),
      op = operation(1, {
        changes: [
          {
            slideId: 'slide-two',
            beforeIndex: 2,
            afterIndex: 2,
            title: 'Audience',
            changes: ['content'],
          },
        ],
      }),
      next = await qa.stage(2);
    const atomic = (qa.store as any).atomicJson.bind(qa.store),
      verified = qa.store.readVerified.bind(qa.store);
    vi.spyOn(qa.store as any, 'atomicJson').mockImplementation(async (file: any, data: unknown) => {
      if (file.endsWith('working.json')) throw new Error('commit unavailable');
      return atomic(file, data);
    });
    vi.spyOn(qa.store, 'readVerified').mockImplementation(async (file) => {
      if (file.path.endsWith('.rollback')) throw new Error('rollback temporarily unavailable');
      return verified(file);
    });
    await expect(
      qa.store.publish(next.target, next.staged, { revision: 2, operation: op }, signal()),
    ).rejects.toMatchObject({ code: 'PUBLICATION_RECOVERY_REQUIRED' });
    const pending = JSON.parse(
      await readFile(path.join(next.target.directory, 'pending.json'), 'utf8'),
    );
    expect(pending.next.operationReceipts.at(-1).operationId).toBe(op.operationId);
    expect(pending.next.operationReceipts.at(-1).changes).toEqual(op.changes);
    expect(await readFile(next.target.file, 'utf8')).toBe('revision-2');
    vi.restoreAllMocks();
    const restarted = new PresentationWorkingFiles(qa.cfg);
    expect(await restarted.lookupOperation(qa.projectId, op)).toBeNull();
    expect(await restarted.load(qa.projectId)).toEqual(first.record);
    expect(await readFile(next.target.file, 'utf8')).toBe('revision-1');
    await expect(readFile(path.join(next.target.directory, 'pending.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    // After a genuine rollback, the same uncommitted identity can safely execute once.
    const retried = await qa.commit(op, 'retried change');
    expect(retried.record.operationReceipts).toHaveLength(2);
  });

  it('retains a committed receipt when the process exits before cleaning up its journal', async () => {
    const qa = await fixture();
    await qa.commit(operation(0));
    const op = operation(1, {
        changes: [
          {
            slideId: 'slide-two',
            beforeIndex: 2,
            afterIndex: 2,
            title: 'Audience',
            changes: ['style'],
          },
        ],
      }),
      next = await qa.stage(2);
    let journal: unknown;
    const atomic = (qa.store as any).atomicJson.bind(qa.store);
    vi.spyOn(qa.store as any, 'atomicJson').mockImplementation(async (file: any, data: unknown) => {
      if (file.endsWith('pending.json')) journal = structuredClone(data);
      return atomic(file, data);
    });
    const record = await qa.store.publish(
      next.target,
      next.staged,
      { revision: 2, operation: op },
      signal(),
    );
    await writeFile(path.join(next.target.directory, 'pending.json'), JSON.stringify(journal));
    const restarted = new PresentationWorkingFiles(qa.cfg);
    expect(await restarted.lookupOperation(qa.projectId, op)).toEqual(
      record.operationReceipts!.at(-1),
    );
    expect(await restarted.load(qa.projectId)).toEqual(record);
    expect(await readFile(next.target.file, 'utf8')).toBe('revision-2');
    await expect(readFile(path.join(next.target.directory, 'pending.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
