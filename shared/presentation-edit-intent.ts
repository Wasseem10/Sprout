/** Pure intent helpers; these do not authorize, read, or edit any Office files. */
const slideNumbers: Record<string, number> = {
  zero: 0,
  one: 1,
  first: 1,
  two: 2,
  second: 2,
  three: 3,
  third: 3,
  four: 4,
  fourth: 4,
  five: 5,
  fifth: 5,
  six: 6,
  sixth: 6,
  seven: 7,
  seventh: 7,
  eight: 8,
  eighth: 8,
  nine: 9,
  ninth: 9,
  ten: 10,
  tenth: 10,
  eleven: 11,
  eleventh: 11,
  twelve: 12,
  twelfth: 12,
  thirteen: 13,
  thirteenth: 13,
  fourteen: 14,
  fourteenth: 14,
  fifteen: 15,
  fifteenth: 15,
  sixteen: 16,
  sixteenth: 16,
  seventeen: 17,
  seventeenth: 17,
  eighteen: 18,
  eighteenth: 18,
  nineteen: 19,
  nineteenth: 19,
  twenty: 20,
  twentieth: 20,
};
const numberWords = Object.keys(slideNumbers).join('|');
const slideAfter = new RegExp(
  `\\bslide\\s+(?:number\\s+)?(last|final|${numberWords}|-?\\d+(?:st|nd|rd|th)?)\\b`,
  'gi',
);
const slideBefore = new RegExp(
  `\\b(last|final|${numberWords}|-?\\d+(?:st|nd|rd|th)?)\\s+slide\\b`,
  'gi',
);

function spokenText(request: string): string {
  return (
    request
      .trim()
      .replace(/^(?:(?:hey|hi)[,.!]?\s+)?insight(?:\s*os)?[,.!]?\s+/i, '')
      .replace(/^(?:(?:um|uh|well|so)[,\s.]+)+/i, '')
      // Speech fillers can split the destination itself: “second, uh, slide”.
      // This is intent text only; literal source paths are parsed separately.
      .replace(/\b(?:um+|uh+|erm)\b/gi, ' ')
      .replace(/[,;]+/g, ' ')
      .replace(/\s+/g, ' ')
  );
}

export function hasExplicitImageSlide(request: string): boolean {
  const text = spokenText(request);
  return [...text.matchAll(slideAfter), ...text.matchAll(slideBefore)].length > 0;
}

/** A request to place an image in an existing slide, rather than generate a new deck. */
export function wantsExistingSlideImage(request: string): boolean {
  const text = spokenText(request);
  if (/\b(?:don't|do not|never)\s+(?:add|insert|include|put|place|use)\b/i.test(text)) return false;
  const newDeck =
    /\b(?:new|another)\s+(?:presentation|deck|power\s?point)\b/i.test(text) ||
    /\b(?:create|build|prepare|generate|start)\b[^.!?]{0,100}\b(?:presentation|deck|power\s?point|slides)\b/i.test(
      text,
    ) ||
    /\bmake\s+(?:me\s+)?(?:a|an|new|another|one|two|three|four|five|six|\d+)\b[^.!?]{0,100}\b(?:presentation|deck|power\s?point|slides)\b/i.test(
      text,
    ) ||
    /\bmake\s+(?:me\s+)?(?:a|an|new|another)\s+(?:presentation|deck|power\s?point)\b/i.test(text) ||
    /\b(?:need|want)\s+(?:(?:you|to|me|for|make|create)\s+)*(?:a|an|new)\s+(?:presentation|deck|power\s?point)\b/i.test(
      text,
    );
  if (newDeck) return false;
  return (
    /\b(?:add|insert|include|put|place|use|replace)\b/i.test(text) &&
    /\b(?:images?|pictures?|photos?|pngs?|jpe?gs?)\b/i.test(text) &&
    /\b(?:slide|(?:current|existing|open)\s+(?:presentation|deck|power\s?point))\b/i.test(text)
  );
}

/** Return a validated, one-based destination. Explicit destinations override current selection. */
export function requestedImageSlide(
  request: string,
  currentSelected: number | null | undefined,
  total: number,
): number | null {
  if (!Number.isInteger(total) || total < 1) return null;
  const text = spokenText(request);
  const explicit = [...text.matchAll(slideAfter), ...text.matchAll(slideBefore)].map((match) => {
    const token = match[1].toLowerCase();
    if (token === 'last' || token === 'final') return total;
    return slideNumbers[token] ?? Number(token.replace(/(?:st|nd|rd|th)$/, ''));
  });
  if (explicit.length) {
    const unique = new Set(explicit);
    const [value] = unique;
    return unique.size === 1 && Number.isInteger(value) && value >= 1 && value <= total
      ? value
      : null;
  }
  if (
    /\b(?:that|this|current|selected)\s+slide\b/i.test(text) &&
    typeof currentSelected === 'number' &&
    Number.isInteger(currentSelected) &&
    currentSelected >= 1 &&
    currentSelected <= total
  )
    return currentSelected;
  return null;
}

/** Ignore incomplete speech fragments instead of replaying the previous instruction. */
export function isIncompleteSpokenCommand(request: string): boolean {
  let text = spokenText(request)
    .replace(/[.!?,;:…]+$/, '')
    .trim();
  if (!text || /^(?:um|uh|well|so|a|an|the|and|to|for|please)$/i.test(text)) return true;
  text = text
    .replace(/^(?:can|could|would|will)\s+you(?:\s+please)?\s*/i, '')
    .replace(/^please\s+/i, '')
    .replace(/^i\s+(?:want|need)\s+you\s+to\s*/i, '')
    .replace(/\s+for\s+me$/i, '')
    .trim();
  if (!text) return true;
  return /^(?:create|make|build|prepare|write|open|use|add|insert|include|go|show|read|analy[sz]e|help)(?:\s+(?:me|a|an|the|to|for))*$/i.test(
    text,
  );
}
