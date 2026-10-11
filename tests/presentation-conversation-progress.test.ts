import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { config } from '../server/config';
import { PresentationConversation, PresentationQuestion } from '../server/computer/presentation-conversation';
import { PresentationFailureError } from '../shared/presentation-failure';
import * as interpreter from '../server/computer/presentation-intent';
import type { ComputerResult, ComputerState } from '../shared/computer';
import type { PresentationExecutionOperation, PresentationFields, PresentationIntentContext, PresentationTurnIntent } from '../shared/presentation-intent';

afterEach(() => vi.restoreAllMocks());
const signal = () => new AbortController().signal;
const intent = (operations: PresentationTurnIntent['operations']): PresentationTurnIntent => ({
  kind: 'request', domain: 'presentation', startsNewTask: false, awaitingContinuation: false, fields: { open: false }, operations,
});

function fixture() {
  const projectId = randomUUID();
  const state = { presentation: {
    projectId, filename: 'working.pptx', title: 'Community presentation', sha256: '1'.padStart(64, '0'),
    slideCount: 3, slideTitles: ['Cover', 'Audience', 'Review'], opened: false,
    project: { revision: 1 },
  } } as ComputerState;
  const contexts: PresentationIntentContext[] = [];
  const intents = new Map<string, PresentationTurnIntent>();
  const infer = vi.spyOn(interpreter, 'interpretPresentationTurn').mockImplementation(async (text, context) => {
    contexts.push(structuredClone(context));
    return structuredClone(intents.get(text)!);
  });
  const result = (summary: string): ComputerResult => ({ summary, state: structuredClone(state) });
  const commit = (operation: PresentationExecutionOperation, summary: string): ComputerResult => {
    const baseRevision = state.presentation!.project!.revision;
    state.presentation!.project!.revision++;
    state.presentation!.sha256 = String(baseRevision + 1).padStart(64, '0');
    return { ...result(summary), changes: [{
      projectId, operationId: operation.execution!.operationId, baseRevision, committedRevision: baseRevision + 1,
      outputSha256: state.presentation!.sha256, changes: [{ slideId: 'audience', beforeIndex: 2, afterIndex: 2, title: 'Audience', changes: ['content'] }],
      summary, local: 'saved', native: { status: 'not_requested' }, cloud: { status: 'not_saved' },
    }] };
  };
  const execute = vi.fn(async (operation: PresentationExecutionOperation, _fields: PresentationFields, _signal: AbortSignal): Promise<ComputerResult> => {
    if (operation.type === 'set_theme') return commit(operation, 'Saved the dark theme.');
    if (operation.type === 'resize_text') return commit(operation, 'Saved larger text on slide two.');
    if (operation.type === 'navigate_slide') return { ...result('Select slide two in PowerPoint.'), desktopIntent: { kind: 'slide', slide: 2, filename: 'working.pptx' } };
    if (operation.type === 'open_folder') return { ...result('Opened the requested folder.'), desktopIntent: { kind: 'openFolder', name: 'Marketing' } };
    if (operation.type === 'insert_image') return { ...result('Opening the picture folder.'), desktopIntent: { kind: 'openFolder', name: 'Marketing', continueRequest: 'executor-picture' } };
    if (operation.type === 'save') return { ...result('Verified the saved final revision.'), persistence: {
      projectId, revision: state.presentation!.project!.revision, sha256: state.presentation!.sha256, provider: 'local', savedAt: new Date().toISOString(), verified: true,
    } };
    throw new PresentationFailureError('invalid_content', 'The remaining edit could not finish.');
  });
  const continueExecution = vi.fn(async (_token: string, _signal: AbortSignal): Promise<ComputerResult> => { throw new Error('The source picture changed.'); });
  const cancelled = vi.fn();
  const conversation = new PresentationConversation(config(), {
    context: () => ({ conversation: [], activePresentation: {
      projectId, filename: 'working.pptx', title: 'Community presentation', slideCount: 3, revision: state.presentation!.project!.revision,
    } }),
    snapshot: () => structuredClone(state), execute, continueExecution, cancelled,
  });
  const request = (text: string, operations: PresentationTurnIntent['operations'], activeSignal = signal()) => {
    intents.set(text, intent(operations));
    return conversation.request(text, activeSignal);
  };
  const verified = () => {
    state.presentation!.selectedSlide = 2;
    state.presentation!.desktopNavigation = { status: 'verified', slide: 2 };
    conversation.recordNavigationResult();
  };
  return { state, contexts, intents, infer, execute, continueExecution, cancelled, conversation, request, result, commit, verified };
}

function continuation(result: ComputerResult | null) {
  if (!result?.desktopIntent || !('continueRequest' in result.desktopIntent) || !result.desktopIntent.continueRequest)
    throw new Error('Expected an opaque native continuation');
  return result.desktopIntent.continueRequest;
}

