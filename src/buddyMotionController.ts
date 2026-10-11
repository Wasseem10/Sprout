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
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import type { BuddyVisualState } from './AssistantSignal';
import {
  DONE_CUE_LIFETIME_MS,
  SPROUT_BEHAVIOR_CLIPS,
  type BuddyBehaviorInput,
  type BuddyBehaviorMode,
  type BuddyBehaviorCapabilities,
} from './buddyBehavior';

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
const BODY_BEHAVIORS = SPROUT_BEHAVIOR_CLIPS.filter((name) => name !== 'Sprout_Done');
const SLEEP_CLIPS = ['Sprout_SleepEnter', 'Sprout_SleepLoop', 'Sprout_Wake'];

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
  const extended = clips.some((clip) => SPROUT_BEHAVIOR_CLIPS.some((name) => name === clip.name));
  if (extended)
    for (const name of [...BASE_NAMES, ...SPROUT_BEHAVIOR_CLIPS])
      if (clips.filter((clip) => clip.name === name).length !== 1)
        errors.push(`Expected exactly one clip: ${name}`);
  const signatures = new Map<string, string>();
  for (const clip of clips) {
    if (
      ![...BASE_NAMES, 'Sprout_Click', 'Sprout_Blink', ...SPROUT_BEHAVIOR_CLIPS].includes(clip.name)
    ) {
      errors.push(`Unknown authored clip: ${clip.name}`);
      continue;
    }
    if (!(clip.duration > 0) || !Number.isFinite(clip.duration))
      errors.push(`Invalid duration: ${clip.name}`);
    if (!clip.tracks.length) errors.push(`Empty clip: ${clip.name}`);
    let hasMorph = false;
    const completeMorphOwners = new Set<Mesh>();
    const channels = new Set<string>();
    for (const track of clip.tracks) {
      const parsed = PropertyBinding.parseTrackName(track.name);
      const target = parsed.objectName === 'bones' ? parsed.objectIndex : parsed.nodeName;
      const node = root.getObjectByName(target) ?? root.getObjectByProperty('uuid', target);
      const semantic = node?.name ?? target;
      const channel = `${semantic}.${parsed.propertyName}`;
      if (channels.has(channel)) errors.push(`Duplicate channel: ${clip.name} → ${channel}`);
      channels.add(channel);
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
        clip.name === 'Sprout_Click' || clip.name === 'Sprout_Done'
          ? semantic === 'REACTION_ROOT' && transform
          : clip.name === 'Sprout_Blink'
            ? ['LID_L', 'LID_R'].includes(semantic) && transform
            : (BONE_NAMES.has(semantic) && transform) ||
              morph ||
              (SLEEP_CLIPS.includes(clip.name) &&
                ['LID_L', 'LID_R'].includes(semantic) &&
                parsed.propertyName === 'scale');
      if (!permitted) errors.push(`Unexpected owner: ${clip.name} → ${track.name}`);
      if (![...track.times, ...track.values].every(Number.isFinite))
        errors.push(`Non-finite channel: ${track.name}`);
    }
    if (
      BASE_NAMES.some((name) => name === clip.name) ||
      BODY_BEHAVIORS.some((name) => name === clip.name)
    ) {
      if (!hasMorph) errors.push(`Missing complete body weights: ${clip.name}`);
      for (const owner of new Set(morphOwners.values()))
        if (!completeMorphOwners.has(owner))
          errors.push(`Missing complete morph owner: ${clip.name} → ${owner.name}`);
      if (extended) {
        for (const bone of BONE_NAMES)
          for (const property of TRANSFORM_PROPERTIES)
            if (!channels.has(`${bone}.${property}`))
              errors.push(`Missing full pose channel: ${clip.name} → ${bone}.${property}`);
        if (SLEEP_CLIPS.includes(clip.name))
          for (const side of ['L', 'R'])
            if (!channels.has(`LID_${side}.scale`))
              errors.push(`Missing sleep lid: ${clip.name} → LID_${side}`);
      }
      if (BASE_NAMES.some((name) => name === clip.name))
        signatures.set(
          clip.name,
          clip.tracks
            .map((track) => track.name)
            .sort()
            .join('|'),
        );
      if (BASE_NAMES.some((name) => name === clip.name) && Math.abs(clip.duration - 6) > 0.002)
        errors.push(`Base loop must be 6 seconds: ${clip.name}`);
    }
  }
  const idleSignature = signatures.get('Sprout_Idle');
  for (const [name, signature] of signatures) {
    if (signature !== idleSignature) errors.push(`Base channel mismatch: ${name}`);
  }
  if (extended) {
    const idle = clips.find((clip) => clip.name === 'Sprout_Idle');
    const baseBindings = new Map(
      idle?.tracks.map((track) => {
        const parsed = PropertyBinding.parseTrackName(track.name);
        const node =
          root.getObjectByName(parsed.nodeName) ??
          root.getObjectByProperty('uuid', parsed.nodeName);
        return [`${node?.name ?? parsed.nodeName}.${parsed.propertyName}`, track.name];
      }),
    );
    const blink = clips.find((clip) => clip.name === 'Sprout_Blink');
    const lidBindings = new Map(
      blink?.tracks.map((track) => {
        const parsed = PropertyBinding.parseTrackName(track.name);
        const node =
          root.getObjectByName(parsed.nodeName) ??
          root.getObjectByProperty('uuid', parsed.nodeName);
        return [`${node?.name ?? parsed.nodeName}.${parsed.propertyName}`, track.name];
      }),
    );
    for (const clip of clips.filter((clip) => BODY_BEHAVIORS.some((name) => name === clip.name)))
      for (const track of clip.tracks) {
        const parsed = PropertyBinding.parseTrackName(track.name);
        const node =
          root.getObjectByName(parsed.nodeName) ??
          root.getObjectByProperty('uuid', parsed.nodeName);
        const key = `${node?.name ?? parsed.nodeName}.${parsed.propertyName}`;
        const expected = baseBindings.get(key) ?? lidBindings.get(key);
        if (expected !== track.name)
          errors.push(`Binding identity mismatch: ${clip.name} → ${track.name}`);
      }
    const click = clips.find((clip) => clip.name === 'Sprout_Click');
    const done = clips.find((clip) => clip.name === 'Sprout_Done');
    if (
      done &&
      click &&
      done.tracks
        .map((track) => track.name)
        .sort()
        .join('|') !==
        click.tracks
          .map((track) => track.name)
          .sort()
          .join('|')
    )
      errors.push('Done/Click binding mismatch');
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
  behavior: {
    mode: BuddyBehaviorMode;
    sleeping: boolean;
    visible: boolean;
    revision: number;
    capabilities: BuddyBehaviorCapabilities;
    doneActive: boolean;
    pendingDone: boolean;
  };
};

