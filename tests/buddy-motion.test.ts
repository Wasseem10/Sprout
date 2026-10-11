import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  AnimationClip,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  NumberKeyframeTrack,
  Object3D,
  VectorKeyframeTrack,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  auditSproutModel,
  finiteSproutGaze,
  SproutAttentionController,
  SproutMotionController,
} from '../src/buddyMotionController';
import { runSproutReplay } from '../src/buddyReplay';
import { BuddyAudioEnvelope } from '../src/buddyAudioEnvelope';
import type { AudioPresentationSample } from '../src/audioPresentation';

function fixture() {
  const scene = new Group();
  const named = (name: string, parent: Object3D) => {
    const node = new Object3D();
    node.name = name;
    parent.add(node);
    return node;
  };
  const sprout = named('SPROUT_ROOT', scene);
  const reaction = named('REACTION_ROOT', sprout);
  const root = named('ROOT', reaction);
  const body = named('BODY', root);
  const face = named('FACE_MOUNT', body);
  for (const side of ['L', 'R']) {
    named(`BUD_${side}_TIP`, named(`BUD_${side}_BASE`, body));
    named(`FOOT_${side}`, root);
    named(`EYE_${side}`, named(`GAZE_${side}`, face));
    named(`LID_${side}`, face);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.morphAttributes.position = [0, 1, 2].map(
    () => new Float32BufferAttribute(new Array(9).fill(0), 3),
  );
  const mesh = new Mesh(geometry, new MeshStandardMaterial());
  mesh.name = 'SPROUT_BODY';
  mesh.morphTargetDictionary = { Jelly_Squash: 0, Jelly_Sway_L: 1, Jelly_Sway_R: 2 };
  mesh.morphTargetInfluences = [0, 0, 0];
  reaction.add(mesh);
  const base = (name: string, amplitude: number) =>
    new AnimationClip(name, 6, [
      new VectorKeyframeTrack('BODY.position', [0, 3, 6], [0, 0, 0, 0, amplitude, 0, 0, 0, 0]),
      new NumberKeyframeTrack(
        'SPROUT_BODY.morphTargetInfluences',
        [0, 3, 6],
        [0, 0, 0, amplitude, 0, 0, 0, 0, 0],
      ),
    ]);
  const clips = [
    base('Sprout_Idle', 0.03),
    base('Sprout_Listen', 0.08),
    new AnimationClip('Sprout_Click', 10 / 24, [
      new VectorKeyframeTrack(
        'REACTION_ROOT.scale',
        [0, 5 / 24, 10 / 24],
        [1, 1, 1, 1.07, 0.93, 1.07, 1, 1, 1],
      ),
    ]),
    new AnimationClip(
      'Sprout_Blink',
      4 / 24,
      ['L', 'R'].map(
        (side) =>
          new VectorKeyframeTrack(
            `LID_${side}.scale`,
            [0, 2 / 24, 4 / 24],
            [1, 1, 1, 1, 0.1, 1, 1, 1, 1],
          ),
      ),
    ),
  ];
  return { scene, clips };
}

function pose(root: Object3D) {
  const values: number[] = [];
  root.traverse((node) => {
    values.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray());
    if (node instanceof Mesh) values.push(...(node.morphTargetInfluences ?? []));
  });
  return values;
}

