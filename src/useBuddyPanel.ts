import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  createBuddyPanelCoordinator,
  waitForBuddyViewport,
  type BuddyPanelStage,
} from './buddyPanelCoordinator';
import { observeDesktopVisibility } from './desktopVisibility';

export type BuddyReadingMemory = {
  scrollTop: number;
  followLatest: boolean;
  selection?: { start: number; end: number; direction: 'forward' | 'backward' | 'none' };
};

type PanelSettings = {
  expanded: boolean;
  modalOpen: boolean;
  pet: RefObject<HTMLButtonElement | null>;
  close: RefObject<HTMLButtonElement | null>;
  input: RefObject<HTMLTextAreaElement | null>;
  feed: RefObject<HTMLDivElement | null>;
  readingMemory: RefObject<BuddyReadingMemory>;
  expansionFailed: () => void;
};

export function useBuddyPanel(settings: PanelSettings) {
  const latest = useRef(settings);
  latest.current = settings;
  const [stage, setStage] = useState<BuddyPanelStage>('closed');
  const [error, setError] = useState('');
  const [motionPaused, setMotionPaused] = useState(
    () => localStorage.getItem('insightos.buddyMotionPaused') === 'true',
  );
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const reduce = useRef(reducedMotion || motionPaused);
  reduce.current = reducedMotion || motionPaused;
  const shell = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const nativeVisibility = useRef<ReturnType<typeof observeDesktopVisibility> | null>(null);
  const coordinator = useRef<ReturnType<typeof createBuddyPanelCoordinator> | null>(null);
  const revealFocus = useRef(false);
  const revealed = useRef(false);
  const rememberReadingPosition = () => {
    const current = latest.current;
    const memory = current.readingMemory.current;
    const feed = current.feed.current;
    // The owner also lends these DOM refs to the replacement workspace.
    if (feed?.classList.contains('buddy-feed')) {
      memory.scrollTop = feed.scrollTop;
      memory.followLatest = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
    }
    const input = current.input.current;
    if (input?.closest('.buddy-composer'))
      memory.selection = {
        start: input.selectionStart,
        end: input.selectionEnd,
        direction: input.selectionDirection,
      };
  };

  useEffect(() => {
    localStorage.setItem('insightos.buddyMotionPaused', String(motionPaused));
  }, [motionPaused]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', changed);
    let pixelRatio = window.devicePixelRatio;
    const zoomChanged = () => {
      if (Math.abs(window.devicePixelRatio - pixelRatio) < 0.001) return;
      pixelRatio = window.devicePixelRatio;
      const current = latest.current;
      void coordinator.current?.request(current.expanded, current.modalOpen);
    };
    // Browser zoom changes CSS viewport units as well as devicePixelRatio.
    window.addEventListener('resize', zoomChanged);
    const hidden = () => {
      if (
        (document.hidden || nativeVisibility.current?.isVisible() === false) &&
        animation.current?.playState === 'running'
      ) {
        try {
          animation.current.finish();
        } catch {
          animation.current.cancel();
        }
      }
    };
    nativeVisibility.current = observeDesktopVisibility(hidden);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      preference.removeEventListener('change', changed);
      window.removeEventListener('resize', zoomChanged);
      document.removeEventListener('visibilitychange', hidden);
      nativeVisibility.current?.dispose();
      nativeVisibility.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    coordinator.current = createBuddyPanelCoordinator({
      nativeMode: async (mode, requestId) => window.insightos?.setBuddyMode?.(mode, requestId),
      layoutReady: waitForBuddyViewport,
      stage: setStage,
      beforeHide: () => {
        const current = latest.current;
        rememberReadingPosition();
        revealed.current = false;
        if (!current.modalOpen) current.pet.current?.focus({ preventScroll: true });
      },
      afterReveal: () => {
        revealed.current = true;
        revealFocus.current = !latest.current.modalOpen;
      },
      error: (message) => {
        setError(message);
        latest.current.expansionFailed();
      },
      decorate: (expanded, signal) => {
        const element = shell.current;
        if (!element) return Promise.resolve();
        if (
          reduce.current ||
          document.hidden ||
          nativeVisibility.current?.isVisible() === false ||
          typeof element.animate !== 'function'
        ) {
          animation.current?.cancel();
          animation.current = null;
          element.style.opacity = expanded ? '1' : '0';
          element.style.transform = 'none';
          return Promise.resolve();
        }
        if (!animation.current && !expanded) return Promise.resolve();
        if (!animation.current) {
          animation.current = element.animate(
            [
              { opacity: 0, transform: 'translateY(-6px) scale(.985)' },
              { opacity: 1, transform: 'translateY(0) scale(1)' },
            ],
            { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' },
          );
          animation.current.pause();
          animation.current.currentTime = 0;
        }
        const active = animation.current;
        active.updatePlaybackRate(expanded ? 1 : -220 / 160);
        active.play();
        return new Promise<void>((resolve, reject) => {
          let settled = false;
          const finish = (aborted = false) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener('abort', abort);
            if (aborted) reject(new DOMException('Panel intent changed.', 'AbortError'));
            else resolve();
          };
          const abort = () => finish(true);
          if (signal.aborted) abort();
          else {
            signal.addEventListener('abort', abort, { once: true });
            void active.finished.then(
              () => finish(),
              () => finish(),
            );
          }
        });
      },
    });
    return () => {
      // Preserve programmatic/tray workspace switches as well as the visible action.
      if (revealed.current) rememberReadingPosition();
      coordinator.current?.dispose();
      coordinator.current = null;
      animation.current?.cancel();
      animation.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (settings.expanded) setError('');
    void coordinator.current?.request(settings.expanded, settings.modalOpen);
  }, [settings.expanded, settings.modalOpen, motionPaused, reducedMotion]);

  useLayoutEffect(() => {
    if (stage !== 'open') return;
    const current = latest.current;
    const memory = current.readingMemory.current;
    if (current.feed.current) current.feed.current.scrollTop = memory.scrollTop;
    if (memory.selection && current.input.current)
      current.input.current.setSelectionRange(
        memory.selection.start,
        memory.selection.end,
        memory.selection.direction,
      );
    if (revealFocus.current) {
      current.close.current?.focus({ preventScroll: true });
      revealFocus.current = false;
    }
  }, [stage]);

  return {
    stage,
    available: stage === 'open',
    error,
    shell,
    motionPaused,
    reducedMotion,
    rememberReadingPosition,
    toggleMotion: () => setMotionPaused((paused) => !paused),
    onScroll() {
      const feed = latest.current.feed.current;
      if (!feed || stage !== 'open') return;
      const memory = latest.current.readingMemory.current;
      memory.scrollTop = feed.scrollTop;
      memory.followLatest = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
    },
    followNewContent() {
      const feed = latest.current.feed.current;
      const memory = latest.current.readingMemory.current;
      if (stage === 'open' && feed && memory.followLatest) {
        feed.scrollTop = feed.scrollHeight;
        memory.scrollTop = feed.scrollTop;
      }
    },
  };
}
