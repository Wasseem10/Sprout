import { z } from 'zod';

export const presentationFailureCodeSchema = z.enum([
  'ambiguous_target',
  'missing_source',
  'stale_revision',
  'invalid_content',
  'no_meaningful_change',
  'layout_capacity',
  'provider_unavailable',
  'file_write_failed',
  'native_view_failed',
  'cloud_save_failed',
  // Reserved for the later graph/data operations; declaring these does not implement them.
  'invalid_graph',
  'unverified_data',
]);
export type PresentationFailureCode = z.infer<typeof presentationFailureCodeSchema>;
export const presentationFailureDispositionSchema = z.enum([
  'clarification',
  'recovery_offered',
  'terminal',
]);
export type PresentationFailureDisposition = z.infer<typeof presentationFailureDispositionSchema>;
export const presentationFailureSchema = z.strictObject({
  code: presentationFailureCodeSchema,
  disposition: presentationFailureDispositionSchema,
  message: z.string(),
  detailCode: z.string().optional(),
  /** Supplied by the executor from commit evidence, never inferred from error wording. */
  committed: z.boolean().optional(),
});
export type PresentationFailure = z.infer<typeof presentationFailureSchema>;
export type PresentationFailureOptions = {
  /** A trusted operation boundary may classify an otherwise untyped error explicitly. */
  code?: PresentationFailureCode;
  disposition?: PresentationFailureDisposition;
  committed?: boolean;
};

/** A boundary-specific error with a user-facing message and a private original cause. */
export class PresentationFailureError extends Error {
  constructor(
    readonly code: PresentationFailureCode,
    message: string,
    readonly disposition: PresentationFailureDisposition = 'terminal',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PresentationFailureError';
  }
}

const codeAliases: Readonly<Record<string, PresentationFailureCode>> = {
  navigation_unverified: 'native_view_failed',
  OPERATION_ID_CONFLICT: 'stale_revision',
  OPERATION_RECEIPT_EXPIRED: 'stale_revision',
  OPERATION_LOOKUP_UNAVAILABLE: 'file_write_failed',
  PUBLICATION_RECOVERY_REQUIRED: 'file_write_failed',
};
const capacityCodes: Readonly<Record<string, PresentationFailureCode>> = {
  unavailable_candidate: 'layout_capacity',
  stale_revision: 'stale_revision',
  unsupported_layout: 'layout_capacity',
  deck_limit: 'layout_capacity',
  invalid_continuation_id: 'invalid_content',
  invalid_deck: 'invalid_content',
  no_fitting_split: 'layout_capacity',
};
const sourceFields = new Set(['folderName', 'folderPath', 'folderLocation', 'sourceImage']);
function errorCode(error: Error): string | undefined {
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
function className(error: Error): string {
  // Some existing subclasses do not assign Error.name; their actual constructor remains typed.
  return error.name !== 'Error' ? error.name : error.constructor.name;
}
function isCancellation(error: Error): boolean {
  return (
    error.name === 'AbortError' ||
    errorCode(error) === 'STOPPED' ||
    errorCode(error) === 'ABORT_ERR'
  );
}
function identify(error: Error): Omit<PresentationFailure, 'message' | 'committed'> | undefined {
  const sourceCode = errorCode(error);
  if (isCancellation(error) || sourceCode === 'OPERATION_ALREADY_COMMITTED') return undefined;
  if (error instanceof PresentationFailureError)
    return { code: error.code, disposition: error.disposition, detailCode: sourceCode };
  const typedCode = presentationFailureCodeSchema.safeParse(sourceCode);
  if (typedCode.success)
    return {
      code: typedCode.data,
      disposition: typedCode.data === 'ambiguous_target' ? 'clarification' : 'terminal',
      detailCode: sourceCode,
    };
  if (sourceCode && Object.hasOwn(codeAliases, sourceCode))
    return { code: codeAliases[sourceCode], disposition: 'terminal', detailCode: sourceCode };
  const name = className(error);
  if (
    name === 'PresentationCapacityRecoveryError' &&
    sourceCode &&
    Object.hasOwn(capacityCodes, sourceCode)
  )
    return { code: capacityCodes[sourceCode], disposition: 'terminal', detailCode: sourceCode };
  if (name === 'PresentationReferenceError')
    return { code: 'ambiguous_target', disposition: 'clarification' };
  if (
    name === 'ProviderRequestError' &&
    typeof (error as Error & { httpStatus?: unknown }).httpStatus === 'number'
  )
    return { code: 'provider_unavailable', disposition: 'terminal' };
  if (name === 'PresentationWindowError')
    return {
      code: 'native_view_failed',
      disposition: 'terminal',
      ...(sourceCode ? { detailCode: sourceCode } : {}),
    };
  if (name === 'FolderResolutionError')
    return { code: 'missing_source', disposition: 'clarification' };
  if (name === 'PresentationQuestion') {
    const field = (error as Error & { field?: unknown }).field;
    if (field === 'imageDestination')
      return { code: 'ambiguous_target', disposition: 'clarification' };
    if (typeof field === 'string' && sourceFields.has(field))
      return { code: 'missing_source', disposition: 'clarification' };
  }
  return undefined;
}

/**
 * Uses typed classes/codes only. Unknown exceptions remain unknown: no message regex,
 * filesystem-errno guessing, automatic retry, or inferred commit status.
 */
export function classifyPresentationFailure(
  error: unknown,
  options: PresentationFailureOptions = {},
): PresentationFailure | undefined {
  if (!(error instanceof Error)) return undefined;
  if (isCancellation(error) || errorCode(error) === 'OPERATION_ALREADY_COMMITTED') return undefined;
  let identified: Omit<PresentationFailure, 'message' | 'committed'> | undefined;
  if (options.code)
    identified = {
      code: options.code,
      disposition: options.disposition ?? 'terminal',
      ...(errorCode(error) ? { detailCode: errorCode(error) } : {}),
    };
  else {
    const visited = new Set<Error>();
    let current: unknown = error;
    for (let depth = 0; depth < 4 && current instanceof Error && !visited.has(current); depth++) {
      visited.add(current);
      identified = identify(current);
      if (
        identified ||
        isCancellation(current) ||
        errorCode(current) === 'OPERATION_ALREADY_COMMITTED'
      )
        break;
      current = current.cause;
    }
  }
  if (!identified) return undefined;
  return {
    ...identified,
    disposition: options.disposition ?? identified.disposition,
    message: error.message,
    ...(options.committed === undefined ? {} : { committed: options.committed }),
  };
}
