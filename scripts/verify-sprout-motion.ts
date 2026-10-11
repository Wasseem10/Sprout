import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  Box3,
  Matrix4,
  Mesh,
  Object3D,
  OrthographicCamera,
  SkinnedMesh,
  Texture,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { auditSproutModel, SproutMotionController } from '../src/buddyMotionController';
import { runSproutReplay } from '../src/buddyReplay';

// Opt into complete pose matrices only when debugging. Normal reports retain
// every acceptance check plus a digest of each timestamped pose trace.
const trace = process.argv.includes('--trace');
const reportArguments = process.argv.slice(2).filter((argument) => argument !== '--trace');
const assetPath = path.resolve(reportArguments[0] ?? 'public/buddy/sprout-v004.glb');
const reportPath = path.resolve(
  reportArguments[1] ?? 'artifacts/glass-sprout-v004/sprout-motion-replay.json',
);
// This CPU audit evaluates exported geometry and animation. Browser proofs
// separately validate embedded image bytes, decoding, colour space and rendering.
function geometryLoader() {
  return new GLTFLoader().register(() => ({
    name: 'GeometryOnlyTexturePlaceholder',
    loadTexture: async () => new Texture(),
  }));
}
const bytes = await readFile(assetPath);
const camera = new OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 30);
camera.position.set(0.1, 0.24, 6);
camera.lookAt(0, 0.08, 0);
camera.updateMatrixWorld(true);
function capture(root: Object3D) {
  root.updateMatrixWorld(true);
  const matrices: number[] = [];
  root.traverse((node) => {
    matrices.push(...node.matrixWorld.elements);
    if (node instanceof Mesh) matrices.push(...(node.morphTargetInfluences ?? []));
  });
  const eyes = ['EYE_L', 'EYE_R'].map((name) => {
    const node = root.getObjectByName(name);
    const projected = node?.getWorldPosition(new Vector3()).project(camera);
    return projected?.toArray() ?? [];
  });
  return { matrices, eyes };
}
function evaluatedVertices(root: Object3D) {
  root.updateMatrixWorld(true);
  const body: number[] = [];
  const envelope = new Box3();
  const projected = new Box3();
  const vertex = new Vector3();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    for (let index = 0; index < node.geometry.attributes.position.count; index++) {
      node.getVertexPosition(index, vertex).applyMatrix4(node.matrixWorld);
      envelope.expandByPoint(vertex);
      if (node.name === 'SPROUT_BODY') body.push(...vertex.toArray());
      projected.expandByPoint(vertex.project(camera));
    }
  });
  return {
    body,
    envelope: { min: envelope.min.toArray(), max: envelope.max.toArray() },
    projected: { min: projected.min.toArray(), max: projected.max.toArray() },
  };
}
const runs = [];
const envelopeSamples: {
  at: number;
  world: { min: number[]; max: number[] };
  projected: { min: number[]; max: number[] };
}[] = [];
let clipManifest: { name: string; duration: number; channels: string[] }[] = [];
let errors: string[] = [];
let meshManifest: {
  name: string;
  vertices: number;
  triangles: number;
  morphs: string[];
  morphNormals: number;
  joints: string[];
}[] = [];
for (const fps of [30, 60, 120]) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await geometryLoader().parseAsync(buffer, `${path.dirname(assetPath)}/`);
  errors = auditSproutModel(gltf.scene, gltf.animations);
  if (fps === 30) {
    gltf.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const count = node.geometry.attributes.position?.count ?? 0;
      const morphs = Object.keys(node.morphTargetDictionary ?? {});
      const morphNormals = node.geometry.morphAttributes.normal ?? [];
      meshManifest.push({
        name: node.name,
        vertices: count,
        triangles: (node.geometry.index?.count ?? count) / 3,
        morphs,
        morphNormals: morphNormals.length,
        joints: node instanceof SkinnedMesh ? node.skeleton.bones.map((bone) => bone.name) : [],
      });
      if (morphs.includes('Jelly_Squash')) {
        if (!node.geometry.attributes.normal) errors.push(`Missing basis normals: ${node.name}`);
        if (
          morphNormals.length !== morphs.length ||
          morphNormals.some((attribute: { count: number }) => attribute.count !== count)
        )
          errors.push(`Missing/mismatched morph normals: ${node.name}`);
        if (
          !node.geometry.morphAttributes.position ||
          node.geometry.morphAttributes.position.some(
            (attribute: { count: number }) => attribute.count !== count,
          )
        )
          errors.push(`Mismatched morph positions: ${node.name}`);
      }
    });
  }
  clipManifest = gltf.animations.map((clip) => ({
    name: clip.name,
    duration: clip.duration,
    channels: clip.tracks.map((track) => track.name),
  }));
  if (errors.length) break;
  const controller = new SproutMotionController(gltf.scene, gltf.animations, 2.3 * 0.02);
  runs.push({
    fps,
    samples: runSproutReplay(controller, fps, () => {
      const snapshot = capture(gltf.scene);
      if (fps === 30) {
        const geometry = evaluatedVertices(gltf.scene);
        envelopeSamples.push({ at: 0, world: geometry.envelope, projected: geometry.projected });
      }
      return snapshot;
    }),
  });
  controller.dispose();
}
if (runs.length)
  for (let index = 0; index < envelopeSamples.length; index++)
    envelopeSamples[index].at = runs[0].samples[index].at;
