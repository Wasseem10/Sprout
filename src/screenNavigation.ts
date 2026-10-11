import type { ComputerResult, ComputerState, ScreenPointer } from '../shared/computer';

export function screenNavigationGoal(request: string) {
  if (wantsCurrentScreen(request)) return null;
  request = request
    .trim()
    .replace(/^(?:hey\s+)?insight(?:\s+os)?[,.!]?\s+/i, '')
    .replace(/^(?:and\s+|can you\s+|could you\s+|please\s+)/i, '');
  const match = request.match(
    /^(?:navigate|help me navigate|take control(?: of my (?:screen|computer))?|control my (?:screen|computer)|use my (?:screen|computer))\s+(?:to\s+|and\s+)?(.+)$/i,
  );
  if (match) return match[1].trim();
  if (
    /\b(?:on|in) (?:my|the) (?:screen|desktop|computer)\b/i.test(request) &&
    /\b(?:then|and then)\b/i.test(request)
  )
    return request;
  return null;
}

export function wantsCurrentScreen(request: string) {
  const text = request
    .trim()
    .replace(/^(?:hey\s+)?insight(?:\s+os)?[,.!]?\s+/i, '')
    .replace(/^(?:and\s+|can you\s+|could you\s+|please\s+)/i, '');
  return (
    /^(?:use|see|look at|take (?:over|control of)|control) (?:my|the|this) (?:screen|desktop|computer)[.!?]*$/i.test(
      text,
    ) ||
    /\b(?:describe|read|what|tell me|look at|see)\b.*\b(?:screen|display|desktop)\b/i.test(text) ||
    /^(?:what (?:do|can) you see|can you see (?:it|this))[.!?]*$/i.test(text)
  );
}
type Capture = { name: string; image: string; captureId: string };
type Controls = {
  capture(): Promise<Capture>;
  observe(capture: Capture, signal: AbortSignal): Promise<ComputerState>;
  decide(goal: string, history: string[], signal: AbortSignal): Promise<ComputerResult>;
  click(capture: Capture, pointer: ScreenPointer): Promise<{ target: string }>;
  scroll(direction: 'up' | 'down'): Promise<unknown>;
  phase(message: string): void;
  settle(): Promise<void>;
  pause?(): Promise<ComputerState>;
};
export async function runScreenNavigation(goal: string, controls: Controls, signal: AbortSignal) {
  const history: string[] = [];
  let priorImage = '';
  for (let turn = 0; turn <= 6; turn++) {
    signal.throwIfAborted();
    controls.phase('Looking at the updated screen');
    const capture = await controls.capture();
    signal.throwIfAborted();
    const state = await controls.observe(capture, signal);
    if (priorImage === capture.image)
      return {
        state: controls.pause ? await controls.pause() : state,
        summary:
          'The screen did not visibly change after that action, so I stopped. Tell me what to try next.',
        clarification: true,
        tool: 'nextScreenStep' as const,
      };
    controls.phase('Choosing the next screen step');
    const next = await controls.decide(goal, [...history], signal);
    signal.throwIfAborted();
    if (!next.screenStep || ['done', 'ask'].includes(next.screenStep.decision)) return next;
    if (history.length >= 6)
      return {
        state: next.state,
        summary:
          'I completed six navigation actions. Tell me the next step, or say navigate followed by your goal to continue.',
        clarification: true,
        tool: 'nextScreenStep' as const,
      };
    priorImage = capture.image;
    if (next.screenStep.decision === 'click' && next.pointer) {
      controls.phase(`Clicking ${next.pointer.observedText}`);
      signal.throwIfAborted();
      const clicked = await controls.click(capture, next.pointer);
      history.push(`Clicked ${clicked.target}`);
    } else if (next.screenStep.decision === 'scroll' && next.screenStep.direction) {
      controls.phase(`Scrolling ${next.screenStep.direction}`);
      signal.throwIfAborted();
      await controls.scroll(next.screenStep.direction);
      history.push(`Scrolled ${next.screenStep.direction}`);
    } else
      return {
        ...next,
        pointer: undefined,
        clarification: true,
        summary: 'I could not validate the next screen action. Nothing was clicked.',
      };
    signal.throwIfAborted();
    await controls.settle();
  }
  throw new Error('The screen navigation stopped.');
}
