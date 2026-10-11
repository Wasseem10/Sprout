const presentationNoun = /\b(?:presentation|power\s?point|deck|slides?)\b/i;
const creationRequest =
  /^(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:create|make|build|prepare|generate|start)\b\s*(.*)$/i;
const naturalRequest = /^(?:i\s+(?:want|need|would like)|i['’]d like)\s+(.+)$/i;
const creationVerb =
  /^(?:creat(?:e|ing)|mak(?:e|ing)|build(?:ing)?|prepar(?:e|ing)|generat(?:e|ing)|start(?:ing)?)\b\s*(.*)$/i;

function requestedCreationBody(text: string): string | null {
  const direct = text.match(creationRequest)?.[1];
  if (direct) return direct;
  let body = text.match(naturalRequest)?.[1];
  if (!body) return null;
  let requiresCreationVerb = false;
  if (/^(?:you\s+)?to\s+/i.test(body)) {
    body = body.replace(/^(?:you\s+)?to\s+/i, '');
    requiresCreationVerb = true;
  }
  if (/^(?:(?:some|your)\s+)?help\b/i.test(body)) {
    body = body.replace(/^(?:(?:some|your)\s+)?help\s+(?:me\s+)?(?:(?:with|to)\s+)?/i, '');
    requiresCreationVerb = true;
  }
  const created = body.match(creationVerb)?.[1];
  // “I need help using PowerPoint” is an assistance request, not a fresh deck.
  return created ?? (requiresCreationVerb ? null : body);
}

function normalized(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function topicPhrase(text: string): string {
  return normalized(text)
    .replace(
      /\b(?:for|to|me|us|a|an|the|my|our|this|that|it|current|existing|editable|proposed|simple|professional|clean|blue|dark|light|white|bright|minimal|modern)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A creation verb in a question is not evidence of a new task. Generic repeated
 * requests continue the pending topic; a distinct topic or explicit new deck
 * starts over. This classifier does not resolve folders or perform any action.
 */
export function startsFreshPresentationTask(
  request: string,
  currentGoal: string | null | undefined,
): boolean {
  const text = request.trim().replace(/^(?:(?:well|um|uh|okay|ok|so)[,\s]+)+/i, '');
  const body = requestedCreationBody(text);
  if (!body) return false;
  const noun = presentationNoun.exec(body);
  if (!noun) return false;
  const before = body.slice(0, noun.index);
  const after = body.slice(noun.index + noun[0].length);
  if (/\b(?:new|another|separate|different)\b/i.test(before)) return true;
  if (!currentGoal) return true;

  // Topic-first ("a Black History Month presentation") and topic-last
  // ("a presentation for Black History Month") are both common in speech.
  const afterTopic = after.match(
    /^\s+(?:about|on(?: the topic of)?|titled|for)\s+(.+?)(?=\s+(?:using|with|from|and (?:use|include|add)|to (?:use|include|add))\b|[.!?]|$)/i,
  )?.[1];
  const topic = topicPhrase(afterTopic ?? before);
  if (!topic) return false;
  const previous = ` ${normalized(currentGoal)} `;
  return !previous.includes(` ${topic} `);
}
