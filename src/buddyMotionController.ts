import {
  AdditiveAnimationBlendMode,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  Mesh,
  NumberKeyframeTrack,
  Object3D,
  PropertyBinding,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import type { BuddyVisualState } from './AssistantSignal';

const BASE_NAMES = ['Sprout_Idle', 'Sprout_Listen', 'Sprout_Think', 'Sprout_Speak'] as const;
const BONE_NAMES = new Set([
  'ROOT',
  'BODY',
  'FACE_MOUNT',
  'BUD_L_BASE',
  'BUD_L_TIP',
  'BUD_R_BASE',
  'BUD_R_TIP',
  'FOOT_L',
  'FOOT_R',
]);
const REQUIRED_NODES = [
  'SPROUT_ROOT',
  'REACTION_ROOT',
  'GAZE_L',
  'GAZE_R',
  'EYE_L',
  'EYE_R',
  'LID_L',
  'LID_R',
];
const REQUIRED_MORPHS = ['Jelly_Squash', 'Jelly_Sway_L', 'Jelly_Sway_R'];
const TRANSFORM_PROPERTIES = new Set(['position', 'quaternion', 'scale']);
const ATTENTION_YAW = (10 * Math.PI) / 180;
const ATTENTION_PITCH = (6 * Math.PI) / 180;
const ATTENTION_DAMPING = 9;
const COMPRESSION_DAMPING = 6;
const MAX_ATTENTION_COMPRESSION = 1;
const ATTENTION_BODY_SCALE = [0.055, -0.085, 0.055] as const;

/** Invalid coordinates clear both axes rather than leaving a partially stale target. */
export function finiteSproutGaze(x: number, y: number) {
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }
    : { x: 0, y: 0 };
}

/** Sole writer of the unkeyed outer mount; the rig/mixer never owns this transform. */
export class SproutAttentionController {
  private x = 0;
  private y = 0;
  private targetX = 0;
  private targetY = 0;
  private compression = 0;

  constructor(private mount: Object3D) {}

  setTarget(x: number, y: number) {
    const target = finiteSproutGaze(x, y);
    this.targetX = target.x;
    this.targetY = target.y;
  }

  update(delta: number) {
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const bodyDecay = Math.exp(-ATTENTION_DAMPING * dt);
    const compressionDecay = Math.exp(-COMPRESSION_DAMPING * dt);
    // The lag is linear while the target is fixed. Integrating this second
    // damped response exactly keeps compression/settle independent of refresh rate.
    const lag = (Math.abs(this.targetX - this.x) + Math.abs(this.targetY - this.y)) / 4;
    this.compression =
      this.compression * compressionDecay +
      MAX_ATTENTION_COMPRESSION *
        lag *
        COMPRESSION_DAMPING *
        ((bodyDecay - compressionDecay) / (COMPRESSION_DAMPING - ATTENTION_DAMPING));
    this.x = this.targetX + (this.x - this.targetX) * bodyDecay;
    this.y = this.targetY + (this.y - this.targetY) * bodyDecay;
    // Sprout faces +Z: positive yaw turns right; negative X pitch looks up.
    this.mount.rotation.set(-this.y * ATTENTION_PITCH, this.x * ATTENTION_YAW, 0, 'YXZ');
    return this.compression;
  }

  reset() {
    this.x = this.y = this.targetX = this.targetY = this.compression = 0;
    this.mount.rotation.set(0, 0, 0, 'YXZ');
  }

  snapshot() {
    return {
      x: this.x,
      y: this.y,
      target: { x: this.targetX, y: this.targetY },
      yaw: this.mount.rotation.y,
      pitch: this.mount.rotation.x,
      compression: this.compression,
    };
  }
}

