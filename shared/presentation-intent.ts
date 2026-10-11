import { z } from 'zod';
import type { Flowchart } from './presentation-flowchart.js';

export const presentationSlideTargetSchema = z.union([
  z.number().int().min(1).max(100),
  z.enum(['first', 'last', 'current', 'next', 'previous']),
]);
export type PresentationSlideTarget = z.infer<typeof presentationSlideTargetSchema>;

export const presentationThemeSchema = z.enum(['blue', 'light', 'dark']);
const folderLocationSchema = z.enum(['desktop', 'documents', 'downloads']);
const literal = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((s) => !/[\u0000-\u001f]/.test(s));
const sourceImageSchema = literal.refine(
  (value) =>
    ['same', 'different'].includes(value) ||
    (!/[\\/]/.test(value) && /\.(?:png|jpe?g)$/i.test(value)),
  'Use same, different, or an exact PNG/JPG image filename. Omit sourceImage for a generic picture request.',
);
const datasetFilenameSchema = literal.refine(value => !/[\\/:<>"|?*]/.test(value) && /\.(?:csv|xlsx)$/i.test(value), 'Use an exact CSV/XLSX filename, with its folder supplied separately.');

export const presentationFieldsSchema = z.strictObject({
  topic: z.string().trim().min(1).max(400).optional(),
  totalSlides: z.number().int().min(3).max(10).optional(),
  contentDensity: z.enum(['brief', 'standard', 'detailed']).optional(),
  folderName: literal.optional(),
  folderLocation: folderLocationSchema.optional(),
  folderPath: literal.optional(),
  sourceImage: sourceImageSchema.optional(),
  datasetFilename: datasetFilenameSchema.optional(),
  imageDestination: presentationSlideTargetSchema.optional(),
  theme: presentationThemeSchema.optional(),
  open: z.boolean().optional(),
});
export type PresentationFields = z.infer<typeof presentationFieldsSchema>;

const imageSourceFields = {
  folderName: literal.optional(),
  folderLocation: folderLocationSchema.optional(),
  folderPath: literal.optional(),
  sourceImage: sourceImageSchema.optional(),
};

export const presentationOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('create'),
    topic: z.string().trim().min(1).max(400).optional(),
    totalSlides: z.number().int().min(3).max(10).optional(),
    contentDensity: z.enum(['brief', 'standard', 'detailed']).optional(),
    theme: presentationThemeSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('insert_image'),
    target: presentationSlideTargetSchema.optional(),
    targetReference: literal.optional(),
    ...imageSourceFields,
  }),
  z.strictObject({
    type: z.literal('read_slide'),
    target: presentationSlideTargetSchema.optional(),
    targetReference: literal.optional(),
  }),
  z.strictObject({ type: z.literal('navigate_slide'), target: presentationSlideTargetSchema, targetReference: literal.optional() }),
  z.strictObject({
    type: z.literal('revise_slide'),
    target: presentationSlideTargetSchema.optional(),
    targetReference: literal.optional(),
    instruction: z.string().trim().min(1).max(1200),
    processEdit: z.enum(['wording', 'structure']).optional(),
    detailChange: z.enum(['expand', 'shorten', 'preserve']).optional(),
    maximumWords: z.number().int().min(1).max(500).optional(),
    reductionPercent: z.number().int().min(1).max(99).optional(),
    lengthConstraintQuote: z.string().trim().min(1).max(1200).optional(),
  }),
  z.strictObject({ type: z.literal('set_theme'), theme: presentationThemeSchema }),
  z.strictObject({ type: z.literal('open_presentation') }),
  z.strictObject({ type: z.literal('undo') }),
  z.strictObject({ type: z.literal('save') }),
  z.strictObject({ type: z.literal('resume'), name: z.string().trim().min(1).max(160).optional() }),
  z.strictObject({ type: z.literal('list_saved') }),
  z.strictObject({ type: z.literal('open_folder'), ...imageSourceFields }),
  z.strictObject({ type: z.literal('import_studio_source'), folderName: literal.optional(), folderLocation: folderLocationSchema.optional(), folderPath: literal.optional(), datasetFilename: datasetFilenameSchema.optional() }),
  z.strictObject({ type: z.literal('add_summary'), target: z.literal('last').optional() }),
  z.strictObject({ type: z.literal('recover_layout'), choice: z.enum(['split', 'keep']) }),
  z.strictObject({
    type: z.literal('move_slide'),
    target: presentationSlideTargetSchema,
    targetReference: literal.optional(),
    before: presentationSlideTargetSchema,
    beforeReference: literal.optional(),
  }),
  z.strictObject({
    type: z.literal('resize_text'),
    target: presentationSlideTargetSchema.optional(),
    targetReference: literal.optional(),
    direction: z.enum(['larger', 'smaller']),
  }),
  z.strictObject({
    type: z.literal('set_layout'),
    target: presentationSlideTargetSchema.optional(),
    targetReference: literal.optional(),
    layout: z.enum(['single', 'two-column', 'image-left', 'image-right', 'large-image']),
  }),
  z.strictObject({
    type: z.literal('resize_title'),
    target: presentationSlideTargetSchema.optional(),
    targetReference: literal.optional(),
    direction: z.enum(['larger', 'smaller']),
  }),
  z.strictObject({
    type: z.literal('describe_layout'),
    target: presentationSlideTargetSchema.optional(),
    targetReference: literal.optional(),
  }),
  z.strictObject({ type: z.literal('describe_image'), target: presentationSlideTargetSchema.optional(), targetReference: literal.optional() }),
  z.strictObject({ type: z.literal('edit_image_description'), target: presentationSlideTargetSchema.optional(), targetReference: literal.optional(), description: z.string().trim().min(5).max(500) }),
  z.strictObject({
    type: z.literal('insert_verified_chart'),
    target: presentationSlideTargetSchema,
    targetReference: literal.optional(),
    position: z.enum(['before', 'after']).optional(),
  }),
  z.strictObject({
    type: z.literal('read_chart'),
    target: presentationSlideTargetSchema.optional(),
    targetReference: literal.optional(),
    detail: z.enum(['summary', 'source', 'values']).default('summary'),
  }),
  z.strictObject({ type: z.literal('refresh_verified_chart'), target: presentationSlideTargetSchema.optional(), targetReference: literal.optional() }),
  z.strictObject({
    type: z.literal('insert_flowchart'),
    target: presentationSlideTargetSchema.optional(),
    targetReference: literal.optional(),
    position: z.enum(['before', 'after']).default('after'),
    instruction: z.string().trim().min(1).max(1200),
  }),
  z.strictObject({
    type: z.literal('read_flowchart'),
    target: presentationSlideTargetSchema.optional(),
    targetReference: literal.optional(),
    scope: z.enum(['all', 'decision', 'branch', 'node']).default('all'),
    reference: z.string().trim().min(1).max(60).optional(),
  }),
  z.strictObject({
    type: z.literal('edit_flowchart'),
    target: presentationSlideTargetSchema.optional(),
    targetReference: literal.optional(),
    label: z.string().trim().min(1).max(60),
    branch: z.string().trim().min(1).max(32).optional(),
    from: z.string().trim().min(1).max(60).optional(),
    to: z.string().trim().min(1).max(60).optional(),
  }),
]);
export type PresentationOperation = z.infer<typeof presentationOperationSchema>;

