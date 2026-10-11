import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  AnimationClip,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  Object3D,
  OrthographicCamera,
  QuaternionKeyframeTrack,
  Texture,
  VectorKeyframeTrack,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { auditSproutModel, SproutMotionController } from '../src/buddyMotionController';
import type { BuddyBehaviorInput } from '../src/buddyBehavior';
import { buddyPlaybackPhase } from '../src/buddyBehavior';
import type { AudioPresentationSample } from '../src/audioPresentation';

function fixture() {
  const scene = new Group();
  const named = (name: string, parent: Object3D) => {
    const node = new Object3D();
    node.name = name;
    parent.add(node);
    return node;
  };
  const reaction = named('REACTION_ROOT', named('SPROUT_ROOT', scene));
  const root = named('ROOT', reaction),
    body = named('BODY', root),
    face = named('FACE_MOUNT', body);
  const bones = [root, body, face];
  for (const side of ['L', 'R']) {
    const base = named(`BUD_${side}_BASE`, body);
    bones.push(base, named(`BUD_${side}_TIP`, base), named(`FOOT_${side}`, root));
    named(`EYE_${side}`, named(`GAZE_${side}`, face));
    named(`LID_${side}`, face);
  }
  for (const name of ['SPROUT_BODY', 'SPROUT_CORE']) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.morphAttributes.position = [0, 1, 2].map(
      () => new Float32BufferAttribute(new Array(9).fill(0), 3),
    );
    const mesh = new Mesh(geometry, new MeshStandardMaterial());
    mesh.name = name;
    mesh.morphTargetDictionary = { Jelly_Squash: 0, Jelly_Sway_L: 1, Jelly_Sway_R: 2 };
    mesh.morphTargetInfluences = [0, 0, 0];
    reaction.add(mesh);
  }
  const full = (
    name: string,
    duration: number,
    from = 0,
    middle = 0.1,
    end = 0,
    sleeping = false,
  ) => {
    const times = [0, duration / 2, duration];
    const tracks = bones.flatMap((bone) => [
      new VectorKeyframeTrack(
        `${bone.name}.position`,
        times,
        bone.name === 'ROOT' ? [0, from, 0, 0, middle, 0, 0, end, 0] : new Array(9).fill(0),
      ),
      new QuaternionKeyframeTrack(
        `${bone.name}.quaternion`,
        times,
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
      ),
      new VectorKeyframeTrack(`${bone.name}.scale`, times, new Array(9).fill(1)),
    ]);
    const morphs = ['SPROUT_BODY', 'SPROUT_CORE'].map(
      (owner) =>
        new NumberKeyframeTrack(
          `${owner}.morphTargetInfluences`,
          times,
          [0, 0, 0, 0.1, 0.03, 0, 0, 0, 0],
        ),
    );
    const lids = sleeping
      ? ['L', 'R'].map(
          (side) =>
            new VectorKeyframeTrack(
              `LID_${side}.scale`,
              times,
              name === 'Sprout_SleepEnter'
                ? [1, 1, 1, 1, 0.1, 1, 1, 0.1, 1]
                : name === 'Sprout_Wake'
                  ? [1, 0.1, 1, 1, 0.5, 1, 1, 1, 1]
                  : [1, 0.1, 1, 1, 0.1, 1, 1, 0.1, 1],
            ),
        )
      : [];
    return new AnimationClip(name, duration, [...tracks, ...morphs, ...lids]);
  };
  const overlay = (name: string, duration: number) =>
    new AnimationClip(name, duration, [
      new QuaternionKeyframeTrack(
        'REACTION_ROOT.quaternion',
        [0, duration / 2, duration],
        [0, 0, 0, 1, 0.04, 0, 0, Math.sqrt(1 - 0.04 ** 2), 0, 0, 0, 1],
      ),
      new VectorKeyframeTrack(
        'REACTION_ROOT.scale',
        [0, duration / 2, duration],
        [1, 1, 1, 1.03, 0.97, 1.03, 1, 1, 1],
      ),
    ]);
  const clips = [
    ...['Idle', 'Listen', 'Think', 'Speak'].map((name) => full(`Sprout_${name}`, 6)),
    overlay('Sprout_Click', 0.4),
    new AnimationClip(
      'Sprout_Blink',
      0.2,
      ['L', 'R'].map(
        (side) =>
          new VectorKeyframeTrack(
            `LID_${side}.scale`,
            [0, 0.1, 0.2],
            [1, 1, 1, 1, 0.1, 1, 1, 1, 1],
          ),
      ),
    ),
    full('Sprout_JoyJump', 1.6, 0, 0.6, 0),
    full('Sprout_SleepEnter', 1.6, 0, -0.15, -0.3, true),
    full('Sprout_SleepLoop', 4.8, -0.3, -0.29, -0.3, true),
    full('Sprout_Wake', 1.2, -0.3, -0.15, 0, true),
    overlay('Sprout_Done', 0.8),
  ];
  return { scene, clips, controller: new SproutMotionController(scene, clips) };
}
const input = (overrides: Partial<BuddyBehaviorInput> = {}): BuddyBehaviorInput => ({
  generation: 1,
  manualEligible: true,
  ...overrides,
});
function pose(scene: Object3D) {
  const result: number[] = [];
  scene.traverse((node) => {
    result.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray());
    if (node instanceof Mesh) result.push(...(node.morphTargetInfluences ?? []));
  });
  return result;
}

