import type { Config } from '../config.js';
import type { ComputerResult } from '../../shared/computer.js';
import { mergePresentationDraft, type PresentationTaskDraft, type PresentationIntentContext, type PresentationFields, type PresentationExecutionOperation, type PresentationTargetBinding, type PresentationRequestedTarget, type PresentationArtifactEvidence, type PresentationFailedTask } from '../../shared/presentation-intent.js';
import { constrainFailedTaskRetry, interpretPresentationTurn } from './presentation-intent.js';
import { groundedPresentationReply } from '../../shared/presentation-feedback.js';
import { classifyPresentationFailure } from '../../shared/presentation-failure.js';
import { createHash } from 'node:crypto';

/** Stable across a transport retry, distinct for every newly spoken turn. */
function operationIdentity(turnId: string, index: number): string {
  const hex = createHash('sha256').update(`${turnId}:${index}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export class PresentationQuestion extends Error {
  constructor(public field: keyof PresentationFields | 'clarification', message: string) { super(message); }
}

/** A turn changes semantic slots; only validated executor results advance the queue. */
export class PresentationConversation {
  draft: PresentationTaskDraft | null = null;
  lastVerifiedResult: PresentationArtifactEvidence | null = null;
  lastFailedTask: PresentationFailedTask | null = null;
  private reviewedIndex?: number;
  reviewedTarget?: { projectId: string; slideId: string };
  lastRequestedTarget?: PresentationRequestedTarget;
  get reviewedSlide() { return this.reviewedIndex; }
  set reviewedSlide(index: number | undefined) {
    this.reviewedIndex = index;
    if (index === undefined) this.reviewedTarget = undefined;
  }
  private generation = 0;
  private continuation: string | null = null;
  private executorContinuation: string | null = null;
  private awaitingNavigation: PresentationExecutionOperation | null = null;
  private activeRequest: symbol | null = null;
  private failedDraftId: string | null = null;
  private progress: { draftId: string; summaries: string[]; changes: NonNullable<ComputerResult['changes']>; continuation?: string } | null = null;
  private failedProgress: { token: string; summary: string; changes: NonNullable<ComputerResult['changes']> } | null = null;
  constructor(private cfg: Config, private host: {
    context(): Omit<PresentationIntentContext, 'draft' | 'lastVerifiedResult'>;
    snapshot(): ComputerResult['state'];
    bind?(operation: PresentationExecutionOperation, fields: PresentationFields, anchor?: PresentationTargetBinding): PresentationExecutionOperation;
    execute(operation: PresentationExecutionOperation, fields: PresentationFields, signal: AbortSignal): Promise<ComputerResult>;
    executeBatch?(operations: PresentationExecutionOperation[], fields: PresentationFields, signal: AbortSignal): Promise<ComputerResult>;
    continueExecution(token: string, signal: AbortSignal): Promise<ComputerResult>;
    cancelled(reason?: 'failed'): void;
  }) {}
  cancel() {
    this.activeRequest = null;
    this.progress = null;
    this.failedProgress = null;
    this.failedDraftId = null;
    this.generation++;
    this.draft = null;
    this.continuation = null;
    this.executorContinuation = null;
    this.awaitingNavigation = null;
    this.lastFailedTask = null;
    this.lastRequestedTarget = undefined;
    this.host.cancelled();
  }
  /** Barge-in preserves diagnostic context, never an executable abandoned queue. */
  interrupt() {
    this.activeRequest = null;
    if (this.draft) {
      this.failTask(this.draft, 'The remaining presentation work was interrupted. Completed changes remain saved.', this.awaitingNavigation ?? undefined);
      return;
    }
    // Invalidate a still-running interpreter even before it has produced a draft.
    this.generation++;
    this.continuation = null;
    this.executorContinuation = null;
    this.awaitingNavigation = null;
    this.host.cancelled('failed');
  }
  private assertCurrentBinding(binding: PresentationTargetBinding | undefined) {
    if (!binding) return;
    const current = this.host.context().activePresentation;
    if (current?.projectId !== binding.projectId || current.revision !== binding.boundRevision)
      throw Object.assign(new Error('The presentation changed while that task was waiting. Tell me which change you want on the current revision. No waiting edit was applied.'), { code: 'stale_revision' });
  }
  /** Only this execution's durable receipts can advance its already-bound references. */
  private advanceBindings(
    draft: PresentationTaskDraft,
    batch: PresentationExecutionOperation[],
    before: PresentationIntentContext['activePresentation'],
    result: ComputerResult,
  ) {
    const current = this.host.context().activePresentation;
    // These operations intentionally replace the active artifact. Their dependent
    // operations bind after completion; old saved bindings are not carried forward.
    if (batch[0].type === 'create' || batch[0].type === 'resume') return;
    if (!before?.projectId || before.revision === undefined || !current?.projectId || current.revision === undefined) return;
    if (before.projectId !== current.projectId) {
      throw Object.assign(new Error('The active presentation changed before this task finished. Start the remaining work on the current presentation.'), { code: 'stale_revision' });
    }
    if (before.revision === current.revision) return;
    const ownIds = new Set(batch.map(operation => operation.execution?.operationId).filter(Boolean));
    const receipts = (result.changes ?? []).filter(receipt => ownIds.has(receipt.operationId) && receipt.projectId === before.projectId && receipt.local === 'saved');
    let expectedRevision = before.revision;
    for (const receipt of receipts) {
      if (receipt.baseRevision !== expectedRevision || receipt.committedRevision !== expectedRevision + 1) break;
      expectedRevision = receipt.committedRevision;
    }
    const last = receipts.at(-1);
    if (expectedRevision !== current.revision || last?.outputSha256 !== this.host.snapshot().presentation?.sha256)
      throw Object.assign(new Error('The presentation changed outside this task. The remaining edits were not run; review the current presentation first.'), { code: 'stale_revision' });
    const bindings = [...draft.operations, ...batch].flatMap(operation => operation.binding ? [operation.binding] : []);
    if (draft.anchor) bindings.push(draft.anchor);
    for (const binding of bindings) {
      if (binding.projectId === before.projectId && binding.boundRevision === before.revision)
        binding.boundRevision = current.revision;
    }
  }
  private failTask(draft: PresentationTaskDraft, message: string, prerequisite?: PresentationExecutionOperation) {
    const progress = this.progress?.draftId === draft.id ? this.progress : null;
    if (progress?.continuation && progress.changes.length) this.failedProgress = {
      token: progress.continuation,
      summary: `${progress.summaries.join(' ')} The remaining steps could not finish: ${message} The completed changes remain saved.`,
      changes: structuredClone(progress.changes),
    };
    this.progress = null;
    this.activeRequest = null;
    const presentation = this.host.snapshot().presentation;
    this.lastFailedTask = structuredClone({
      fields: draft.fields,
      operations: [...(prerequisite ? [prerequisite] : []), ...draft.operations].slice(0, 8),
      transcript: draft.transcripts.join('\n').slice(-2000),
      error: message.slice(0, 800),
      ...(presentation ? { artifact: { filename: presentation.filename, revision: presentation.project?.revision, sha256: presentation.sha256, projectId: this.host.context().activePresentation?.projectId } } : {}),
    });
    this.failedDraftId = draft.id;
    this.generation++;
    this.draft = null;
    this.continuation = null;
    this.executorContinuation = null;
    this.awaitingNavigation = null;
    this.host.cancelled('failed');
  }
  /** A cancellation can arrive after the atomic commit but before its result. */
  private reconcileInterruptedCommit(
    draft: PresentationTaskDraft,
    batch: PresentationExecutionOperation[],
    before: PresentationIntentContext['activePresentation'],
    result: ComputerResult,
  ) {
    const failed = this.lastFailedTask;
    if (this.draft || !failed || this.failedDraftId !== draft.id) return;
    const current = this.host.context().activePresentation;
    const snapshot = this.host.snapshot().presentation;
    const ids = new Set(batch.flatMap(operation => operation.execution ? [operation.execution.operationId] : []));
    if (!ids.size || !batch.every(operation => failed.operations.some(pending => pending.execution?.operationId === operation.execution?.operationId))) return;
    const replacesProject = batch[0].type === 'create';
    const projectId = replacesProject ? result.state.presentation?.projectId : before?.projectId;
    const baseRevision = replacesProject ? 0 : before?.revision;
    if (!projectId || baseRevision === undefined || current?.projectId !== projectId || !snapshot) return;
    const receipts = (result.changes ?? []).filter(receipt => ids.has(receipt.operationId) && receipt.projectId === projectId && receipt.local === 'saved');
    let revision = baseRevision;
    for (const receipt of receipts) {
      if (receipt.baseRevision !== revision || receipt.committedRevision !== revision + 1) return;
      revision = receipt.committedRevision;
    }
    const last = receipts.at(-1);
    if (!last || revision !== current.revision || last.outputSha256 !== snapshot.sha256 ||
      result.state.presentation?.sha256 !== snapshot.sha256 || result.state.presentation?.project?.revision !== revision) return;
    // executeBatch publishes one atomic candidate under its first operation ID.
    const completed = batch.length > 1 && receipts.some(receipt => receipt.operationId === batch[0].execution?.operationId)
      ? ids : new Set(receipts.map(receipt => receipt.operationId));
    failed.operations = failed.operations.filter(operation => !operation.execution || !completed.has(operation.execution.operationId));
    for (const operation of failed.operations) {
      if (operation.binding?.projectId === projectId && operation.binding.boundRevision === baseRevision)
        operation.binding.boundRevision = revision;
    }
    failed.artifact = { projectId, filename: snapshot.filename, revision, sha256: snapshot.sha256 };
    failed.error = 'The completed changes were saved before interruption. Only the remaining steps were interrupted.';
    if (!failed.operations.length) {
      this.lastFailedTask = null;
      this.failedDraftId = null;
    }
  }
  private reply(summary: string): ComputerResult {
    return { summary, spokenSummary: summary, clarification: true, state: this.host.snapshot() };
  }
  /** Called when native execution reports a new outcome, never from an old snapshot. */
  recordNavigationResult() {
    const actual = this.host.snapshot().presentation;
    if (!actual?.desktopNavigation) return;
    const navigation = actual.desktopNavigation;
    this.lastVerifiedResult = {
      filename: actual.filename, title: actual.title, revision: actual.project?.revision,
      saved: true, slideCount: actual.slideCount,
      summary: navigation.status === 'verified' ? `PowerPoint verified slide ${actual.selectedSlide}.` : `The file remains saved. PowerPoint selection failed: ${navigation.message}`,
      navigation: {
        ...(navigation.slide !== undefined ? { slide: navigation.slide } : {}),
        ...(navigation.requestedSlide !== undefined ? { requestedSlide: navigation.requestedSlide } : {}),
        verified: navigation.status === 'verified', error: navigation.message,
      },
    };
    if (navigation.status === 'failed' && this.draft)
      this.failTask(this.draft, navigation.message ?? 'PowerPoint selection was not verified.', this.awaitingNavigation ?? undefined);
    else if (navigation.status === 'verified') {
      if (this.draft && this.awaitingNavigation?.binding) {
        const binding = this.awaitingNavigation.binding;
        const current = this.host.context().activePresentation;
        const expected = current?.projectId === binding.projectId ? current.slides?.find(slide => slide.id === binding.targetSlideId)?.index : undefined;
        if (expected === undefined || actual.selectedSlide !== expected || current?.revision !== binding.boundRevision) {
          this.failTask(this.draft, current?.revision !== binding.boundRevision
            ? 'The presentation changed while slide selection was pending. The remaining changes were not run.'
            : 'PowerPoint did not verify the requested slide. The remaining changes were not run.', this.awaitingNavigation);
          return;
        }
        this.draft.anchor = binding;
      }
      this.awaitingNavigation = null;
    }
  }
  async request(transcript: string, signal: AbortSignal, turn?: { turnId: string; requestHash: string }): Promise<ComputerResult | null> {
    const request = Symbol('presentation-request');
    this.activeRequest = request;
    const aborted = () => {
      if (this.activeRequest === request) this.interrupt();
    };
    signal.addEventListener('abort', aborted, { once: true });
    try {
      if (signal.aborted) aborted();
      signal.throwIfAborted();
      return await this.requestTurn(transcript, signal, turn);
    } finally {
      signal.removeEventListener('abort', aborted);
      if (this.activeRequest === request) this.activeRequest = null;
    }
  }
  private async requestTurn(transcript: string, signal: AbortSignal, turn?: { turnId: string; requestHash: string }): Promise<ComputerResult | null> {
    if (transcript.startsWith('__insight_semantic_')) {
      if (transcript === this.failedProgress?.token) return {
        ...this.reply(this.failedProgress.summary), changes: structuredClone(this.failedProgress.changes), taskStatus: 'failed',
      };
      if (transcript !== this.continuation || !this.draft) return this.reply('That request was replaced. Your saved presentation is unchanged.');
      this.continuation = null;
      const executorToken = this.executorContinuation;
      this.executorContinuation = null;
      return this.run(signal, executorToken ?? undefined);
    }
    const generation = this.generation;
    const interpreted = await interpretPresentationTurn(transcript, {
      ...this.host.context(), draft: this.draft, lastVerifiedResult: this.lastVerifiedResult, lastFailedTask: this.lastFailedTask,
    }, this.cfg, signal);
    signal.throwIfAborted();
    if (generation !== this.generation) throw new Error('Presentation request was cancelled.');
    // Keep the executor invariant even with another interpreter implementation.
    const intent = constrainFailedTaskRetry(interpreted, this.lastFailedTask);
    if (intent.kind === 'cancellation') {
      this.cancel();
      return this.reply('Okay, I cancelled that task. Any completed presentation files are still saved.');
    }
    if (intent.domain === 'other') return null;
    if (intent.kind === 'question') return this.reply(groundedPresentationReply(intent.reply ?? 'What would you like to know about your presentation?', this.host.snapshot()));
    if (intent.retryFailedTask) {
      const failed = this.lastFailedTask;
      const current = this.host.snapshot().presentation;
      const currentProjectId = this.host.context().activePresentation?.projectId;
      if (!failed || (failed.artifact && (current?.filename !== failed.artifact.filename || current.project?.revision !== failed.artifact.revision ||
        (failed.artifact.sha256 !== undefined && current.sha256 !== failed.artifact.sha256) ||
        (failed.artifact.projectId !== undefined && currentProjectId !== failed.artifact.projectId))) ||
        failed.operations.some(operation => operation.binding && operation.binding.projectId !== currentProjectId))
        return this.reply('The presentation has changed or there is no failed task to retry. Tell me which change you want now.');
      this.draft = {
        id: crypto.randomUUID(), generation: this.generation,
        workflow: failed.operations.some((op) => op.type === 'create') ? 'create' : 'edit',
        fields: structuredClone(failed.fields), operations: structuredClone(failed.operations),
        transcripts: [failed.transcript], pendingQuestion: null, lastSuccessfulArtifact: this.lastVerifiedResult,
      };
    }
    this.continuation = null;
    this.executorContinuation = null;
    this.awaitingNavigation = null;
    this.draft = mergePresentationDraft(this.draft, intent, transcript, { id: crypto.randomUUID(), generation: ++this.generation });
    if (!this.draft) return this.reply(intent.reply ?? 'What would you like to change?');
    // Only unexecuted work remains in this queue. A spoken correction is a new
    // operation identity; an opaque native continuation retains these identities.
    const identity = turn ?? { turnId: crypto.randomUUID(), requestHash: createHash('sha256').update(transcript).digest('hex') };
    this.draft.operations = this.draft.operations.map((operation, index, all) => ({ ...operation, execution: {
      operationId: operationIdentity(identity.turnId, index), turnId: identity.turnId,
      turnRequestHash: identity.requestHash, operationIndex: index, operationCount: all.length,
    } }));
    if (intent.awaitingContinuation) return this.reply(intent.reply ?? (this.draft.fields.topic ? 'Go ahead, I’m listening.' : 'What should the presentation be about?'));
    // Explicit operation fields are initial values. A correction supplied in global
    // slots overrides them so an old target cannot win after “No, slide two”.
    for (const op of this.draft.operations) {
      for (const key of ['topic', 'totalSlides', 'contentDensity', 'theme', 'folderName', 'folderLocation', 'folderPath', 'sourceImage'] as const) {
        if (key in op && !(key in this.draft.fields)) (this.draft.fields as Record<string, unknown>)[key] = (op as unknown as Record<string, unknown>)[key];
      }
    }
    if (intent.reply && !this.draft.operations.length) return this.reply(intent.reply);
    this.lastFailedTask = null;
    this.failedDraftId = null;
    return this.run(signal);
  }
  private async run(signal: AbortSignal, executorToken?: string): Promise<ComputerResult> {
    const draft = this.draft!;
    const generation = this.generation;
    if (this.progress?.draftId !== draft.id) {
      this.progress = { draftId: draft.id, summaries: [], changes: [] };
      this.failedProgress = null;
    }
    const progress = this.progress;
    const { summaries, changes } = progress;
    const combinedChanges = (additional: ComputerResult['changes'] = []) => {
      const receipts = new Map<string, NonNullable<ComputerResult['changes']>[number]>();
      for (const receipt of [...changes, ...additional]) receipts.set(`${receipt.projectId}:${receipt.operationId}:${receipt.committedRevision}`, receipt);
      return structuredClone([...receipts.values()].slice(-64));
    };
    const withProgress = (next: ComputerResult, includeNext = true): ComputerResult => {
      if (!summaries.length && !changes.length) return next;
      const summary = [...summaries, ...(includeNext ? [next.spokenSummary ?? next.summary] : [])].join(' ');
      return { ...next, summary, spokenSummary: summary, changes: combinedChanges(next.changes) };
    };
    let result: ComputerResult | undefined;
    while (draft.operations.length) {
      signal.throwIfAborted();
      if (generation !== this.generation) throw new Error('Presentation request was cancelled.');
      let operation = draft.operations[0];
      if (operation.type === 'create' && !draft.fields.topic) {
        draft.pendingQuestion = { field: 'topic', question: 'What should the presentation be about?' };
        return withProgress(this.reply(draft.pendingQuestion.question));
      }
      if (operation.type === 'create' && draft.operations.some((op) => op.type === 'insert_image') && !draft.fields.folderName && !draft.fields.folderPath) {
        draft.pendingQuestion = { field: 'folderName', question: 'What is the picture folder called?' };
        return withProgress(this.reply(draft.pendingQuestion.question));
      }
      try {
        this.assertCurrentBinding(this.awaitingNavigation?.binding);
        if (this.awaitingNavigation)
          throw Object.assign(new Error('PowerPoint has not verified the requested slide. The remaining changes were not run.'), { code: 'navigation_unverified' });
        this.assertCurrentBinding(operation.binding);
        this.assertCurrentBinding(draft.anchor);
        operation = this.host.bind?.(operation, draft.fields, draft.anchor) ?? operation;
        this.assertCurrentBinding(operation.binding);
        draft.operations[0] = operation;
        // Content and typography on one explicitly shared target are one edit.
        // Independent targets retain their own ordered result and commit.
        const batch = [operation];
        if (!executorToken && this.host.executeBatch && operation.binding && ['revise_slide', 'resize_text', 'set_layout', 'resize_title'].includes(operation.type)) {
          for (const next of draft.operations.slice(1)) {
            if (!['revise_slide', 'resize_text', 'set_layout', 'resize_title'].includes(next.type) || !('target' in next) || !('target' in operation) || next.target !== operation.target) break;
            this.assertCurrentBinding(next.binding);
            const bound = this.host.bind?.(next, draft.fields, draft.anchor) ?? next;
            this.assertCurrentBinding(bound.binding);
            if (bound.binding?.projectId !== operation.binding.projectId || bound.binding?.targetSlideId !== operation.binding.targetSlideId) break;
            batch.push(bound);
          }
        }
        const before = this.host.context().activePresentation;
        result = executorToken ? await this.host.continueExecution(executorToken, signal)
          : batch.length > 1 ? await this.host.executeBatch!(batch, draft.fields, signal)
          : await this.host.execute(operation, draft.fields, signal);
        executorToken = undefined;
        if (signal.aborted || generation !== this.generation)
          this.reconcileInterruptedCommit(draft, batch, before, result);
        signal.throwIfAborted();
        if (generation !== this.generation) throw new Error('Presentation request was cancelled.');
        this.advanceBindings(draft, batch, before, result);
        if (result.persistence) {
          const saved = result.persistence;
          for (const change of [...changes, ...(result.changes ?? [])]) {
            if (change.projectId === saved.projectId && change.committedRevision === saved.revision && change.outputSha256 === saved.sha256)
              change.cloud = { status: saved.verified ? 'verified' : 'not_verified', provider: saved.provider, savedAt: saved.savedAt };
          }
        }
        if (result.clarification) {
          if (result.recovery || result.taskStatus === 'failed') this.failTask(draft, result.summary);
          return withProgress(result);
        }
        if (result.desktopIntent?.kind === 'openFolder' && result.desktopIntent.continueRequest) {
          this.executorContinuation = result.desktopIntent.continueRequest;
          this.continuation = `__insight_semantic_${crypto.randomUUID()}`;
          progress.continuation = this.continuation;
          return withProgress({ ...result, desktopIntent: { ...result.desktopIntent, continueRequest: this.continuation } });
        }
        const presentation = result.state.presentation;
        if (presentation) {
          this.lastVerifiedResult = {
            filename: presentation.filename, title: presentation.title, revision: presentation.project?.revision,
            slideCount: presentation.slideCount, saved: true, summary: result.summary,
            ...(presentation.desktopNavigation ? { navigation: { slide: presentation.desktopNavigation.slide, requestedSlide: presentation.desktopNavigation.requestedSlide, verified: presentation.desktopNavigation.status === 'verified', error: presentation.desktopNavigation.message } } : {}),
          };
          draft.lastSuccessfulArtifact = this.lastVerifiedResult;
        }
        draft.pendingQuestion = null;
        draft.operations.splice(0, batch.length);
        if (operation.type === 'create' || operation.type === 'resume') draft.anchor = undefined;
        else if (operation.binding && result.desktopIntent?.kind !== 'slide') draft.anchor = operation.binding;
        summaries.push(result.spokenSummary ?? result.summary);
        if (summaries.length > 16) summaries.splice(0, summaries.length - 16);
        changes.splice(0, changes.length, ...combinedChanges(result.changes));
        if (result.desktopIntent?.kind === 'openFolder' && !result.desktopIntent.continueRequest && draft.operations.length) {
          this.continuation = `__insight_semantic_${crypto.randomUUID()}`;
          progress.continuation = this.continuation;
          return withProgress({ ...result, desktopIntent: { ...result.desktopIntent, continueRequest: this.continuation } }, false);
        }
        if (result.desktopIntent?.kind === 'slide' && draft.operations.length) {
          // Selection needs native verification before a dependent “current” edit.
          this.continuation = `__insight_semantic_${crypto.randomUUID()}`;
          progress.continuation = this.continuation;
          this.awaitingNavigation = { type: 'navigate_slide', target: result.desktopIntent.slide, binding: operation.binding };
          return withProgress({ ...result, desktopIntent: { ...result.desktopIntent, continueRequest: this.continuation } }, false);
        }
      } catch (error) {
        signal.throwIfAborted();
        if (generation !== this.generation) throw error;
        if (error instanceof PresentationQuestion) {
          draft.pendingQuestion = { field: error.field, question: error.message };
          return withProgress({ ...this.reply(error.message), failure: classifyPresentationFailure(error, { disposition: 'clarification', committed: changes.length > 0 }) });
        }
        const presentation = this.host.snapshot().presentation;
        const failure = error instanceof Error ? error.message : 'Unknown error';
        if (!changes.length) this.lastVerifiedResult = presentation ? { filename: presentation.filename, title: presentation.title, saved: true, summary: `The requested operation failed: ${failure}. This operation made no verified change.` } : null;
        this.failTask(draft, failure);
        if (changes.length) {
          const summary = `${summaries.join(' ')} The next step could not finish: ${failure} The completed changes remain saved.`;
          return { summary, spokenSummary: summary, state: this.host.snapshot(), changes, taskStatus: 'failed', clarification: true, failure: classifyPresentationFailure(error, { committed: true }) };
        }
        throw error;
      }
    }
    this.draft = null;
    this.progress = null;
    return result ? { ...result, ...(changes.length ? { changes } : {}), summary: summaries.join(' '), spokenSummary: summaries.join(' ') } : this.reply('What would you like to do with your presentation?');
  }
}