const seamChecks: {
  clip: string;
  endpointMaxDifference: number;
  seamVelocityMaxDifference: number;
}[] = [];
const clipEnvelopeSamples: {
  clip: string;
  at: number;
  world: { min: number[]; max: number[] };
  projected: { min: number[]; max: number[] };
}[] = [];
let reactionBodyMaxDifference = 0;
let reactionFaceMaxDifference = 0;
const extremeEnvelopes: {
  pose: string;
  world: { min: number[]; max: number[] };
  projected: { min: number[]; max: number[] };
}[] = [];
if (!errors.length) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await geometryLoader().parseAsync(buffer, `${path.dirname(assetPath)}/`);
  const controller = new SproutMotionController(gltf.scene, gltf.animations);
  for (const name of ['Sprout_Idle', 'Sprout_Listen', 'Sprout_Think', 'Sprout_Speak']) {
    const clip = gltf.animations.find((candidate) => candidate.name === name);
    if (!clip) continue;
    controller.mixer.stopAllAction();
    const action = controller.mixer.clipAction(clip).reset().setEffectiveWeight(1).play();
    action.paused = true;
    const geometryAt = (time: number) => {
      action.time = time;
      controller.mixer.update(0);
      return evaluatedVertices(gltf.scene);
    };
    const sampleAt = (time: number) => geometryAt(time).body;
    const epsilon = 0.02;
    const start = sampleAt(0);
    const after = sampleAt(epsilon);
    const before = sampleAt(clip.duration - epsilon);
    const end = sampleAt(clip.duration);
    let endpointMaxDifference = 0;
    let seamVelocityMaxDifference = 0;
    for (let index = 0; index < start.length; index += 3) {
      endpointMaxDifference = Math.max(
        endpointMaxDifference,
        Math.hypot(...[0, 1, 2].map((axis) => end[index + axis] - start[index + axis])),
      );
      seamVelocityMaxDifference = Math.max(
        seamVelocityMaxDifference,
        Math.hypot(
          ...[0, 1, 2].map(
            (axis) =>
              (after[index + axis] -
                start[index + axis] -
                (end[index + axis] - before[index + axis])) /
              epsilon,
          ),
        ),
      );
    }
    seamChecks.push({ clip: name, endpointMaxDifference, seamVelocityMaxDifference });
    if (endpointMaxDifference > 1e-5)
      errors.push(`Loop endpoint mismatch: ${name} (${endpointMaxDifference}m)`);
    // A scale-specific first gate. Report the actual velocity difference rather than endpoint equality alone.
    if (seamVelocityMaxDifference > 0.01)
      errors.push(`Loop seam velocity mismatch: ${name} (${seamVelocityMaxDifference}m/s)`);
    for (let index = 0; index <= 8; index++) {
      const at = (clip.duration * index) / 8;
      const geometry = geometryAt(at);
      clipEnvelopeSamples.push({
        clip: name,
        at,
        world: geometry.envelope,
        projected: geometry.projected,
      });
    }
  }
  controller.dispose();
  const frozen = new SproutMotionController(gltf.scene, gltf.animations);
  frozen.mixer.existingAction(
    gltf.animations.find((clip) => clip.name === 'Sprout_Idle')!,
  )!.paused = true;
  const reaction = gltf.scene.getObjectByName('REACTION_ROOT')!;
  const baseline = evaluatedVertices(gltf.scene).body;
  const beforeReaction = reaction.matrixWorld.clone();
  const faceBefore = ['EYE_L', 'EYE_R'].map((name) =>
    gltf.scene.getObjectByName(name)!.getWorldPosition(new Vector3()),
  );
  frozen.react('Sprout_Click');
  frozen.update(gltf.animations.find((clip) => clip.name === 'Sprout_Click')!.duration / 2);
  const reacted = evaluatedVertices(gltf.scene).body;
  const transform = new Matrix4().multiplyMatrices(reaction.matrixWorld, beforeReaction.invert());
  for (let index = 0; index < baseline.length; index += 3) {
    const expected = new Vector3().fromArray(baseline, index).applyMatrix4(transform);
    reactionBodyMaxDifference = Math.max(
      reactionBodyMaxDifference,
      expected.distanceTo(new Vector3().fromArray(reacted, index)),
    );
  }
  for (let index = 0; index < faceBefore.length; index++) {
    const actual = gltf.scene
      .getObjectByName(index ? 'EYE_R' : 'EYE_L')!
      .getWorldPosition(new Vector3());
    reactionFaceMaxDifference = Math.max(
      reactionFaceMaxDifference,
      faceBefore[index].applyMatrix4(transform).distanceTo(actual),
    );
  }
  if (reactionBodyMaxDifference > 1e-5 || reactionFaceMaxDifference > 1e-5)
    errors.push(
      `Click does not carry skin and face together: body ${reactionBodyMaxDifference}, face ${reactionFaceMaxDifference}`,
    );
  frozen.dispose();
  // Separate, unanimated scene: authored one-hot morphs must remain inside the
  // camera even when the sampled replay never reaches their absolute extremes.
  const extremes = await geometryLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    `${path.dirname(assetPath)}/`,
  );
  const body = extremes.scene.getObjectByName('SPROUT_BODY') as Mesh;
  const dictionary = body.morphTargetDictionary!;
  for (const [pose, weights] of [
    ['Neutral', [0, 0, 0]],
    ['Jelly_Squash', [1, 0, 0]],
    ['Jelly_Sway_L', [0, 1, 0]],
    ['Jelly_Sway_R', [0, 0, 1]],
    ['Combined bounded morphs', [0.34, 0.33, 0.33]],
  ] as const) {
    for (const [index, name] of ['Jelly_Squash', 'Jelly_Sway_L', 'Jelly_Sway_R'].entries())
      body.morphTargetInfluences![dictionary[name]] = weights[index];
    const geometry = evaluatedVertices(extremes.scene);
    extremeEnvelopes.push({ pose, world: geometry.envelope, projected: geometry.projected });
  }
}
for (const sample of envelopeSamples)
  if (
    [...sample.projected.min.slice(0, 2), ...sample.projected.max.slice(0, 2)].some(
      (value) => Math.abs(value) > 0.98,
    )
  )
    errors.push(`Animated envelope exceeds camera margin at ${sample.at}s`);
