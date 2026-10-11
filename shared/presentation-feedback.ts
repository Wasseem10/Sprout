import type { ComputerState } from './computer.js';

/** A file write and native view selection are separate verified outcomes. */
export function presentationNavigationFailure(
  state: ComputerState,
  current?: { savedEditSummary?: string },
): string {
  // Image history describes earlier file writes, not the action whose native
  // selection just failed. Only this response can supply a current saved edit.
  const requested = state.presentation?.desktopNavigation?.requestedSlide;
  const recovery =
    typeof requested === 'number'
      ? `You can say “go to slide ${requested}” to try selecting it again.`
      : requested === 'first' || requested === 'last'
        ? `You can say “go to the ${requested} slide” to try selecting it again.`
        : requested
          ? `I was trying to select the ${requested} slide. Tell me a slide number to try again.`
          : 'You can ask me to try the slide again.';
  return `${current?.savedEditSummary ? `${current.savedEditSummary} ` : ''}I couldn’t confirm the slide selection in PowerPoint. ${recovery}`;
}

export function groundedPresentationReply(reply: string, state: ComputerState): string {
  if (state.presentation?.desktopNavigation?.status !== 'failed') return reply;
  const reassurance =
    /\b(?:successfully|everything (?:is|seems|looks) (?:set|ready)|(?:i|you|we)(?:’ve|'ve| have)? (?:navigated|selected|opened|finished|completed)|(?:looks|seems) like.{0,60}(?:added|done|set|ready|success)|(?:you (?:are|’re|'re) (?:now )?on|(?:presentation|PowerPoint|deck) is open on) (?:the )?slide)\b/i.test(
      reply,
    );
  return reassurance ? presentationNavigationFailure(state) : reply;
}
