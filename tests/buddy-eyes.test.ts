import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Box3, Mesh, NumberKeyframeTrack, OrthographicCamera, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { auditSproutModel, SproutMotionController } from '../src/buddyMotionController';
import { neutralAvatarRect, sproutSleepHeadAnchor } from '../src/buddyRenderer';
import { buddyStillPaths } from '../src/AssistantSignal';
import type { BuddyBehaviorInput } from '../src/buddyBehavior';

const input = (overrides: Partial<BuddyBehaviorInput> = {}): BuddyBehaviorInput => ({
  generation: 1,
  manualEligible: true,
  ...overrides,
});

/** These Node proofs load real exported geometry/tracks; texture pixels/GPU appearance are not tested. */
async function actualAsset(version = 'v005') {
  const bytes = await readFile(
    new URL(
      `../design/buddy/sprout/sprout-${version === 'v006' ? 'daylight' : 'prism'}-${version}.glb`,
      import.meta.url,
    ),
  );
  const loader = new GLTFLoader().register(() => ({
    name: 'GeometryOnlyTexturePlaceholder',
    loadTexture: async () => new Texture(),
  }));
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const controller = new SproutMotionController(gltf.scene, gltf.animations);
  const eye = (side = 'L') => gltf.scene.getObjectByName(`EYE_${side}`) as Mesh;
  const glint = (side = 'L') => gltf.scene.getObjectByName(`GLINT_${side}`)!;
  const closure = () => ['L', 'R'].map((side) => eye(side).morphTargetInfluences![0]);
  const dispose = () => {
    controller.dispose();
    const textures = new Set<Texture>();
    gltf.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        for (const value of Object.values(material))
          if (value instanceof Texture) textures.add(value);
        material.dispose();
      }
    });
    for (const texture of textures) texture.dispose();
  };
  return { ...gltf, controller, eye, glint, closure, dispose };
}

