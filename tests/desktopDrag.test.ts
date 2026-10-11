import { expect, it, vi } from 'vitest';
import { createDesktopDragObserver, type DesktopDragSnapshot } from '../src/desktopDrag';

it('ignores stale initial truth and invalid or out-of-order native drag events', async () => {
  let complete!: (value: DesktopDragSnapshot) => void;
  let emit!: (value: DesktopDragSnapshot) => void;
  const changes = vi.fn();
  const observer = createDesktopDragObserver({
    desktopDrag: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    onDesktopDrag: (listener) => {
      emit = listener;
      return vi.fn();
    },
  }).observe(changes);
  emit({ active: true, revision: 2 });
  complete({ active: false, revision: 1 });
  await Promise.resolve();
  expect(observer.isActive()).toBe(true);
  emit({ active: false, revision: 1 });
  emit({ active: false, revision: NaN });
  expect(observer.isActive()).toBe(true);
  emit({ active: false, revision: 3 });
  expect(observer.isActive()).toBe(false);
  expect(changes.mock.calls).toEqual([[true], [false]]);
  observer.dispose();
});

it('shares one listener and ignores a disposed connection after reconnecting', async () => {
  const completions: ((snapshot: DesktopDragSnapshot) => void)[] = [];
  const subscriptions: ((snapshot: DesktopDragSnapshot) => void)[] = [];
  const unsubscribe = vi.fn();
  const bridge = {
    desktopDrag: vi.fn(
      () => new Promise<DesktopDragSnapshot>((resolve) => completions.push(resolve)),
    ),
    onDesktopDrag: vi.fn((listener: (snapshot: DesktopDragSnapshot) => void) => {
      subscriptions.push(listener);
      return unsubscribe;
    }),
  };
  const service = createDesktopDragObserver(bridge);
  const first = service.observe(vi.fn());
  const second = service.observe(vi.fn());
  expect(bridge.onDesktopDrag).toHaveBeenCalledTimes(1);
  first.dispose();
  expect(unsubscribe).not.toHaveBeenCalled();
  second.dispose();
  second.dispose();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  const current = service.observe(vi.fn());
  subscriptions[1]({ active: false, revision: 5 });
  subscriptions[0]({ active: true, revision: 100 });
  completions[0]({ active: true, revision: 101 });
  await Promise.resolve();
  expect(current.isActive()).toBe(false);
  completions[1]({ active: true, revision: 6 });
  await Promise.resolve();
  expect(current.isActive()).toBe(true);
  current.dispose();
});

it('a failed getter cannot replace authoritative native drag truth', async () => {
  const changes = vi.fn();
  const observation = createDesktopDragObserver({
    desktopDrag: () => Promise.reject(new Error('Unavailable')),
    onDesktopDrag: (listener) => {
      listener({ active: true, revision: 1 });
      return vi.fn();
    },
  }).observe(changes);
  await Promise.resolve();
  expect(observation.isActive()).toBe(true);
  expect(changes).toHaveBeenCalledExactlyOnceWith(true);
  observation.dispose();
});

it('ordinary web has no native drag state', () => {
  const changes = vi.fn();
  const observation = createDesktopDragObserver().observe(changes);
  expect(observation.isActive()).toBe(false);
  expect(changes).not.toHaveBeenCalled();
  observation.dispose();
});