/** Created by the executor, never accepted in provider output. Positions are only a view of these IDs. */
export interface PresentationTargetBinding {
  projectId: string;
  targetSlideId: string;
  beforeSlideId?: string;
  boundRevision: number;
  /** Exact validated graph and object selected by the executor, never by the model. */
  graph?: { sha256: string; edgeId?: string; nodeId?: string };
}
export interface PresentationExecutionIdentity {
  operationId: string;
  turnId: string;
  turnRequestHash: string;
  operationIndex: number;
  operationCount: number;
}
export type PresentationExecutionOperation = PresentationOperation & {
  binding?: PresentationTargetBinding;
  execution?: PresentationExecutionIdentity;
};
export interface PresentationRecoveryChoice {
  id: string;
  category: 'layout_capacity';
  projectId: string;
  slideId: string;
  slideIndex: number;
  title: string;
  baseRevision: number;
  choices: ('split' | 'keep')[];
  question: string;
}
export type PresentationTargetedOperation = Extract<PresentationOperation, {
  type: 'insert_image' | 'read_slide' | 'navigate_slide' | 'revise_slide' | 'move_slide' | 'resize_text' | 'set_layout' | 'resize_title' | 'describe_layout' | 'describe_image' | 'edit_image_description' | 'insert_verified_chart' | 'read_chart' | 'refresh_verified_chart' | 'insert_flowchart' | 'read_flowchart' | 'edit_flowchart';
}>;
export function isTargetedPresentationOperation(operation: PresentationOperation): operation is PresentationTargetedOperation {
  return ['insert_image', 'read_slide', 'navigate_slide', 'revise_slide', 'move_slide', 'resize_text', 'set_layout', 'resize_title', 'describe_layout', 'describe_image', 'edit_image_description', 'insert_verified_chart', 'read_chart', 'refresh_verified_chart', 'insert_flowchart', 'read_flowchart', 'edit_flowchart'].includes(operation.type);
}
export interface PresentationRequestedTarget {
  projectId: string;
  slideId: string;
  revision: number;
  index: number;
  title: string;
  operationType: PresentationTargetedOperation['type'];
}

