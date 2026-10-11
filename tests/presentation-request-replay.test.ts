import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ComputerController } from '../server/computer/controller';
import { config, type Config } from '../server/config';
import { PresentationWorkingFiles } from '../server/computer/presentation-working-file';
import * as interpretation from '../server/computer/presentation-intent';
import * as planning from '../server/computer/presentation-deck';
import type { OrderedPresentationDeck } from '../shared/presentation-deck';
import type { PresentationTurnIntent } from '../shared/presentation-intent';

const controllers: ComputerController[] = [];
const signal = () => new AbortController().signal;
afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const turn = (values: Partial<PresentationTurnIntent>): PresentationTurnIntent => ({
  kind: 'request',
  domain: 'presentation',
  startsNewTask: false,
  awaitingContinuation: false,
  fields: { open: false },
  operations: [],
  ...values,
});
const createIntent = () =>
  turn({
    startsNewTask: true,
    fields: { topic: 'Community campaign', totalSlides: 3, open: false },
    operations: [{ type: 'create' }],
  });
const editIntent = () =>
  turn({
    operations: [
      {
        type: 'revise_slide',
        target: 2,
        instruction: 'Explain the audience research more clearly.',
      },
    ],
  });

async function controller(cfg: Config) {
  const value = new ComputerController(cfg);
  controllers.push(value);
  await value.init();
  vi.spyOn(value as any, 'launchOffice').mockResolvedValue(undefined);
  vi.spyOn(value as any, 'refreshPresentationFile').mockImplementation(
    async (_input: unknown, promote: any) => {
      await promote();
      return {
        promoted: true,
        opened: false,
        wasOpen: false,
        closed: 0,
        retainedModified: 0,
        warnings: [],
      };
    },
  );
  return value;
}

async function fixture() {
  const localDir = await mkdtemp(path.join(tmpdir(), 'insight-replay-'));
  const cfg: Config = {
    ...config(),
    localDir,
    owner: 'request-replay-test',
    host: '127.0.0.1',
    hfToken: 'test-no-network',
    cloudUrl: '',
    neonUrl: '',
    dbToken: '',
  };
  const initial: OrderedPresentationDeck = {
    schemaVersion: 2,
    title: 'Community campaign',
    theme: 'blue',
    textScale: 1,
    allowImageReuse: false,
    slides: [
      {
        id: 'cover',
        type: 'cover',
        title: 'Community campaign',
        subtitle: 'A proposed accessible campaign for the local community',
      },
      {
        id: 'audience',
        type: 'text',
        title: 'Audience research',
        points: [
          'Ask local community members about their priorities.',
          'Review the findings before drafting the campaign.',
        ],
      },
      {
        id: 'review',
        type: 'text',
        title: 'Review the campaign',
        points: [
          'Check each proposed claim against the campaign brief.',
          'Ask community members for feedback before publishing.',
        ],
      },
    ],
  };
  const intents = new Map<string, PresentationTurnIntent>();
  const interpret = vi
    .spyOn(interpretation, 'interpretPresentationTurn')
    .mockImplementation(async (request) => {
      const intent = intents.get(request);
      if (!intent) throw new Error(`Missing synthetic interpretation: ${request}`);
      return structuredClone(intent);
    });
  const plan = vi.spyOn(planning, 'planOrderedDeck').mockResolvedValue(initial);
  let edits = 0;
  const revise = vi.spyOn(planning, 'reviseOrderedSlide').mockImplementation(async (deck, id) => ({
    ...structuredClone(deck),
    slides: deck.slides.map((slide) =>
      slide.id === id && slide.type === 'text'
        ? {
            ...slide,
            points: [
              `Ask community members to explain which campaign topics matter most in discussion round ${++edits}.`,
              'Record their comments before revising the proposed message.',
            ],
          }
        : structuredClone(slide),
    ),
  }));
  const write = vi.spyOn(planning, 'writeOrderedDeck');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('Replay tests must not access providers or Neon');
    }),
  );
  const current = await controller(cfg);
  const request = async (
    text: string,
    intent: PresentationTurnIntent,
    identity: { turnId: string; baseRevision?: number; projectId?: string },
    target = current,
  ) => {
    intents.set(text, intent);
    return target.request(text, signal(), identity);
  };
  const create = async () => {
    const identity = { turnId: randomUUID(), baseRevision: 0 };
    await request('Create a community campaign presentation.', createIntent(), identity);
    return identity;
  };
  const capture = async (target = current) => {
    const id = target.presentationSelectionIdentity()!.projectId;
    const working = new PresentationWorkingFiles(cfg),
      record = (await working.load(id))!;
    return {
      project: structuredClone(target.snapshot().presentation!.project),
      record,
      bytes: await readFile(record.working.path),
      files: await readdir(working.directory(id)),
      inference: interpret.mock.calls.length,
      plans: plan.mock.calls.length,
      revisions: revise.mock.calls.length,
      exports: write.mock.calls.length,
    };
  };
  return {
    cfg,
    current,
    intents,
    request,
    create,
    capture,
    interpret,
    plan,
    revise,
    write,
    initial,
  };
}