/** Reject overlapping authored owners rather than silently stripping export channels. */
export function auditSproutModel(root: Object3D, clips: AnimationClip[]): string[] {
  const errors: string[] = [];
  for (const name of [...REQUIRED_NODES, ...BONE_NAMES]) {
    if (!root.getObjectByName(name)) errors.push(`Missing node: ${name}`);
  }
  const sprout = root.getObjectByName('SPROUT_ROOT');
  if (root.getObjectByName('REACTION_ROOT')?.parent !== sprout)
    errors.push('REACTION_ROOT must be a direct child of SPROUT_ROOT');
  const morphOwners = new Map<string, Mesh>();
  root.traverse((node) => {
    if (!(node instanceof Mesh) || !node.morphTargetDictionary) return;
    if (REQUIRED_MORPHS.every((name) => name in node.morphTargetDictionary!)) {
      morphOwners.set(node.name, node);
      morphOwners.set(node.uuid, node);
    }
  });
  if (!morphOwners.has('SPROUT_BODY')) errors.push('Missing body jelly morph vector');
  if (root.getObjectByName('SPROUT_CORE') && !morphOwners.has('SPROUT_CORE'))
    errors.push('Missing core jelly morph vector');
  for (const name of ['Sprout_Idle', 'Sprout_Listen', 'Sprout_Click', 'Sprout_Blink']) {
    if (clips.filter((clip) => clip.name === name).length !== 1)
      errors.push(`Expected exactly one clip: ${name}`);
  }
  const signatures = new Map<string, string>();
  for (const clip of clips) {
    if (![...BASE_NAMES, 'Sprout_Click', 'Sprout_Blink'].includes(clip.name)) continue;
    if (!(clip.duration > 0) || !Number.isFinite(clip.duration))
      errors.push(`Invalid duration: ${clip.name}`);
    if (!clip.tracks.length) errors.push(`Empty clip: ${clip.name}`);
    let hasMorph = false;
    const completeMorphOwners = new Set<Mesh>();
    for (const track of clip.tracks) {
      const parsed = PropertyBinding.parseTrackName(track.name);
      const target = parsed.objectName === 'bones' ? parsed.objectIndex : parsed.nodeName;
      const node = root.getObjectByName(target) ?? root.getObjectByProperty('uuid', target);
      const semantic = node?.name ?? target;
      const transform = TRANSFORM_PROPERTIES.has(parsed.propertyName);
      const morphOwner = morphOwners.get(target);
      const morph =
        parsed.propertyName === 'morphTargetInfluences' &&
        parsed.propertyIndex === undefined &&
        Boolean(morphOwner) &&
        track.getValueSize() === morphOwner?.morphTargetInfluences?.length;
      hasMorph ||= morph;
      if (morph && morphOwner) {
        if (completeMorphOwners.has(morphOwner))
          errors.push(`Duplicate morph owner: ${clip.name} → ${morphOwner.name}`);
        completeMorphOwners.add(morphOwner);
      }
      const permitted =
        clip.name === 'Sprout_Click'
          ? semantic === 'REACTION_ROOT' && transform
          : clip.name === 'Sprout_Blink'
            ? ['LID_L', 'LID_R'].includes(semantic) && transform
            : (BONE_NAMES.has(semantic) && transform) || morph;
      if (!permitted) errors.push(`Unexpected owner: ${clip.name} → ${track.name}`);
      if (![...track.times, ...track.values].every(Number.isFinite))
        errors.push(`Non-finite channel: ${track.name}`);
    }
    if (BASE_NAMES.some((name) => name === clip.name)) {
      if (!hasMorph) errors.push(`Missing complete body weights: ${clip.name}`);
      for (const owner of new Set(morphOwners.values()))
        if (!completeMorphOwners.has(owner))
          errors.push(`Missing complete morph owner: ${clip.name} → ${owner.name}`);
      signatures.set(
        clip.name,
        clip.tracks
          .map((track) => track.name)
          .sort()
          .join('|'),
      );
      if (Math.abs(clip.duration - 6) > 0.002)
        errors.push(`Base loop must be 6 seconds: ${clip.name}`);
    }
  }
  const idleSignature = signatures.get('Sprout_Idle');
  for (const [name, signature] of signatures) {
    if (signature !== idleSignature) errors.push(`Base channel mismatch: ${name}`);
  }
  return errors;
}

export type SproutMotionSnapshot = {
  phase: BuddyVisualState;
  moving: boolean;
  weights: Record<string, number>;
  times: Record<string, number>;
  clickActive: boolean;
  blinkActive: boolean;
  generation: number;
  gaze: { x: number; y: number };
  attentionCompression: number;
};

/** One mixer, one base-weight compositor, two disjoint one-shots, unkeyed gaze. */
export class SproutMotionController {
  readonly mixer: AnimationMixer;
  private base = new Map<string, AnimationAction>();
  private weights: Record<string, number> = {};
  private transition: { from: Record<string, number>; target: string; elapsed: number } | null =
    null;
  private target = 'Sprout_Idle';
  private clock = 0;
  private phase: BuddyVisualState = 'idle';
  private moving = true;
  private generation = 0;
  private oneShots = new Map<
    string,
    { action: AnimationAction; active: boolean; generation: number; finished: number | null }
  >();
  private gaze: { node: Object3D; origin: Vector3 }[];
  private gazeTarget = { x: 0, y: 0 };
  private gazeCurrent = { x: 0, y: 0 };
  private compression = 0;
  private attentionSquash: AnimationAction | null = null;
  private disposed = false;

