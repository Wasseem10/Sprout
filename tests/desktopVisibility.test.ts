import { expect, it, vi } from 'vitest';
import {
  createDesktopVisibilityObserver,
  type DesktopVisibilitySnapshot,
} from '../src/desktopVisibility';

function fixture() {
  let resolve!: (snapshot: DesktopVisibilitySnapshot) => void;
  const initial = new Promise<DesktopVisibilitySnapshot>((done) => {
    resolve = done;
  });
  let listener: ((snapshot: DesktopVisibilitySnapshot) => void) | undefined;
  const unsubscribe = vi.fn();
  const bridge = {
    desktopVisibility: vi.fn(() => initial),
    onDesktopVisibility: vi.fn((callback: (snapshot: DesktopVisibilitySnapshot) => void) => {
      listener = callback;
      return unsubscribe;
    }),
  };
  return {
    bridge,
    resolve,
    emit: (snapshot: DesktopVisibilitySnapshot) => listener!(snapshot),
    unsubscribe,
  };
}

it('ignores a stale initial snapshot after a newer native hide/show event', async () => {
  const host = fixture();
  const changes: boolean[] = [];
  const observation = createDesktopVisibilityObserver(host.bridge).observe((value) =>
    changes.push(value),
  );
  expect(observation.isVisible()).toBe(false);
  host.emit({ visible: true, revision: 2 });
  host.resolve({ visible: false, revision: 1 });
  await Promise.resolve();
  expect(observation.isVisible()).toBe(true);
  expect(changes).toEqual([true]);
  host.emit({ visible: false, revision: 3 });
  host.emit({ visible: true, revision: 2 });
  expect(observation.isVisible()).toBe(false);
  expect(changes).toEqual([true, false]);
  observation.dispose();
});

it('shares one native listener and unsubscribes only after the last consumer', async () => {
  const host = fixture();
  const service = createDesktopVisibilityObserver(host.bridge);
  const first = service.observe(vi.fn());
  const secondChanges = vi.fn();
  const second = service.observe(secondChanges);
  expect(host.bridge.onDesktopVisibility).toHaveBeenCalledTimes(1);
  expect(host.bridge.desktopVisibility).toHaveBeenCalledTimes(1);
  first.dispose();
  expect(host.unsubscribe).not.toHaveBeenCalled();
  host.emit({ visible: true, revision: 1 });
  expect(second.isVisible()).toBe(true);
  second.dispose();
  second.dispose();
  expect(host.unsubscribe).toHaveBeenCalledTimes(1);
  host.resolve({ visible: true, revision: 0 });
  await Promise.resolve();
  host.emit({ visible: true, revision: 2 });
  expect(secondChanges).toHaveBeenCalledTimes(1);
});

it('ignores a disposed connection snapshot after a new consumer reconnects', async () => {
  const completions: ((snapshot: DesktopVisibilitySnapshot) => void)[] = [];
  const subscriptions: ((snapshot: DesktopVisibilitySnapshot) => void)[] = [];
  const service = createDesktopVisibilityObserver({
    desktopVisibility: () => new Promise((resolve) => completions.push(resolve)),
    onDesktopVisibility: (listener) => {
      subscriptions.push(listener);
      return vi.fn();
    },
  });
  const old = service.observe(vi.fn());
  old.dispose();
  const changes = vi.fn();
  const current = service.observe(changes);
  subscriptions[1]({ visible: false, revision: 5 });
  // An old session even with a higher revision cannot replace the new connection.
  completions[0]({ visible: true, revision: 100 });
  subscriptions[0]({ visible: true, revision: 101 });
  await Promise.resolve();
  expect(current.isVisible()).toBe(false);
  expect(changes).not.toHaveBeenCalled();
  completions[1]({ visible: true, revision: 6 });
  await Promise.resolve();
  expect(current.isVisible()).toBe(true);
  expect(changes).toHaveBeenCalledExactlyOnceWith(true);
  current.dispose();
});

it('an unavailable initial getter cannot override an authoritative native hide event', async () => {
  const changes = vi.fn();
  const service = createDesktopVisibilityObserver({
    desktopVisibility: () => Promise.reject(new Error('Unavailable')),
    onDesktopVisibility: (listener) => {
      listener({ visible: false, revision: 3 });
      return vi.fn();
    },
  });
  const observation = service.observe(changes);
  await Promise.resolve();
  expect(observation.isVisible()).toBe(false);
  expect(changes).not.toHaveBeenCalled();
  observation.dispose();
});

it('keeps ordinary web behavior when there is no native visibility bridge', () => {
  const changes = vi.fn();
  const observation = createDesktopVisibilityObserver().observe(changes);
  expect(observation.isVisible()).toBe(true);
  observation.dispose();
  expect(changes).not.toHaveBeenCalled();
});