export const presentationTurnIntentSchema = z
  .strictObject({
    kind: z.enum(['request', 'continuation', 'correction', 'cancellation', 'question']),
    domain: z.enum(['presentation', 'other']),
    startsNewTask: z.boolean(),
    retryFailedTask: z.boolean().optional(),
    awaitingContinuation: z.boolean(),
    fields: presentationFieldsSchema,
    operations: z.array(presentationOperationSchema).max(8),
    reply: z.string().trim().min(1).max(650).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.retryFailedTask && value.startsNewTask)
      ctx.addIssue({ code: 'custom', path: ['retryFailedTask'], message: 'Retrying failed work and starting a new task are mutually exclusive.' });
    if (value.retryFailedTask && (value.domain !== 'presentation' || !['request', 'correction'].includes(value.kind)))
      ctx.addIssue({ code: 'custom', path: ['retryFailedTask'], message: 'Only an explicit presentation request or correction can retry failed work.' });
    if (
      (value.domain === 'other' || value.kind === 'question' || value.kind === 'cancellation') &&
      value.operations.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['operations'],
        message: 'Other-domain turns, questions and cancellations must not execute operations.',
      });
    if (value.domain === 'other' && Object.keys(value.fields).length)
      ctx.addIssue({
        code: 'custom',
        path: ['fields'],
        message: 'Other-domain turns must not change presentation fields.',
      });
    if (value.kind === 'cancellation' && Object.keys(value.fields).length)
      ctx.addIssue({
        code: 'custom',
        path: ['fields'],
        message: 'Cancellation must clear the pending task without changing completed artifacts.',
      });
    if (
      value.startsNewTask &&
      (value.kind !== 'request' || !value.operations.some((op) => op.type === 'create'))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['startsNewTask'],
        message: 'Only a request containing create can replace the creation draft.',
      });
  });
export type PresentationTurnIntent = z.infer<typeof presentationTurnIntentSchema>;

export interface PresentationArtifactEvidence {
  filename: string;
  title?: string;
  revision?: number;
  slideCount?: number;
  summary: string;
  saved: boolean;
  navigation?: { slide?: number; requestedSlide?: PresentationSlideTarget; verified: boolean; error?: string };
}

export interface PresentationTaskDraft {
  id: string;
  generation: number;
  workflow: 'create' | 'edit' | 'open_folder';
  fields: PresentationFields;
  operations: PresentationExecutionOperation[];
  /** A completed in-task target; native navigation sets this only after verification. */
  anchor?: PresentationTargetBinding;
  transcripts: string[];
  pendingQuestion: {
    field: keyof PresentationFields | 'target' | 'clarification';
    question: string;
  } | null;
  lastSuccessfulArtifact: PresentationArtifactEvidence | null;
}

/** Failed work is context, never an executable queue until the user asks to retry it. */
export interface PresentationFailedTask {
  fields: PresentationFields;
  operations: PresentationExecutionOperation[];
  transcript: string;
  error: string;
  artifact?: { filename: string; revision?: number; projectId?: string; sha256?: string };
}