  constructor(
    private root: Object3D,
    clips: AnimationClip[],
    private gazeTravel = 0.04,
  ) {
    this.mixer = new AnimationMixer(root);
    for (const name of BASE_NAMES) {
      const clip = clips.find((candidate) => candidate.name === name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip).setLoop(LoopRepeat, Infinity);
      action.setEffectiveWeight(name === 'Sprout_Idle' ? 1 : 0);
      this.base.set(name, action);
      this.weights[name] = name === 'Sprout_Idle' ? 1 : 0;
      if (name === 'Sprout_Idle') action.play();
    }
    for (const name of ['Sprout_Click', 'Sprout_Blink']) {
      const clip = clips.find((candidate) => candidate.name === name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip).setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      this.oneShots.set(name, { action, active: false, generation: 0, finished: null });
    }
    this.gaze = ['GAZE_L', 'GAZE_R'].flatMap((name) => {
      const node = root.getObjectByName(name);
      return node ? [{ node, origin: node.position.clone() }] : [];
    });
    const squashTracks: (NumberKeyframeTrack | VectorKeyframeTrack)[] = [];
    const idle = clips.find((clip) => clip.name === 'Sprout_Idle');
    const authoredPath = (node: Object3D, property: string) =>
      idle?.tracks.find((track) => {
        const parsed = PropertyBinding.parseTrackName(track.name);
        return (
          parsed.propertyName === property &&
          (parsed.nodeName === node.name || parsed.nodeName === node.uuid)
        );
      })?.name ?? `${node.name}.${property}`;
    root.traverse((node) => {
      if (!(node instanceof Mesh) || !node.morphTargetDictionary || !node.morphTargetInfluences)
        return;
      if (!REQUIRED_MORPHS.every((name) => name in node.morphTargetDictionary!)) return;
      const vector = node.morphTargetInfluences.map((_, index) =>
        index === node.morphTargetDictionary!.Jelly_Squash ? 1 : 0,
      );
      // Three caches PropertyMixers by the exact track path. Reuse the
      // authored spelling (name or UUID), otherwise two caches would write
      // the same influences separately instead of composing the additive value.
      squashTracks.push(
        new NumberKeyframeTrack(
          authoredPath(node, 'morphTargetInfluences'),
          [0, 1],
          [...vector.map(() => 0), ...vector],
        ),
      );
    });
    const body = root.getObjectByName('BODY');
    const face = root.getObjectByName('FACE_MOUNT');
    if (body && face) {
      squashTracks.push(
        new VectorKeyframeTrack(
          authoredPath(body, 'scale'),
          [0, 1],
          [0, 0, 0, ...ATTENTION_BODY_SCALE],
        ),
      );
      // Keep eye/smile proportions while their mount follows the compressed
      // body. A sampled inverse scale is composed by the same PropertyMixer,
      // with sub-pixel interpolation error rather than a second bone writer.
      const times = Array.from({ length: 65 }, (_, index) => index / 64);
      const values = times.flatMap((amount) =>
        ATTENTION_BODY_SCALE.map((offset) => 1 / (1 + offset * amount) - 1),
      );
      squashTracks.push(new VectorKeyframeTrack(authoredPath(face, 'scale'), times, values));
    }
    if (squashTracks.length) {
      // Additive vectors are composed by this same mixer, including an inset
      // core when present. No direct morph or bone writer is introduced.
      const clip = new AnimationClip(
        'Runtime_AttentionSoftness',
        1,
        squashTracks,
        AdditiveAnimationBlendMode,
      );
      this.attentionSquash = this.mixer.clipAction(clip).setLoop(LoopRepeat, Infinity);
      // The compositor seeks this parameter clip; mixer time never advances
      // it. Neutral additive values at time0 make pause/reset deterministic.
      this.attentionSquash.setEffectiveWeight(1).setEffectiveTimeScale(0).play();
    }
    this.mixer.addEventListener('finished', this.finished);
    this.mixer.update(0);
  }

  private finished = (event: { action: AnimationAction }) => {
    for (const shot of this.oneShots.values()) {
      if (shot.active && event.action === shot.action) shot.finished = shot.generation;
    }
  };