describe('Sprout authored motion controller', () => {
  it('rejects export channels that compete with lids, gaze or reaction ownership', () => {
    const { scene, clips } = fixture();
    expect(auditSproutModel(scene, clips)).toEqual([]);
    clips[0].tracks.push(new VectorKeyframeTrack('GAZE_L.position', [0, 6], [0, 0, 0, 0, 0, 0]));
    expect(auditSproutModel(scene, clips)).toContain(
      'Unexpected owner: Sprout_Idle → GAZE_L.position',
    );
    expect(auditSproutModel(scene, clips)).toContain('Base channel mismatch: Sprout_Listen');
  });

  it('requires one complete base morph vector for both shell and an inset core', () => {
    const { scene, clips } = fixture();
    const shell = scene.getObjectByName('SPROUT_BODY') as Mesh;
    const core = shell.clone();
    core.name = 'SPROUT_CORE';
    shell.parent!.add(core);
    for (const clip of clips.filter((clip) =>
      ['Sprout_Idle', 'Sprout_Listen'].includes(clip.name),
    )) {
      const vector = clip.tracks.find((track) => track.name.startsWith('SPROUT_BODY.'))!.clone();
      vector.name = 'SPROUT_CORE.morphTargetInfluences';
      clip.tracks.push(vector);
    }
    expect(auditSproutModel(scene, clips)).toEqual([]);
    clips[0].tracks.push(clips[0].tracks.at(-1)!.clone());
    expect(auditSproutModel(scene, clips)).toContain(
      'Duplicate morph owner: Sprout_Idle → SPROUT_CORE',
    );
    clips[0].tracks.pop();
    clips[1].tracks.pop();
    expect(auditSproutModel(scene, clips)).toContain(
      'Missing complete morph owner: Sprout_Listen → SPROUT_CORE',
    );
    clips[1].tracks.push(
      new NumberKeyframeTrack('SPROUT_CORE.morphTargetInfluences[0]', [0, 6], [0, 0]),
    );
    expect(auditSproutModel(scene, clips)).toContain(
      'Unexpected owner: Sprout_Listen → SPROUT_CORE.morphTargetInfluences[0]',
    );
    core.morphTargetDictionary = { Jelly_Squash: 0, Jelly_Sway_L: 1 };
    expect(auditSproutModel(scene, clips)).toContain('Missing core jelly morph vector');
  });

  it('retargets from the visible mixture without resetting a contributing action', () => {
    const { scene, clips } = fixture();
    const controller = new SproutMotionController(scene, clips);
    controller.update(2);
    controller.setPhase('listening');
    controller.update(0.1);
    const previous = controller.snapshot();
    expect(previous.weights.Sprout_Idle).toBeGreaterThan(0);
    expect(previous.weights.Sprout_Listen).toBeGreaterThan(0);
    const before = pose(scene);
    controller.setPhase('idle');
    expect(controller.snapshot().weights).toEqual(previous.weights);
    expect(controller.snapshot().times).toEqual(previous.times);
    expect(pose(scene)).toEqual(before);
    controller.update(0.1);
    expect(
      Object.values(controller.snapshot().weights).reduce((sum, weight) => sum + weight, 0),
    ).toBeCloseTo(1, 12);
    controller.dispose();
  });

  it('lets click and blink overlap a base transition, serializes clicks and keeps phase on completion', () => {
    const { scene, clips } = fixture();
    const controller = new SproutMotionController(scene, clips);
    expect(controller.react('Sprout_Click')).toBe(true);
    expect(controller.react('Sprout_Click')).toBe(false);
    controller.setPhase('listening');
    controller.update(0.05);
    expect(controller.react('Sprout_Blink')).toBe(true);
    controller.update(0.1);
    expect(controller.snapshot()).toMatchObject({
      clickActive: true,
      blinkActive: true,
      phase: 'listening',
    });
    controller.update(0.4);
    expect(controller.snapshot()).toMatchObject({
      clickActive: false,
      blinkActive: false,
      phase: 'listening',
    });
    expect(scene.getObjectByName('REACTION_ROOT')!.scale.toArray()).toEqual([1, 1, 1]);
    expect(controller.react('Sprout_Click')).toBe(true);
    controller.dispose();
  });

  it('parks reduced motion, still accepts phase and resumes from a fresh clock', () => {
    const { scene, clips } = fixture();
    const controller = new SproutMotionController(scene, clips);
    controller.update(1);
    controller.react('Sprout_Click');
    controller.setMotion(false);
    const parked = pose(scene);
    controller.setPhase('speaking');
    controller.setGaze(1, 1);
    controller.setAttentionCompression(0.065);
    controller.update(100);
    expect(pose(scene)).toEqual(parked);
    expect(controller.snapshot()).toMatchObject({
      phase: 'speaking',
      moving: false,
      clickActive: false,
    });
    controller.setMotion(true);
    controller.update(1 / 60);
    expect(controller.snapshot().times.Sprout_Listen).toBeCloseTo(1 / 60, 10);
    controller.dispose();
  });

  it('composes identical small attention squash with authored shell/core weights in one mixer', () => {
    const { scene, clips } = fixture();
    const shell = scene.getObjectByName('SPROUT_BODY') as Mesh;
    const core = shell.clone();
    core.name = 'SPROUT_CORE';
    shell.parent!.add(core);
    for (const clip of clips.filter(
      (clip) => clip.name === 'Sprout_Idle' || clip.name === 'Sprout_Listen',
    )) {
      const vector = clip.tracks.at(-1)!.clone();
      vector.name = 'SPROUT_CORE.morphTargetInfluences';
      clip.tracks.push(vector);
    }
    const controller = new SproutMotionController(scene, clips);
    controller.setAttentionCompression(0.04);
    controller.update(3);
    expect(shell.morphTargetInfluences![0]).toBeCloseTo(0.07, 7);
    expect(core.morphTargetInfluences).toEqual(shell.morphTargetInfluences);
    controller.react('Sprout_Click');
    controller.react('Sprout_Blink');
    controller.setPhase('listening');
    controller.update(0.1);
    expect(core.morphTargetInfluences).toEqual(shell.morphTargetInfluences);
    expect(controller.snapshot()).toMatchObject({ clickActive: true, blinkActive: true });
    controller.setMotion(false);
    expect(shell.morphTargetInfluences).toEqual([0, 0, 0]);
    expect(core.morphTargetInfluences).toEqual([0, 0, 0]);
    controller.setMotion(true);
    controller.update(0);
    expect(controller.snapshot().attentionCompression).toBe(0);
    controller.dispose();
  });

  it('compresses through BODY while preserving world eye proportions and neutral pause', () => {
    const { scene, clips } = fixture();
    const controller = new SproutMotionController(scene, clips);
    const body = scene.getObjectByName('BODY')!;
    const eye = scene.getObjectByName('EYE_L')!;
    const scale = new Vector3();
    for (const amount of [0, 0.019, 0.296, 0.65, 1]) {
      controller.setAttentionCompression(amount);
      controller.update(0);
      scene.updateMatrixWorld(true);
      expect(body.scale.x).toBeCloseTo(1 + 0.055 * amount, 7);
      expect(body.scale.y).toBeCloseTo(1 - 0.085 * amount, 7);
      eye.getWorldScale(scale);
      expect(scale.x).toBeCloseTo(1, 5);
      expect(scale.y).toBeCloseTo(1, 5);
      expect(scale.z).toBeCloseTo(1, 5);
    }
    controller.setMotion(false);
    expect(body.scale.toArray()).toEqual([1, 1, 1]);
    expect(scene.getObjectByName('FACE_MOUNT')!.scale.toArray()).toEqual([1, 1, 1]);
    controller.dispose();
  });

  it('replays identical event timestamps and evaluated poses at 30, 60 and 120 updates per second', () => {
    const runs = [30, 60, 120].map((fps) => {
      const { scene, clips } = fixture();
      const controller = new SproutMotionController(scene, clips);
      const replay = runSproutReplay(controller, fps, () => pose(scene));
      controller.dispose();
      return replay;
    });
    for (const replay of runs.slice(1))
      for (let index = 0; index < replay.length; index++) {
        expect(replay[index].at).toBe(runs[0][index].at);
        for (let value = 0; value < replay[index].pose.length; value++)
          expect(replay[index].pose[value]).toBeCloseTo(runs[0][index].pose[value], 6);
      }
  });
});