export interface PresentationIntentContext {
  draft: PresentationTaskDraft | null;
  knownFolder?: {
    name: string;
    location?: 'desktop' | 'documents' | 'downloads';
    path?: string;
    imageNames?: string[];
  } | null;
  knownDatasetSource?: { folderName: string; folderPath: string; datasetFilename: string; sourceSheet: string } | null;
  activePresentation?: {
    projectId?: string;
    filename: string;
    title: string;
    slideCount: number;
    revision?: number;
    verifiedSelectedSlide?: number;
    reviewedSlide?: number;
    slideTitles?: string[];
    slides?: { id: string; index: number; title: string; type?: string; graph?: Flowchart }[];
  } | null;
  conversation: { request: string; outcome: string }[];
  lastVerifiedResult: PresentationArtifactEvidence | null;
  lastFailedTask?: PresentationFailedTask | null;
  /** User intent evidence only. This does not mean the slide was selected or edited. */
  lastRequestedTarget?: PresentationRequestedTarget | null;
  pendingRecovery?: PresentationRecoveryChoice | null;
}

/** A stop must not wait for inference. Corrections beginning with "no" are not stops. */
export function isExactPresentationCancellation(request: string): boolean {
  const text = request
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:hey )?insight(?: os)?\s+/, '');
  return (
    /^(?:(?:no|okay|ok) )?(?:stop|cancel|never mind|nevermind|forget it|don't do that|do not do that)(?: (?:please|actually|now))?$/.test(
      text,
    ) || text === 'no'
  );
}

/** Only a diagnostic interpretation view is normalized; transcripts and literals stay exact. */
export function normalizePresentationTranscript(request: string): string {
  if (/(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\)/.test(request)) return request;
  return request
    .split(/("[^"\r\n]*"|“[^”\r\n]*”|'[^'\r\n]*')/g)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(/\b(?:uh|um|erm)\b[,.]?\s*/gi, '')
            .replace(/\s+,/g, ',')
            .replace(/\s{2,}/g, ' '),
    )
    .join('')
    .trim();
}

/** An explicit source is independent of paths and choices resolved for an earlier step. */
export function mergePresentationSourceFields(
  inherited: PresentationFields,
  supplied: PresentationFields,
): PresentationFields {
  const fields = { ...inherited };
  for (const key of ['folderName', 'folderLocation', 'folderPath', 'sourceImage'] as const)
    if (supplied[key] !== undefined) (fields as Record<string, unknown>)[key] = supplied[key];
  const same = (a?: string, b?: string) => a?.replace(/\\/g, '/').toLowerCase() === b?.replace(/\\/g, '/').toLowerCase();
  const changedName = supplied.folderName !== undefined && !same(supplied.folderName, inherited.folderName);
  const changedLocation = supplied.folderLocation !== undefined && supplied.folderLocation !== inherited.folderLocation;
  const changedPath = supplied.folderPath !== undefined && !same(supplied.folderPath, inherited.folderPath);
  if ((changedName || changedLocation) && supplied.folderPath === undefined) delete fields.folderPath;
  if ((changedName || changedPath) && supplied.folderLocation === undefined) delete fields.folderLocation;
  if (changedPath && supplied.folderName === undefined)
    fields.folderName = supplied.folderPath!.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1);
  if ((changedName || changedLocation || changedPath) && supplied.sourceImage === undefined) delete fields.sourceImage;
  return fields;
}