  setPhase(phase: BuddyVisualState) {
    this.phase = phase;
    this.generation += 1;
    const proposed =
      phase === 'listening'
        ? 'Sprout_Listen'
        : phase === 'thinking'
          ? 'Sprout_Think'
          : phase === 'speaking'
            ? 'Sprout_Speak'
            : 'Sprout_Idle';
    const target = this.base.has(proposed)
      ? proposed
      : phase === 'thinking' || phase === 'speaking'
        ? 'Sprout_Listen'
        : 'Sprout_Idle';
    if (!this.moving || target === this.target) return;
    this.target = target;
    for (const [name, action] of this.base) {
      action.stopFading().stopWarping();
      if (name === target && (this.weights[name] ?? 0) === 0) {
        // Only a zero-contribution action can be initialized. Existing mixtures keep their times.
        action.enabled = true;
        action.paused = false;
        action.time = this.clock % action.getClip().duration;
        action.play();
      }
    }
    this.transition = { from: { ...this.weights }, target, elapsed: 0 };
  }

  setMotion(moving: boolean) {
    if (moving === this.moving) return;
    this.moving = moving;
    this.transition = null;
    this.clock = 0;
    for (const shot of this.oneShots.values()) {
      shot.active = false;
      shot.finished = null;
      shot.generation += 1;
      shot.action.stop();
    }
    for (const [name, action] of this.base) {
      action.stop();
      this.weights[name] = name === 'Sprout_Idle' ? 1 : 0;
      action.setEffectiveWeight(this.weights[name]);
      if (name === 'Sprout_Idle') {
        action.time = 0;
        action.paused = !moving;
        action.play();
      }
    }
    this.target = 'Sprout_Idle';
    this.gazeCurrent = { x: 0, y: 0 };
    this.compression = 0;
    if (this.attentionSquash) this.attentionSquash.time = 0;
    this.applyGaze();
    this.mixer.update(0);
    if (moving) this.setPhase(this.phase);
  }

  setGaze(x: number, y: number) {
    this.gazeTarget = finiteSproutGaze(x, y);
  }

  resetGaze() {
    this.gazeCurrent = { x: 0, y: 0 };
    this.gazeTarget = { x: 0, y: 0 };
    this.applyGaze();
  }

  setAttentionCompression(value: number) {
    this.compression = Number.isFinite(value)
      ? Math.max(0, Math.min(MAX_ATTENTION_COMPRESSION, value))
      : 0;
  }

  /** First proof serializes retriggers; UI activation itself never waits for this reaction. */
  react(name: 'Sprout_Click' | 'Sprout_Blink'): boolean {
    const shot = this.oneShots.get(name);
    if (!this.moving || !shot || shot.active || this.disposed) return false;
    shot.active = true;
    shot.finished = null;
    shot.generation += 1;
    shot.action.reset().setEffectiveWeight(1).play();
    return true;
  }

  update(delta: number) {
    if (this.disposed || !this.moving) return;
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.clock += dt;
    if (this.transition) {
      this.transition.elapsed += dt;
      const progress = Math.min(1, this.transition.elapsed / 0.22);
      const alpha = progress * progress * (3 - 2 * progress);
      for (const [name, action] of this.base) {
        const weight =
          (this.transition.from[name] ?? 0) * (1 - alpha) +
          (name === this.transition.target ? alpha : 0);
        this.weights[name] = weight;
        action.setEffectiveWeight(weight);
      }
      if (progress === 1) {
        this.transition = null;
        for (const [name, action] of this.base) if (!this.weights[name]) action.stop();
      }
    }
    if (this.attentionSquash) this.attentionSquash.time = this.compression;
    this.mixer.update(dt);
    // Stop after mixer iteration, avoiding action-array mutation inside its finished event.
    for (const shot of this.oneShots.values()) {
      if (shot.finished === shot.generation) {
        shot.active = false;
        shot.finished = null;
        shot.action.stop();
      }
    }
    const alpha = 1 - Math.exp(-12 * dt);
    this.gazeCurrent.x += (this.gazeTarget.x - this.gazeCurrent.x) * alpha;
    this.gazeCurrent.y += (this.gazeTarget.y - this.gazeCurrent.y) * alpha;
    this.applyGaze();
  }

  private applyGaze() {
    for (const { node, origin } of this.gaze) {
      node.position.copy(origin);
      node.position.x += this.gazeCurrent.x * this.gazeTravel;
      node.position.y += this.gazeCurrent.y * this.gazeTravel * 0.6;
    }
  }

  snapshot(): SproutMotionSnapshot {
    return {
      phase: this.phase,
      moving: this.moving,
      weights: { ...this.weights },
      times: Object.fromEntries([...this.base].map(([name, action]) => [name, action.time])),
      clickActive: this.oneShots.get('Sprout_Click')?.active ?? false,
      blinkActive: this.oneShots.get('Sprout_Blink')?.active ?? false,
      generation: this.generation,
      gaze: { ...this.gazeCurrent },
      attentionCompression: this.compression,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.removeEventListener('finished', this.finished);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}
