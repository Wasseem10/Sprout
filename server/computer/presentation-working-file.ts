import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  opendir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { renamePresentationManifest } from './atomic-json-rename.js';
import type { Config } from '../config.js';
import { presentationSlideChangeSchema } from '../../shared/presentation-change.js';
import {
  presentationLocalManifestSchema,
  presentationSessionSchema,
} from '../../shared/presentation-session.js';
import {
  managedPresentationFileSchema,
  type ManagedPresentationFile,
} from './presentation-windows.js';

export const PRESENTATION_OPERATION_RECEIPT_LIMIT = 64;
export const PRESENTATION_RECEIPT_PROJECT_SCAN_LIMIT = 256;
export const PRESENTATION_RECEIPT_METADATA_BYTE_LIMIT = 16 * 1024 * 1024;
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const presentationOperationKeySchema = z.strictObject({
  operationId: z.string().uuid(),
  requestHash: sha256Schema,
  baseRevision: z.number().int().nonnegative(),
});
export type PresentationOperationKey = z.infer<typeof presentationOperationKeySchema>;
const operationCommitSchema = presentationOperationKeySchema
  .extend({
    changedSlideIds: z.array(z.string().min(1).max(100)).max(20),
    changes: z.array(presentationSlideChangeSchema).max(20).optional(),
    summary: z.string().min(1).max(600).optional(),
    turnId: z.string().uuid().optional(),
    turnRequestHash: sha256Schema.optional(),
    operationIndex: z.number().int().nonnegative().max(7).optional(),
    operationCount: z.number().int().min(1).max(8).optional(),
  })
  .superRefine((value, context) => {
    if (new Set(value.changedSlideIds).size !== value.changedSlideIds.length)
      context.addIssue({
        code: 'custom',
        path: ['changedSlideIds'],
        message: 'Changed slide IDs must be unique.',
      });
    if (
      value.changes &&
      (new Set(value.changes.map((change) => change.slideId)).size !== value.changes.length ||
        JSON.stringify(value.changes.map((change) => change.slideId).sort()) !==
          JSON.stringify([...value.changedSlideIds].sort()))
    )
      context.addIssue({
        code: 'custom',
        path: ['changes'],
        message: 'Detailed changes must match the unique changed slide IDs.',
      });
    const turnFields = [
      value.turnId,
      value.turnRequestHash,
      value.operationIndex,
      value.operationCount,
    ];
    if (
      turnFields.some((field) => field !== undefined) &&
      turnFields.some((field) => field === undefined)
    )
      context.addIssue({
        code: 'custom',
        path: ['turnId'],
        message:
          'Turn receipts require the turn ID, request hash and operation position/count together.',
      });
    if (
      value.operationIndex !== undefined &&
      value.operationCount !== undefined &&
      value.operationIndex >= value.operationCount
    )
      context.addIssue({
        code: 'custom',
        path: ['operationIndex'],
        message: 'Operation index must be within the turn.',
      });
  });
export type PresentationOperationCommit = z.infer<typeof operationCommitSchema>;
const operationReceiptSchema = operationCommitSchema
  .safeExtend({
    projectId: z.string().uuid(),
    committedRevision: z.number().int().positive(),
    outputSha256: sha256Schema,
    committedAt: z.string().datetime(),
  })
  .refine((receipt) => receipt.committedRevision === receipt.baseRevision + 1, {
    message: 'An operation receipt must describe the next committed revision.',
  });
export type PresentationOperationReceipt = z.infer<typeof operationReceiptSchema>;
export class PresentationOperationConflictError extends Error {
  readonly code = 'OPERATION_ID_CONFLICT';
  constructor() {
    super(
      'This request ID already belongs to a different presentation change. Start a new request.',
    );
  }
}
export class PresentationOperationExpiredError extends Error {
  readonly code = 'OPERATION_RECEIPT_EXPIRED';
  constructor() {
    super(
      'This request is older than the current presentation and cannot be replayed safely. Review the current presentation and start a new request.',
    );
  }
}
export class PresentationOperationAlreadyCommittedError extends Error {
  readonly code = 'OPERATION_ALREADY_COMMITTED';
  constructor(readonly receipt: PresentationOperationReceipt) {
    super('This presentation change was already saved.');
  }
}
export class PresentationOperationLookupError extends Error {
  readonly code = 'OPERATION_LOOKUP_UNAVAILABLE';
  constructor(cause: unknown) {
    super(
      'I could not safely check whether this request was already saved. I have not repeated the change.',
      { cause },
    );
  }
}