function mergeQueuedOperations(
  queued: PresentationExecutionOperation[],
  incoming: PresentationOperation[],
  fields: PresentationFields,
  changedFields: PresentationFields,
  kind: PresentationTurnIntent['kind'],
): PresentationExecutionOperation[] {
  const result = queued.map((operation) => ({ ...operation }));
  const reconciled = new Set<number>();
  const creating = result.some((operation) => operation.type === 'create');
  for (const operation of incoming) {
    // Theme corrections while collecting a new deck belong to its creation, not a second write.
    if (creating && operation.type === 'set_theme') {
      const create = result.find((item) => item.type === 'create');
      if (create?.type === 'create') create.theme = operation.theme;
      continue;
    }
    const matches = queued.flatMap((item, index) => {
      if (reconciled.has(index)) return [];
      if (item.type !== operation.type) return [];
      const compatible = item.type === 'create' || item.type === 'set_theme' || item.type === 'import_studio_source' || kind === 'correction' || (
        JSON.stringify(item) === JSON.stringify(operation) ||
        ('target' in item && 'target' in operation && item.target === operation.target)
      );
      return compatible ? [index] : [];
    });
    const match = matches.find((index) => 'target' in queued[index] && 'target' in operation && queued[index].target === operation.target) ?? matches[0] ?? -1;
    if (match < 0) result.push({ ...operation });
    else {
      const prior = result[match];
      result[match] = { ...prior, ...operation } as PresentationExecutionOperation;
      if (prior.type === 'revise_slide' && operation.type === 'revise_slide') {
        // A replacement edit defines its own limit contract. Contextual target-only
        // continuations keep the queued operation; a new edit never inherits a hidden cap.
        const merged = result[match] as Extract<PresentationExecutionOperation, { type: 'revise_slide' }>;
        for (const key of ['maximumWords', 'reductionPercent', 'lengthConstraintQuote'] as const)
          if (operation[key] === undefined) delete merged[key];
      }
      if (prior.type === 'import_studio_source' && operation.type === 'import_studio_source') {
        const merged = result[match] as Extract<PresentationExecutionOperation, { type: 'import_studio_source' }>;
        const changedName = operation.folderName !== undefined && operation.folderName !== prior.folderName;
        const changedPath = operation.folderPath !== undefined && operation.folderPath !== prior.folderPath;
        if ((changedName || operation.folderLocation !== undefined) && operation.folderPath === undefined) delete merged.folderPath;
        if (changedName && operation.folderLocation === undefined) delete merged.folderLocation;
        if ((changedName || changedPath) && operation.datasetFilename === undefined) delete merged.datasetFilename;
      }
      if (isTargetedPresentationOperation(operation) && (
        (operation.target !== undefined && (kind === 'correction' || !isTargetedPresentationOperation(prior) || operation.target !== prior.target)) ||
        (operation.type === 'move_slide' && (kind === 'correction' || prior.type !== 'move_slide' || operation.before !== prior.before))
      )) delete result[match].binding;
      reconciled.add(match);
    }
  }
  const imageCount = result.filter((operation) => operation.type === 'insert_image').length;
  const firstImage = result.findIndex((operation) => operation.type === 'insert_image');
  const firstTarget = result.findIndex(isTargetedPresentationOperation);
  const createFields = (value: PresentationFields) => ({
    ...(value.topic !== undefined ? { topic: value.topic } : {}),
    ...(value.totalSlides !== undefined ? { totalSlides: value.totalSlides } : {}),
    ...(value.contentDensity !== undefined ? { contentDensity: value.contentDensity } : {}),
    ...(value.theme !== undefined ? { theme: value.theme } : {}),
  });
  const sourceFields = (value: PresentationFields) => ({
    ...(value.folderName !== undefined ? { folderName: value.folderName } : {}),
    ...(value.folderLocation !== undefined ? { folderLocation: value.folderLocation } : {}),
    ...(value.folderPath !== undefined ? { folderPath: value.folderPath } : {}),
    ...(value.sourceImage !== undefined ? { sourceImage: value.sourceImage } : {}),
  });
  return result.map((operation, index) => {
    if (operation.type === 'import_studio_source') {
      const supplied = !incoming.length && index === 0 ? changedFields : {};
      const scoped = mergePresentationSourceFields(sourceFields(fields), sourceFields(operation));
      const merged = mergePresentationSourceFields(scoped, sourceFields(supplied));
      delete merged.sourceImage;
      const changedFolder = ['folderName', 'folderPath'].some(key => key in supplied && operation[key as keyof typeof operation] !== undefined && supplied[key as keyof PresentationFields] !== operation[key as keyof typeof operation]);
      return { ...operation, ...merged, datasetFilename: supplied.datasetFilename ?? (changedFolder ? undefined : operation.datasetFilename ?? fields.datasetFilename) };
    }
    if (operation.type === 'create')
      return { ...createFields(fields), ...operation, ...createFields(changedFields) };
    if (operation.type === 'insert_image' || operation.type === 'open_folder') {
      const applyDelta = !incoming.length && (
        (operation.type === 'open_folder' && index === 0) ||
        (operation.type === 'insert_image' && (imageCount === 1 || index === firstImage))
      );
      const sourceOperation = { ...operation };
      if (operation.type === 'insert_image' && applyDelta && changedFields.imageDestination !== undefined &&
        (kind === 'correction' || operation.target !== changedFields.imageDestination)) delete sourceOperation.binding;
      if (applyDelta && changedFields.folderLocation && !changedFields.folderPath)
        delete sourceOperation.folderPath;
      if (
        applyDelta &&
        changedFields.folderName &&
        changedFields.folderName !== operation.folderName
      ) {
        if (!changedFields.folderPath) delete sourceOperation.folderPath;
        if (!changedFields.folderLocation) delete sourceOperation.folderLocation;
      }
      const scopedSource = mergePresentationSourceFields(sourceFields(fields), sourceFields(sourceOperation));
      const withoutSource = { ...sourceOperation };
      delete withoutSource.folderName;
      delete withoutSource.folderLocation;
      delete withoutSource.folderPath;
      delete withoutSource.sourceImage;
      return {
        ...withoutSource,
        ...(applyDelta ? mergePresentationSourceFields(scopedSource, sourceFields(changedFields)) : scopedSource),
        ...(operation.type === 'insert_image' &&
        operation.target === undefined &&
        fields.imageDestination !== undefined
          ? { target: fields.imageDestination }
          : {}),
        ...(operation.type === 'insert_image' &&
        applyDelta &&
        changedFields.imageDestination !== undefined
          ? { target: changedFields.imageDestination }
          : {}),
      };
    }
    if (
      !imageCount &&
      index === firstTarget &&
      !incoming.length &&
      changedFields.imageDestination !== undefined &&
      isTargetedPresentationOperation(operation)
    )
      return { ...operation, target: changedFields.imageDestination, binding: undefined } as PresentationExecutionOperation;
    return operation;
  });
}

