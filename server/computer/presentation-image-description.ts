import type { PresentationIntentContext, PresentationOperation, PresentationSlideTarget } from '../../shared/presentation-intent.js';

const text = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
const sentence = (value: string) => text(value).replace(/[.!?]+$/, '');
function targetIndex(target: PresentationSlideTarget | undefined, context: PresentationIntentContext): number | undefined {
  if (typeof target === 'number') return target;
  if (target === 'first') return 1;
  if (target === 'last') return context.activePresentation?.slideCount;
  const selected = context.activePresentation?.verifiedSelectedSlide;
  const reviewed = context.activePresentation?.reviewedSlide;
  if (target === 'next' || target === 'previous') return selected ? selected + (target === 'next' ? 1 : -1) : undefined;
  return !selected || !reviewed || selected === reviewed ? reviewed ?? selected : undefined;
}

/** A literal source span is necessary but not sufficient: it must be supplied as replacement text. */
export function hasSuppliedImageDescription(request: string, operation: Extract<PresentationOperation, { type: 'edit_image_description' }>, context: PresentationIntentContext, retry = false): boolean {
  const retained = [...(context.draft?.operations ?? []), ...(retry ? context.lastFailedTask?.operations ?? [] : [])];
  const input = text(request), description = text(operation.description);
  const bareAnswer = sentence(input) === sentence(description);
  if (!bareAnswer && retained.some(item => item.type === 'edit_image_description' && item.description === operation.description)) return true;
  const index = input.indexOf(description);
  if (index < 0) return false;
  const prefix = input.slice(0, index), suffix = input.slice(index + description.length);
  const descriptor = /\b(?:description|describe|alt(?:ernate)? text)\b/i;
  const introducing = /(?:\b(?:to|as|say|read)|\b(?:description|alt(?:ernate)? text)\s*[:=])\s*["“']?$/i;
  const says = /\b(?:it|(?:the|this|that|my)\s+(?:description|picture|image))\s+should\s+(?:say|read)\s*["“']?$/i;
  if (descriptor.test(prefix) && introducing.test(prefix) || says.test(prefix)) {
    const quoted = /["“']$/.test(prefix) && /^["”']/.test(suffix);
    if (quoted || /^[.!?\s]*$/.test(suffix)) return true;
  }
  // Bare replies are only answers to a specific retained description question.
  const pending = context.draft?.pendingQuestion;
  const targets = [...new Set((context.draft?.operations ?? []).flatMap(item => {
    if (item.type !== 'edit_image_description') return [];
    const index = item.binding
      ? item.binding.projectId === context.activePresentation?.projectId ? context.activePresentation.slides?.find(slide => slide.id === item.binding!.targetSlideId)?.index : undefined
      : item.target === undefined ? undefined : targetIndex(item.target, context);
    return index === undefined ? [] : [index];
  }))];
  const sameTarget = targets.length === 1 && (operation.target === undefined || targetIndex(operation.target, context) === targets[0]);
  return !!pending && descriptor.test(pending.question) && sameTarget && bareAnswer;
}
