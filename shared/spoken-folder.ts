/** Folder clarification parsing has no filesystem access or execution side effects. */
export type SpokenFolderLocation = 'desktop' | 'documents' | 'downloads';

export interface SpokenFolderReference {
  name: string | null;
  location: SpokenFolderLocation | null;
  kind: 'explicit' | 'bare' | 'location';
  /** A source-selection hint; callers must implement or clarify it themselves. */
  imageLimit: 1 | null;
}

export interface SpokenFolderContext {
  awaitingName?: boolean;
  previousName?: string | null;
}

const locationPhrase = /\b(?:on|in|at)\s+(?:(?:my|the|your)\s+)?(desktop|documents?|downloads?)\b/i;
const absolutePath = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/;
const taskStart =
  /^(?:(?:can|could|would|will)\s+you\b|(?:i\s+(?:want|need|would)|please|open|go|click|press|read|describe|explain|review|select|use|add|insert|include|change|replace|swap|move|create|make|build|prepare|write|analy[sz]e|search|find|browse|research|start|stop|cancel|save|resume|undo|hi|hello|how|what|why|where|when|is|are|do|does|should|no|never)\b)/i;
const nonNames =
  /^(?:a|an|my|the|this|that|your|it|folder|desktop|documents?|downloads?|on|in|at|yes|yeah|sure|okay|ok|go ahead|i uploaded it|you choose|clean blue|blue|bright minimal|dark minimal|light minimal|minimal|dark|light|white)$/i;

function locationOf(text: string): SpokenFolderLocation | null {
  const match = text.match(locationPhrase)?.[1];
  if (!match) return null;
  return /^desktop$/i.test(match)
    ? 'desktop'
    : /^documents?$/i.test(match)
      ? 'documents'
      : 'downloads';
}

function withoutFillers(text: string): string {
  return text.replace(/^(?:(?:well|um|uh|okay|ok|yes|yeah|sure|actually|so)[,\s.]+)+/i, '');
}