describe('whole-character attention', () => {
  it('turns +Z toward right/up within the limits and never changes the authored child transform', () => {
    const mount = new Group();
    const child = new Object3D();
    child.position.set(0.1, 0.2, 0.3);
    mount.add(child);
    const before = pose(child);
    const attention = new SproutAttentionController(mount);
    attention.setTarget(100, 100);
    attention.update(10);
    expect(attention.snapshot().yaw).toBeCloseTo((10 * Math.PI) / 180, 10);
    expect(attention.snapshot().pitch).toBeCloseTo((-6 * Math.PI) / 180, 10);
    expect(mount.rotation.z).toBe(0);
    const facing = new Vector3(0, 0, 1).applyQuaternion(mount.quaternion);
    expect(facing.x).toBeGreaterThan(0);
    expect(facing.y).toBeGreaterThan(0);
    expect(pose(child)).toEqual(before);
    attention.setTarget(-100, -100);
    attention.update(10);
    expect(attention.snapshot().yaw).toBeCloseTo((-10 * Math.PI) / 180, 10);
    expect(attention.snapshot().pitch).toBeCloseTo((6 * Math.PI) / 180, 10);
  });

  it('returns neutral on unavailable input and resets a suspended pose without accumulating elapsed time', () => {
    const attention = new SproutAttentionController(new Group());
    attention.setTarget(1, 1);
    attention.update(0.1);
    expect(attention.snapshot().compression).toBeGreaterThan(0);
    attention.setTarget(NaN, 1);
    expect(attention.snapshot().target).toEqual({ x: 0, y: 0 });
    attention.update(3);
    expect(attention.snapshot().x).toBeCloseTo(0, 10);
    expect(attention.snapshot().compression).toBeLessThan(0.000001);
    expect(finiteSproutGaze(1, Infinity)).toEqual({ x: 0, y: 0 });
    attention.setTarget(-1, -1);
    attention.update(0.1);
    attention.reset();
    expect(attention.snapshot()).toMatchObject({ x: 0, y: 0, yaw: 0, pitch: 0, compression: 0 });
    attention.update(NaN);
    expect(attention.snapshot().target).toEqual({ x: 0, y: 0 });
  });

  it('lets eyes lead and evaluates the same interrupted body/eye/settle poses at 30, 60 and 120Hz', () => {
    const run = (fps: number) => {
      const { scene, clips } = fixture();
      const mount = new Group();
      mount.add(scene);
      const attention = new SproutAttentionController(mount);
      const controller = new SproutMotionController(scene, clips);
      const samples: number[][] = [];
      for (const segment of [
        { duration: 0.1, x: 1, y: 1 },
        { duration: 0.3, x: 1, y: 1 },
        { duration: 0.4, x: -1, y: -0.4 },
        { duration: 0.5, x: 0, y: 0 },
        { duration: 0.5, x: 0.6, y: 1 },
        { duration: 0.6, x: 0, y: 0 },
      ]) {
        attention.setTarget(segment.x, segment.y);
        controller.setGaze(segment.x, segment.y);
        let remaining = segment.duration;
        while (remaining > 1e-10) {
          const dt = Math.min(1 / fps, remaining);
          controller.setAttentionCompression(attention.update(dt));
          controller.update(dt);
          remaining -= dt;
        }
        const body = attention.snapshot();
        const eyes = controller.snapshot().gaze;
        samples.push([body.x, body.y, body.compression, eyes.x, eyes.y, ...pose(scene)]);
      }
      expect(samples[0][3]).toBeGreaterThan(samples[0][0]);
      expect(samples[0][4]).toBeGreaterThan(samples[0][1]);
      controller.dispose();
      return samples;
    };
    const runs = [30, 60, 120].map(run);
    for (const samples of runs.slice(1))
      samples.forEach((sample, index) =>
        sample.forEach((value, valueIndex) =>
          expect(value).toBeCloseTo(runs[0][index][valueIndex], 9),
        ),
      );
  });
});

