import { useLayoutEffect, useRef, type RefObject } from 'react';
import { observeDesktopVisibility } from './desktopVisibility';
import { observeDesktopDrag } from './desktopDrag';

type Pose = { yaw: number; pitch: number };
const clamp = (value: number) => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));

/** Presentation-only state. A held press wins over editing/menu neutralization. */
export function createBuddyTiltModel() {
  let current: Pose = { yaw: 0, pitch: 0 };
  let target: Pose = { yaw: 0, pitch: 0 };
  let pointer = { x: 0, y: 0 };
  let allowed = false;
  let restrained = false;
  let pressed = false;
  const retarget = () => {
    target = pressed
      ? { ...current }
      : allowed && !restrained
        ? { yaw: pointer.x * 1.2, pitch: -pointer.y * 0.45 || 0 }
        : { yaw: 0, pitch: 0 };
  };
  return {
    pose: () => ({ ...current }),
    pending: () => Math.abs(target.yaw - current.yaw) + Math.abs(target.pitch - current.pitch) > 0,
    setAllowed(next: boolean) {
      allowed = next;
      if (!next) {
        current = { yaw: 0, pitch: 0 };
        pointer = { x: 0, y: 0 };
        pressed = false;
      }
      retarget();
    },
    restrain(next: boolean) {
      restrained = next;
      retarget();
    },
    point(x: number, y: number) {
      if (!allowed) return;
      pointer = { x: clamp(x), y: clamp(y) };
      retarget();
    },
    press() {
      if (!allowed) return;
      pressed = true;
      retarget();
    },
    release(cancelled = false) {
      pressed = false;
      if (cancelled) pointer = { x: 0, y: 0 };
      retarget();
    },
    advance(seconds: number) {
      const blend = 1 - Math.exp(-18 * Math.max(0, seconds));
      current = {
        yaw: current.yaw + (target.yaw - current.yaw) * blend,
        pitch: current.pitch + (target.pitch - current.pitch) * blend,
      };
      if (Math.abs(target.yaw - current.yaw) + Math.abs(target.pitch - current.pitch) < 0.001)
        current = { ...target };
      return { ...current };
    },
  };
}

type Settings = {
  surface: RefObject<HTMLElement | null>;
  plane: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  motion: boolean;
  blocked: boolean;
};