function withoutSpeechPauses(text: string): string {
  // Only normalize pauses after folder/location grammar. Quoted names remain literal.
  return text.replace(
    /["“][^"”]*["”]|\b((?:my|the|your|on|in|at|from|called|named)|(?:it|that|there|which)(?:['’]s| is)|the folder is)(?:\s*,\s*|\s+(?=(?:uh|um|er|erm)\b))(?:(?:uh|um|er|erm)\b[\s,]*)*/gi,
    (match: string, prefix: string | undefined) => (prefix ? `${prefix} ` : match),
  );
}

function candidateFrom(text: string): string | null {
  let value = text.trim();
  const quoted = value.match(/^["“]([^"”]+)["”]/);
  if (quoted) value = quoted[1].trim();
  else {
    // Sentence punctuation and follow-up actions belong to the request, not the name.
    value = value
      .split(/[.!?](?:\s|$)/, 1)[0]
      .replace(locationPhrase, '\u0000')
      .split('\u0000', 1)[0]
      .replace(
        /\s+(?:and|then|with|using|to)\s+(?:please\s+)?(?:can\s+you\s+)?(?:add|insert|include|use|open|create|make|put|place|show|read|go|change|replace|swap|move|save)\b.*$/i,
        '',
      )
      .replace(
        /\s+(?:with|using)\s+(?:(?:my|the|those|these|one|two|three|four|five|six|[1-6])\s+)?(?:images?|pictures?|photos?|pngs?|jpe?gs?)\b.*$/i,
        '',
      )
      .trim();
  }
  value = value
    .replace(/^["“]|["”]$/g, '')
    .replace(/[.!?,;:]+$/, '')
    .trim();
  if (!value || value.length > 500 || /[\u0000-\u001f]/.test(value)) return null;
  return value;
}

/**
 * Extract an explicit folder reference, or a bounded answer to a pending folder question.
 * A location-only reply retains the previous name even when followed by a slide command.
 * This only produces literal strings; path authorization remains the resolver's job.
 */
export function parseSpokenFolderReference(
  request: string,
  context: SpokenFolderContext = {},
): SpokenFolderReference | null {
  if (!request.trim() || request.length > 2048 || /[\u0000-\u001f]/.test(request)) return null;
  const literalText = withoutFillers(request.trim());
  const text = withoutSpeechPauses(literalText);
  if (/^(?:what|which|where|why|how|when)\b/i.test(text)) return null;
  const location = locationOf(text);
  const imageLimit: 1 | null =
    /\b(?:just|only|use|add|include)\s+(?:a\s+)?(?:one|1|single)\s+(?:png|jpe?g|image|picture|photo)\b/i.test(
      text,
    )
      ? 1
      : null;
  const answer = (
    name: string | null,
    kind: SpokenFolderReference['kind'],
  ): SpokenFolderReference => ({
    name,
    location,
    kind,
    imageLimit,
  });

  const quotedPath = literalText.match(/["“]((?:[A-Za-z]:[\\/]|\\\\)[^"”]+)["”]/)?.[1];
  const pathText =
    quotedPath ??
    literalText.match(/\b(?:folder|from|in|called|named)\s+((?:[A-Za-z]:[\\/]|\\\\).+)/i)?.[1] ??
    (absolutePath.test(literalText) ? literalText : null);
  if (pathText) {
    const name = quotedPath ? quotedPath.trim() : candidateFrom(pathText);
    if (name && absolutePath.test(name)) return answer(name, 'explicit');
  }

  const namedText =
    text.match(/\bfolder\s+(?:(?:is|was)\s+)?(?:called|named)\s+(.+)/i)?.[1] ??
    text.match(
      /^(?:it(?:['’]s| is)|that(?:['’]s| is)|there(?:['’]s| is))\s+(?:called|named)\s+(.+)/i,
    )?.[1] ??
    text.match(/\bfolder\s+is\s+(.+)/i)?.[1];
  if (namedText) {
    const name = candidateFrom(namedText);
    if (name && !nonNames.test(name)) return answer(name, 'explicit');
  }

  const beforeFolder =
    text.match(/["“]([^"”]+)["”]\s+folder\b/i)?.[1] ??
    text.match(
      /\b(?:my|the|your)\s+((?:(?!\b(?:my|the|your|from|in)\b)[^,.!?"“”])+?)\s+folder\b/i,
    )?.[1] ??
    text.match(
      /^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:open|go to|use|select|click|double.?click)\s+(.+?)\s+folder\b/i,
    )?.[1] ??
    text.match(
      /^([^,.!?"“”]+?)\s+folder(?:\s*,?\s+(?:(?:is|(?:that|which)(?:['’]s| is))\s+)?(?:on|in|at)\b|[.!?]*$)/i,
    )?.[1];
  if (beforeFolder) {
    const name = candidateFrom(beforeFolder.replace(/^(?:my|the|your)\s+/i, ''));
    if (name && !nonNames.test(name) && !taskStart.test(name)) return answer(name, 'explicit');
  }
  const afterFolder = text.match(/\bfolder\s+(.+)/i)?.[1];
  if (
    afterFolder &&
    !/^(?:called|named|and|with|to|then|using|use|on|in|at|is|are|that|which|images?|pictures?|photos?|assets?)\b/i.test(
      afterFolder,
    )
  ) {
    const name = candidateFrom(afterFolder);
    if (name && !nonNames.test(name) && !taskStart.test(name)) return answer(name, 'explicit');
  }

  if (!context.awaitingName && !context.previousName) return null;
  if (location && /^(?:(?:it|that|the folder)(?:['’]s| is)\s+)?(?:on|in|at)\b/i.test(text))
    return answer(context.previousName ?? null, 'location');
  if (/^(?:desktop|documents?|downloads?)[.!?]*$/i.test(text)) {
    const normalized = text.replace(/[.!?]*$/, '').toLowerCase();
    return {
      ...answer(context.previousName ?? null, 'location'),
      location:
        normalized === 'desktop'
          ? 'desktop'
          : /^documents?$/.test(normalized)
            ? 'documents'
            : 'downloads',
    };
  }

  if (!context.awaitingName) return null;
  const bare = text.replace(/^(?:it(?:['’]s| is)|the folder is)\s+/i, '');
  if (taskStart.test(bare) || /\?$/.test(bare)) return null;
  const name = candidateFrom(bare);
  if (
    !name ||
    name.length > 80 ||
    nonNames.test(name) ||
    taskStart.test(name) ||
    /[\\/]/.test(name)
  )
    return null;
  return answer(name, 'bare');
}
