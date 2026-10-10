import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { validatePointerRequest, targetRegionChanged } =
  require('../electron/native-pointer.cjs') as {
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
