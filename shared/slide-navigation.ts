export type SlideTarget = number | 'next' | 'previous' | 'first' | 'last';

const numbers: Record<string, number> = {
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
};

export function spokenSlideTarget(request: string): SlideTarget | null {
  const text = request
    .trim()
    .replace(/^(?:hey[,.!]?\s+)?insight(?:\s*os)?[,.!]?\s+/i, '')
    .replace(/^hey[,.!]?\s+/i, '')
    .replace(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?/i, '')
    .replace(/\s+please[.!?]*$/i, '')
    .replace(/[.!?]+$/, '');
  const relative = text.match(/^(next|previous|prior|first|last)\s+slide$/i);
  if (relative)
    return relative[1].toLowerCase() === 'prior'
      ? 'previous'
      : (relative[1].toLowerCase() as SlideTarget);
  const match = text.match(
    /^(?:(?:go|jump|switch|move|navigate|take me)(?:\s+to)?|open|show|select|bring up)\s+(?:me\s+)?(?:the\s+)?(.+?)[.!?]*$/i,
  );
  if (!match) return null;
  const destination = match[1].trim().replace(/[.!?]+$/, '');
  const named = destination.match(/^(next|previous|prior|first|last)\s+slide$/i);
  if (named)
    return named[1].toLowerCase() === 'prior'
      ? 'previous'
      : (named[1].toLowerCase() as SlideTarget);
  const numbered =
    destination.match(/^slide\s+(?:number\s+)?(\d+|[a-z]+)$/i) ??
    destination.match(/^(\d+)(?:st|nd|rd|th)?\s+slide$/i) ??
    destination.match(/^([a-z]+)\s+slide$/i);
  if (!numbered) return null;
  const value = numbered[1].toLowerCase();
  if (value === 'last' || value === 'next' || value === 'previous') return value;
  return /^\d+$/.test(value) ? Number(value) : (numbers[value] ?? null);
}
