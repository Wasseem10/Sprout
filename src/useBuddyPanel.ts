import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  createBuddyPanelCoordinator,
  waitForBuddyViewport,
  type BuddyPanelStage,
} from './buddyPanelCoordinator';

type PanelSettings = {
  expanded: boolean;
  modalOpen: boolean;
  pet: RefObject<HTMLButtonElement | null>;
  close: RefObject<HTMLButtonElement | null>;
  input: RefObject<HTMLTextAreaElement | null>;
  feed: RefObject<HTMLDivElement | null>;
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
  const coordinator = useRef<ReturnType<typeof createBuddyPanelCoordinator> | null>(null);
  const revealFocus = useRef(false);
  const scroll = useRef(0);
  const follow = useRef(true);
  const selection = useRef<
    { start: number; end: number; direction: 'forward' | 'backward' | 'none' } | undefined
  >(undefined);

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
      if (document.hidden && animation.current?.playState === 'running') {
        try {
          animation.current.finish();
        } catch {
          animation.current.cancel();
        }
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      preference.removeEventListener('change', changed);
      window.removeEventListener('resize', zoomChanged);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  useLayoutEffect(() => {
    coordinator.current = createBuddyPanelCoordinator({
      nativeMode: async (mode, requestId) => window.insightos?.setBuddyMode?.(mode, requestId),
      layoutReady: waitForBuddyViewport,
      stage: setStage,
      beforeHide: () => {
        const current = latest.current;
        scroll.current = current.feed.current?.scrollTop ?? scroll.current;
        const input = current.input.current;
        if (input)
          selection.current = {
            start: input.selectionStart,
            end: input.selectionEnd,
            direction: input.selectionDirection,
          };
        if (!current.modalOpen) current.pet.current?.focus({ preventScroll: true });
      },
      afterReveal: () => {
        revealFocus.current = !latest.current.modalOpen;
      },
      error: (message) => {
        setError(message);
        latest.current.expansionFailed();
      },
      decorate: (expanded, signal) => {
        const element = shell.current;
        if (!element) return Promise.resolve();
        if (reduce.current || document.hidden || typeof element.animate !== 'function') {
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
    if (current.feed.current) current.feed.current.scrollTop = scroll.current;
    if (selection.current && current.input.current)
      current.input.current.setSelectionRange(
        selection.current.start,
        selection.current.end,
        selection.current.direction,
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
    toggleMotion: () => setMotionPaused((paused) => !paused),
    onScroll() {
      const feed = latest.current.feed.current;
      if (!feed || stage !== 'open') return;
      scroll.current = feed.scrollTop;
      follow.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
    },
    followNewContent() {
      const feed = latest.current.feed.current;
      if (stage === 'open' && feed && follow.current) {
        feed.scrollTop = feed.scrollHeight;
        scroll.current = feed.scrollTop;
      }
    },
  };
}
