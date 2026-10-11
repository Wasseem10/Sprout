import {
  isTargetedPresentationOperation,
  normalizePresentationTranscript,
  type PresentationIntentContext,
  type PresentationSlideTarget,
  type PresentationTurnIntent,
} from './presentation-intent.js';

/** Reference validation only: this module never identifies or dispatches an action. */
export class PresentationReferenceError extends Error {
  constructor(
    message: string,
    readonly question = 'Which slide should each change apply to? Please give its number or full title.',
  ) {
    super(message);
    this.name = 'PresentationReferenceError';
  }
}
type Slide = { index: number; title: string };
type Mention = {
  start: number;
  end: number;
  values: PresentationSlideTarget[];
  negated: boolean;
  weakTitle?: boolean;
};
const cardinal = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];
const ordinal = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
];
const numberWords = new Map([
  ...cardinal.map((word, index) => [word, index + 1] as const),
  ...ordinal.map((word, index) => [word, index + 1] as const),
]);
const numericPattern = `(?:\\d+(?:st|nd|rd|th)?|${[...numberWords.keys()].join('|')})`;
const relativePattern = '(?:last|current|next|previous)';
const referencePattern = new RegExp(
  `\\b(?:slide[\\s,]+(?:number[\\s,]+)?(${numericPattern}|${relativePattern})|(${numericPattern}|${relativePattern})[\\s,]+slide)\\b`,
  'g',
);
const titleStopWords = new Set(
  'a an the of on in to for and or with is it this that my your our slide slides presentation deck read add make text title current next last previous first please'.split(
    ' ',
  ),
);
const text = (value: string) =>
  normalizePresentationTranscript(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
const words = (value: string) => text(value).match(/[\p{L}\p{N}]+/gu) ?? [];
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function number(value: string): number | undefined {
  if (/^\d+(?:st|nd|rd|th)?$/.test(value)) return Number.parseInt(value, 10);
  return numberWords.get(value);
}
function literalTarget(value: string): PresentationSlideTarget | undefined {
  return (
    number(value) ??
    (['last', 'current', 'next', 'previous'].includes(value)
      ? (value as PresentationSlideTarget)
      : undefined)
  );
}
function negatedAt(transcript: string, start: number): boolean {
  const prefix = transcript.slice(Math.max(0, start - 140), start);
  return (
    /\b(?:not|except|rather than|instead of)\s+(?:(?:the|on|to|at)\s+)*$/.test(prefix) ||
    /\b(?:don't|do not|never)\b[^,;.!?]*$/.test(prefix)
  );
}
function titleValues(quote: string, slides: Slide[]): number[] {
  const needle = words(quote);
  if (!needle.some((word) => !titleStopWords.has(word))) return [];
  return slides
    .filter((slide) => {
      const title = ` ${words(slide.title).join(' ')} `;
      return title.includes(` ${needle.join(' ')} `);
    })
    .map((slide) => slide.index);
}
function mentions(transcript: string, slides: Slide[]): Mention[] {
  const found: Mention[] = [];
  const bare = literalTarget(transcript.replace(/^the\s+/, ''));
  if (bare !== undefined)
    found.push({ start: 0, end: transcript.length, values: [bare], negated: false });
  for (const match of transcript.matchAll(referencePattern)) {
    const target = literalTarget(match[1] ?? match[2]);
    if (target !== undefined)
      found.push({
        start: match.index,
        end: match.index + match[0].length,
        values: [target],
        negated: negatedAt(transcript, match.index),
      });
  }
  const list = new RegExp(
    `\\bslides[\\s,]+${numericPattern}(?:\\s*(?:,|and|&|to|through)\\s*${numericPattern})*\\b`,
    'g',
  );
  for (const match of transcript.matchAll(list)) {
    for (const token of match[0].matchAll(new RegExp(`\\b${numericPattern}\\b`, 'g'))) {
      const start = match.index + token.index;
      found.push({
        start,
        end: start + token[0].length,
        values: [number(token[0])!],
        negated: negatedAt(transcript, match.index),
      });
    }
  }
  const fragments = new Set<string>();
  for (const slide of slides) {
    const title = words(slide.title);
    for (let start = 0; start < title.length; start++)
      for (let end = start + 1; end <= title.length; end++) {
        const fragment = title.slice(start, end);
        if (fragment.some((word) => !titleStopWords.has(word))) fragments.add(fragment.join(' '));
      }
  }
  for (const fragment of fragments) {
    const expression = new RegExp(
      `(?<![\\p{L}\\p{N}])${fragment.split(' ').map(escapePattern).join('[^\\p{L}\\p{N}]+')}(?![\\p{L}\\p{N}])`,
      'gu',
    );
    for (const match of transcript.matchAll(expression))
      found.push({
        start: match.index,
        end: match.index + match[0].length,
        values: titleValues(fragment, slides),
        negated: negatedAt(transcript, match.index),
        weakTitle:
          words(fragment).filter((word) => !titleStopWords.has(word)).length < 2 &&
          !slides.some((slide) => words(slide.title).join(' ') === fragment),
      });
  }
  // A full title is stronger evidence than its nested generic title fragments.
  return found.filter(
    (item) =>
      !found.some(
        (other) =>
          other !== item &&
          other.start <= item.start &&
          other.end >= item.end &&
          other.end - other.start > item.end - item.start,
      ),
  );
}
function resolveQuotedReference(
  quote: string,
  transcript: string,
  slides: Slide[],
  allowedWeakIndex?: number,
  allowedContextIndex?: number,
): PresentationSlideTarget {
  const normalized = text(quote);
  const quotedWords = words(normalized);
  const occurrences = quotedWords.length
    ? [
        ...transcript.matchAll(
          new RegExp(
            `(?<![\\p{L}\\p{N}])${quotedWords.map(escapePattern).join('[^\\p{L}\\p{N}]+')}(?![\\p{L}\\p{N}])`,
            'gu',
          ),
        ),
      ]
    : [];
  if (!occurrences.length)
    throw new PresentationReferenceError(
      'The reference quote was not spoken in this turn. Copy the exact target words from the transcript, not from history.',
    );
  if (occurrences.some((match) => negatedAt(transcript, match.index)))
    throw new PresentationReferenceError(
      'The quoted target occurs in a negated reference. Quote the affirmative corrected target, including enough context to distinguish it.',
    );
  const direct = literalTarget(normalized);
  if (direct !== undefined) {
    const explicit = mentions(transcript, []).filter((item) => !item.negated);
    if (
      !occurrences.some((occurrence) =>
        explicit.some(
          (item) =>
            item.start <= occurrence.index && item.end >= occurrence.index + occurrence[0].length,
        ),
      )
    )
      throw new PresentationReferenceError(
        'A bare number or ordinal is not a slide reference here. Quote its slide-reference phrase, not a slide count, date or value from content.',
      );
  }
  const quotedMentions = mentions(normalized, slides);
  if (
    quotedMentions.some(
      (item) => item.weakTitle && (item.values.length !== 1 || item.values[0] !== allowedWeakIndex),
    )
  )
    throw new PresentationReferenceError(
      'A single general title word is not enough to identify a slide. Ask for the slide number or fuller title.',
      'Which slide do you mean? Please give its number or more of its title.',
    );
  const resolved = [
    ...new Set(direct !== undefined ? [direct] : quotedMentions.flatMap((item) => item.values)),
  ];
  // A verbatim anaphoric reference can use one unambiguous current context. It must
  // not contain (or compete with) any literal number/title reference in this turn.
  if (!resolved.length && !quotedMentions.length && /\b(?:it|this|that|you)\b/.test(normalized) && allowedContextIndex !== undefined && !mentions(transcript, slides).length)
    return allowedContextIndex;
  if (resolved.length !== 1)
    throw new PresentationReferenceError(
      'The reference does not identify one existing slide. Use a distinct full title or explicit slide number.',
      'Which slide do you mean? Please give its number or full title.',
    );
  return resolved[0];
}
function position(
  target: PresentationSlideTarget,
  count: number | undefined,
  context: PresentationIntentContext,
): number | undefined {
  if (typeof target === 'number') return target;
  if (target === 'first') return 1;
  if (target === 'last') return count;
  const current =
    context.lastRequestedTarget?.index ??
    context.activePresentation?.verifiedSelectedSlide ??
    context.activePresentation?.reviewedSlide;
  if (!current) return undefined;
  return target === 'next' ? current + 1 : target === 'previous' ? current - 1 : current;
}

/** Validates model targets against actual utterance references before executor-owned ID binding. */
export function validatePresentationReferences(
  intent: PresentationTurnIntent,
  request: string,
  context: PresentationIntentContext,
): PresentationTurnIntent {
  if (intent.domain !== 'presentation' || ['question', 'cancellation'].includes(intent.kind))
    return intent;
  const create = intent.operations.find((operation) => operation.type === 'create');
  const creating = !!create || (!intent.startsNewTask && context.draft?.workflow === 'create');
  const count = creating
    ? (intent.fields.totalSlides ?? create?.totalSlides ?? context.draft?.fields.totalSlides)
    : context.activePresentation?.slideCount;
  const slides = creating ? [] : (context.activePresentation?.slides ?? []);
  const failedBinding = context.lastFailedTask?.operations[0]?.binding;
  const allowedWeakIndex =
    !creating &&
    failedBinding &&
    context.lastFailedTask?.operations.length === 1 &&
    failedBinding.projectId === context.activePresentation?.projectId &&
    failedBinding.boundRevision === context.activePresentation?.revision
      ? context.activePresentation?.slides?.find(
          (slide) => slide.id === failedBinding.targetSlideId,
        )?.index
      : undefined;
  const transcript = text(request);
  const found = mentions(transcript, slides);
  const positive = found.filter((item) => !item.negated);
  const values = [...new Set(positive.flatMap((item) => item.values))];
  const ambiguous = positive.some(
    (item) => item.values.length !== 1 || (item.weakTitle && item.values[0] !== allowedWeakIndex),
  );
  const multiple = values.length > 1;
  const active = context.activePresentation;
  const requested = context.lastRequestedTarget;
  const contextualPositions = [...new Set([
    active?.reviewedSlide, active?.verifiedSelectedSlide,
    requested && requested.projectId === active?.projectId && requested.revision === active?.revision ? requested.index : undefined,
  ].filter((index): index is number => index !== undefined))];
  const unambiguousContext = !creating && contextualPositions.length === 1 ? contextualPositions[0] : undefined;
  const result: PresentationTurnIntent = {
    ...intent,
    fields: { ...intent.fields },
    operations: intent.operations.map((operation) => ({ ...operation })),
  };
  for (const operation of result.operations) {
    if (!isTargetedPresentationOperation(operation)) continue;
    for (const key of operation.type === 'move_slide'
      ? (['target', 'before'] as const)
      : (['target'] as const)) {
      const quote =
        key === 'target'
          ? operation.targetReference
          : operation.type === 'move_slide'
            ? operation.beforeReference
            : undefined;
      const target =
        key === 'target'
          ? operation.target
          : operation.type === 'move_slide'
            ? operation.before
            : undefined;
      let resolved: PresentationSlideTarget | undefined;
      if (quote) resolved = resolveQuotedReference(quote, transcript, slides, allowedWeakIndex,
        position(target ?? 'current', count, context) === unambiguousContext ? unambiguousContext : undefined);
      else if (operation.type === 'move_slide' && found.length) {
        const otherQuote = key === 'target' ? operation.beforeReference : operation.targetReference;
        if (
          otherQuote &&
          (target === 'current' ||
            position(target ?? 'current', count, context) === position('current', count, context))
        )
          continue;
        throw new PresentationReferenceError(
          'Moving a slide has two reference roles. Quote each explicit reference in targetReference and beforeReference; retain current only for a context-supported implicit role.',
        );
      } else if (multiple || ambiguous)
        throw new PresentationReferenceError(
          'Multiple or ambiguous slide references occur in this turn. Provide targetReference for every targeted operation and beforeReference for move_slide, each quoting that operation’s actual affirmative reference.',
        );
      else if (values.length === 1) resolved = values[0];
      // No fresh reference leaves a genuinely contextual target to the executor's stable binding rules.
      if (resolved === undefined) continue;
      const resolvedPosition = position(resolved, count, context);
      if (
        resolvedPosition !== undefined &&
        (resolvedPosition < 1 || (count !== undefined && resolvedPosition > count))
      )
        throw new PresentationReferenceError(
          `The spoken slide reference is outside the ${creating ? 'new' : 'active'} presentation's known slide count. Ask which valid slide to use.`,
          `That slide is outside this presentation. Which slide should I use${count ? `, from one to ${count}` : ''}?`,
        );
      if (
        quote &&
        target !== undefined &&
        target !== resolved &&
        position(target, count, context) !== resolvedPosition
      )
        throw new PresentationReferenceError(
          `The target ${target} contradicts its quoted reference ${quote}. Return target ${resolved}, retaining the operation requested for that reference.`,
        );
      if (key === 'target') operation.target = resolved;
      else if (operation.type === 'move_slide') operation.before = resolved;
    }
  }
  const images = result.operations.filter((operation) => operation.type === 'insert_image');
  if (images.length === 1 && images[0].target !== undefined)
    result.fields.imageDestination = images[0].target;
  else if (
    !result.operations.some(isTargetedPresentationOperation) &&
    result.fields.imageDestination !== undefined
  ) {
    if (multiple || ambiguous)
      throw new PresentationReferenceError(
        'The target-only answer mentions multiple slides. Ask which one the pending operation should use.',
      );
    if (values.length === 1) result.fields.imageDestination = values[0];
  }
  return result;
}