/** Merge semantic fields without converting a sentence into a folder guess. */
export function mergePresentationDraft(
  previous: PresentationTaskDraft | null,
  intent: PresentationTurnIntent,
  transcript: string,
  identity: { id: string; generation: number },
): PresentationTaskDraft | null {
  if (intent.kind === 'cancellation') return null;
  if (intent.domain === 'other' || intent.kind === 'question') return previous;
  const existing = intent.startsNewTask ? null : previous;
  const fields = { ...existing?.fields, ...intent.fields };
  // A newly named folder invalidates a stale location/path; a location-only answer retains its name.
  if (
    existing &&
    intent.fields.folderName &&
    intent.fields.folderName.toLowerCase() !== existing.fields.folderName?.toLowerCase()
  ) {
    if (!intent.fields.folderLocation) delete fields.folderLocation;
    if (!intent.fields.folderPath) delete fields.folderPath;
    if (!intent.fields.datasetFilename) delete fields.datasetFilename;
  }
  if (intent.fields.folderLocation && !intent.fields.folderPath) delete fields.folderPath;
  const operations = mergeQueuedOperations(
    existing?.operations ?? [],
    intent.operations,
    fields,
    intent.fields,
    intent.kind,
  );
  if (!existing && !operations.length) return null;
  const question = existing?.pendingQuestion;
  const answered = question && question.field in intent.fields;
  return {
    id: existing?.id ?? identity.id,
    generation: identity.generation,
    workflow: operations.some((op) => op.type === 'create')
      ? 'create'
      : operations.every((op) => op.type === 'open_folder')
        ? 'open_folder'
        : (existing?.workflow ?? 'edit'),
    fields,
    operations,
    anchor: intent.kind === 'correction' && (intent.fields.imageDestination !== undefined || intent.operations.some(isTargetedPresentationOperation)) ? undefined : existing?.anchor,
    transcripts: [...(existing?.transcripts ?? []), transcript].slice(-20),
    pendingQuestion: answered ? null : (question ?? null),
    lastSuccessfulArtifact: previous?.lastSuccessfulArtifact ?? null,
  };
}