for (const sample of extremeEnvelopes)
  if (
    [...sample.projected.min.slice(0, 2), ...sample.projected.max.slice(0, 2)].some(
      (value) => Math.abs(value) > 0.98,
    )
  )
    errors.push(`Morph extreme exceeds camera margin: ${sample.pose}`);
for (const sample of clipEnvelopeSamples)
  if (
    [...sample.projected.min.slice(0, 2), ...sample.projected.max.slice(0, 2)].some(
      (value) => Math.abs(value) > 0.98,
    )
  )
    errors.push(`Clip envelope exceeds camera margin: ${sample.clip} at ${sample.at}s`);
let maximumMatrixDifference = 0;
let maximumEyeDifferenceAt96px = 0;
for (const run of runs.slice(1)) {
  for (let index = 0; index < run.samples.length; index++) {
    const current = run.samples[index].pose;
    const reference = runs[0].samples[index].pose;
    for (let value = 0; value < current.matrices.length; value++)
      maximumMatrixDifference = Math.max(
        maximumMatrixDifference,
        Math.abs(current.matrices[value] - reference.matrices[value]),
      );
    for (let eye = 0; eye < current.eyes.length; eye++) {
      maximumEyeDifferenceAt96px = Math.max(
        maximumEyeDifferenceAt96px,
        Math.hypot(
          current.eyes[eye][0] - reference.eyes[eye][0],
          current.eyes[eye][1] - reference.eyes[eye][1],
        ) * 48,
      );
    }
  }
}
if (maximumMatrixDifference > 1e-5)
  errors.push(`Replay matrix difference ${maximumMatrixDifference} > 1e-5`);
if (maximumEyeDifferenceAt96px > 0.2)
  errors.push(`Replay projected eye difference ${maximumEyeDifferenceAt96px}px > 0.2px`);
const report = {
  assetPath,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
  kind: 'Simulated deterministic controller replay; no GPU, microphone or backend proof',
  textureScope:
    'Texture placeholders in CPU geometry checks; embedded texture decoding and rendering are verified by the browser glossy proof.',
  meshManifest,
  seamChecks,
  reactionBodyMaxDifference,
  reactionFaceMaxDifference,
  envelopeSamples,
  extremeEnvelopes,
  clipEnvelopeSamples,
  updatesPerSecond: runs.map((run) => run.fps),
  clipManifest,
  maximumMatrixDifference,
  maximumEyeDifferenceAt96px,
  errors,
  pass: errors.length === 0,
  runs: trace
    ? runs
    : runs.map((run) => ({
        fps: run.fps,
        sampleCount: run.samples.length,
        // Span of the captured deterministic poses, not browser playback time.
        duration: (run.samples.at(-1)?.at ?? 0) - (run.samples[0]?.at ?? 0),
        poseDigest: `sha256:${createHash('sha256').update(JSON.stringify(run.samples)).digest('hex')}`,
      })),
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    reportPath,
    pass: report.pass,
    errors,
    maximumMatrixDifference,
    maximumEyeDifferenceAt96px,
  }),
);
if (!report.pass) process.exitCode = 1;
