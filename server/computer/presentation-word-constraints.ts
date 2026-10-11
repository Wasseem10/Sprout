import type { PresentationIntentContext, PresentationTurnIntent } from '../../shared/presentation-intent.js';
import { PresentationReferenceError } from '../../shared/presentation-reference.js';

type Limits = { maximumWords?: number; reductionPercent?: number };
type Evidence = Limits & { matched: string[]; unsupported: boolean };
const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const numberWord = `(?:${[...small, ...tens, 'hundred', 'and'].join('|')})`;
const quantity = `(?:[+-]?\\d+(?:\\.\\d+)?|${numberWord}(?:[ -]+${numberWord}){0,5})`;
const lengthSubject = `(?:it|this|that|the|my|slide|body|text|copy|word|count|wording|content|length|on|of|\\d+|${small.slice(1).join('|')})`;
const reductionVerb = '(?:shorten|reduce|cut|trim|condense|compress|decrease)';
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
function integer(value: string): number | undefined {
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) return /^\d+$/.test(value) ? Number(value) : undefined;
  const tokens = value.split(/[ -]+/).filter(token => token !== 'and');
  let result = 0;
  if (tokens.length >= 2 && tokens[1] === 'hundred') {
    const lead = small.indexOf(tokens[0]);
    if (lead < 1 || lead > 9) return undefined;
    result = lead * 100; tokens.splice(0, 2);
  }
  if (!tokens.length) return result;
  if (tokens.length === 1 && small.includes(tokens[0])) return result + small.indexOf(tokens[0]);
  const ten = tens.indexOf(tokens[0]);
  if (ten < 0 || tokens.length > 2) return undefined;
  const unit = tokens.length === 2 ? small.indexOf(tokens[1]) : 0;
  if (unit < 0 || unit > 9) return undefined;
  return result + (ten + 2) * 10 + unit;
}
function evidence(input: string, inspectPercent: boolean): Evidence {
  const text = normalize(input), result: Evidence = { matched: [], unsupported: false };
  const spans: [number, number][] = [];
  const add = (key: keyof Limits, value: number | undefined, match: RegExpExecArray) => {
    const limit = key === 'maximumWords' ? 500 : 99;
    if (value === undefined || value < 1 || value > limit || result[key] !== undefined && result[key] !== value) result.unsupported = true;
    else result[key] = value;
    result.matched.push(match[0]); spans.push([match.index, match.index + match[0].length]);
  };
  const maximum = new RegExp(`\\b(at most|no more than|not more than|up to|maximum(?: of)?|under|fewer than|less than)\\s+(${quantity})\\s+(?:body\\s+)?words\\b`, 'g');
  for (const match of text.matchAll(maximum)) {
    const number = integer(match[2]);
    add('maximumWords', number === undefined ? undefined : number - (['under', 'fewer than', 'less than'].includes(match[1]) ? 1 : 0), match);
  }
  if (inspectPercent) {
    const percent = new RegExp(`\\b${reductionVerb}(?:\\s+${lengthSubject}){0,7}\\s+by\\s+(${quantity})\\s*(?:%|percent\\b|per cent\\b)|\\b(${quantity})\\s*(?:%|percent\\b|per cent\\b)\\s+(?:shorter|fewer words|less text)\\b`, 'g');
    for (const match of text.matchAll(percent)) add('reductionPercent', integer(match[1] ?? match[2]), match);
  }
  const residue = [...text].map((letter, index) => spans.some(([start, end]) => index >= start && index < end) ? ' ' : letter).join('');
  // Unsupported exact counts, ranges, decimal limits and fractions must not be
  // silently converted into an upper bound or a guessed percentage.
  const unhandled = new RegExp(`(?:${quantity})\\s*words\\b`, 'i');
  const unsupportedPercentage = new RegExp(`\\b${reductionVerb}(?:\\s+${lengthSubject}){0,7}\\s+(?:(?:by|to)\\s+)?${quantity}\\s*(?:%|percent\\b|per cent\\b)`, 'i');
  const fractionalLength = /\b(?:(?:by|in|to)\s+(?:(?:a|one)\s+)?(?:half|quarter|third)|halve|(?:half|(?:a|one)\s+(?:quarter|third))\s+(?:as long|shorter|less text))\b/;
  if (unhandled.test(residue) || inspectPercent && (fractionalLength.test(residue) || unsupportedPercentage.test(residue))) result.unsupported = true;
  if (spans.some(([start]) => /\b(?:not|never|instead of|rather than|don't|do not)\s*$/.test(text.slice(0, start)))) result.unsupported = true;
  return result;
}
const question = 'Should I use an upper word limit, such as “at most 40 words”, or a reduction, such as “shorten by 25 percent”? Exact counts and ranges need a clearer choice.';
function reject(message: string): never { throw new PresentationReferenceError(message, question); }

/** Validates quantitative evidence only; it never chooses an action or a slide. */
export function validatePresentationWordConstraints(intent: PresentationTurnIntent, request: string, context: PresentationIntentContext): void {
  const operations = intent.operations.filter(operation => operation.type === 'revise_slide');
  if (!operations.length) return;
  const current = evidence(request, operations.some(operation => operation.detailChange === 'shorten' || operation.reductionPercent !== undefined));
  if (current.unsupported) reject('The explicit length constraint is unsupported, contradictory or ambiguous. Ask a focused question; do not drop or approximate it.');
  const retained = [...(context.draft?.operations ?? []), ...(intent.retryFailedTask ? context.lastFailedTask?.operations ?? [] : [])];
  for (const operation of operations) {
    const constrained = operation.maximumWords !== undefined || operation.reductionPercent !== undefined;
    if (!constrained) {
      if (operation.lengthConstraintQuote) reject('Omit lengthConstraintQuote when there is no numeric length constraint.');
      continue;
    }
    if (operation.detailChange !== 'shorten') reject('Explicit shortening limits require detailChange=shorten. Other numeric editing constraints require clarification.');
    // Missing/abbreviated model quote is transport loss, not missing user intent.
    // The complete utterance already proves both value and length relationship.
    const exactCurrentLimits = current.matched.length > 0 && current.maximumWords === operation.maximumWords && current.reductionPercent === operation.reductionPercent;
    const quoteEvidence = operation.lengthConstraintQuote ? evidence(operation.lengthConstraintQuote, true) : undefined;
    const completeQuote = !!quoteEvidence?.matched.length && !quoteEvidence.unsupported && quoteEvidence.maximumWords === operation.maximumWords && quoteEvidence.reductionPercent === operation.reductionPercent;
    if (!completeQuote && exactCurrentLimits && (!operation.lengthConstraintQuote || current.matched.some(match => normalize(match).includes(normalize(operation.lengthConstraintQuote!)))))
      operation.lengthConstraintQuote = request;
    if (!operation.lengthConstraintQuote) reject('Every explicit shortening limit needs its exact user-supplied lengthConstraintQuote. Ordinary tightening has no numeric constraint.');
    const pending = retained.some(item => item.type === 'revise_slide' && item.maximumWords === operation.maximumWords && item.reductionPercent === operation.reductionPercent && item.lengthConstraintQuote === operation.lengthConstraintQuote);
    if (!pending && !normalize(request).includes(normalize(operation.lengthConstraintQuote))) reject('The shortening constraint quote was not supplied by the user or retained in the pending edit. Never invent a hidden percentage.');
    const stated = evidence(operation.lengthConstraintQuote, true);
    if (stated.unsupported || !stated.matched.length || stated.maximumWords !== operation.maximumWords || stated.reductionPercent !== operation.reductionPercent)
      reject('The numeric fields do not equal the quoted length constraint. Under N words means maximumWords=N-1; at most N means N. Never estimate a percentage from vague wording.');
  }
  for (const key of ['maximumWords', 'reductionPercent'] as const) {
    if (current[key] !== undefined && !operations.some(operation => operation[key] === current[key]))
      reject('An explicit numeric length constraint was omitted. Carry the exact requested limit, or clarify if unsupported.');
  }
}