/** One settling-only loop; never owns panel.shell, native bounds, draft or focus. */
export function useBuddyTilt(settings: Settings) {
  const latest = useRef(settings);
  latest.current = settings;
  const refresh = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const surface = settings.surface.current;
    const plane = settings.plane.current;
    if (!surface || !plane) return;
    const model = createBuddyTiltModel();
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const forced = matchMedia('(forced-colors: active)');
    let intersecting = true;
    let focused = true;
    let keyboard = false;
    let held = false;
    let nativeDragging = false;
    let scrolling = false;
    let scrollTimer = 0;
    let frame = 0;
    let clock = 0;
    let disposed = false;
    let visibility: ReturnType<typeof observeDesktopVisibility> | undefined;
    const paint = () => {
      const { yaw, pitch } = model.pose();
      plane.style.transform =
        yaw || pitch ? `perspective(1800px) rotateX(${pitch}deg) rotateY(${yaw}deg)` : 'none';
      plane.style.setProperty('--buddy-light-x', `${(yaw / 1.2) * 10}px`);
      plane.style.setProperty('--buddy-light-y', `${(-pitch / 0.45) * 5}px`);
      plane.style.setProperty('--buddy-shadow-x', `${(-yaw / 1.2) * 2}px`);
      plane.style.setProperty('--buddy-shadow-y', `${(pitch / 0.45) * 1}px`);
      plane.dataset.tilt = yaw || pitch ? 'active' : 'neutral';
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      clock = 0;
      plane.style.willChange = '';
    };
    const tick = (time: number) => {
      frame = 0;
      if (disposed) return;
      model.advance(clock ? Math.min(0.05, (time - clock) / 1000) : 1 / 60);
      clock = time;
      paint();
      if (model.pending()) frame = requestAnimationFrame(tick);
      else stop();
    };
    const schedule = () => {
      if (model.pending() && !frame) {
        plane.style.willChange = 'transform';
        frame = requestAnimationFrame(tick);
      } else if (!model.pending()) stop();
    };
    const restricted = () => {
      const active = document.activeElement;
      const editing =
        active instanceof HTMLElement &&
        surface.contains(active) &&
        active.matches('textarea,input,[contenteditable="true"]');
      const selection = window.getSelection();
      const selecting =
        !!selection && !selection.isCollapsed && surface.contains(selection.anchorNode);
      return latest.current.blocked || editing || selecting || keyboard || scrolling;
    };
    const update = () => {
      const allowed =
        latest.current.enabled &&
        latest.current.motion &&
        fine.matches &&
        !reduced.matches &&
        !forced.matches &&
        !document.hidden &&
        visibility?.isVisible() !== false &&
        intersecting &&
        focused;
      model.setAllowed(allowed);
      if (allowed && nativeDragging) model.press();
      if (!allowed) {
        held = false;
        scrolling = false;
        clearTimeout(scrollTimer);
      }
      model.restrain(restricted());
      paint();
      schedule();
      return allowed;
    };
    refresh.current = update;
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || nativeDragging) return;
      keyboard = false;
      model.restrain(restricted());
      const rect = surface.getBoundingClientRect();
      model.point(
        rect.width ? ((event.clientX - rect.left) / rect.width - 0.5) * 2 : 0,
        rect.height ? ((event.clientY - rect.top) / rect.height - 0.5) * 2 : 0,
      );
      schedule();
    };
    const leave = () => {
      if (nativeDragging) return;
      model.point(0, 0);
      schedule();
    };
    const press = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || nativeDragging) return;
      keyboard = false;
      held = true;
      model.press();
      stop();
    };
    const release = () => {
      if (!held) return;
      held = false;
      if (nativeDragging) return;
      model.restrain(restricted());
      model.release();
      schedule();
    };
    const cancel = () => {
      held = false;
      if (nativeDragging) return;
      model.release(true);
      schedule();
    };
    const blur = () => {
      focused = false;
      cancel();
      update();
    };
    const focus = () => {
      focused = true;
      update();
    };
    const key = () => {
      keyboard = true;
      update();
    };
    const scroll = () => {
      scrolling = true;
      clearTimeout(scrollTimer);
      if (!update()) return;
      scrollTimer = window.setTimeout(() => {
        scrolling = false;
        update();
      }, 120);
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      update();
    });
    observer.observe(surface);
    visibility = observeDesktopVisibility(update);
    const drag = observeDesktopDrag((active) => {
      nativeDragging = active;
      if (!active) {
        held = false;
        model.release(true);
      }
      update();
    });
    nativeDragging = drag.isActive();
    surface.addEventListener('pointermove', move, { passive: true });
    surface.addEventListener('pointerleave', leave);
    surface.addEventListener('pointerdown', press, true);
    surface.addEventListener('lostpointercapture', cancel);
    surface.addEventListener('focusin', update);
    surface.addEventListener('focusout', update);
    surface.addEventListener('keydown', key);
    surface.addEventListener('scroll', scroll, { capture: true, passive: true });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    document.addEventListener('selectionchange', update);
    document.addEventListener('visibilitychange', update);
    for (const media of [fine, reduced, forced]) media.addEventListener('change', update);
    update();
    return () => {
      disposed = true;
      refresh.current = () => {};
      stop();
      clearTimeout(scrollTimer);
      observer.disconnect();
      visibility?.dispose();
      drag.dispose();
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerleave', leave);
      surface.removeEventListener('pointerdown', press, true);
      surface.removeEventListener('lostpointercapture', cancel);
      surface.removeEventListener('focusin', update);
      surface.removeEventListener('focusout', update);
      surface.removeEventListener('keydown', key);
      surface.removeEventListener('scroll', scroll, true);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('visibilitychange', update);
      for (const media of [fine, reduced, forced]) media.removeEventListener('change', update);
      model.setAllowed(false);
      paint();
    };
  }, [settings.surface, settings.plane]);
  useLayoutEffect(() => {
    refresh.current();
  }, [settings.enabled, settings.motion, settings.blocked]);
}