const recordSchema = z
  .strictObject({
    version: z.literal(1),
    projectId: z.string().uuid(),
    revision: z.number().int().positive(),
    working: managedPresentationFileSchema,
    archive: managedPresentationFileSchema,
    committedAt: z.string().datetime(),
    session: presentationSessionSchema.optional(),
    local: presentationLocalManifestSchema.optional(),
    operationReceipts: z
      .array(operationReceiptSchema)
      .max(PRESENTATION_OPERATION_RECEIPT_LIMIT)
      .optional(),
  })
  .superRefine((record, context) => {
    const operations = new Set<string>();
    const positions = new Set<string>();
    const turns = new Map<string, { hash: string; count: number }>();
    let previousRevision = 0;
    for (const receipt of record.operationReceipts ?? []) {
      if (
        receipt.projectId !== record.projectId ||
        receipt.committedRevision > record.revision ||
        receipt.committedRevision <= previousRevision ||
        operations.has(receipt.operationId)
      )
        context.addIssue({
          code: 'custom',
          path: ['operationReceipts'],
          message: 'Invalid operation receipt ownership or revision order.',
        });
      operations.add(receipt.operationId);
      previousRevision = receipt.committedRevision;
      if (receipt.turnId) {
        const prior = turns.get(receipt.turnId),
          position = `${receipt.turnId}:${receipt.operationIndex}`;
        if (
          positions.has(position) ||
          (prior &&
            (prior.hash !== receipt.turnRequestHash || prior.count !== receipt.operationCount))
        )
          context.addIssue({
            code: 'custom',
            path: ['operationReceipts'],
            message: 'Conflicting turn receipt metadata.',
          });
        positions.add(position);
        turns.set(receipt.turnId, {
          hash: receipt.turnRequestHash!,
          count: receipt.operationCount!,
        });
      }
    }
  });
export type WorkingPresentationRecord = z.infer<typeof recordSchema>;
export type WorkingPresentationCommit = Omit<
  WorkingPresentationRecord,
  'version' | 'projectId' | 'working' | 'archive' | 'committedAt' | 'operationReceipts'
> & {
  operation?: PresentationOperationCommit;
};
const mutationQueues = new Map<string, Promise<void>>();
const activeSchema = z.strictObject({ projectId: z.string().uuid() });
const pendingSchema = z.strictObject({
  previous: managedPresentationFileSchema.nullable(),
  previousFile: z.string().optional(),
  rollback: managedPresentationFileSchema.optional(),
  previousActive: activeSchema.nullable().optional(),
  next: recordSchema,
});
export class PresentationPublicationRecoveryError extends Error {
  readonly code = 'PUBLICATION_RECOVERY_REQUIRED';
  constructor(cause: unknown) {
    super(
      'The presentation update needs recovery before continuing. Your files and recovery journal were retained.',
      { cause },
    );
    this.name = 'PresentationPublicationRecoveryError';
  }
}
export type WorkingPresentationTarget = {
  projectId: string;
  file: string;
  filename: string;
  expected?: ManagedPresentationFile;
  directory: string;
};
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const samePath = (a: string, b: string) =>
  process.platform === 'win32'
    ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
    : path.resolve(a) === path.resolve(b);

/** A stable user-facing file and immutable private bytes. Never trusts filename prefixes. */
export class PresentationWorkingFiles {
  constructor(private cfg: Pick<Config, 'owner' | 'localDir'>) {}

  /** Also covers recovery reads: they must never roll back another in-flight publication. */
  private async serialized<T>(action: () => Promise<T>): Promise<T> {
    const key =
      process.platform === 'win32'
        ? path.resolve(this.activeFile()).toLowerCase()
        : path.resolve(this.activeFile());
    const preceding = mutationQueues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = preceding.then(() => ready);
    mutationQueues.set(key, queued);
    await preceding;
    try {
      return await action();
    } finally {
      release();
      if (mutationQueues.get(key) === queued) mutationQueues.delete(key);
    }
  }