describe('presentation progress through native continuations', () => {
  it.each(['navigate_slide', 'open_folder', 'insert_image'] as const)('preserves a committed prefix when %s pauses before a later failure', async (native) => {
    const qa = fixture();
    const first = await qa.request('Theme, desktop step, then edit.', [
      { type: 'set_theme', theme: 'dark' },
      native === 'navigate_slide' ? { type: native, target: 2 } : native === 'insert_image' ? { type: native, target: 2 } : { type: native, folderName: 'Marketing' },
      { type: 'revise_slide', target: 2, instruction: 'Explain more.' },
    ]);
    expect(first?.changes).toHaveLength(1);
    expect(first?.summary).toContain('Saved the dark theme.');
    if (native === 'navigate_slide') qa.verified();
    const final = await qa.conversation.request(continuation(first), signal());
    expect(final).toMatchObject({ taskStatus: 'failed', clarification: true });
    expect(final?.changes).toEqual(first?.changes);
    expect(final?.summary).toContain('Saved the dark theme.');
    expect(final?.summary).toContain('completed changes remain saved');
    if (native !== 'insert_image') expect(final?.failure).toMatchObject({ code: 'invalid_content', disposition: 'terminal', committed: true });
    expect(qa.execute.mock.calls.filter(([operation]) => operation.type === 'set_theme')).toHaveLength(1);
    expect(qa.conversation.draft).toBeNull();
    expect(qa.conversation.lastFailedTask?.operations.some(operation => operation.type === 'set_theme')).toBe(false);
  });

  it('keeps unique receipts through two native boundaries and verifies only the final saved revision', async () => {
    const qa = fixture();
    const first = await qa.request('Theme, folder, resize, navigate, save.', [
      { type: 'set_theme', theme: 'dark' }, { type: 'open_folder', folderName: 'Marketing' },
      { type: 'resize_text', target: 2, direction: 'larger' }, { type: 'navigate_slide', target: 2 }, { type: 'save' },
    ]);
    const second = await qa.conversation.request(continuation(first), signal());
    expect(second?.changes).toHaveLength(2);
    qa.verified();
    const final = await qa.conversation.request(continuation(second), signal());
    expect(final?.changes).toHaveLength(2);
    expect(new Set(final?.changes?.map(change => change.operationId)).size).toBe(2);
    expect(final?.changes?.[0].cloud.status).toBe('not_saved');
    expect(final?.changes?.[1].cloud).toMatchObject({ status: 'verified', provider: 'local' });
    expect(final?.changes?.[1].outputSha256).toBe(final?.persistence?.sha256);
    expect(final?.summary.match(/Saved the dark theme\./g)).toHaveLength(1);
    expect(final?.summary.match(/Saved larger text/g)).toHaveLength(1);
    expect(second?.changes?.[1].cloud.status).toBe('not_saved');
    expect(qa.conversation.draft).toBeNull();
  });

  it('returns the saved prefix when native verification fails before a continuation can run', async () => {
    const qa = fixture();
    const first = await qa.request('Theme then navigate and edit.', [
      { type: 'set_theme', theme: 'dark' }, { type: 'navigate_slide', target: 2 },
      { type: 'revise_slide', target: 'current', instruction: 'Explain more.' },
    ]);
    qa.state.presentation!.desktopNavigation = { status: 'failed', requestedSlide: 2, message: 'PowerPoint did not respond.' };
    qa.conversation.recordNavigationResult();
    const final = await qa.conversation.request(continuation(first), signal());
    expect(final?.taskStatus).toBe('failed');
    expect(final?.changes).toEqual(first?.changes);
    expect(final?.summary).toContain('PowerPoint did not respond');
    expect(final?.summary).toContain('completed changes remain saved');
    expect(qa.execute.mock.calls.map(([operation]) => operation.type)).toEqual(['set_theme', 'navigate_slide']);
  });

  it('retains saved progress and the pending queue for a typed source clarification', async () => {
    const qa = fixture();
    qa.execute.mockImplementationOnce(async operation => qa.commit(operation, 'Saved the dark theme.'));
    qa.execute.mockImplementationOnce(async () => { throw new PresentationQuestion('folderName', 'Which picture folder should I use?'); });
    const result = await qa.request('Change the theme then add a picture.', [
      { type: 'set_theme', theme: 'dark' }, { type: 'insert_image', target: 2 },
    ]);
    expect(result?.failure).toEqual({ code: 'missing_source', disposition: 'clarification', message: 'Which picture folder should I use?', committed: true });
    expect(result?.changes).toHaveLength(1);
    expect(result?.taskStatus).toBeUndefined();
    expect(qa.conversation.draft?.operations.map(operation => operation.type)).toEqual(['insert_image']);
    expect(qa.conversation.lastFailedTask).toBeNull();
  });
});