describe('presentation request replay across the real file publication pipeline', () => {
  it('does not infer, export, add undo history or repeat desktop actions for create/edit/undo retries before and after restart', async () => {
    const qa = await fixture();
    const createIdentity = await qa.create();
    const created = await qa.capture();
    expect(created.record.operationReceipts).toHaveLength(1);
    expect(created.record.session!.history).toHaveLength(0);
    const repeatCreate = await qa.current.request(
      'Create a community campaign presentation.',
      signal(),
      createIdentity,
    );
    expect(repeatCreate.desktopIntent).toBeUndefined();
    expect(await qa.capture()).toEqual(created);

    let restarted = await controller(qa.cfg);
    await restarted.request('Create a community campaign presentation.', signal(), createIdentity);
    expect(await qa.capture(restarted)).toEqual(created);
    const editIdentity = { turnId: randomUUID(), baseRevision: 1 };
    await qa.request('Improve the audience explanation.', editIntent(), editIdentity, restarted);
    const edited = await qa.capture(restarted);
    expect(edited.record.revision).toBe(2);
    expect(edited.record.session!.history).toHaveLength(1);
    expect(edited.record.operationReceipts?.at(-1)?.changedSlideIds).toEqual(['audience']);
    await restarted.request('Improve the audience explanation.', signal(), editIdentity);
    expect(await qa.capture(restarted)).toEqual(edited);
    await restarted.close();
    restarted = await controller(qa.cfg);
    await restarted.request('Improve the audience explanation.', signal(), editIdentity);
    expect(await qa.capture(restarted)).toEqual(edited);

    const undoIdentity = { turnId: randomUUID(), baseRevision: 2 };
    await qa.request(
      'Undo the last change.',
      turn({ operations: [{ type: 'undo' }] }),
      undoIdentity,
      restarted,
    );
    const undone = await qa.capture(restarted);
    expect(undone.record.revision).toBe(3);
    expect(undone.record.session!.history).toHaveLength(0);
    expect(undone.project!.orderedDeck).toEqual(created.project!.orderedDeck);
    await restarted.request('Undo the last change.', signal(), undoIdentity);
    expect(await qa.capture(restarted)).toEqual(undone);
    await restarted.close();
    restarted = await controller(qa.cfg);
    await restarted.request('Undo the last change.', signal(), undoIdentity);
    expect(await qa.capture(restarted)).toEqual(undone);
  });

  it('shares an in-flight duplicate while allowing the same words as a later intentional request', async () => {
    const qa = await fixture();
    await qa.create();
    const original = qa.revise.getMockImplementation()!;
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    qa.revise.mockImplementationOnce(async (...args) => {
      entered();
      await wait;
      return original(...args);
    });
    const identity = { turnId: randomUUID(), baseRevision: 1 };
    qa.intents.set('Improve the audience explanation.', editIntent());
    const first = qa.current.request('Improve the audience explanation.', signal(), identity);
    await started;
    const second = qa.current.request('Improve the audience explanation.', signal(), identity);
    release();
    const results = await Promise.all([first, second]);
    expect(results[1].desktopIntent).toBeUndefined();
    expect(qa.revise).toHaveBeenCalledTimes(1);
    expect(qa.interpret).toHaveBeenCalledTimes(2);
    expect(qa.write).toHaveBeenCalledTimes(2);
    const once = await qa.capture();
    expect(once.record.revision).toBe(2);
    expect(once.record.session!.history).toHaveLength(1);
    await qa.current.request('Improve the audience explanation.', signal(), {
      turnId: randomUUID(),
      baseRevision: 2,
    });
    const intentional = await qa.capture();
    expect(intentional.record.revision).toBe(3);
    expect(intentional.record.session!.history).toHaveLength(2);
    expect(qa.revise).toHaveBeenCalledTimes(2);
    expect(intentional.project!.orderedDeck).not.toEqual(once.project!.orderedDeck);
  });

  it('refuses changed instructions under a reused ID and unknown stale requests before any model or file work', async () => {
    const qa = await fixture(),
      identity = await qa.create();
    const before = await qa.capture();
    await expect(
      qa.current.request('Replace this with a different presentation.', signal(), identity),
    ).rejects.toThrow(/identifier|instructions/i);
    expect(await qa.capture()).toEqual(before);
    const restarted = await controller(qa.cfg);
    await expect(
      restarted.request('Replace this with a different presentation.', signal(), identity),
    ).rejects.toMatchObject({ code: 'OPERATION_ID_CONFLICT' });
    await expect(
      restarted.request('An unknown old request.', signal(), {
        turnId: randomUUID(),
        baseRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_RECEIPT_EXPIRED' });
    expect(await qa.capture(restarted)).toEqual(before);
  });

  it('replays only committed results after a later operation in a compound request fails', async () => {
    const qa = await fixture();
    await qa.create();
    const identity = { turnId: randomUUID(), baseRevision: 1 };
    const text = 'Improve the audience and then the review explanation.';
    const original = qa.revise.getMockImplementation()!;
    qa.revise
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error('The second edit could not finish'));
    qa.intents.set(
      text,
      turn({
        operations: [
          { type: 'revise_slide', target: 2, instruction: 'Explain the audience more clearly.' },
          { type: 'revise_slide', target: 3, instruction: 'Explain the review more clearly.' },
        ],
      }),
    );
    const failed = await qa.current.request(text, signal(), identity);
    expect(failed.taskStatus).toBe('failed');
    expect(failed.summary).toMatch(/second edit.*completed changes remain saved/i);
    expect(failed.changes).toHaveLength(1);
    expect(failed.changes![0]).toMatchObject({ committedRevision: 2, local: 'saved' });
    expect(failed.changes![0].changes.map((change) => change.slideId)).toEqual(['audience']);
    const partial = await qa.capture();
    const receipt = partial.record.operationReceipts!.at(-1)!;
    expect(receipt).toMatchObject({
      turnId: identity.turnId,
      operationIndex: 0,
      operationCount: 2,
      committedRevision: 2,
      changedSlideIds: ['audience'],
    });
    expect(partial.record.session!.history).toHaveLength(1);
    const restarted = await controller(qa.cfg);
    const result = await restarted.request(text, signal(), identity);
    expect(result.summary).toMatch(/already saved/);
    expect(result.desktopIntent).toBeUndefined();
    expect(await qa.capture(restarted)).toEqual(partial);
    expect(partial.project!.orderedDeck!.slides[2]).toEqual(qa.initial.slides[2]);
  });

  it('returns the original project receipt after a switch and restart without reinterpreting or changing the new project', async () => {
    const qa = await fixture();
    await qa.create();
    const projectA = qa.current.presentationSelectionIdentity()!.projectId;
    const editIdentity = { turnId: randomUUID(), baseRevision: 1, projectId: projectA };
    await qa.request('Improve the audience explanation.', editIntent(), editIdentity);
    const savedA = await qa.capture();
    const oldReceipt = savedA.record.operationReceipts!.at(-1)!;
    const creationIdentity = { turnId: randomUUID(), baseRevision: 2, projectId: projectA };
    await qa.request('Create another community presentation.', createIntent(), creationIdentity);
    const projectB = qa.current.presentationSelectionIdentity()!.projectId;
    expect(projectB).not.toBe(projectA);
    const beforeB = await qa.capture();
    expect(beforeB.record.revision).toBe(1);
    await qa.current.close();
    const restarted = await controller(qa.cfg);
    const result = await restarted.request(
      'Improve the audience explanation.',
      signal(),
      editIdentity,
    );
    expect(result.summary).toMatch(/original presentation/);
    expect(result.changes?.[0]).toMatchObject({
      projectId: projectA,
      operationId: oldReceipt.operationId,
      baseRevision: 1,
      committedRevision: 2,
      outputSha256: oldReceipt.outputSha256,
      changes: oldReceipt.changes,
      local: 'saved',
      native: { status: 'not_verified' },
      cloud: { status: 'not_verified' },
    });
    expect(result.desktopIntent).toBeUndefined();
    expect(result.state.presentation?.projectId).toBe(projectB);
    expect(await qa.capture(restarted)).toEqual(beforeB);
    // The creation turn captured A but saved B; replay must still find the newly created B.
    const repeatedCreation = await restarted.request(
      'Create another community presentation.',
      signal(),
      creationIdentity,
    );
    expect(repeatedCreation.changes?.[0]?.projectId).toBe(projectB);
    expect(await qa.capture(restarted)).toEqual(beforeB);
  });
});