describe('actual happy-eye export and exclusive mixer ownership', () => {
  it('keeps the daylight material variant on the same strict eye/animation contract with matching stills', async () => {
    const asset = await actualAsset('v006');
    try {
      expect(auditSproutModel(asset.scene, asset.animations)).toEqual([]);
      expect(asset.controller.snapshot().eyeProfile).toBe('happy-eyes-v005');
      expect(asset.animations).toHaveLength(11);
      expect(buddyStillPaths('/buddy/sprout-v006.glb', true).slice(0, 3)).toEqual([
        '/buddy/sprout-v006-sleep.png',
        '/buddy/sprout-v005-sleep.png',
        '/buddy/sprout-v004-sleep.png',
      ]);
      expect(buddyStillPaths('/buddy/sprout-v006.glb', false).slice(0, 2)).toEqual([
        '/buddy/sprout-v006.png',
        '/buddy/sprout-v005.png',
      ]);
    } finally {
      asset.dispose();
    }
  });
  it('accepts exact complete bindings and rejects constant/missing or indexed eye tracks', async () => {
    const asset = await actualAsset();
    try {
      expect(auditSproutModel(asset.scene, asset.animations)).toEqual([]);
      expect(asset.controller.snapshot().eyeProfile).toBe('happy-eyes-v005');
      expect(asset.animations).toHaveLength(11);
      for (const side of ['L', 'R']) {
        expect(asset.eye(side).morphTargetDictionary).toEqual({ CloseHappy: 0 });
        expect(asset.scene.getObjectByName(`LID_${side}`)).toBeUndefined();
        expect(asset.scene.getObjectByName(`CLOSED_EYE_${side}`)).toBeUndefined();
      }
      const clips = asset.animations.map((clip) => clip.clone());
      const blink = clips.find((clip) => clip.name === 'Sprout_Blink')!;
      expect(blink.tracks).toHaveLength(4);
      const eyeTrack = blink.tracks.find((track) => track.name === 'EYE_L.morphTargetInfluences')!;
      eyeTrack.values.fill(0);
      expect(auditSproutModel(asset.scene, clips)).toContain(
        'Blink never closes: EYE_L.morphTargetInfluences',
      );
      blink.tracks[blink.tracks.indexOf(eyeTrack)] = new NumberKeyframeTrack(
        'EYE_L.morphTargetInfluences[0]',
        [0, blink.duration],
        [0, 0],
      );
      expect(auditSproutModel(asset.scene, clips)).toContain(
        'Unexpected owner: Sprout_Blink → EYE_L.morphTargetInfluences[0]',
      );
      const sleep = clips.find((clip) => clip.name === 'Sprout_SleepLoop')!;
      sleep.tracks = sleep.tracks.filter((track) => track.name !== 'GLINT_R.scale');
      expect(auditSproutModel(asset.scene, clips)).toContain(
        'Missing happy-eye channel: Sprout_SleepLoop → GLINT_R.scale',
      );
    } finally {
      asset.dispose();
    }
  });

  it('deforms the navy eyes at the authored blink peak and preserves its visible closure on sleep entry', async () => {
    const asset = await actualAsset();
    try {
      const blink = asset.animations.find((clip) => clip.name === 'Sprout_Blink')!;
      const track = blink.tracks.find((item) => item.name === 'EYE_L.morphTargetInfluences')!;
      const peakIndex = [...track.values].indexOf(Math.max(...track.values));
      const openHeight = new Box3().setFromObject(asset.eye(), true).getSize(new Vector3()).y;
      expect(asset.controller.react('Sprout_Blink')).toBe(true);
      asset.controller.update(track.times[peakIndex], 100);
      for (const value of asset.closure()) expect(value).toBeCloseTo(1, 5);
      expect(asset.glint().scale.toArray()).toEqual(
        expect.arrayContaining([expect.closeTo(0.001, 5)]),
      );
      const closedHeight = new Box3().setFromObject(asset.eye(), true).getSize(new Vector3()).y;
      expect(closedHeight).toBeLessThan(openHeight * 0.5);
      const visible = asset.closure();
      asset.controller.setBehavior(input({ request: { id: 1, action: 'sleep' } }), 100);
      asset.controller.update(0, 100);
      asset.closure().forEach((value, index) => expect(value).toBeCloseTo(visible[index], 6));
      expect(asset.controller.snapshot().blinkActive).toBe(false);
      asset.controller.update(2, 2100);
      expect(asset.controller.snapshot().behavior.mode).toBe('sleep');
      for (const value of asset.closure()) expect(value).toBeCloseTo(1, 6);
    } finally {
      asset.dispose();
    }
  });

  it('keeps sleep closure/glints exclusive, wakes continuously, and restores open rest on real-phase interruption', async () => {
    const asset = await actualAsset();
    try {
      asset.controller.setBehavior(input({ request: { id: 1, action: 'sleep' } }), 0);
      asset.controller.update(2, 2000);
      asset.controller.setGaze(1, 1);
      asset.controller.setAttentionCompression(1);
      asset.controller.update(0.4, 2400);
      expect(asset.controller.react('Sprout_Blink')).toBe(false);
      expect(asset.closure()).toEqual([1, 1]);
      for (const side of ['L', 'R'])
        asset
          .glint(side)
          .scale.toArray()
          .forEach((value) => expect(value).toBeCloseTo(0.001, 6));
      asset.controller.setMotion(false);
      asset.controller.update(50, 52400);
      expect(asset.closure()).toEqual([1, 1]);
      const camera = new OrthographicCamera(-1.72, 1.72, 1.72, -1.72, 0.1, 30);
      camera.position.set(0.1, 0.24, 6);
      camera.lookAt(0, 0.24, 0);
      const anchor = sproutSleepHeadAnchor(asset.scene, camera, 'happy-eyes-v005');
      expect(anchor).not.toBeNull();
      expect(anchor!.x).toBeGreaterThan(0);
      expect(anchor!.x).toBeLessThan(1);
      expect(anchor!.y).toBeGreaterThan(0);
      expect(anchor!.y).toBeLessThan(1);
      asset.controller.setMotion(true);
      asset.controller.setBehavior(input({ request: { id: 2, action: 'wake' } }), 52400);
      asset.controller.update(0, 52400);
      expect(asset.closure()).toEqual([1, 1]);
      asset.controller.update(1.5, 53900);
      expect(asset.closure()).toEqual([0, 0]);
      asset.controller.setBehavior(input({ request: { id: 3, action: 'sleep' } }), 53900);
      asset.controller.update(0.7, 54600);
      const before = asset.closure();
      expect(before[0]).toBeGreaterThan(0);
      asset.controller.setPhase('listening');
      asset.controller.update(0, 54600);
      asset.closure().forEach((value, index) => expect(value).toBeCloseTo(before[index], 6));
      asset.controller.update(0.2, 54800);
      expect(asset.closure()).toEqual([0, 0]);
      expect(asset.controller.snapshot().behavior.mode).toBe('normal');
      expect(asset.controller.snapshot().weights.Sprout_Listen).toBe(1);
      expect((asset.scene.getObjectByName('SPROUT_BODY') as Mesh).morphTargetInfluences).toEqual(
        (asset.scene.getObjectByName('SPROUT_CORE') as Mesh).morphTargetInfluences,
      );
    } finally {
      asset.dispose();
    }
  });

  it('preserves the strict legacy lid profile and matching explicit legacy stills', async () => {
    const asset = await actualAsset('v004');
    try {
      expect(auditSproutModel(asset.scene, asset.animations)).toEqual([]);
      expect(asset.controller.snapshot().eyeProfile).toBe('legacy-lids');
      expect(buddyStillPaths('/buddy/sprout-v004.glb', true)[0]).toBe(
        '/buddy/sprout-v004-sleep.png',
      );
      expect(buddyStillPaths('/buddy/sprout-v005.glb', true).slice(0, 2)).toEqual([
        '/buddy/sprout-v005-sleep.png',
        '/buddy/sprout-v004-sleep.png',
      ]);
      expect(buddyStillPaths('/buddy/sprout-v003.glb', false)[0]).toBe('/buddy/sprout-v003.png');
    } finally {
      asset.dispose();
    }
  });

  it('keeps interrupted closure poses identical at 30/60/120Hz and reuses one bounded mixer binding set', async () => {
    const traces: number[][][] = [];
    for (const fps of [30, 60, 120]) {
      const asset = await actualAsset();
      try {
        const samples: number[][] = [];
        let now = 0;
        const steps = [
          { duration: 0.07, blink: true },
          { duration: 0.09, sleep: true },
          { duration: 0.11, phase: 'listening' },
          { duration: 0.09, phase: 'speaking' },
          { duration: 0.3, phase: 'idle' },
          { duration: 0.6, sleep: true },
          { duration: 0.08, wake: true },
          { duration: 0.1, phase: 'thinking' },
          { duration: 0.1 },
        ] as const;
        let id = 0;
        const actionCount = asset.controller.mixer.stats.actions.total;
        const bindingCount = asset.controller.mixer.stats.bindings.total;
        for (const step of steps) {
          if ('phase' in step) asset.controller.setPhase(step.phase);
          if ('blink' in step) asset.controller.react('Sprout_Blink');
          if ('sleep' in step || 'wake' in step)
            asset.controller.setBehavior(
              input({ request: { id: ++id, action: 'sleep' in step ? 'sleep' : 'wake' } }),
              now * 1000,
            );
          let remaining: number = step.duration;
          while (remaining > 1e-10) {
            const dt = Math.min(1 / fps, remaining);
            now += dt;
            asset.controller.update(dt, now * 1000);
            remaining -= dt;
          }
          const pose: number[] = [];
          asset.scene.traverse((node) => {
            pose.push(
              ...node.position.toArray(),
              ...node.quaternion.toArray(),
              ...node.scale.toArray(),
            );
            if (node instanceof Mesh) pose.push(...(node.morphTargetInfluences ?? []));
          });
          samples.push(pose);
          expect(asset.controller.mixer.stats.actions.total).toBe(actionCount);
          expect(asset.controller.mixer.stats.bindings.total).toBe(bindingCount);
        }
        traces.push(samples);
        asset.controller.dispose();
        expect(asset.controller.mixer.stats.actions.total).toBe(0);
        expect(asset.controller.mixer.stats.bindings.total).toBe(0);
      } finally {
        asset.dispose();
      }
    }
    for (const trace of traces.slice(1))
      trace.forEach((sample, index) =>
        sample.forEach((value, coordinate) =>
          expect(value).toBeCloseTo(traces[0][index][coordinate], 6),
        ),
      );
  });
});

