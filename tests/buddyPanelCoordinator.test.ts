import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { createBuddyPanelCoordinator, type BuddyPanelStage } from '../src/buddyPanelCoordinator';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function panelFixture(overrides: Partial<Parameters<typeof createBuddyPanelCoordinator>[0]> = {}) {
  const events: string[] = [];
  let stage: BuddyPanelStage = 'closed';
  const panel = createBuddyPanelCoordinator({
    nativeMode: async (mode) => {
      events.push(`native:${mode}`);
      return undefined;
    },
    layoutReady: async () => {
      events.push('layout:ready');
    },
    decorate: async (expanded) => {
      events.push(`decorate:${expanded}`);
    },
    beforeHide: () => {
      events.push('focus:pet');
    },
    afterReveal: () => {
      events.push('focus:panel');
    },
    stage: (next) => {
      stage = next;
      events.push(`stage:${next}`);
    },
    error: (message) => {
      events.push(`error:${message}`);
    },
    ...overrides,
  });
  return { panel, events, stage: () => stage };
}

it('exposes and focuses conversation only after native acknowledgement and applied layout', async () => {
  const native = deferred<undefined>();
  const layout = deferred();
  const fixture = panelFixture({
    nativeMode: () => native.promise,
    layoutReady: () => layout.promise,
  });
  const opening = fixture.panel.request(true);
  expect(fixture.stage()).toBe('preparing-open');
  expect(fixture.events).not.toContain('focus:panel');
  native.resolve(undefined);
  await Promise.resolve();
  expect(fixture.events).not.toContain('focus:panel');
  layout.resolve();
  await opening;
  expect(fixture.stage()).toBe('open');
  expect(fixture.events.indexOf('stage:open')).toBeLessThan(fixture.events.indexOf('focus:panel'));
});

it('restores focus before exit and never lets a superseded exit shrink a reopened panel', async () => {
  const exit = deferred();
  const fixture = panelFixture({
    decorate: (expanded) => (expanded ? Promise.resolve() : exit.promise),
  });
  await fixture.panel.request(true);
  const closing = fixture.panel.request(false);
  expect(fixture.stage()).toBe('closing');
  expect(fixture.events).toContain('focus:pet');
  expect(fixture.events).not.toContain('native:pill');
  await fixture.panel.request(true);
  exit.resolve();
  await closing;
  expect(fixture.stage()).toBe('open');
  expect(fixture.events).not.toContain('native:pill');
});

it('a late opening cannot reveal content or steal focus after collapse or disposal', async () => {
  const native = deferred<undefined>();
  const fixture = panelFixture({
    nativeMode: (mode) => (mode === 'panel' ? native.promise : Promise.resolve(undefined)),
  });
  const opening = fixture.panel.request(true);
  await fixture.panel.request(false);
  fixture.panel.dispose();
  native.resolve(undefined);
  await opening;
  expect(fixture.stage()).toBe('closed');
  expect(fixture.events).not.toContain('focus:panel');
});

it('keeps safe modal bounds when the conversation is closed', async () => {
  const fixture = panelFixture();
  await fixture.panel.request(true);
  await fixture.panel.request(false, true);
  expect(fixture.stage()).toBe('closed');
  expect(fixture.events.filter((event) => event.startsWith('native:'))).toEqual([
    'native:panel',
    'native:panel',
  ]);
});

it('a rejected expansion remains closed and reports an actionable error without panel focus', async () => {
  const fixture = panelFixture({
    nativeMode: async (mode) => {
      if (mode === 'panel') throw new Error('Window unavailable.');
      return undefined;
    },
  });
  await fixture.panel.request(true);
  expect(fixture.stage()).toBe('closed');
  expect(fixture.events).not.toContain('focus:panel');
  expect(fixture.events.some((event) => event.includes('Window unavailable.'))).toBe(true);
});

it('rejects an acknowledgement from a different request without revealing the panel', async () => {
  const fixture = panelFixture({
    nativeMode: async (mode, requestId) => ({
      mode,
      requestId: requestId + 1,
      bounds: { x: 0, y: 0, width: 408, height: 672 },
      viewport: { width: 408, height: 672 },
    }),
  });
  await fixture.panel.request(true);
  expect(fixture.stage()).toBe('closed');
  expect(fixture.events).not.toContain('focus:panel');
  expect(fixture.events.some((event) => event.includes('different layout request'))).toBe(true);
});

const require = createRequire(import.meta.url);
const { buddyBounds } = require('../electron/buddy-window.cjs') as {
  buddyBounds: (
    mode: string,
    area: { x: number; y: number; width: number; height: number },
    anchor?: { x: number; y: number },
    zoomFactor?: number,
  ) => { x: number; y: number; width: number; height: number };
};

it('preserves the pet anchor while expanding and clamps safely on small or offset displays', () => {
  const area = { x: -1920, y: 30, width: 1920, height: 1050 };
  const anchor = { x: -1100, y: 140 };
  expect(buddyBounds('panel', area, anchor)).toEqual({ ...anchor, width: 408, height: 672 });
  expect(buddyBounds('pill', area, anchor)).toEqual({ ...anchor, width: 296, height: 128 });
  expect(
    buddyBounds('panel', { x: 30, y: 40, width: 320, height: 480 }, { x: 330, y: 460 }),
  ).toEqual({ x: 30, y: 40, width: 320, height: 480 });
  expect(() => buddyBounds('invalid', area)).toThrow('Unknown companion mode');
});

it('reserves room for enlarged dock text while respecting the physical work area', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1032 };
  expect(buddyBounds('panel', area, { x: 1512, y: 360 }, 2)).toEqual({
    x: 1104,
    y: 0,
    width: 816,
    height: 1032,
  });
  expect(buddyBounds('pill', area, { x: 32, y: 28 }, 2)).toEqual({
    x: 32,
    y: 28,
    width: 592,
    height: 256,
  });
  expect(buddyBounds('workspace', area, { x: 32, y: 28 }, 2).width).toBe(1350);
  expect(() => buddyBounds('panel', area, undefined, Number.NaN)).toThrow('Invalid companion zoom');
});