describe('actual Sprout export integration', () => {
  it('preserves single-mixer shell/core deformation and portable physical materials in A/B/C', async () => {
    for (const name of [
      'sprout-prism-v002',
      'sprout-volume-v003',
      'sprout-core-v003',
      'sprout-core-refined-v003',
    ]) {
      const bytes = await readFile(new URL(`../design/buddy/sprout/${name}.glb`, import.meta.url));
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const gltf = await new GLTFLoader().parseAsync(buffer, '');
      expect(auditSproutModel(gltf.scene, gltf.animations), name).toEqual([]);
      expect(gltf.animations, name).toHaveLength(6);
      const shell = gltf.scene.getObjectByName('SPROUT_BODY') as Mesh;
      const core = gltf.scene.getObjectByName('SPROUT_CORE') as Mesh | undefined;
      expect(shell.geometry.morphAttributes.normal, name).toHaveLength(3);
      if (name !== 'sprout-prism-v002') {
        const material = shell.material as MeshPhysicalMaterial;
        expect(material).toBeInstanceOf(MeshPhysicalMaterial);
        expect(material.opacity).toBe(1);
        expect(material.transmission).toBeGreaterThan(0.8);
        expect(material.thickness).toBeGreaterThan(0.25);
        expect(material.attenuationDistance).toBeGreaterThan(3);
        expect(material.ior).toBeGreaterThan(1.3);
      }
      if (name.startsWith('sprout-core')) {
        expect(core).toBeDefined();
        expect(core!.geometry.morphAttributes.normal).toHaveLength(3);
      }
      const mount = new Group();
      mount.add(gltf.scene);
      const attention = new SproutAttentionController(mount);
      const controller = new SproutMotionController(gltf.scene, gltf.animations);
      attention.setTarget(1, 1);
      controller.setGaze(1, 1);
      controller.react('Sprout_Click');
      controller.react('Sprout_Blink');
      for (let frame = 0; frame < 90; frame++) {
        if (frame === 4) controller.setPhase('listening');
        if (frame === 10) controller.setPhase('thinking');
        if (frame === 17) controller.setPhase('speaking');
        if (frame === 30) attention.setTarget(-1, -1);
        if (frame === 60) attention.setTarget(0, 0);
        controller.setAttentionCompression(attention.update(1 / 60));
        controller.update(1 / 60);
        expect(shell.morphTargetInfluences!.every(Number.isFinite), name).toBe(true);
        if (core) expect(core.morphTargetInfluences, name).toEqual(shell.morphTargetInfluences);
      }
      expect(controller.snapshot().phase).toBe('speaking');
      controller.setMotion(false);
      attention.reset();
      const parked = pose(gltf.scene);
      controller.update(300);
      expect(pose(gltf.scene), name).toEqual(parked);
      controller.dispose();
      gltf.scene.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        node.geometry.dispose();
        for (const material of Array.isArray(node.material) ? node.material : [node.material])
          material.dispose();
      });
    }
  });
});

