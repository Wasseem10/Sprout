import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  validatePointerRequest,
  targetRegionChanged,
  taskbarAppPattern,
  locateTaskbarApp,
  locateAccessibleTarget,
  locateRunningAppCaption,
  locateAppActivation,
} = require('../electron/native-pointer.cjs') as {
  validatePointerRequest: (
    capture: { id: string; createdAt: number } | null,
    input: Record<string, unknown>,
    now?: number,
  ) => unknown;
  targetRegionChanged: (
    previous: Buffer,
    current: Buffer,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => boolean;
  taskbarAppPattern: (app: string) => string | null;
  locateTaskbarApp: (app: string, signal?: AbortSignal) => Promise<unknown>;
  locateAccessibleTarget: (target: string, path?: string, signal?: AbortSignal) => Promise<unknown>;
  locateRunningAppCaption: (app: string, signal?: AbortSignal) => Promise<unknown>;
  locateAppActivation: (
    app: string,
    signal: AbortSignal,
    dependencies: {
      taskbar: (app: string, signal: AbortSignal) => Promise<unknown>;
      caption: (app: string, signal: AbortSignal) => Promise<unknown>;
      wait: (ms: number, signal: AbortSignal) => Promise<void>;
    },
  ) => Promise<{ target: unknown; method: 'taskbar' | 'titlebar' } | null>;
};

const now = Date.now();
const capture = { id: 'observed-screen', createdAt: now };
const request = {
  captureId: 'observed-screen',
  x: 0.5,
  y: 0.5,
  target: 'Apply button',
  observedText: 'Apply now',
  context: 'listing',
};

it('permits one current, named navigation target and blocks risky or stale desktop clicks', () => {
  expect(validatePointerRequest(capture, request, now)).toEqual(request);
  expect(() => validatePointerRequest(capture, { ...request, captureId: 'other' }, now)).toThrow(
    'capture changed',
  );
  expect(() => validatePointerRequest(capture, request, now + 75_001)).toThrow('too old');
  expect(() => validatePointerRequest(capture, { ...request, x: 1.4 }, now)).toThrow('outside');
  expect(() => validatePointerRequest(capture, { ...request, context: 'form' }, now)).toThrow(
    'form',
  );
  expect(() =>
    validatePointerRequest(capture, { ...request, target: 'Submit application' }, now),
  ).toThrow('submission');
  expect(() =>
    validatePointerRequest(capture, { ...request, observedText: 'Place order' }, now),
  ).toThrow('payment');
  expect(() =>
    validatePointerRequest(capture, { ...request, observedText: 'Sign in' }, now),
  ).toThrow('account');
  expect(() =>
    validatePointerRequest(capture, { ...request, observedText: 'Unrelated link' }, now),
  ).toThrow('does not match');
});

it('detects a changed button region before a Windows mouse click', () => {
  const width = 120,
    height = 80;
  const original = Buffer.alloc(width * height * 4, 100);
  const unchanged = Buffer.from(original);
  expect(targetRegionChanged(original, unchanged, 0.5, 0.5, width, height)).toBe(false);
  const changed = Buffer.from(original);
  for (let y = 20; y < 60; y++)
    for (let x = 30; x < 90; x++) {
      const index = (y * width + x) * 4;
      changed[index] = 240;
      changed[index + 1] = 240;
      changed[index + 2] = 240;
    }
  expect(targetRegionChanged(original, changed, 0.5, 0.5, width, height)).toBe(true);
});

it('recognizes grouped app names and real window titles on subsequent taskbar activations', () => {
  const chrome = new RegExp(taskbarAppPattern('chrome')!, 'i');
  expect(chrome.test('Google Chrome')).toBe(true);
  expect(chrome.test('3 Google Chrome windows')).toBe(true);
  expect(chrome.test('New Tab - Google Chrome')).toBe(true);
  expect(chrome.test('Q3 report - Microsoft Edge')).toBe(false);
  const ppt = new RegExp(taskbarAppPattern('powerPoint')!, 'i');
  expect(ppt.test('Q3-shareholder-review - PowerPoint')).toBe(true);
  expect(taskbarAppPattern('unknown.exe')).toBeNull();
  expect(taskbarAppPattern('toString')).toBeNull();
});

it('does not launch a lookup for a cancelled old command and accepts a fresh command after it', async () => {
  const cancelled = new AbortController();
  cancelled.abort(new Error('Stopped previous command'));
  await expect(locateTaskbarApp('chrome', cancelled.signal)).rejects.toThrow('Stopped previous');
  await expect(locateAccessibleTarget('Demo link', undefined, cancelled.signal)).rejects.toThrow(
    'Stopped previous',
  );
  await expect(locateRunningAppCaption('chrome', cancelled.signal)).rejects.toThrow(
    'Stopped previous',
  );
  const next = new AbortController();
  await expect(locateTaskbarApp('unsupported', next.signal)).resolves.toBeNull();
  await expect(locateRunningAppCaption('unsupported', next.signal)).resolves.toBeNull();
});

it('finds a newly launched window after bounded settling without delaying an already-open app', async () => {
  const signal = new AbortController().signal;
  const point = { x: 500, y: 20, name: 'New app window' };
  const existing = {
    taskbar: vi.fn().mockResolvedValue(point),
    caption: vi.fn().mockResolvedValue(null),
    wait: vi.fn(),
  };
  await expect(locateAppActivation('chrome', signal, existing)).resolves.toEqual({
    target: point,
    method: 'taskbar',
  });
  expect(existing.caption).toHaveBeenCalledTimes(1);
  expect(existing.wait).not.toHaveBeenCalled();

  const appearing = {
    taskbar: vi.fn().mockResolvedValue(null),
    caption: vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(point),
    wait: vi.fn().mockResolvedValue(undefined),
  };
  await expect(locateAppActivation('chrome', signal, appearing)).resolves.toEqual({
    target: point,
    method: 'titlebar',
  });
  expect(appearing.taskbar).toHaveBeenCalledTimes(2);
  expect(appearing.caption).toHaveBeenCalledTimes(3);
  expect(appearing.wait.mock.calls.map(([ms]) => ms)).toEqual([250, 500]);
});

it('prefers a running app title bar over its taskbar button so activation cannot minimize it', async () => {
  const caption = { x: 600, y: 20, name: 'Already active Chrome' };
  const taskbar = { x: 600, y: 1000, name: 'Google Chrome' };
  const available = {
    caption: vi.fn().mockResolvedValue(caption),
    taskbar: vi.fn().mockResolvedValue(taskbar),
    wait: vi.fn(),
  };
  await expect(
    locateAppActivation('chrome', new AbortController().signal, available),
  ).resolves.toEqual({ target: caption, method: 'titlebar' });
  expect(available.taskbar).not.toHaveBeenCalled();
  expect(available.wait).not.toHaveBeenCalled();
});

it('stops activation lookups during the launch wait and bounds absent-window retries', async () => {
  const controller = new AbortController();
  const stopped = {
    taskbar: vi.fn().mockResolvedValue(null),
    caption: vi.fn().mockResolvedValue(null),
    wait: vi.fn(async () => {
      controller.abort(new Error('Stop app activation'));
    }),
  };
  await expect(locateAppActivation('chrome', controller.signal, stopped)).rejects.toThrow(
    'Stop app activation',
  );
  expect(stopped.taskbar).toHaveBeenCalledTimes(1);
  expect(stopped.caption).toHaveBeenCalledTimes(1);

  const absent = {
    taskbar: vi.fn().mockResolvedValue(null),
    caption: vi.fn().mockResolvedValue(null),
    wait: vi.fn().mockResolvedValue(undefined),
  };
  await expect(
    locateAppActivation('chrome', new AbortController().signal, absent),
  ).resolves.toBeNull();
  expect(absent.taskbar).toHaveBeenCalledTimes(3);
  expect(absent.caption).toHaveBeenCalledTimes(3);
});
