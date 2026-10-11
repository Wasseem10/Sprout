import { isExactPresentationCancellation } from '../shared/presentation-intent';

export function isOtherAssistantTurn(text: string) {
  // Mentioning Insight in a question to another assistant does not address us.
  // For example, “Hey ChatGPT, why is Insight not responding?” must not
  // interrupt Insight's current reply or start a desktop action.
  return /^(?:hey\s+|okay\s+|ok\s+)?(?:chat\s?gpt|codex|gemini|siri|alexa)\b/i.test(text.trim());
}

// Short corrections are valid turns. In particular, "no" must not wait for
// end-of-utterance transcription before stopping a spoken reply.
export function isInterruptionTranscript(value: string) {
  const text = value.trim();
  if (!text || isOtherAssistantTurn(text)) return false;
  return (
    /^(?:stop|wait|no|yes|yeah|okay|ok|open|next|back|cancel|pause|actually)[.!?]*$/i.test(text) ||
    (text.length >= 3 && text.split(/\s+/).length >= 2)
  );
}

const normalizedTurn = (text: string) =>
  text
    .toLowerCase()
    .replace(/[.!?,;:…]+$/g, '')
    .trim();

export function isUrgentVoiceTurn(text: string) {
  return (
    isExactPresentationCancellation(text) ||
    /^(?:(?:hey\s+)?insight[,.]?\s+)?(?:stop|cancel|pause|wait|no)[.!?]*$/i.test(text.trim())
  );
}

export function isIncompleteVoiceThought(text: string) {
  const value = normalizedTurn(
    normalizedTurn(text)
      .replace(/(?:[,\s]+(?:um|uh|erm|er))+$/i, '')
      .replace(/^(?:um|uh|well)[,\s]+/i, ''),
  );
  return (
    !value ||
    /\b(?:um|uh|erm|er|a|an|the|my|our|your|from|for|with|to|in|on|of|about|and|or|because|using|called|named)$/i.test(
      value,
    ) ||
    /^(?:(?:can|could|would|will) you\s+)?(?:create|make|build|prepare|add|insert|use|open)(?:\s+for me)?$/i.test(
      value,
    )
  );
}

export function voiceTurnDelay(text: string) {
  return isUrgentVoiceTurn(text) ? 0 : isIncompleteVoiceThought(text) ? 1900 : 350;
}

export function shouldJoinVoiceSegments(previous: string, next: string) {
  if (!previous || isUrgentVoiceTurn(next)) return false;
  return (
    isIncompleteVoiceThought(previous) ||
    normalizedTurn(next).startsWith(`${normalizedTurn(previous)} `) ||
    /^(?:and|with|using|from|for|to|in|on|about|that|which)\b/i.test(next.trim())
  );
}

export function joinVoiceSegments(previous: string, next: string) {
  const left = previous
    .trim()
    .replace(/[.!?…]+$/, '')
    .trim();
  const right = next
    .trim()
    .replace(/^(?:\.{2,}|…)+/, '')
    .trim();
  if (right.toLowerCase().startsWith(`${left.toLowerCase()} `)) return right;
  return `${left} ${right}`.trim();
}
