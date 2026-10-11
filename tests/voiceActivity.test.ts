import { describe, expect, it, vi } from 'vitest';
import { createVoiceActivity, observeVoicePlayback } from '../src/voiceActivity';

describe('semantic voice activity', () => {
  it('only accepted speech advances input activity; ending/resetting is idempotent', () => {
    let now = 100;
    const owner = createVoiceActivity(() => now);
    const changed = vi.fn();
    const unsubscribe = owner.subscribe(changed);
    expect(owner.getSnapshot().speechRevision).toBe(0);
    owner.endUtterance();
    expect(changed).not.toHaveBeenCalled();
    owner.acceptedSpeech(true);
    expect(owner.getSnapshot()).toMatchObject({
      speechRevision: 1,
      lastSpeechAt: 100,
      utteranceActive: true,
    });
    now = 900;
    owner.endUtterance();
    expect(owner.getSnapshot()).toMatchObject({
      speechRevision: 1,
      lastSpeechAt: 100,
      utteranceActive: false,
    });
    owner.acceptedSpeech(false);
    expect(owner.getSnapshot()).toMatchObject({ speechRevision: 2, lastSpeechAt: 900 });
    unsubscribe();
    owner.endUtterance();
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('keeps final reply pending until matching playback settles, rejecting stale and duplicate events', () => {
    const owner = createVoiceActivity();
    const acknowledgment = owner.beginOutput();
    const final = owner.beginOutput('task-7:final');
    owner.outputState(acknowledgment, 'playing');
    owner.settleOutput(acknowledgment, 'ended');
    expect(owner.getSnapshot().output).toEqual({
      generation: final,
      replyId: 'task-7:final',
      state: 'pending',
    });
    owner.outputState(final, 'playing');
    owner.outputState(final, 'pending');
    expect(owner.getSnapshot().output?.state).toBe('pending');
    owner.outputState(final, 'playing');
    owner.settleOutput(final, 'ended');
    const settled = owner.getSnapshot();
    owner.outputState(final, 'playing');
    owner.settleOutput(final, 'error');
    owner.cancelOutput('cancelled');
    expect(owner.getSnapshot()).toBe(settled);
    expect(settled.output?.reason).toBe('ended');
  });

  it('preserves explicit pause versus output skip even when cleanup follows', () => {
    const owner = createVoiceActivity();
    owner.beginOutput('paused-task');
    owner.cancelOutput('paused');
    owner.cancelOutput('cancelled');
    expect(owner.getSnapshot().output?.reason).toBe('paused');
    owner.beginOutput('skipped-task');
    owner.cancelOutput('skipped');
    owner.cancelOutput('cancelled');
    expect(owner.getSnapshot().output?.reason).toBe('skipped');
  });

  it('observes native playback and detaches old elements without another audio graph', () => {
    const owner = createVoiceActivity();
    const generation = owner.beginOutput('native');
    const old = new EventTarget();
    const next = new EventTarget();
    let current = old;
    const observe = (audio: EventTarget) =>
      observeVoicePlayback(
        audio as HTMLAudioElement,
        () => current === audio,
        (state) => owner.outputState(generation, state),
      );
    const detach = observe(old);
    old.dispatchEvent(new Event('playing'));
    expect(owner.getSnapshot().output?.state).toBe('playing');
    old.dispatchEvent(new Event('waiting'));
    expect(owner.getSnapshot().output?.state).toBe('pending');
    detach();
    current = next;
    const detachNext = observe(next);
    old.dispatchEvent(new Event('playing'));
    expect(owner.getSnapshot().output?.state).toBe('pending');
    next.dispatchEvent(new Event('playing'));
    expect(owner.getSnapshot().output?.state).toBe('playing');
    next.dispatchEvent(new Event('pause'));
    expect(owner.getSnapshot().output?.state).toBe('pending');
    detachNext();
  });
});
