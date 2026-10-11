import { afterEach, expect, it, vi } from 'vitest';
import { config } from '../server/config';
import type { OrderedPresentationSlide } from '../shared/presentation-deck';
import { PRESENTATION_COPY_REVIEW_SYSTEM, reviewPresentationCopy } from '../server/computer/presentation-copy-review';

afterEach(() => vi.unstubAllGlobals());
const cfg = { ...config(), hfToken: 'test-only', hfWritingModel: 'configured-review-writer', hfWritingReasoningEffort: 'none' as const, cloudUrl: '', cloudPassphrase: '' };
const original: OrderedPresentationSlide = { id: 'bound-slide', type: 'text', title: 'A proposed plan', points: [
  'The proposed outreach may help residents learn about the garden. No participation increase has been measured.',
  'The team will review feedback before choosing the next activity.',
] };
const candidate: OrderedPresentationSlide = { ...original, points: [
  'Proposed outreach may help residents learn about the garden. No participation increase has been measured.',
  'The team will review feedback before choosing its next activity.',
] };
const input = { original, candidate, request: 'Make this more concise while retaining the meaning.', evidence: 'This is a proposal; no outcomes have been measured.' };
function transport(result: unknown) {
  const fetcher = vi.fn(async () => Response.json({ choices: [{ message: { content: typeof result === 'string' ? result : JSON.stringify(result) } }] }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

it('compares the bound original and candidate directly, allows synonyms, and does not request a rewrite', async () => {
  const fetcher = transport({ passed: true, issues: [] });
  expect(await reviewPresentationCopy(input, cfg, new AbortController().signal)).toEqual({ passed: true, issues: [] });
  const request = JSON.parse(String((fetcher.mock.calls[0] as unknown as [unknown, RequestInit])[1].body));
  const context = JSON.parse(request.messages[1].content);
  expect(context.original.text).toEqual([original.title, ...original.points]);
  expect(context.candidate.text).toEqual([candidate.title, ...candidate.points]);
  expect(context.request).toBe(input.request);
  expect(context.relevantEvidence).toBe(input.evidence);
  expect(request.model).toBe('configured-review-writer');
  expect(request.reasoning_effort).toBe('none');
  expect(request.response_format.json_schema.name).toBe('PresentationCopyReview');
  expect(request.messages[0].content).toBe(PRESENTATION_COPY_REVIEW_SYSTEM);
  expect(request.messages[0].content).toContain('Allow genuine synonyms');
  expect(request.messages[0].content).toContain('Never rewrite');
  expect(request.messages[0].content).toContain('A meaningful small word reduction can satisfy');
  expect(request.messages[0].content).toContain('there is no hidden percentage threshold');
  expect(request.messages[0].content).toContain('Existing concise slide phrases and labels do not all need verbs');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('returns a grounded readability failure for a newly broken sentence without treating every slide phrase as a sentence', async () => {
  const changed = { ...candidate, points: [candidate.points[0], 'The team will review feedback before.'] };
  const result = { passed: false, issues: [
    { kind: 'readability', description: 'The revision leaves the subordinate thought unfinished.', sourceQuote: 'before choosing the next activity.', candidateQuote: 'before.' },
  ] };
  transport(result);
  expect(await reviewPresentationCopy({ ...input, candidate: changed }, cfg, new AbortController().signal)).toEqual(result);
});

it('returns grounded negation/uncertainty evidence without substituting its own copy', async () => {
  const changed = { ...candidate, points: ['Outreach helps residents learn about the garden. Participation increased.', candidate.points[1]] };
  const result = { passed: false, issues: [
    { kind: 'uncertainty_change', description: 'A possible effect is stated as a certain effect.', sourceQuote: 'may help residents', candidateQuote: 'helps residents' },
    { kind: 'negation_change', description: 'An unmeasured outcome is stated as an observed result.', sourceQuote: 'No participation increase has been measured.', candidateQuote: 'Participation increased.' },
  ] };
  transport(result);
  expect(await reviewPresentationCopy({ ...input, candidate: changed }, cfg, new AbortController().signal)).toEqual(result);
});

it.each([
  { passed: true, issues: [{ kind: 'material_omission', description: 'Missing review.', sourceQuote: original.points[1], candidateQuote: '' }] },
  { passed: false, issues: [] },
  { passed: true, issues: [], replacement: 'Unauthorized rewrite' },
  { passed: false, issues: [{ kind: 'material_omission', description: 'Missing review.', sourceQuote: 'An invented source statement.', candidateQuote: '' }] },
  { passed: false, issues: [{ kind: 'uncertainty_change', description: 'Missing condition.', sourceQuote: 'may help residents', candidateQuote: '' }] },
  { passed: false, issues: [{ kind: 'unsupported_addition', description: 'An unsupported outcome.', sourceQuote: '', candidateQuote: 'Attendance doubled.' }] },
  'not JSON',
])('fails closed on malformed or ungrounded review %# without retrying', async result => {
  const fetcher = transport(result);
  await expect(reviewPresentationCopy(input, cfg, new AbortController().signal)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('allows an omitted-source issue to quote only the original, and an unsupported-addition issue to quote only the candidate', async () => {
  const changed = { ...candidate, points: [candidate.points[0], 'Attendance doubled.'] };
  const result = { passed: false, issues: [
    { kind: 'material_omission', description: 'The feedback review prerequisite was removed.', sourceQuote: original.points[1], candidateQuote: '' },
    { kind: 'unsupported_addition', description: 'No evidence supports an attendance result.', sourceQuote: '', candidateQuote: 'Attendance doubled.' },
  ] };
  transport(result);
  expect(await reviewPresentationCopy({ ...input, candidate: changed }, cfg, new AbortController().signal)).toEqual(result);
});

it('rejects mismatched targets before any provider request', async () => {
  const fetcher = transport({ passed: true, issues: [] });
  await expect(reviewPresentationCopy({ ...input, candidate: { ...candidate, id: 'another-slide' } }, cfg, new AbortController().signal)).rejects.toThrow('same bound slide');
  expect(fetcher).not.toHaveBeenCalled();
});

it('does not cache a previous candidate review', async () => {
  const fetcher = transport({ passed: true, issues: [] });
  await reviewPresentationCopy(input, cfg, new AbortController().signal);
  await reviewPresentationCopy({ ...input, candidate: { ...candidate, points: [...candidate.points].reverse() } }, cfg, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('propagates provider failure and late cancellation instead of accepting unreviewed content', async () => {
  const fetcher = vi.fn(async () => new Response('{}', { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(reviewPresentationCopy(input, cfg, new AbortController().signal)).rejects.toThrow('503');
  expect(fetcher).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  vi.stubGlobal('fetch', vi.fn(async () => { controller.abort(); return Response.json({ choices: [{ message: { content: '{"passed":true,"issues":[]}' } }] }); }));
  await expect(reviewPresentationCopy(input, cfg, controller.signal)).rejects.toThrow();
});