describe('read-only audio presentation envelope', () => {
  const sample = (overrides: Partial<AudioPresentationSample> = {}): AudioPresentationSample => ({
    inputLevel: 0.5,
    outputLevel: 0.8,
    inputSampledAt: 100,
    outputSampledAt: 100,
    playbackGeneration: 1,
    outputPlaying: true,
    source: 'simulated',
    ...overrides,
  });
  it('requires fresh, available levels and an authoritative matching phase', () => {
    const envelope = new BuddyAudioEnvelope();
    expect(envelope.sample(sample(), 'speaking', 120, 0.1)).toBeGreaterThan(0);
    expect(envelope.sample(sample({ inputSampledAt: 500 }), 'speaking', 500, 0.1)).toBe(0);
    expect(envelope.sample(sample({ outputLevel: null }), 'speaking', 120, 0.1)).toBe(0);
    expect(envelope.sample(sample(), 'thinking', 120, 0.1)).toBe(0);
  });
  it('discards obsolete output immediately on interruption or generation change', () => {
    const envelope = new BuddyAudioEnvelope();
    envelope.sample(sample(), 'speaking', 120, 0.1);
    expect(envelope.sample(sample({ outputPlaying: false }), 'speaking', 120, 0.001)).toBe(0);
    envelope.sample(sample(), 'speaking', 120, 0.1);
    expect(
      envelope.sample(sample({ playbackGeneration: 2, outputLevel: 0 }), 'speaking', 120, 0.001),
    ).toBe(0);
  });
});