/** One mixer composes full-body poses, exclusive lids and serialized reaction overlays. */
export class SproutMotionController {
  readonly mixer: AnimationMixer;
  private base = new Map<string, AnimationAction>();
  private weights: Record<string, number> = {};
  private transition: {
    from: Record<string, number>;
    target: string;
    elapsed: number;
    duration: number;
  } | null = null;
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
  private attentionWeight = 1;
  private attentionSquash: AnimationAction | null = null;
  private disposed = false;
  private mode: BuddyBehaviorMode = 'normal';
  private sleeping = false;
  private visible = true;
  private revision = 0;
  private behavior: BuddyBehaviorInput = { generation: 0, manualEligible: false };
  private lastRequest: number | undefined;
  private seenDone = new Set<string>();
  private pendingDone: NonNullable<BuddyBehaviorInput['done']> | null = null;
  private bodyFinished: { action: AnimationAction; generation: number } | null = null;
  private reactionReturn: {
    action: AnimationAction;
    tracks: {
      track: VectorKeyframeTrack | QuaternionKeyframeTrack;
      property: 'scale' | 'quaternion';
      rest: number[];
    }[];
  } | null = null;
  readonly capabilities: BuddyBehaviorCapabilities;

  constructor(
    private root: Object3D,
    clips: AnimationClip[],
    private gazeTravel = 0.04,
  ) {
    this.mixer = new AnimationMixer(root);
    this.capabilities = {
      joy: clips.some((clip) => clip.name === 'Sprout_JoyJump'),
      sleep: SLEEP_CLIPS.every((name) => clips.some((clip) => clip.name === name)),
      done: clips.some((clip) => clip.name === 'Sprout_Done'),
    };
    for (const name of [...BASE_NAMES, ...BODY_BEHAVIORS]) {
      const clip = clips.find((candidate) => candidate.name === name);
      if (!clip) continue;
      const loop = BASE_NAMES.some((base) => base === name) || name === 'Sprout_SleepLoop';
      const action = this.mixer
        .clipAction(clip)
        .setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
      action.clampWhenFinished = !loop;
      action.setEffectiveWeight(name === 'Sprout_Idle' ? 1 : 0);
      this.base.set(name, action);
      this.weights[name] = name === 'Sprout_Idle' ? 1 : 0;
      if (name === 'Sprout_Idle') action.play();
    }
    for (const name of ['Sprout_Click', 'Sprout_Blink', 'Sprout_Done']) {
      const clip = clips.find((candidate) => candidate.name === name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip).setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      this.oneShots.set(name, { action, active: false, generation: 0, finished: null });
    }
    const reaction = root.getObjectByName('REACTION_ROOT');
    const click = clips.find((clip) => clip.name === 'Sprout_Click');
    if (this.capabilities.done && reaction && click) {
      const tracks = click.tracks.flatMap((track) => {
        const property = PropertyBinding.parseTrackName(track.name).propertyName;
        if (property !== 'scale' && property !== 'quaternion') return [];
        const rest = reaction[property].toArray();
        const recovery =
          property === 'quaternion'
            ? new QuaternionKeyframeTrack(track.name, [0, 0.12], [...rest, ...rest])
            : new VectorKeyframeTrack(track.name, [0, 0.12], [...rest, ...rest]);
        return [{ track: recovery, property: property as 'scale' | 'quaternion', rest }];
      });
      const action = this.mixer
        .clipAction(
          new AnimationClip(
            'Runtime_ReactionReturn',
            0.12,
            tracks.map((item) => item.track),
          ),
        )
        .setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      this.reactionReturn = { action, tracks };
      this.oneShots.set('Runtime_ReactionReturn', {
        action,
        active: false,
        generation: 0,
        finished: null,
      });
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
    if (
      event.action === this.base.get(this.target) &&
      BODY_BEHAVIORS.some((name) => name === this.target)
    )
      this.bodyFinished = { action: event.action, generation: this.generation };
  };

  private phaseTarget() {
    const proposed =
      this.phase === 'listening'
        ? 'Sprout_Listen'
        : this.phase === 'thinking'
          ? 'Sprout_Think'
          : this.phase === 'speaking'
            ? 'Sprout_Speak'
            : 'Sprout_Idle';
    return this.base.has(proposed)
      ? proposed
      : this.phase === 'thinking' || this.phase === 'speaking'
        ? 'Sprout_Listen'
        : 'Sprout_Idle';
  }

  private retarget(target: string, duration = 0.22, restart = false) {
    if (!this.base.has(target)) return;
    this.target = target;
    this.bodyFinished = null;
    for (const [name, action] of this.base) {
      action.stopFading().stopWarping();
      if (BODY_BEHAVIORS.some((body) => body === name) && name !== target) action.paused = true;
      if (name === target && (this.weights[name] ?? 0) === 0) {
        // Only a zero-contribution action can be initialized. Existing mixtures keep their times.
        action.enabled = true;
        action.paused = false;
        action.time = restart ? 0 : this.clock % action.getClip().duration;
        action.play();
      } else if (name === target) {
        action.paused = false;
      }
    }
    this.transition = { from: { ...this.weights }, target, elapsed: 0, duration };
  }

  private changeMode(mode: BuddyBehaviorMode) {
    if (mode !== this.mode) {
      this.mode = mode;
      this.revision += 1;
    }
  }

  private setSleeping(sleeping: boolean) {
    if (sleeping !== this.sleeping) {
      this.sleeping = sleeping;
      this.revision += 1;
    }
  }

  private stopShot(name: string) {
    const shot = this.oneShots.get(name);
    if (!shot) return;
    if (shot.active && name === 'Sprout_Done') this.revision += 1;
    const settle =
      shot.active &&
      (name === 'Sprout_Done' || name === 'Sprout_Click') &&
      this.moving &&
      this.visible &&
      !this.disposed;
    const reaction = settle ? this.root.getObjectByName('REACTION_ROOT') : undefined;
    if (reaction && this.reactionReturn)
      for (const item of this.reactionReturn.tracks)
        item.track.values.set([...reaction[item.property].toArray(), ...item.rest]);
    shot.active = false;
    shot.finished = null;
    shot.generation += 1;
    shot.action.stop();
    if (reaction && this.reactionReturn) {
      const recovery = this.oneShots.get('Runtime_ReactionReturn')!;
      recovery.active = true;
      recovery.generation += 1;
      recovery.finished = null;
      recovery.action.reset().setEffectiveWeight(1).play();
      this.mixer.update(0);
    }
  }

  private interrupted() {
    if (this.behavior.pendingInterruption) return true;
    try {
      return Boolean(this.behavior.isInterrupted?.());
    } catch {
      return true;
    }
  }

  private recover() {
    this.setSleeping(false);
    this.pendingDone = null;
    this.stopShot('Sprout_Done');
    if (this.mode === 'normal' || this.mode === 'recover') return;
    this.generation += 1;
    this.changeMode('recover');
    this.retarget(this.phaseTarget(), 0.18);
    if (!this.moving) this.park();
  }

  setPhase(phase: BuddyVisualState) {
    const changed = this.phase !== phase;
    this.phase = phase;
    if (changed) this.generation += 1;
    if (phase === 'thinking') {
      this.stopShot('Sprout_Done');
    }
    if (changed && phase !== 'idle' && phase !== 'success' && this.mode !== 'normal')
      this.recover();
    if (this.mode === 'recover' && changed && this.moving) {
      this.retarget(this.phaseTarget(), 0.18);
      return;
    }
    if (this.mode !== 'normal' || !this.moving) return;
    const target = this.phaseTarget();
    if (target !== this.target) this.retarget(target);
  }

  /** Inputs carry no resource ownership; rejected requests are consumed, never queued. */
  setBehavior(input: BuddyBehaviorInput | undefined, now = performance.now()) {
    const next = input ?? { generation: 0, manualEligible: false };
    const epochChanged = next.generation !== this.behavior.generation;
    this.behavior = next;
    if (epochChanged || this.interrupted()) {
      this.pendingDone = null;
      this.stopShot('Sprout_Done');
      this.recover();
    } else if (!next.manualEligible && this.mode === 'joy') this.recover();
    else if (!next.manualEligible && ['enter-sleep', 'sleep'].includes(this.mode)) this.wake();
    const request = next.request;
    if (request && Number.isFinite(request.id) && request.id !== this.lastRequest) {
      this.lastRequest = request.id;
      if (request.action === 'wake') this.wake();
      else if (
        next.manualEligible &&
        ['idle', 'success'].includes(this.phase) &&
        !this.interrupted() &&
        this.visible
      ) {
        if (request.action === 'sleep' && this.capabilities.sleep) {
          if (this.mode !== 'sleep' && this.mode !== 'enter-sleep') {
            this.setSleeping(true);
            if (this.mode !== 'joy') this.beginBody('Sprout_SleepEnter', 'enter-sleep');
            if (!this.moving) this.park();
          }
        } else if (
          request.action === 'joy' &&
          this.capabilities.joy &&
          this.moving &&
          this.mode === 'normal'
        ) {
          this.setSleeping(false);
          this.beginBody('Sprout_JoyJump', 'joy');
        }
      }
    }
    const done = next.done;
    if (done && done.id && Number.isFinite(done.issuedAt)) {
      const key = `${done.generation}:${done.id}`;
      if (!this.seenDone.has(key)) {
        this.seenDone.add(key);
        if (this.seenDone.size > 64) this.seenDone.delete(this.seenDone.values().next().value!);
        if (
          done.generation === next.generation &&
          now >= done.issuedAt &&
          now - done.issuedAt <= DONE_CUE_LIFETIME_MS &&
          this.capabilities.done &&
          this.moving &&
          this.visible &&
          !this.interrupted() &&
          !this.oneShots.get('Sprout_Done')?.active
        )
          this.pendingDone = done;
      }
    }
    this.consumeDone(now);
  }

  private consumeDone(now: number) {
    if (!this.pendingDone) return;
    if (
      now - this.pendingDone.issuedAt > DONE_CUE_LIFETIME_MS ||
      this.pendingDone.generation !== this.behavior.generation ||
      !this.moving ||
      !this.visible ||
      this.interrupted()
    ) {
      this.pendingDone = null;
      return;
    }
    if (
      this.phase === 'thinking' ||
      this.mode !== 'normal' ||
      this.oneShots.get('Sprout_Click')?.active ||
      this.oneShots.get('Runtime_ReactionReturn')?.active
    )
      return;
    this.pendingDone = null;
    this.react('Sprout_Done');
  }

  private beginBody(name: string, mode: BuddyBehaviorMode) {
    this.generation += 1;
    this.pendingDone = null;
    for (const shot of this.oneShots.keys())
      if (shot !== 'Runtime_ReactionReturn') this.stopShot(shot);
    this.gazeTarget = { x: 0, y: 0 };
    this.changeMode(mode);
    this.retarget(name, 0.16, true);
  }

  private wake() {
    if (!this.sleeping && !['enter-sleep', 'sleep'].includes(this.mode)) return;
    this.setSleeping(false);
    if (this.mode === 'joy') return; // Cancel the one pending rest request; keep the finite jump.
    if (this.capabilities.sleep && this.moving) this.beginBody('Sprout_Wake', 'wake');
    else {
      this.recover();
      this.park();
    }
  }

  setVisible(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible;
    this.revision += 1;
    if (!visible) {
      this.pendingDone = null;
      this.stopShot('Sprout_Done');
      this.stopShot('Sprout_Click');
      this.stopShot('Sprout_Blink');
      this.stopShot('Runtime_ReactionReturn');
      if (this.mode === 'joy') {
        this.recover();
        this.park();
      }
    } else if (this.moving && this.mode === 'normal' && this.target !== this.phaseTarget()) {
      this.retarget(this.phaseTarget());
    }
  }

  allowsAttention() {
    return (
      this.mode === 'normal' &&
      !this.oneShots.get('Sprout_Done')?.active &&
      !this.oneShots.get('Runtime_ReactionReturn')?.active
    );
  }
  allowsBlink() {
    return !['enter-sleep', 'sleep', 'wake', 'recover'].includes(this.mode);
  }

  private park() {
    this.transition = null;
    this.bodyFinished = null;
    const target = this.sleeping && this.capabilities.sleep ? 'Sprout_SleepLoop' : 'Sprout_Idle';
    for (const [name, action] of this.base) {
      action.stop();
      this.weights[name] = name === target ? 1 : 0;
      action.setEffectiveWeight(this.weights[name]);
      if (name === target) {
        action.time = 0;
        action.paused = true;
        action.play();
      }
    }
    this.target = target;
    this.changeMode(this.sleeping ? 'sleep' : 'normal');
    this.compression = 0;
    this.attentionWeight = 1;
    if (this.attentionSquash) this.attentionSquash.time = 0;
    this.resetGaze();
    this.mixer.update(0);
  }

  setMotion(moving: boolean) {
    if (moving === this.moving) return;
    this.moving = moving;
    this.revision += 1;
    this.clock = 0;
    for (const shot of this.oneShots.values()) {
      shot.active = false;
      shot.finished = null;
      shot.generation += 1;
      shot.action.stop();
    }
    this.pendingDone = null;
    this.park();
    if (moving) {
      const target = this.base.get(this.target);
      if (target) target.paused = false;
      if (!this.sleeping) this.setPhase(this.phase);
    }
  }

  setGaze(x: number, y: number) {
    this.gazeTarget = this.allowsAttention() ? finiteSproutGaze(x, y) : { x: 0, y: 0 };
  }

  resetGaze() {
    this.gazeCurrent = { x: 0, y: 0 };
    this.gazeTarget = { x: 0, y: 0 };
    this.applyGaze();
  }

  setAttentionCompression(value: number) {
    if (!this.allowsAttention()) return;
    this.compression = Number.isFinite(value)
      ? Math.max(0, Math.min(MAX_ATTENTION_COMPRESSION, value))
      : 0;
  }

  /** Cosmetic overlays serialize; the real UI action never waits for their animation. */
  react(name: 'Sprout_Click' | 'Sprout_Blink' | 'Sprout_Done'): boolean {
    const shot = this.oneShots.get(name);
    if (!this.moving || !this.visible || !shot || shot.active || this.disposed) return false;
    if (name === 'Sprout_Blink' ? !this.allowsBlink() : this.mode !== 'normal') return false;
    if (
      (name !== 'Sprout_Blink' &&
        (this.oneShots.get('Sprout_Click')?.active || this.oneShots.get('Sprout_Done')?.active)) ||
      (name !== 'Sprout_Blink' && this.oneShots.get('Runtime_ReactionReturn')?.active)
    )
      return false;
    shot.active = true;
    if (name === 'Sprout_Done') this.revision += 1;
    shot.finished = null;
    shot.generation += 1;
    shot.action.reset().setEffectiveWeight(1).play();
    return true;
  }

  update(delta: number, now = performance.now()) {
    if (this.disposed) return;
    if (this.interrupted()) {
      this.pendingDone = null;
      this.stopShot('Sprout_Done');
      this.recover();
    }
    this.consumeDone(now);
    if (!this.moving || !this.visible) return;
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    if (!dt) {
      this.advance(0);
      return;
    }
    let remaining = dt;
    // Split at authored ends and compositor boundaries; end/return timing is
    // independent of whether the host updates at30/60/120Hz.
    while (remaining > 1e-10) {
      const activeBody =
        BODY_BEHAVIORS.some((name) => name === this.target) && this.target !== 'Sprout_SleepLoop'
          ? this.base.get(this.target)
          : undefined;
      const bodyRemaining =
        activeBody && !activeBody.paused
          ? activeBody.getClip().duration - activeBody.time
          : Infinity;
      const transitionRemaining = this.transition
        ? this.transition.duration - this.transition.elapsed
        : Infinity;
      let shotRemaining = Infinity;
      for (const shot of this.oneShots.values())
        if (shot.active && !shot.action.paused) {
          const left = shot.action.getClip().duration - shot.action.time;
          if (left > 1e-9) shotRemaining = Math.min(shotRemaining, left);
        }
      const step = Math.min(
        remaining,
        bodyRemaining > 1e-9 ? bodyRemaining : Infinity,
        transitionRemaining > 1e-9 ? transitionRemaining : Infinity,
        shotRemaining,
      );
      this.advance(step);
      remaining -= step;
      this.consumeDone(now - remaining * 1000);
    }
    this.consumeDone(now);
  }

  private advance(dt: number) {
    this.clock += dt;
    if (this.transition) {
      this.transition.elapsed += dt;
      const progress = Math.min(1, this.transition.elapsed / this.transition.duration);
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
        if (this.mode === 'recover') this.changeMode('normal');
      }
    }
    if (this.attentionSquash) {
      const targetWeight = this.allowsAttention() ? 1 : 0;
      this.attentionWeight =
        targetWeight + (this.attentionWeight - targetWeight) * Math.exp(-14 * dt);
      this.attentionSquash.setEffectiveWeight(this.attentionWeight);
      this.attentionSquash.time = this.compression;
    }
    this.mixer.update(dt);
    // Stop after mixer iteration, avoiding action-array mutation inside its finished event.
    for (const [name, shot] of this.oneShots) {
      if (shot.finished === shot.generation) {
        if (name === 'Sprout_Done') this.revision += 1;
        shot.active = false;
        shot.finished = null;
        shot.action.stop();
      }
    }
    if (
      this.bodyFinished?.generation === this.generation &&
      this.bodyFinished.action === this.base.get(this.target)
    ) {
      this.bodyFinished = null;
      if (this.mode === 'enter-sleep' && this.sleeping) {
        this.changeMode('sleep');
        this.retarget('Sprout_SleepLoop', 0.16, true);
      } else if (this.mode === 'joy' && this.sleeping) {
        this.beginBody('Sprout_SleepEnter', 'enter-sleep');
      } else if (this.mode === 'joy' || this.mode === 'wake') {
        this.changeMode('recover');
        this.retarget(this.phaseTarget(), 0.18);
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

  behaviorSnapshot(): SproutMotionSnapshot['behavior'] {
    return {
      mode: this.mode,
      sleeping: this.sleeping,
      visible: this.visible,
      revision: this.revision,
      capabilities: { ...this.capabilities },
      doneActive: this.oneShots.get('Sprout_Done')?.active ?? false,
      pendingDone: Boolean(this.pendingDone),
    };
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
      behavior: this.behaviorSnapshot(),
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