  directory(projectId: string) {
    z.string().uuid().parse(projectId);
    return path.join(
      this.cfg.localDir,
      'presentation-revisions',
      hash(Buffer.from(this.cfg.owner)),
      projectId,
    );
  }

  private activeFile() {
    return path.join(
      this.cfg.localDir,
      'presentation-revisions',
      hash(Buffer.from(this.cfg.owner)),
      'active.json',
    );
  }

  async active(): Promise<WorkingPresentationRecord | null> {
    const active = await this.readActive();
    if (!active) return null;
    const record = await this.load(active.projectId);
    // Recovery of an uncommitted project may restore the previous active pointer.
    const recovered = await this.readActive();
    return recovered && recovered.projectId !== active.projectId
      ? this.load(recovered.projectId)
      : record;
  }

  private async readActive(): Promise<z.infer<typeof activeSchema> | null> {
    try {
      const file = this.activeFile(),
        stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1000)
        throw new Error('Invalid active presentation reference.');
      return activeSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private async restoreActive(
    projectId: string,
    previous: z.infer<typeof activeSchema> | null | undefined,
  ) {
    if (previous === undefined) return; // Journals from before active-pointer recovery.
    const current = await this.readActive();
    // Never replace a more recent project's active pointer while recovering an older one.
    if (current?.projectId !== projectId) return;
    if (previous?.projectId === current.projectId) return;
    if (previous) await this.atomicJson(this.activeFile(), previous);
    else {
      try {
        await unlink(this.activeFile());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }

  async readVerified(file: ManagedPresentationFile) {
    managedPresentationFileSchema.parse(file);
    const stat = await lstat(file.path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > 22 * 1024 * 1024 ||
      !samePath(await realpath(file.path), file.path)
    )
      throw new Error(
        'The working presentation was redirected or replaced. I kept your current deck.',
      );
    const bytes = await readFile(file.path);
    if (hash(bytes) !== file.sha256)
      throw new Error(
        'The working presentation changed outside Insight. Save or review those changes before continuing.',
      );
    return bytes;
  }

  private async atomicJson(file: string, value: unknown) {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
      await renamePresentationManifest(temp, file);
    } finally {
      await unlink(temp).catch(() => undefined);
    }
  }

  private async recover(projectId: string) {
    const directory = this.directory(projectId),
      journal = path.join(directory, 'pending.json');
    let pending: z.infer<typeof pendingSchema>;
    try {
      const stat = await lstat(journal);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000)
        throw new Error('Invalid presentation recovery record.');
      pending = pendingSchema.parse(JSON.parse(await readFile(journal, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new PresentationPublicationRecoveryError(error);
    }
    try {
      if (
        pending.next.projectId !== projectId ||
        !samePath(path.dirname(pending.next.archive.path), directory) ||
        (pending.previous &&
          (!samePath(pending.previous.path, pending.next.working.path) ||
            !pending.previousFile ||
            !samePath(path.dirname(pending.previousFile), directory)))
      )
        throw new Error('Presentation recovery ownership mismatch.');
      if (pending.rollback) {
        const suffix = pending.rollback.path.slice(pending.next.working.path.length);
        if (
          !pending.previous ||
          pending.rollback.sha256 !== pending.previous.sha256 ||
          !samePath(path.dirname(pending.rollback.path), path.dirname(pending.next.working.path)) ||
          !samePath(
            pending.rollback.path.slice(0, pending.next.working.path.length),
            pending.next.working.path,
          ) ||
          !/^\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.rollback$/i.test(
            suffix,
          )
        )
          throw new Error('Presentation rollback ownership mismatch.');
      }
      let alreadyCommitted = false;
      try {
        const current = recordSchema.parse(
          JSON.parse(await readFile(path.join(directory, 'working.json'), 'utf8')),
        );
        alreadyCommitted =
          current.projectId === projectId &&
          current.revision === pending.next.revision &&
          current.committedAt === pending.next.committedAt &&
          current.archive.sha256 === pending.next.archive.sha256 &&
          samePath(current.archive.path, pending.next.archive.path) &&
          current.working.sha256 === pending.next.working.sha256 &&
          samePath(current.working.path, pending.next.working.path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (alreadyCommitted) await this.readVerified(pending.next.working);
      else {
        let currentHash: string | undefined;
        try {
          const stat = await lstat(pending.next.working.path);
          if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            stat.size > 22 * 1024 * 1024 ||
            !samePath(await realpath(pending.next.working.path), pending.next.working.path)
          )
            throw new Error('The working file changed during recovery.');
          currentHash = hash(await readFile(pending.next.working.path));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        if (currentHash === pending.next.working.sha256) {
          if (pending.previous) {
            if (pending.rollback) {
              await this.readVerified(pending.rollback);
              await this.readVerified(pending.next.working);
              await rename(pending.rollback.path, pending.previous.path);
            } else {
              // Compatibility for older journals without prepared sibling rollback bytes.
              const bytes = await this.readVerified({
                path: pending.previousFile!,
                sha256: pending.previous.sha256,
              });
              const temporary = `${pending.previous.path}.${randomUUID()}.recovery`;
              try {
                await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
                await this.readVerified(pending.next.working);
                await rename(temporary, pending.previous.path);
              } finally {
                await unlink(temporary).catch(() => undefined);
              }
            }
          } else {
            await this.readVerified(pending.next.working);
            await unlink(pending.next.working.path);
          }
        } else if (currentHash !== pending.previous?.sha256)
          throw new Error('The working file changed during recovery. I kept those changes.');
        await this.restoreActive(projectId, pending.previousActive);
      }
      await unlink(journal);
      if (pending.rollback) {
        // It was either consumed by rollback or is now redundant after a verified commit.
        try {
          await this.readVerified(pending.rollback);
          await unlink(pending.rollback.path);
        } catch {
          /* Never remove redirected or externally changed rollback bytes. */
        }
      }
    } catch (error) {
      throw error instanceof PresentationPublicationRecoveryError
        ? error
        : new PresentationPublicationRecoveryError(error);
    }
  }

  async load(projectId: string): Promise<WorkingPresentationRecord | null> {
    return this.serialized(() => this.loadUnlocked(projectId));
  }

  private async loadUnlocked(projectId: string): Promise<WorkingPresentationRecord | null> {
    const directory = this.directory(projectId);
    await this.recover(projectId);
    try {
      const filename = path.join(directory, 'working.json');
      const stat = await lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000)
        throw new Error('Invalid working presentation record.');
      const record = recordSchema.parse(JSON.parse(await readFile(filename, 'utf8')));
      if (record.projectId !== projectId || !samePath(path.dirname(record.archive.path), directory))
        throw new Error('Working presentation ownership mismatch.');
      return record;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private findOperation(record: WorkingPresentationRecord | null, key: PresentationOperationKey) {
    const receipt = record?.operationReceipts?.find(
      (entry) => entry.operationId === key.operationId,
    );
    if (receipt) {
      if (receipt.requestHash !== key.requestHash || receipt.baseRevision !== key.baseRevision)
        throw new PresentationOperationConflictError();
      return structuredClone(receipt);
    }
    // A missing older ID may have fallen out of the bounded ledger. Never replay it.
    if (record && key.baseRevision !== record.revision)
      throw new PresentationOperationExpiredError();
    return null;
  }

  async lookupOperation(
    projectId: string,
    key: PresentationOperationKey,
  ): Promise<PresentationOperationReceipt | null> {
    const parsed = presentationOperationKeySchema.parse({
      operationId: key.operationId,
      requestHash: key.requestHash,
      baseRevision: key.baseRevision,
    });
    return this.findOperation(await this.load(projectId), parsed);
  }

  async lookupTurn(
    projectId: string,
    key: { turnId: string; requestHash: string; baseRevision?: number },
  ): Promise<PresentationOperationReceipt[]> {
    const parsed = z
      .strictObject({
        turnId: z.string().uuid(),
        requestHash: sha256Schema,
        baseRevision: z.number().int().nonnegative().optional(),
      })
      .parse(key);
    const record = await this.load(projectId);
    const receipts =
      record?.operationReceipts?.filter((entry) => entry.turnId === parsed.turnId) ?? [];
    if (receipts.some((receipt) => receipt.turnRequestHash !== parsed.requestHash))
      throw new PresentationOperationConflictError();
    if (
      !receipts.length &&
      record &&
      parsed.baseRevision !== undefined &&
      parsed.baseRevision !== record.revision
    )
      throw new PresentationOperationExpiredError();
    return structuredClone(
      receipts.sort((left, right) => left.operationIndex! - right.operationIndex!),
    );
  }

  /** A delayed response may belong to a project that is no longer active. */
  async lookupOwnerTurn(key: {
    turnId: string;
    requestHash: string;
    baseRevision?: number;
    projectId?: string;
  }): Promise<PresentationOperationReceipt[]> {
    const parsed = z
      .strictObject({
        turnId: z.string().uuid(),
        requestHash: sha256Schema,
        baseRevision: z.number().int().nonnegative().optional(),
        projectId: z.string().uuid().optional(),
      })
      .parse(key);
    return this.serialized(async () => {
      const ownerDirectory = path.dirname(this.activeFile());
      const receipts: PresentationOperationReceipt[] = [];
      let capturedRecord: WorkingPresentationRecord | null = null;
      let projects = 0,
        entries = 0,
        metadataBytes = 0;
      try {
        let ownerStat;
        try {
          ownerStat = await lstat(ownerDirectory);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
          throw error;
        }
        if (
          !ownerStat.isDirectory() ||
          ownerStat.isSymbolicLink() ||
          !samePath(await realpath(ownerDirectory), ownerDirectory)
        )
          throw new Error('The presentation receipt owner directory was redirected.');
        for await (const entry of await opendir(ownerDirectory)) {
          if (++entries > PRESENTATION_RECEIPT_PROJECT_SCAN_LIMIT * 4)
            throw new Error('The presentation receipt directory exceeds the bounded scan limit.');
          if (!z.string().uuid().safeParse(entry.name).success) continue;
          if (++projects > PRESENTATION_RECEIPT_PROJECT_SCAN_LIMIT)
            throw new Error('Too many presentation projects to verify this retry safely.');
          const directory = this.directory(entry.name),
            stat = await lstat(directory);
          if (
            !entry.isDirectory() ||
            !stat.isDirectory() ||
            stat.isSymbolicLink() ||
            !samePath(await realpath(directory), directory)
          )
            throw new Error('A presentation receipt project directory was redirected.');
          for (const filename of ['working.json', 'pending.json']) {
            try {
              const recordStat = await lstat(path.join(directory, filename));
              if (
                !recordStat.isFile() ||
                recordStat.isSymbolicLink() ||
                recordStat.size > 2_000_000
              )
                throw new Error('Invalid presentation receipt metadata.');
              metadataBytes += recordStat.size;
              if (metadataBytes > PRESENTATION_RECEIPT_METADATA_BYTE_LIMIT)
                throw new Error(
                  'The presentation receipt metadata exceeds the bounded read limit.',
                );
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
          }
          const record = await this.loadUnlocked(entry.name);
          if (entry.name === parsed.projectId) capturedRecord = record;
          receipts.push(
            ...(record?.operationReceipts?.filter((receipt) => receipt.turnId === parsed.turnId) ??
              []),
          );
        }
      } catch (error) {
        throw error instanceof PresentationPublicationRecoveryError
          ? error
          : new PresentationOperationLookupError(error);
      }
      if (
        receipts.some((receipt) => receipt.turnRequestHash !== parsed.requestHash) ||
        new Set(receipts.map((receipt) => receipt.operationIndex)).size !== receipts.length ||
        new Set(receipts.map((receipt) => receipt.operationCount)).size > 1 ||
        new Set(receipts.map((receipt) => receipt.operationId)).size !== receipts.length
      )
        throw new PresentationOperationConflictError();
      if (
        !receipts.length &&
        capturedRecord &&
        parsed.baseRevision !== undefined &&
        parsed.baseRevision !== capturedRecord.revision
      )
        throw new PresentationOperationExpiredError();
      return structuredClone(
        receipts.sort((left, right) => left.operationIndex! - right.operationIndex!),
      );
    });
  }

  async prepare(input: {
    projectId: string;
    root: string;
    title: string;
    signal: AbortSignal;
    adopt?: { filename: string; sha256: string };
  }): Promise<WorkingPresentationTarget> {
    input.signal.throwIfAborted();
    const root = await realpath(input.root);
    if (!samePath(root, input.root) || (await lstat(input.root)).isSymbolicLink())
      throw new Error('The presentation folder changed. I kept your current deck.');
    const record = await this.load(input.projectId);
    let filename: string;
    let expected: ManagedPresentationFile | undefined;
    if (record) {
      if (!samePath(path.dirname(record.working.path), root))
        throw new Error('This presentation is already bound to a different working folder.');
      filename = path.basename(record.working.path);
      expected = record.working;
    } else if (input.adopt) {
      filename = input.adopt.filename;
      if (filename !== path.basename(filename) || !/^[^/\\:\x00-\x1f]+\.pptx$/i.test(filename))
        throw new Error('Invalid working presentation filename.');
      expected = { path: path.join(root, filename), sha256: input.adopt.sha256 };
    } else {
      const title =
        input.title
          .normalize('NFKD')
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 65) || 'presentation';
      filename = `insight-${title.toLowerCase()}-${input.projectId.slice(0, 8)}.pptx`;
    }
    const file = path.join(root, filename);
    if (expected) await this.readVerified(expected);
    else {
      try {
        await lstat(file);
        throw new Error('The working filename is already in use. I did not overwrite it.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    const directory = this.directory(input.projectId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    input.signal.throwIfAborted();
    return { projectId: input.projectId, file, filename, expected, directory };
  }

  stagePath(target: WorkingPresentationTarget, revision: number) {
    return path.join(target.directory, `revision-${revision}-${randomUUID()}.pptx`);
  }

  async publish(
    target: WorkingPresentationTarget,
    staged: ManagedPresentationFile,
    record: WorkingPresentationCommit,
    signal: AbortSignal,
    beforePublish?: () => void,
  ): Promise<WorkingPresentationRecord> {
    return this.serialized(() => this.publishUnlocked(target, staged, record, signal, beforePublish));
  }

  private async publishUnlocked(
    target: WorkingPresentationTarget,
    staged: ManagedPresentationFile,
    record: WorkingPresentationCommit,
    signal: AbortSignal,
    beforePublish?: () => void,
  ): Promise<WorkingPresentationRecord> {
    signal.throwIfAborted();
    if (
      !samePath(target.directory, this.directory(target.projectId)) ||
      target.filename !== path.basename(target.file)
    )
      throw new Error('Working presentation ownership mismatch.');
    const current = await this.loadUnlocked(target.projectId);
    const { operation: suppliedOperation, ...recordFields } = record;
    const operation = suppliedOperation
      ? operationCommitSchema.parse(suppliedOperation)
      : undefined;
    if (operation) {
      const receipt = this.findOperation(current, operation);
      if (receipt) {
        if (
          receipt.turnId !== operation.turnId ||
          receipt.turnRequestHash !== operation.turnRequestHash ||
          receipt.operationIndex !== operation.operationIndex ||
          receipt.operationCount !== operation.operationCount ||
          JSON.stringify([...receipt.changedSlideIds].sort()) !==
            JSON.stringify([...operation.changedSlideIds].sort()) ||
          JSON.stringify(receipt.changes) !== JSON.stringify(operation.changes)
        )
          throw new PresentationOperationConflictError();
        // Never return normally: a promotion callback must not install an uncommitted candidate.
        throw new PresentationOperationAlreadyCommittedError(receipt);
      }
      if (
        record.revision !== operation.baseRevision + 1 ||
        (!current && !target.expected && operation.baseRevision !== 0)
      )
        throw new PresentationOperationExpiredError();
      if (
        operation.turnId &&
        current?.operationReceipts?.some(
          (receipt) =>
            receipt.turnId === operation.turnId &&
            (receipt.turnRequestHash !== operation.turnRequestHash ||
              receipt.operationCount !== operation.operationCount ||
              receipt.operationIndex! >= operation.operationIndex!),
        )
      )
        throw new PresentationOperationConflictError();
    }
    if (
      current &&
      (!target.expected ||
        !samePath(current.working.path, target.file) ||
        !samePath(current.working.path, target.expected.path) ||
        current.working.sha256 !== target.expected.sha256)
    )
      throw new Error(
        'The presentation advanced after this update was prepared. Review the current presentation and try again.',
      );
    if (
      !samePath(path.dirname(staged.path), target.directory) ||
      samePath(staged.path, target.file)
    )
      throw new Error('A private staged revision is required.');
    signal.throwIfAborted();
    const bytes = await this.readVerified(staged);
    const previous = target.expected ? await this.readVerified(target.expected) : null;
    const committedAt = new Date().toISOString();
    const receipts = [
      ...(current?.operationReceipts ?? []),
      ...(operation
        ? [
            operationReceiptSchema.parse({
              ...operation,
              projectId: target.projectId,
              committedRevision: record.revision,
              outputSha256: staged.sha256,
              committedAt,
            }),
          ]
        : []),
    ].slice(-PRESENTATION_OPERATION_RECEIPT_LIMIT);
    const committed = recordSchema.parse({
      ...recordFields,
      version: 1,
      projectId: target.projectId,
      working: { path: target.file, sha256: staged.sha256 },
      archive: staged,
      committedAt,
      ...(receipts.length ? { operationReceipts: receipts } : {}),
    });
    if (
      committed.session &&
      (committed.session.id !== target.projectId ||
        committed.session.revision !== committed.revision)
    )
      throw new Error('The staged presentation does not match its project revision.');
    if (
      committed.local &&
      (committed.local.projectId !== target.projectId ||
        !samePath(committed.local.outputRoot ?? committed.local.root, path.dirname(target.file)) ||
        committed.local.output?.filename !== target.filename ||
        committed.local.output.sha256 !== staged.sha256)
    )
      throw new Error('The staged presentation does not match its working file.');
    const previousFile = previous
      ? path.join(target.directory, `previous-${target.expected!.sha256}.pptx`)
      : undefined;
    if (previousFile) {
      try {
        await writeFile(previousFile, previous!, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      await this.readVerified({ path: previousFile, sha256: target.expected!.sha256 });
    }
    const temporary = `${target.file}.${randomUUID()}.tmp`;
    const rollback = previous ? `${target.file}.${randomUUID()}.rollback` : undefined;
    const journal = path.join(target.directory, 'pending.json');
    const previousActive = await this.readActive();
    let promoted = false;
    let committedRecord = false;
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      // Allocate rollback bytes before publication, while a full disk is still harmless.
      if (rollback) await writeFile(rollback, previous!, { flag: 'wx', mode: 0o600 });
      await this.atomicJson(journal, {
        previous: target.expected ?? null,
        previousFile,
        ...(rollback ? { rollback: { path: rollback, sha256: target.expected!.sha256 } } : {}),
        previousActive,
        next: committed,
      });
      // Discoverable before publication: recovery ignores a pointer with no committed record.
      await this.atomicJson(this.activeFile(), { projectId: target.projectId });
      signal.throwIfAborted();
      if (target.expected) await this.readVerified(target.expected);
      else {
        try {
          await lstat(target.file);
          throw new Error('The working filename was occupied during export.');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      // After this boundary we complete or roll back even if speech is interrupted.
      signal.throwIfAborted();
      beforePublish?.();
      await rename(temporary, target.file);
      promoted = true;
      await this.atomicJson(path.join(target.directory, 'working.json'), committed);
      committedRecord = true;
      await unlink(journal).catch(() => undefined);
      return committed;
    } catch (error) {
      try {
        if (promoted) {
          // Roll back only our exact newly-published bytes, never subsequent manual edits.
          if (rollback)
            await this.readVerified({ path: rollback, sha256: target.expected!.sha256 });
          await this.readVerified(committed.working);
          if (rollback) await rename(rollback, target.file);
          else await unlink(target.file);
        }
        await this.restoreActive(target.projectId, previousActive);
        await unlink(journal).catch(() => undefined);
      } catch (recoveryError) {
        throw new PresentationPublicationRecoveryError(recoveryError);
      }
      throw error;
    } finally {
      await unlink(temporary).catch(() => undefined);
      // Leave prepared rollback bytes/journal if recovery could not finish.
      if (rollback && (committedRecord || !promoted)) await unlink(rollback).catch(() => undefined);
    }
  }
}