describe('untransformed layout basis for panel tilt', () => {
  it('ignores the tilted avatar rectangle and includes nested offsets, borders and scroll', () => {
    const surface = {
      offsetLeft: 100,
      offsetTop: 200,
      offsetParent: null,
      clientLeft: 2,
      clientTop: 3,
      scrollLeft: 0,
      scrollTop: 4,
      getBoundingClientRect: () => ({ left: 300, top: 50 }),
    } as unknown as HTMLElement;
    const plane = {
      offsetLeft: 10,
      offsetTop: 12,
      offsetParent: surface,
      parentElement: surface,
      clientLeft: 1,
      clientTop: 1,
      scrollLeft: 3,
      scrollTop: 5,
    } as unknown as HTMLElement;
    const owner = {
      offsetLeft: 20,
      offsetTop: 8,
      offsetParent: plane,
      parentElement: plane,
      offsetWidth: 72,
      offsetHeight: 72,
      getBoundingClientRect: () => {
        throw new Error('Tilted bounds must not be read');
      },
    } as unknown as HTMLElement;
    const rect = neutralAvatarRect(owner, surface);
    expect(rect).toEqual({ left: 330, top: 65, width: 72, height: 72 });
    const aim = (x: number, y: number) => ({
      x: (x - rect.left - rect.width / 2) / (rect.width / 2),
      y: (rect.top + rect.height / 2 - y) / (rect.height / 2),
    });
    expect(aim(366, 101)).toEqual({ x: 0, y: 0 });
    expect(aim(402, 65)).toEqual({ x: 1, y: 1 });
  });
});
