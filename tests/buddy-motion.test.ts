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
  VectorKeyframeTrack,
} from 'three';
import { auditSproutModel, SproutMotionController } from '../src/buddyMotionController';
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
