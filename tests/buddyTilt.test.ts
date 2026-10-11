import { describe, expect, it } from 'vitest';
import { createBuddyTiltModel } from '../src/useBuddyTilt';

describe('bounded panel presentation tilt', () => {
  it('clamps extreme coordinates and converges equally across frame rates', () => {
    const poses = [30, 60, 120].map((fps) => {
      const model = createBuddyTiltModel();
      model.setAllowed(true);
      model.point(100, -100);
      for (let i = 0; i < fps / 2; i++) model.advance(1 / fps);
      expect(model.pending()).toBe(false);
      return model.pose();
    });
    expect(poses).toEqual(Array(3).fill({ yaw: 1.2, pitch: 0.45 }));
  });
  it('holds the visible press pose despite a focus/menu restriction until release', () => {
    const model = createBuddyTiltModel();
    model.setAllowed(true);
    model.point(1, 0);
    model.advance(0.1);
    const held = model.pose();
    model.press();
    model.restrain(true);
    model.point(-1, 1);
    model.advance(1);
    expect(model.pose()).toEqual(held);
    expect(model.pending()).toBe(false);
    model.release();
    model.advance(1);
    expect(model.pose()).toEqual({ yaw: 0, pitch: 0 });
  });
  it('resets immediately for hide/pause and cannot replay old pointer intent on return', () => {
    const model = createBuddyTiltModel();
    model.setAllowed(true);
    model.point(1, 1);
    model.advance(0.5);
    model.press();
    model.setAllowed(false);
    expect(model.pose()).toEqual({ yaw: 0, pitch: 0 });
    expect(model.pending()).toBe(false);
    // Pointer/press events during reduced motion or pause cannot arm a later pose.
    model.point(-1, -1);
    model.press();
    model.release();
    model.setAllowed(true);
    model.advance(1);
    expect(model.pose()).toEqual({ yaw: 0, pitch: 0 });
  });
  it('cancelled press removes stale coordinates and nonfinite input remains neutral', () => {
    const model = createBuddyTiltModel();
    model.setAllowed(true);
    model.point(1, 1);
    model.advance(0.1);
    model.press();
    model.release(true);
    model.advance(1);
    expect(model.pose()).toEqual({ yaw: 0, pitch: 0 });
    model.point(NaN, Infinity);
    expect(model.pending()).toBe(false);
  });
});
