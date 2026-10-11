import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { BuddyBehaviorInput } from './buddyBehavior';
import { SproutPresenceCoordinator, type PresenceContext } from './sproutPresence';
import { observeDesktopVisibility } from './desktopVisibility';

type Options = {
  context: PresenceContext;
  getContext: () => PresenceContext;
  pauseVoice: () => void;
};

export function useSproutPresence(options: Options) {
  const [coordinator] = useState(() => new SproutPresenceCoordinator(performance.now()));
  const latest = useRef(options);
  latest.current = options;
  const snapshot = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot);
  const nativeVisible = useRef(true);
  const getContext = () => {
    const current = latest.current.getContext();
    return { ...current, visible: current.visible && nativeVisible.current };
  };
  const evaluate = () => {
    const now = performance.now();
    if (coordinator.update(getContext(), now)) {
      // Recheck at the command boundary: media or work may have changed since the timer armed.
      if (!coordinator.update(getContext(), performance.now())) return;
      latest.current.pauseVoice();
      const current = latest.current.getContext();
      coordinator.pause(performance.now(), current.working, current.speechRevision);
    }
  };
  const evaluateRef = useRef(evaluate);
  evaluateRef.current = evaluate;
  const context = options.context;
  useEffect(() => {
    evaluateRef.current();
  }, [
    context.working,
    context.connecting,
    context.transcribing,
    context.utteranceActive,
    context.speechRevision,
    context.output,
    context.visible,
    context.canCelebrate,
    snapshot.revision,
    snapshot.completionId,
  ]);
  useEffect(() => {
    if (snapshot.nextCheck === null) return;
    const timer = setTimeout(
      () => evaluateRef.current(),
      Math.max(0, snapshot.nextCheck - performance.now()),
    );
    return () => clearTimeout(timer);
  }, [snapshot.nextCheck]);
  useEffect(() => {
    const resume = () => evaluateRef.current();
    const observation = observeDesktopVisibility((visible) => {
      nativeVisible.current = visible;
      resume();
    });
    nativeVisible.current = observation.isVisible();
    resume();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
      observation.dispose();
    };
  }, []);
  const automatic: NonNullable<BuddyBehaviorInput['automatic']> = {
    presence: snapshot.presence,
    revision: snapshot.revision,
    wake: snapshot.wake,
    joy: snapshot.joy,
    interrupt:
      context.working ||
      context.utteranceActive ||
      context.transcribing ||
      context.output?.state === 'playing',
  };
  return {
    snapshot,
    automatic,
    getSnapshot: coordinator.getSnapshot,
    activity(wake = false, supersede = false) {
      coordinator.activity(performance.now(), wake, supersede);
      evaluateRef.current();
    },
    pause() {
      latest.current.pauseVoice();
      const current = latest.current.getContext();
      coordinator.pause(performance.now(), current.working, current.speechRevision);
      evaluateRef.current();
    },
    dismiss() {
      coordinator.dismiss(performance.now());
      evaluateRef.current();
    },
    acceptCompletion(id: string, replyId: string | null) {
      coordinator.acceptCompletion(
        id,
        replyId,
        latest.current.getContext().output?.generation ?? 0,
      );
      // Result handlers register the final reply synchronously before React flushes this update.
    },
  };
}