describe('external abort cancels executable presentation state', () => {
  it.each([true, false])('does not retry an undo committed just before an aborted response (unfinished tail: %s)', async (hasTail) => {
    const qa = fixture(), abort = new AbortController();
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    qa.execute.mockImplementationOnce(async operation => {
      const saved = qa.commit(operation, 'Undo saved before interruption.');
      await wait;
      return saved;
    });
    const running = qa.request('Undo, then finish the remaining work.', [{ type: 'undo' }, ...(hasTail ? [{ type: 'add_summary' } as const] : [])], abort.signal);
    await vi.waitFor(() => expect(qa.execute).toHaveBeenCalledTimes(1));
    const rejection = expect(running).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    release(); await rejection;
    expect(qa.conversation.draft).toBeNull();
    expect(qa.conversation.lastFailedTask?.operations.map(operation => operation.type) ?? []).toEqual(hasTail ? ['add_summary'] : []);
    if (hasTail) expect(qa.conversation.lastFailedTask?.artifact).toMatchObject({ revision: 2, sha256: qa.state.presentation!.sha256 });
    qa.intents.set('Retry the unfinished work.', { ...intent([]), retryFailedTask: true });
    qa.execute.mockImplementationOnce(async operation => qa.commit(operation, 'Summary saved.'));
    await qa.conversation.request('Retry the unfinished work.', signal());
    expect(qa.execute.mock.calls.map(([operation]) => operation.type)).toEqual(hasTail ? ['undo', 'add_summary'] : ['undo']);
    expect(qa.state.presentation!.project!.revision).toBe(hasTail ? 3 : 2);
  });

  it('does not rewrite a new waiting task when an interrupted executor returns a late commit receipt', async () => {
    const qa = fixture(), abort = new AbortController();
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    qa.execute.mockImplementationOnce(async operation => {
      const saved = qa.commit(operation, 'Undo saved.');
      await wait;
      return saved;
    });
    const running = qa.request('Undo and add a summary.', [{ type: 'undo' }, { type: 'add_summary' }], abort.signal);
    await vi.waitFor(() => expect(qa.execute).toHaveBeenCalledTimes(1));
    const rejection = expect(running).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    qa.intents.set('Start a different presentation.', { ...intent([{ type: 'create' }]), startsNewTask: true, awaitingContinuation: true });
    await qa.conversation.request('Start a different presentation.', signal());
    const newDraft = structuredClone(qa.conversation.draft);
    const failureBefore = structuredClone(qa.conversation.lastFailedTask);
    release(); await rejection;
    expect(qa.conversation.draft).toEqual(newDraft);
    expect(qa.conversation.lastFailedTask).toEqual(failureBefore);
    expect(qa.execute).toHaveBeenCalledTimes(1);
  });

  it.each(['execute', 'continue'] as const)('discards the unfinished queue when the request signal aborts during %s without controller.interrupt', async (phase) => {
    const qa = fixture(), abort = new AbortController();
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    let running: Promise<ComputerResult | null>;
    if (phase === 'execute') {
      qa.execute.mockImplementationOnce(async () => { await wait; return qa.result('Obsolete result'); });
      running = qa.request('Edit and add summary.', [{ type: 'revise_slide', target: 2, instruction: 'Explain more.' }, { type: 'add_summary' }], abort.signal);
      await vi.waitFor(() => expect(qa.execute).toHaveBeenCalledTimes(1));
    } else {
      const prepared = await qa.request('Use the picture and add summary.', [{ type: 'insert_image', target: 2 }, { type: 'add_summary' }]);
      qa.continueExecution.mockImplementationOnce(async () => { await wait; return qa.result('Obsolete picture result'); });
      running = qa.conversation.request(continuation(prepared), abort.signal);
      await vi.waitFor(() => expect(qa.continueExecution).toHaveBeenCalledTimes(1));
    }
    const rejection = expect(running).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    expect(qa.conversation.draft).toBeNull();
    release(); await rejection;
    qa.execute.mockResolvedValueOnce(qa.result('Read slide three.'));
    await qa.request('Read the last slide.', [{ type: 'read_slide', target: 'last' }]);
    expect(qa.contexts.at(-1)?.draft).toBeNull();
    expect(qa.execute.mock.calls.filter(([operation]) => operation.type === 'add_summary')).toHaveLength(0);
    expect(qa.cancelled).toHaveBeenCalledWith('failed');
  });

  it('invalidates a still-running interpreter on external abort before it creates a draft', async () => {
    const qa = fixture(), abort = new AbortController();
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    qa.infer.mockImplementationOnce(async () => { await wait; return intent([{ type: 'add_summary' }]); });
    const running = qa.request('Create a summary.', [{ type: 'add_summary' }], abort.signal);
    const rejection = expect(running).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort(); release(); await rejection;
    expect(qa.conversation.draft).toBeNull();
    expect(qa.execute).not.toHaveBeenCalled();
    qa.execute.mockResolvedValueOnce(qa.result('Read slide two.'));
    await qa.request('Read slide two.', [{ type: 'read_slide', target: 2 }]);
    expect(qa.execute.mock.calls.map(([operation]) => operation.type)).toEqual(['read_slide']);
  });
});
