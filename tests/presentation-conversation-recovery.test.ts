import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../server/config';
import { PresentationConversation, PresentationQuestion } from '../server/computer/presentation-conversation';
import * as interpreter from '../server/computer/presentation-intent';
import type { ComputerResult, ComputerState } from '../shared/computer';
import type { PresentationFields, PresentationIntentContext, PresentationExecutionOperation, PresentationOperation, PresentationTurnIntent } from '../shared/presentation-intent';

afterEach(() => vi.restoreAllMocks());
const signal = () => new AbortController().signal;
function semanticOperation(operation: PresentationExecutionOperation): PresentationOperation {
  const { execution, binding, ...semantic } = operation;
  if (execution) {
    expect(execution.operationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(execution.turnId).toMatch(/^[a-f0-9-]{36}$/);
    expect(execution.turnRequestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(execution.operationIndex).toBeGreaterThanOrEqual(0);
    expect(execution.operationIndex).toBeLessThan(execution.operationCount);
  }
  expect(binding).toBeUndefined(); // This host deliberately supplies no structured binding adapter.
  return semantic;
}
const intent = (value: Partial<PresentationTurnIntent>): PresentationTurnIntent => ({
  kind: 'request', domain: 'presentation', startsNewTask: false,
  awaitingContinuation: false, fields: {}, operations: [], ...value,
});

function fixture() {
  const state = {
    presentation: {
      filename: 'pet-behavior-r1.pptx', title: 'Understanding Pet Behavior',
      sha256: 'a'.repeat(64), opened: true, slideCount: 6,
      slideTitles: ['Pet behavior', 'Body language', 'Habits', 'Play', 'Communication', 'Care'],
    },
  } as ComputerState;
  const replies = new Map<string, PresentationTurnIntent>();
  const contexts: PresentationIntentContext[] = [];
  vi.spyOn(interpreter, 'interpretPresentationTurn').mockImplementation(async (request, context) => {
    contexts.push(structuredClone(context));
    if (!replies.has(request)) throw new Error(`Unexpected test request: ${request}`);
    return structuredClone(replies.get(request)!);
  });
  const execute = vi.fn(async (operation: PresentationExecutionOperation, _fields: PresentationFields, _signal: AbortSignal): Promise<ComputerResult> => ({
    state: structuredClone(state), summary: `Completed ${operation.type}.`,
  }));
  const cancelled = vi.fn();
  const continueExecution = vi.fn(async (_token: string, _signal: AbortSignal): Promise<ComputerResult> => ({ state: structuredClone(state), summary: 'Continued the saved task.' }));
  const conversation = new PresentationConversation(config(), {
    snapshot: () => structuredClone(state),
    context: () => ({ conversation: [], activePresentation: state.presentation }),
    execute, continueExecution, cancelled,
  });
  const request = async (text: string, value: Partial<PresentationTurnIntent>) => {
    replies.set(text, intent(value));
    return conversation.request(text, signal());
  };
  return { state, execute, continueExecution, cancelled, conversation, contexts, request };
}

describe('terminal presentation failure recovery', () => {
  it('ends a terminal executor-continuation failure before a fresh operation', async () => {
    const qa = fixture();
    qa.execute.mockResolvedValueOnce({ state: structuredClone(qa.state), summary: 'Opening the source folder.', desktopIntent: { kind: 'openFolder', name: 'Pictures', path: 'C:\\Pictures', continueRequest: 'executor-token' } });
    const prepared = await qa.request('Use the folder picture.', { operations: [{ type: 'insert_image', target: 2 }] });
    const token = prepared?.desktopIntent?.kind === 'openFolder' ? prepared.desktopIntent.continueRequest : undefined;
    qa.continueExecution.mockRejectedValueOnce(new Error('The source changed.'));
    await expect(qa.conversation.request(token!, signal())).rejects.toThrow('source changed');
    expect(qa.conversation.draft).toBeNull();
    await qa.request('Read slide two.', { operations: [{ type: 'read_slide', target: 2 }] });
    expect(qa.execute.mock.calls.map(([operation]) => operation.type)).toEqual(['insert_image', 'read_slide']);
    expect(qa.continueExecution).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['execute', 'resolve'], ['execute', 'reject'], ['continue', 'resolve'], ['continue', 'reject'],
  ])('does not resurrect cancelled state when pending %s later %s', async (mode, outcome) => {
    const qa = fixture();
    let resolve!: (value: ComputerResult) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<ComputerResult>((yes, no) => { resolve = yes; reject = no; });
    let running: Promise<ComputerResult | null>;
    if (mode === 'execute') {
      qa.execute.mockReturnValueOnce(pending);
      running = qa.request('Expand slide two.', { operations: [{ type: 'revise_slide', target: 2, instruction: 'Explain it.', detailChange: 'expand' }] });
      await vi.waitFor(() => expect(qa.execute).toHaveBeenCalledTimes(1));
    } else {
      qa.execute.mockResolvedValueOnce({ state: structuredClone(qa.state), summary: 'Opening source.', desktopIntent: { kind: 'openFolder', name: 'Pictures', path: 'C:\\Pictures', continueRequest: 'executor-token' } });
      const prepared = await qa.request('Add the picture.', { operations: [{ type: 'insert_image', target: 2 }] });
      const token = prepared?.desktopIntent?.kind === 'openFolder' ? prepared.desktopIntent.continueRequest : undefined;
      qa.continueExecution.mockReturnValueOnce(pending);
      running = qa.conversation.request(token!, signal());
      await vi.waitFor(() => expect(qa.continueExecution).toHaveBeenCalledTimes(1));
    }
    const rejected = expect(running).rejects.toThrow(outcome === 'reject' ? 'Late provider failure' : 'cancelled');
    qa.conversation.cancel();
    await qa.request('Read the last slide.', { operations: [{ type: 'read_slide', target: 'last' }] });
    if (outcome === 'reject') reject(new Error('Late provider failure'));
    else resolve({ state: structuredClone(qa.state), summary: 'Obsolete result.' });
    await rejected;
    expect(qa.conversation.draft).toBeNull();
    expect(qa.conversation.lastFailedTask).toBeNull();
    expect(qa.conversation.lastVerifiedResult?.summary).toBe('Completed read_slide.');
  });

  it('ends a failed edit queue so a fresh summary request executes without retrying the edit', async () => {
    const qa = fixture();
    qa.execute.mockRejectedValueOnce(new Error('The text could not fit while preserving facts.'));
    const edit = { type: 'revise_slide', target: 2, instruction: 'Explain this in more detail.', detailChange: 'expand' } as const;
    await expect(qa.request('Explain slide two in more detail.', { operations: [edit] })).rejects.toThrow('could not fit');
    expect(qa.conversation.draft).toBeNull();
    expect(qa.conversation.lastFailedTask?.operations.map(semanticOperation)).toEqual([edit]);
    const answer = await qa.request('Create a summary slide.', { operations: [{ type: 'add_summary' }] });
    expect(qa.execute.mock.calls.map(([operation]) => operation.type)).toEqual(['revise_slide', 'add_summary']);
    expect(answer?.summary).toBe('Completed add_summary.');
    expect(qa.contexts.at(-1)?.draft).toBeNull();
    expect(qa.contexts.at(-1)?.lastFailedTask?.error).toContain('could not fit');
    expect(qa.conversation.lastFailedTask).toBeNull();
  });

  it('keeps failure context through questions and retries only unfinished steps when explicitly requested', async () => {
    const qa = fixture();
    const edit = { type: 'revise_slide', target: 2, instruction: 'Expand the explanation.', detailChange: 'expand' } as const;
    qa.execute.mockImplementationOnce(async () => ({ state: structuredClone(qa.state), summary: 'Slide two read.' }));
    qa.execute.mockRejectedValueOnce(new Error('Provider temporarily unavailable.'));
    await expect(qa.request('Read slide two, expand it, then add a summary.', {
      operations: [{ type: 'read_slide', target: 2 }, edit, { type: 'add_summary' }],
    })).rejects.toThrow('temporarily unavailable');
    expect(qa.conversation.lastFailedTask?.operations.map(semanticOperation)).toEqual([edit, { type: 'add_summary' }]);
    const failedIdentities = qa.conversation.lastFailedTask!.operations.map(operation => operation.execution!);
    expect(failedIdentities.map(value => [value.operationIndex, value.operationCount])).toEqual([[1, 3], [2, 3]]);
    await qa.request('What failed?', { kind: 'question', reply: 'The expansion did not finish.' });
    expect(qa.execute).toHaveBeenCalledTimes(2);
    expect(qa.conversation.lastFailedTask).not.toBeNull();
    const retried = await qa.request('Try that again.', { retryFailedTask: true });
    expect(qa.execute.mock.calls.map(([operation]) => operation.type)).toEqual(['read_slide', 'revise_slide', 'revise_slide', 'add_summary']);
    const retriedIdentities = qa.execute.mock.calls.slice(2).map(([operation]) => operation.execution!);
    expect(retriedIdentities.map(value => [value.operationIndex, value.operationCount])).toEqual([[0, 2], [1, 2]]);
    expect(retriedIdentities[0].turnId).not.toBe(failedIdentities[0].turnId);
    expect(retriedIdentities[0].operationId).not.toBe(failedIdentities[0].operationId);
    expect(retried?.summary).toContain('Completed add_summary.');
    expect(qa.conversation.draft).toBeNull();
  });

  it.each([
    { type: 'add_summary' } as const,
    { type: 'revise_slide', target: 3, instruction: 'Make this clearer.', detailChange: 'preserve' } as const,
  ])('does not prepend failed operations to an explicit new $type plan carrying erroneous retry metadata', async (next) => {
    const qa = fixture();
    const failed = { type: 'revise_slide', target: 2, instruction: 'Expand it.', detailChange: 'expand' } as const;
    qa.execute.mockRejectedValueOnce(new Error('The expansion did not fit.'));
    await expect(qa.request('Expand slide two, then add a summary.', {
      operations: [failed, { type: 'add_summary' }],
    })).rejects.toThrow('did not fit');
    await qa.request('Perform this new plan.', { retryFailedTask: true, operations: [next] });
    expect(qa.execute.mock.calls.map(([operation]) => semanticOperation(operation))).toEqual([failed, next]);
    expect(qa.conversation.draft).toBeNull();
    expect(qa.conversation.lastFailedTask).toBeNull();
  });

  it('replaces the matching failed operation for a correction without restoring completed steps', async () => {
    const qa = fixture();
    const failed = { type: 'revise_slide', target: 2, instruction: 'Expand it.', detailChange: 'expand' } as const;
    qa.execute.mockResolvedValueOnce({ state: structuredClone(qa.state), summary: 'Read slide two.' });
    qa.execute.mockRejectedValueOnce(new Error('The expansion did not fit.'));
    await expect(qa.request('Read slide two, expand it, then add a summary.', {
      operations: [{ type: 'read_slide', target: 2 }, failed, { type: 'add_summary' }],
    })).rejects.toThrow('did not fit');
    const correction = { ...failed, instruction: 'Add only one short explanation.' };
    await qa.request('Try a shorter addition instead.', {
      kind: 'correction', retryFailedTask: true, operations: [correction],
    });
    expect(qa.execute.mock.calls.map(([operation]) => semanticOperation(operation))).toEqual([
      { type: 'read_slide', target: 2 }, failed, correction, { type: 'add_summary' },
    ]);
    expect(qa.conversation.draft).toBeNull();
  });

  it('retains a true clarification and its folder fields until the answer arrives', async () => {
    const qa = fixture();
    qa.execute.mockRejectedValueOnce(new PresentationQuestion('folderLocation', 'Is Marketing on Desktop or in Downloads?'));
    const asked = await qa.request('Use Marketing on slide two.', {
      fields: { folderName: 'Marketing' }, operations: [{ type: 'insert_image', target: 2 }],
    });
    expect(asked?.clarification).toBe(true);
    expect(qa.conversation.draft?.pendingQuestion?.field).toBe('folderLocation');
    expect(qa.conversation.lastFailedTask).toBeNull();
    await qa.request('It is on my Desktop.', { kind: 'continuation', fields: { folderLocation: 'desktop' } });
    expect(qa.execute.mock.calls[1][0]).toMatchObject({ type: 'insert_image', target: 2, folderName: 'Marketing', folderLocation: 'desktop' });
    expect(qa.execute.mock.calls[1][1]).toMatchObject({ folderName: 'Marketing', folderLocation: 'desktop' });
  });

  it('invalidates a failed native continuation and retries its navigation prerequisite before dependent edits', async () => {
    const qa = fixture();
    qa.execute.mockImplementationOnce(async () => ({
      state: structuredClone(qa.state), summary: 'Selecting slide two.',
      desktopIntent: { kind: 'slide', slide: 2, filename: qa.state.presentation!.filename },
    }));
    const edit = { type: 'revise_slide', target: 'current', instruction: 'Shorten the wording.', detailChange: 'shorten' } as const;
    const selected = await qa.request('Go to slide two, then shorten it.', { operations: [{ type: 'navigate_slide', target: 2 }, edit] });
    const token = selected?.desktopIntent?.kind === 'slide' ? selected.desktopIntent.continueRequest : undefined;
    expect(token).toBeTruthy();
    qa.state.presentation!.desktopNavigation = { status: 'failed', requestedSlide: 2, message: 'Office did not verify the slide.' };
    qa.conversation.recordNavigationResult();
    expect(qa.conversation.draft).toBeNull();
    expect(qa.conversation.lastFailedTask?.operations.map(semanticOperation)).toEqual([{ type: 'navigate_slide', target: 2 }, edit]);
    const stale = await qa.conversation.request(token!, signal());
    expect(stale?.summary).toContain('replaced');
    expect(qa.execute).toHaveBeenCalledTimes(1);
    qa.execute.mockImplementationOnce(async () => ({
      state: structuredClone(qa.state), summary: 'Selecting slide two again.',
      desktopIntent: { kind: 'slide', slide: 2, filename: qa.state.presentation!.filename },
    }));
    const retry = await qa.request('Try again.', { retryFailedTask: true });
    expect(semanticOperation(qa.execute.mock.calls[1][0])).toEqual({ type: 'navigate_slide', target: 2 });
    expect(qa.execute).toHaveBeenCalledTimes(2);
    qa.state.presentation!.selectedSlide = 2;
    qa.state.presentation!.desktopNavigation = { status: 'verified', slide: 2 };
    qa.conversation.recordNavigationResult();
    const newToken = retry?.desktopIntent?.kind === 'slide' ? retry.desktopIntent.continueRequest : undefined;
    await qa.conversation.request(newToken!, signal());
    expect(semanticOperation(qa.execute.mock.calls[2][0])).toEqual(edit);
  });

  it('does not restore failed work after cancellation or against a different artifact', async () => {
    const qa = fixture();
    qa.execute.mockRejectedValueOnce(new Error('Edit failed.'));
    await expect(qa.request('Expand slide two.', {
      operations: [{ type: 'revise_slide', target: 2, instruction: 'Expand it.', detailChange: 'expand' }],
    })).rejects.toThrow('Edit failed');
    qa.state.presentation!.filename = 'different-project.pptx';
    const changed = await qa.request('Retry.', { retryFailedTask: true });
    expect(changed?.summary).toContain('presentation has changed');
    expect(qa.execute).toHaveBeenCalledTimes(1);
    await qa.request('Cancel.', { kind: 'cancellation' });
    expect(qa.conversation.lastFailedTask).toBeNull();
    expect(qa.conversation.draft).toBeNull();
  });
});