describe('exclusive cosmetic behaviour ownership', () => {
  const automatic = (
    changes: Partial<NonNullable<BuddyBehaviorInput['automatic']>> = {},
    generation = 1,
  ): BuddyBehaviorInput => ({
    generation,
    manualEligible: false,
    automatic: { presence: 'awake', revision: 1, interrupt: false, ...changes },
  });

  it('keeps logical sleep independently from voice/manual eligibility, including initial and static mounts', () => {
    const { controller } = fixture();
    controller.setBehavior(automatic({ presence: 'asleep' }), 0);
    expect(controller.snapshot().behavior).toMatchObject({ mode: 'sleep', sleeping: true });
    controller.setPhase('listening');
    controller.setBehavior(automatic({ presence: 'asleep' }), 100);
    expect(controller.snapshot().behavior.mode).toBe('sleep');
    controller.setMotion(false);
    controller.setVisible(false);
    controller.setBehavior(automatic({ presence: 'awake', revision: 2 }), 200);
    controller.setBehavior(automatic({ presence: 'asleep', revision: 3 }), 300);
    expect(controller.snapshot().behavior).toMatchObject({ mode: 'sleep', sleeping: true });
    controller.dispose();
  });

  it('preserves Wake across mic starting/listening and preempts only for genuine input/work', () => {
    const { controller, scene } = fixture();
    controller.setBehavior(automatic({ presence: 'asleep' }), 0);
    controller.setBehavior(automatic({ revision: 2, wake: { id: 'resume' } }, 2), 100);
    expect(controller.snapshot().behavior.mode).toBe('wake');
    controller.setPhase('thinking'); // Current adapter maps microphone starting here.
    controller.update(0.2, 300);
    controller.setPhase('listening');
    expect(controller.snapshot().behavior.mode).toBe('wake');
    const before = pose(scene);
    controller.setBehavior(automatic({ revision: 3, interrupt: true }), 300);
    controller.setPhase('thinking');
    expect(pose(scene)).toEqual(before);
    controller.update(0.3, 600);
    expect(controller.snapshot().behavior.mode).toBe('normal');
    expect(controller.snapshot().weights.Sprout_Think).toBe(1);
    controller.dispose();
  });

  it('finishes an automatic wake into the latest quiet listening state', () => {
    const { controller } = fixture();
    controller.setBehavior(automatic({ presence: 'asleep' }), 0);
    controller.setBehavior(automatic({ revision: 2, wake: { id: 'resume' } }), 0);
    controller.setPhase('listening');
    controller.update(2, 2000);
    expect(controller.snapshot().behavior).toMatchObject({ mode: 'normal', sleeping: false });
    expect(controller.snapshot().weights.Sprout_Listen).toBe(1);
    controller.dispose();
  });

  it('celebrates once during quiet open listening without also playing Done', () => {
    const { controller } = fixture();
    controller.setBehavior(automatic(), 0);
    controller.setPhase('listening');
    const cue = {
      ...automatic({ joy: { id: 'task-success' } }),
      done: { id: 'old', generation: 1, issuedAt: 0 },
    };
    controller.setBehavior(cue, 0);
    expect(controller.snapshot().behavior).toMatchObject({ mode: 'joy', doneActive: false });
    controller.update(0.5, 500);
    const time = controller.snapshot().times.Sprout_JoyJump;
    controller.setBehavior(cue, 500);
    expect(controller.snapshot().times.Sprout_JoyJump).toBe(time);
    controller.update(2, 2500);
    controller.setBehavior(cue, 2500);
    expect(controller.snapshot().behavior.mode).toBe('normal');
    expect(controller.snapshot().weights.Sprout_Listen).toBe(1);
    controller.dispose();
  });

  it('consumes old automatic joy at initial mount and unavailable presentation without replay', () => {
    for (const state of ['initial', 'hidden', 'paused'] as const) {
      const { controller } = fixture();
      if (state !== 'initial') controller.setBehavior(automatic(), 0);
      if (state === 'hidden') controller.setVisible(false);
      if (state === 'paused') controller.setMotion(false);
      const cue = automatic({ joy: { id: 'already-issued' } });
      controller.setBehavior(cue, 0);
      controller.setVisible(true);
      controller.setMotion(true);
      controller.setBehavior(cue, 1);
      controller.update(0.3, 301);
      expect(controller.snapshot().behavior.mode).toBe('normal');
      controller.dispose();
    }
  });

  it('seeds a cue issued during an asynchronous model load while retaining subsequent fresh cues', () => {
    const { controller } = fixture();
    controller.setBehavior(automatic(), 0);
    const duringLoad = automatic({ joy: { id: 'while-loading' } });
    controller.setBehavior(duringLoad, 100, true);
    controller.setBehavior(duringLoad, 101);
    expect(controller.snapshot().behavior.mode).toBe('normal');
    controller.setBehavior(automatic({ joy: { id: 'after-ready' } }), 200);
    expect(controller.snapshot().behavior.mode).toBe('joy');
    controller.dispose();
  });

  it('preempts automatic joy from the current pose and permits pending rest after the short cue', () => {
    const { controller, scene } = fixture();
    controller.setBehavior(automatic(), 0);
    controller.setBehavior(automatic({ joy: { id: 'first' } }), 0);
    controller.update(0.4, 400);
    const before = pose(scene);
    controller.setBehavior(automatic({ revision: 2, interrupt: true }), 400);
    expect(pose(scene)).toEqual(before);
    controller.update(0.3, 700);
    controller.setBehavior(automatic({ revision: 3, joy: { id: 'second' } }), 700);
    controller.update(2, 2700);
    controller.setBehavior(automatic({ presence: 'asleep', revision: 3 }), 2700);
    expect(controller.snapshot().behavior.mode).toBe('enter-sleep');
    controller.update(2, 4700);
    expect(controller.snapshot().behavior.mode).toBe('sleep');
    controller.dispose();
  });

  it('suppresses pending/waiting speech while allowing real playback with unavailable amplitude and Studio previews', () => {
    const sample: AudioPresentationSample = {
      inputLevel: null,
      outputLevel: null,
      inputSampledAt: 0,
      outputSampledAt: 0,
      playbackGeneration: 1,
      outputPlaying: false,
      source: 'voice',
    };
    expect(buddyPlaybackPhase('speaking', sample)).toBe('thinking');
    expect(buddyPlaybackPhase('speaking', { ...sample, outputPlaying: true })).toBe('speaking');
    expect(buddyPlaybackPhase('speaking', { ...sample, source: 'simulated' })).toBe('speaking');
    expect(buddyPlaybackPhase('listening', sample)).toBe('listening');
  });

  it('requires every extended clip, complete paired vectors, exact owners and no unknown animation', () => {
    const { scene, clips, controller } = fixture();
    expect(auditSproutModel(scene, clips)).toEqual([]);
    expect(
      auditSproutModel(
        scene,
        clips.filter((clip) => clip.name !== 'Sprout_Wake'),
      ),
    ).toContain('Expected exactly one clip: Sprout_Wake');
    const sleep = clips.find((clip) => clip.name === 'Sprout_SleepLoop')!;
    sleep.tracks = sleep.tracks.filter(
      (track) => track.name !== 'SPROUT_CORE.morphTargetInfluences',
    );
    expect(auditSproutModel(scene, clips)).toContain(
      'Missing complete morph owner: Sprout_SleepLoop → SPROUT_CORE',
    );
    clips
      .find((clip) => clip.name === 'Sprout_Done')!
      .tracks.push(new VectorKeyframeTrack('BODY.scale', [0, 0.8], new Array(6).fill(1)));
    expect(auditSproutModel(scene, clips)).toContain('Unexpected owner: Sprout_Done → BODY.scale');
    expect(auditSproutModel(scene, [...clips, new AnimationClip('Unexpected', 1, [])])).toContain(
      'Unknown authored clip: Unexpected',
    );
    controller.dispose();
  });

  it('checks current eligibility, consumes rejected requests and coalesces repeated joy without a queue', () => {
    const { controller } = fixture();
    controller.setBehavior(input({ manualEligible: false, request: { id: 1, action: 'joy' } }), 0);
    controller.setBehavior(input({ request: { id: 1, action: 'joy' } }), 0);
    expect(controller.snapshot().behavior.mode).toBe('normal');
    controller.setBehavior(input({ request: { id: 2, action: 'joy' } }), 0);
    controller.update(0.4, 400);
    const before = controller.snapshot().times.Sprout_JoyJump;
    controller.setBehavior(input({ request: { id: 3, action: 'joy' } }), 400);
    expect(controller.snapshot().times.Sprout_JoyJump).toBe(before);
    controller.update(2, 2400);
    expect(controller.snapshot().behavior.mode).toBe('normal');
    controller.dispose();
  });

  it('owns sleep lids, suppresses blink/gaze/squash and parks the authored resting pose', () => {
    const { controller, scene } = fixture();
    controller.setBehavior(input({ request: { id: 1, action: 'sleep' } }), 0);
    controller.update(2, 2000);
    expect(controller.snapshot().behavior).toMatchObject({ mode: 'sleep', sleeping: true });
    expect(controller.react('Sprout_Blink')).toBe(false);
    controller.setGaze(1, 1);
    controller.setAttentionCompression(1);
    controller.update(0.1, 2100);
    expect(controller.snapshot().gaze).toEqual({ x: 0, y: 0 });
    expect(scene.getObjectByName('LID_L')!.scale.y).toBeCloseTo(0.1, 6);
    controller.setMotion(false);
    const parked = pose(scene);
    controller.update(100, 102100);
    expect(pose(scene)).toEqual(parked);
    expect(scene.getObjectByName('ROOT')!.position.y).toBeCloseTo(-0.3, 6);
    controller.setMotion(true);
    controller.update(0.1, 102200);
    expect(controller.snapshot().behavior.mode).toBe('sleep');
    controller.dispose();
  });

  it('preempts joy from current eligibility even without a phase or epoch change', () => {
    const { controller, scene } = fixture();
    controller.setBehavior(input({ request: { id: 1, action: 'joy' } }), 0);
    controller.update(0.6, 600);
    const before = pose(scene);
    controller.setBehavior(input({ manualEligible: false }), 600);
    expect(pose(scene)).toEqual(before);
    expect(controller.snapshot().behavior.mode).toBe('recover');
    controller.update(0.2, 800);
    expect(controller.snapshot().behavior.mode).toBe('normal');
    controller.dispose();
  });

  it('retargets lowering/wake/joy from the visible mixture, then restores the latest real phase', () => {
    for (const action of ['joy', 'sleep'] as const) {
      const { controller, scene } = fixture();
      controller.setBehavior(input({ request: { id: 1, action } }), 0);
      controller.update(0.5, 500);
      const before = pose(scene);
      controller.setPhase('thinking');
      expect(pose(scene)).toEqual(before);
      controller.setPhase('speaking');
      controller.update(0.3, 800);
      expect(controller.snapshot().behavior.mode).toBe('normal');
      expect(controller.snapshot().weights.Sprout_Speak).toBe(1);
      expect((scene.getObjectByName('SPROUT_CORE') as Mesh).morphTargetInfluences).toEqual(
        (scene.getObjectByName('SPROUT_BODY') as Mesh).morphTargetInfluences,
      );
      controller.dispose();
    }
  });

  it('lands before the one pending rest request and ignores stale body completions after wake reversal', () => {
    const { controller, scene } = fixture();
    controller.setBehavior(input({ request: { id: 1, action: 'joy' } }), 0);
    controller.update(0.5, 500);
    controller.setBehavior(input({ request: { id: 2, action: 'sleep' } }), 500);
    expect(controller.snapshot().behavior.mode).toBe('joy');
    controller.update(1.2, 1700);
    expect(controller.snapshot().behavior.mode).toBe('enter-sleep');
    controller.update(0.5, 2200);
    const before = pose(scene);
    controller.setBehavior(input({ request: { id: 3, action: 'wake' } }), 2200);
    expect(pose(scene)).toEqual(before);
    controller.setBehavior(input({ generation: 2 }), 2200);
    controller.update(2, 4200);
    expect(controller.snapshot().behavior).toMatchObject({ mode: 'normal', sleeping: false });
    controller.dispose();
  });

  it('plays one fresh Done during conversation, serializes Click and stops immediately on live ref interruption', () => {
    const { controller } = fixture();
    let interrupted = false;
    controller.setPhase('listening');
    controller.react('Sprout_Click');
    const state = input({
      manualEligible: false,
      isInterrupted: () => interrupted,
      done: { id: 'task-1', generation: 1, issuedAt: 0 },
    });
    controller.setBehavior(state, 0);
    expect(controller.snapshot().behavior.pendingDone).toBe(true);
    controller.update(0.5, 500);
    expect(controller.snapshot().behavior.doneActive).toBe(true);
    expect(controller.react('Sprout_Click')).toBe(false);
    controller.setPhase('speaking');
    expect(controller.snapshot().behavior.doneActive).toBe(true);
    interrupted = true;
    controller.update(0.01, 510);
    expect(controller.snapshot().behavior.doneActive).toBe(false);
    interrupted = false;
    controller.setBehavior(state, 600);
    expect(controller.snapshot().behavior.doneActive).toBe(false);
    controller.dispose();
  });

  it('expires processing Done, rejects stale generations and drops hidden/paused cues without replay', () => {
    const { controller } = fixture();
    controller.setPhase('thinking');
    controller.setBehavior(input({ done: { id: 'old', generation: 0, issuedAt: 0 } }), 0);
    expect(controller.snapshot().behavior.pendingDone).toBe(false);
    controller.setBehavior(input({ done: { id: 'current', generation: 1, issuedAt: 0 } }), 0);
    expect(controller.snapshot().behavior.pendingDone).toBe(true);
    controller.update(1.1, 1100);
    controller.setPhase('speaking');
    controller.update(0.1, 1200);
    expect(controller.snapshot().behavior.doneActive).toBe(false);
    controller.setVisible(false);
    const hidden = input({
      request: { id: 3, action: 'joy' },
      done: { id: 'hidden', generation: 1, issuedAt: 1200 },
    });
    controller.setBehavior(hidden, 1200);
    controller.setVisible(true);
    controller.setBehavior(hidden, 1201);
    expect(controller.snapshot().behavior).toMatchObject({ mode: 'normal', doneActive: false });
    controller.setMotion(false);
    controller.setBehavior(input({ done: { id: 'paused', generation: 1, issuedAt: 1201 } }), 1201);
    controller.setMotion(true);
    controller.update(0.1, 1301);
    expect(controller.snapshot().behavior.doneActive).toBe(false);
    controller.dispose();
  });

  it('cancels Done through a bounded neutral return instead of snapping its nod', () => {
    const { controller, scene } = fixture();
    controller.setPhase('speaking');
    controller.setBehavior(
      input({ manualEligible: false, done: { id: 'nod', generation: 1, issuedAt: 0 } }),
      0,
    );
    controller.update(0.35, 350);
    const reaction = scene.getObjectByName('REACTION_ROOT')!;
    const before = [...reaction.quaternion.toArray(), ...reaction.scale.toArray()];
    controller.setPhase('thinking');
    const after = [...reaction.quaternion.toArray(), ...reaction.scale.toArray()];
    after.forEach((value, index) => expect(value).toBeCloseTo(before[index], 6));
    expect(controller.snapshot().behavior.doneActive).toBe(false);
    expect(controller.react('Sprout_Click')).toBe(false);
    controller.update(0.13, 480);
    expect(reaction.scale.toArray()).toEqual([1, 1, 1]);
    expect(reaction.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(controller.react('Sprout_Click')).toBe(true);
    controller.dispose();
  });

  it('keeps legacy capability profiles valid without claiming the five missing clips', () => {
    const { scene, clips, controller: unused } = fixture();
    unused.dispose();
    const legacy = clips.slice(0, 6);
    expect(auditSproutModel(scene, legacy)).toEqual([]);
    const controller = new SproutMotionController(scene, legacy);
    controller.setBehavior(
      input({
        request: { id: 1, action: 'sleep' },
        done: { id: 'task', generation: 1, issuedAt: 0 },
      }),
      0,
    );
    expect(controller.snapshot().behavior).toMatchObject({
      mode: 'normal',
      capabilities: { joy: false, sleep: false, done: false },
    });
    controller.dispose();
  });
});

describe('actual eleven-clip GLB replay (geometry-only texture placeholders)', () => {
  it('fits sampled skinned/morphed joy/rest/wake/Done vertices within the fixed1.72/.24 stage', async () => {
    const bytes = await readFile(
      new URL('../design/buddy/sprout/sprout-prism-v004.glb', import.meta.url),
    );
    const camera = new OrthographicCamera(-1.72, 1.72, 1.72, -1.72, 0.1, 30);
    camera.position.set(0.1, 0.24, 6);
    camera.lookAt(0, 0.24, 0);
    camera.updateMatrixWorld(true);
    const projected = new Vector3();
    let maxAbsX = 0,
      maxAbsY = 0,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const mode of ['joy', 'sleep', 'wake', 'done'] as const) {
      const loader = new GLTFLoader().register(() => ({
        name: 'GeometryOnlyTexturePlaceholder',
        loadTexture: async () => new Texture(),
      }));
      const gltf = await loader.parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        '',
      );
      const controller = new SproutMotionController(gltf.scene, gltf.animations);
      if (mode === 'wake') {
        controller.setBehavior(input({ request: { id: 1, action: 'sleep' } }), 0);
        controller.update(2, 2000);
      }
      if (mode === 'done') {
        controller.setPhase('speaking');
        controller.setBehavior(
          input({ manualEligible: false, done: { id: 'done', generation: 1, issuedAt: 0 } }),
          0,
        );
      } else controller.setBehavior(input({ request: { id: 2, action: mode } }), 0);
      const length = mode === 'sleep' ? 7 : 2;
      for (let sample = 0; sample <= length * 24; sample++) {
        if (sample) controller.update(1 / 24, (sample * 1000) / 24);
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          for (let index = 0; index < node.geometry.attributes.position.count; index++) {
            node.getVertexPosition(index, projected).applyMatrix4(node.matrixWorld).project(camera);
            maxAbsX = Math.max(maxAbsX, Math.abs(projected.x));
            maxAbsY = Math.max(maxAbsY, Math.abs(projected.y));
            minZ = Math.min(minZ, projected.z);
            maxZ = Math.max(maxZ, projected.z);
          }
        });
      }
      controller.dispose();
      gltf.scene.traverse((node) => {
        if (node instanceof Mesh) {
          node.geometry.dispose();
          for (const material of Array.isArray(node.material) ? node.material : [node.material])
            material.dispose();
        }
      });
    }
    expect(maxAbsX).toBeLessThan(0.98);
    expect(maxAbsY).toBeLessThan(0.98);
    expect(minZ).toBeGreaterThan(-1);
    expect(maxZ).toBeLessThan(1);
  });
  it('evaluates interrupted behaviours at30/60/120Hz with identical poses and one mixer', async () => {
    const bytes = await readFile(
      new URL('../design/buddy/sprout/sprout-prism-v004.glb', import.meta.url),
    );
    const traces: number[][][] = [];
    for (const fps of [30, 60, 120]) {
      const loader = new GLTFLoader().register(() => ({
        name: 'GeometryOnlyTexturePlaceholder',
        loadTexture: async () => new Texture(),
      }));
      const gltf = await loader.parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        '',
      );
      expect(auditSproutModel(gltf.scene, gltf.animations)).toEqual([]);
      expect(gltf.animations).toHaveLength(11);
      const controller = new SproutMotionController(gltf.scene, gltf.animations);
      const samples: number[][] = [];
      const steps = [
        { duration: 0.5, action: 'joy' },
        { duration: 0.7 },
        { duration: 0.4, phase: 'thinking' },
        { duration: 0.3, phase: 'idle' },
        { duration: 1.9, action: 'joy' },
        { duration: 2, action: 'sleep' },
        { duration: 1.2 },
        { duration: 1.5, action: 'wake' },
        { duration: 2, action: 'sleep' },
        { duration: 0.4, action: 'wake' },
        { duration: 0.2, action: 'sleep' },
        { duration: 0.4, phase: 'speaking' },
        { duration: 0.3, done: true },
        { duration: 0.5 },
        { duration: 0.4, phase: 'thinking' },
      ] as const;
      let now = 0,
        id = 0;
      for (const step of steps) {
        if ('phase' in step) controller.setPhase(step.phase);
        if ('action' in step)
          controller.setBehavior(input({ request: { id: ++id, action: step.action } }), now * 1000);
        if ('done' in step)
          controller.setBehavior(
            input({
              manualEligible: false,
              done: { id: 'actual', generation: 1, issuedAt: now * 1000 },
            }),
            now * 1000,
          );
        let remaining: number = step.duration;
        while (remaining > 1e-10) {
          const dt = Math.min(1 / fps, remaining);
          now += dt;
          controller.update(dt, now * 1000);
          remaining -= dt;
        }
        samples.push(pose(gltf.scene));
        const shell = gltf.scene.getObjectByName('SPROUT_BODY') as Mesh,
          core = gltf.scene.getObjectByName('SPROUT_CORE') as Mesh;
        expect(core.morphTargetInfluences).toEqual(shell.morphTargetInfluences);
        expect(
          Object.values(controller.snapshot().weights).reduce((sum, value) => sum + value, 0),
        ).toBeCloseTo(1, 10);
      }
      traces.push(samples);
      controller.dispose();
      gltf.scene.traverse((node) => {
        if (node instanceof Mesh) {
          node.geometry.dispose();
          for (const material of Array.isArray(node.material) ? node.material : [node.material])
            material.dispose();
        }
      });
    }
    for (const trace of traces.slice(1))
      trace.forEach((sample, index) =>
        sample.forEach((value, coordinate) =>
          expect(value).toBeCloseTo(traces[0][index][coordinate], 6),
        ),
      );
  });
});
