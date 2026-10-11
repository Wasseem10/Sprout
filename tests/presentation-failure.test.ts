import { describe, expect, it } from 'vitest';
import {
  classifyPresentationFailure,
  PresentationFailureError,
  presentationFailureSchema,
  presentationFailureCodeSchema,
} from '../shared/presentation-failure';
import { PresentationReferenceError } from '../shared/presentation-reference';
import { ProviderRequestError } from '../server/providers/http';
import { FolderResolutionError } from '../server/computer/folder-resolution';
import { PresentationQuestion } from '../server/computer/presentation-conversation';
import { PresentationCapacityRecoveryError } from '../server/computer/presentation-capacity';
import { PresentationProjectError } from '../server/computer/presentation-project';

describe('typed presentation failure classification', () => {
  it.each([
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
  ] as const)('preserves an explicitly typed boundary error: %s', (code) => {
    const error = new PresentationFailureError(code, 'The exact user-facing explanation.');
    const result = classifyPresentationFailure(error);
    expect(result).toMatchObject({ code, message: error.message, disposition: 'terminal' });
    expect(result).not.toHaveProperty('committed');
    expect(presentationFailureSchema.safeParse(result).success).toBe(true);
  });
  it('reserves graph and data categories without inferring them from current errors', () => {
    expect(presentationFailureCodeSchema.parse('invalid_graph')).toBe('invalid_graph');
    expect(presentationFailureCodeSchema.parse('unverified_data')).toBe('unverified_data');
    expect(
      classifyPresentationFailure(new Error('The graph is invalid and data is unverified')),
    ).toBeUndefined();
  });
  it('classifies the actual provider error class and retains a wrapping user message', () => {
    const cause = new ProviderRequestError('Hugging Face', 401, 'key');
    expect(classifyPresentationFailure(cause)).toMatchObject({
      code: 'provider_unavailable',
      disposition: 'terminal',
      message: cause.message,
    });
    const wrapper = new PresentationProjectError('The presentation could not be prepared.', {
      cause,
    });
    expect(classifyPresentationFailure(wrapper)).toMatchObject({
      code: 'provider_unavailable',
      message: wrapper.message,
    });
    expect(classifyPresentationFailure(wrapper)).not.toHaveProperty('cause');
  });
  it('keeps missing-source and target questions separate from terminal failed work', () => {
    expect(
      classifyPresentationFailure(new PresentationReferenceError('The target is ambiguous.')),
    ).toMatchObject({ code: 'ambiguous_target', disposition: 'clarification' });
    expect(
      classifyPresentationFailure(new FolderResolutionError('Which Marketing folder?')),
    ).toMatchObject({ code: 'missing_source', disposition: 'clarification' });
    expect(
      classifyPresentationFailure(new PresentationQuestion('sourceImage', 'Which picture?')),
    ).toMatchObject({ code: 'missing_source', disposition: 'clarification' });
    expect(
      classifyPresentationFailure(new PresentationQuestion('imageDestination', 'Which slide?')),
    ).toMatchObject({ code: 'ambiguous_target', disposition: 'clarification' });
    expect(
      classifyPresentationFailure(new PresentationQuestion('topic', 'What should it be about?')),
    ).toBeUndefined();
  });
  it.each([
    ['stale_revision', 'stale_revision'],
    ['navigation_unverified', 'native_view_failed'],
    ['OPERATION_RECEIPT_EXPIRED', 'stale_revision'],
    ['OPERATION_ID_CONFLICT', 'stale_revision'],
    ['OPERATION_LOOKUP_UNAVAILABLE', 'file_write_failed'],
    ['PUBLICATION_RECOVERY_REQUIRED', 'file_write_failed'],
  ] as const)('maps exact machine code %s without parsing its message', (detailCode, code) => {
    const result = classifyPresentationFailure(
      Object.assign(new Error('An arbitrary explanation.'), { code: detailCode }),
    );
    expect(result).toMatchObject({ code, detailCode, disposition: 'terminal' });
  });
  it('uses explicit recovery disposition only when the executor actually offers recovery', () => {
    const error = Object.assign(new PresentationProjectError('The extra detail does not fit.'), {
      code: 'layout_capacity',
    });
    expect(classifyPresentationFailure(error)).toMatchObject({
      disposition: 'terminal',
      code: 'layout_capacity',
    });
    expect(
      classifyPresentationFailure(error, { disposition: 'recovery_offered', committed: false }),
    ).toMatchObject({ disposition: 'recovery_offered', committed: false });
    const unavailable = new PresentationCapacityRecoveryError(
      'no_fitting_split',
      'The content cannot fit over two slides.',
    );
    expect(classifyPresentationFailure(unavailable)).toMatchObject({
      code: 'layout_capacity',
      disposition: 'terminal',
      message: unavailable.message,
    });
  });
  it('uses commit evidence from the caller, including partial success before failure', () => {
    const error = new PresentationFailureError(
      'native_view_failed',
      'The file was saved, but PowerPoint could not show it.',
    );
    expect(classifyPresentationFailure(error, { committed: true })).toMatchObject({
      committed: true,
      code: 'native_view_failed',
    });
    expect(classifyPresentationFailure(error)).not.toHaveProperty('committed');
  });
  it('supports known operation boundaries without pretending generic errno identifies the operation', () => {
    const error = Object.assign(new Error('Access denied.'), { code: 'EACCES' });
    expect(classifyPresentationFailure(error)).toBeUndefined();
    expect(
      classifyPresentationFailure(error, { code: 'cloud_save_failed', committed: true }),
    ).toEqual({
      code: 'cloud_save_failed',
      disposition: 'terminal',
      message: 'Access denied.',
      detailCode: 'EACCES',
      committed: true,
    });
  });
  it.each([
    'The provider is unavailable.',
    'The source is missing.',
    'The slide does not fit.',
    'PowerPoint failed.',
    'Cloud save failed.',
  ])('does not classify an untyped exception using words: %s', (message) => {
    expect(classifyPresentationFailure(new Error(message))).toBeUndefined();
  });
  it('does not classify cancellation or an idempotent replay as failure', () => {
    expect(
      classifyPresentationFailure(new DOMException('Stopped', 'AbortError'), {
        code: 'file_write_failed',
      }),
    ).toBeUndefined();
    expect(
      classifyPresentationFailure(Object.assign(new Error('Stopped'), { code: 'STOPPED' })),
    ).toBeUndefined();
    expect(
      classifyPresentationFailure(
        Object.assign(new Error('Already saved'), { code: 'OPERATION_ALREADY_COMMITTED' }),
      ),
    ).toBeUndefined();
  });
  it('does not treat an inherited object property as a known code or traverse cause cycles forever', () => {
    expect(
      classifyPresentationFailure(Object.assign(new Error('Unknown'), { code: 'constructor' })),
    ).toBeUndefined();
    const error = new Error('Unknown');
    error.cause = error;
    expect(classifyPresentationFailure(error)).toBeUndefined();
    expect(
      classifyPresentationFailure({
        name: 'ProviderRequestError',
        message: 'Untrusted plain data',
        httpStatus: 401,
      }),
    ).toBeUndefined();
  });
});
