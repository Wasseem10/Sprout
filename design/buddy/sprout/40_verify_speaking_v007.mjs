/** Independent source-export, frozen-binary and animation contract audit. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = json(resolve(base, 'sprout-speaking-v007.manifest.json'));
function glb(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  const length = bytes.readUInt32LE(12);
  return {
    doc: JSON.parse(bytes.toString('utf8', 20, 20 + length)),
    binary: bytes.subarray(28 + length),
  };
}
function accessor(asset, index) {
  const a = asset.doc.accessors[index];
  assert.equal(a.componentType, 5126);
  assert.ok(!a.sparse);
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const view = asset.doc.bufferViews[a.bufferView];
  const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = view.byteStride ?? width * 4;
  const result = [];
  for (let i = 0; i < a.count; i += 1) {
    for (let j = 0; j < width; j += 1)
      result.push(asset.binary.readFloatLE(offset + i * stride + j * 4));
  }
  assert.ok(result.every(Number.isFinite));
  return result;
}
const old = glb(manifest.baseline_path);
const current = glb(manifest.path);
const source = glb(manifest.source_export);
const previousSource = glb(manifest.baseline_source_export);
assert.equal(sha(manifest.path), manifest.sha256);
assert.equal(sha(manifest.editable_source), manifest.editable_source_sha256);
assert.equal(sha(manifest.source_export), manifest.source_export_sha256);
for (const [path, hash] of Object.entries(manifest.preservation.previous_file_hashes))
  assert.equal(sha(path), hash, path);
const frozen = [
  'nodes',
  'skins',
  'meshes',
  'materials',
  'images',
  'textures',
  'samplers',
  'extensionsUsed',
];
for (const name of frozen) assert.deepEqual(current.doc[name], old.doc[name], name);
for (const name of ['nodes', 'skins', 'meshes', 'materials', 'images', 'textures']) {
  assert.deepEqual(source.doc[name], previousSource.doc[name], `${name} editable source export`);
}
for (const animation of previousSource.doc.animations) {
  if (animation.name === 'Sprout_Speak') continue;
  const next = source.doc.animations.find((a) => a.name === animation.name);
  assert.ok(next);
  for (const channel of animation.channels) {
    const name = previousSource.doc.nodes[channel.target.node].name;
    const other = next.channels.find(
      (c) => source.doc.nodes[c.target.node].name === name && c.target.path === channel.target.path,
    );
    assert.ok(other, `${animation.name}: ${name}.${channel.target.path}`);
    for (const field of ['input', 'output']) {
      assert.deepEqual(
        accessor(previousSource, animation.samplers[channel.sampler][field]),
        accessor(source, next.samplers[other.sampler][field]),
      );
    }
  }
}
assert.ok(current.binary.subarray(0, old.binary.length).equals(old.binary));
assert.deepEqual(current.doc.accessors.slice(0, old.doc.accessors.length), old.doc.accessors);
assert.deepEqual(current.doc.bufferViews.slice(0, old.doc.bufferViews.length), old.doc.bufferViews);
assert.equal(current.doc.animations.length, 11);
for (const animation of old.doc.animations) {
  if (animation.name === 'Sprout_Speak') continue;
  assert.deepEqual(
    current.doc.animations.find((a) => a.name === animation.name),
    animation,
  );
}

const speak = current.doc.animations.find((a) => a.name === 'Sprout_Speak');
const sourceSpeak = source.doc.animations.find((a) => a.name === 'Sprout_Speak');
const previousSpeak = old.doc.animations.find((a) => a.name === 'Sprout_Speak');
assert.notDeepEqual(speak, previousSpeak);
assert.equal(speak.channels.length, 29);
const channels = new Map();
let maxSeamError = 0;
for (const channel of speak.channels) {
  const name = current.doc.nodes[channel.target.node].name;
  const key = `${name}.${channel.target.path}`;
  assert.ok(!channels.has(key), key);
  const sampler = speak.samplers[channel.sampler];
  const times = accessor(current, sampler.input);
  const values = accessor(current, sampler.output);
  assert.equal(times[0], 0);
  assert.equal(times.at(-1), 6);
  assert.ok(times.every((t, i) => i === 0 || t > times[i - 1]));
  const width = values.length / times.length;
  assert.ok(Number.isInteger(width));
  for (let i = 0; i < width; i += 1)
    maxSeamError = Math.max(maxSeamError, Math.abs(values[i] - values[values.length - width + i]));
  assert.ok(!/REACTION_ROOT|EYE_|GLINT_|ATTENTION|GAZE/.test(name));
  const authored = sourceSpeak.channels.find(
    (c) => source.doc.nodes[c.target.node].name === name && c.target.path === channel.target.path,
  );
  assert.ok(authored, key);
  const authoredSampler = sourceSpeak.samplers[authored.sampler];
  assert.deepEqual(times, accessor(source, authoredSampler.input), `${key} source times`);
  assert.deepEqual(values, accessor(source, authoredSampler.output), `${key} source values`);
  if (['ROOT', 'FOOT_L', 'FOOT_R'].includes(name)) {
    for (let i = width; i < values.length; i += 1)
      assert.equal(values[i], values[i % width], `${key} planted`);
  }
  channels.set(key, { times, values });
}
assert.ok(maxSeamError < 1e-6, String(maxSeamError));
for (const bone of [
  'ROOT',
  'BODY',
  'FACE_MOUNT',
  'BUD_L_BASE',
  'BUD_L_TIP',
  'BUD_R_BASE',
  'BUD_R_TIP',
  'FOOT_L',
  'FOOT_R',
]) {
  for (const path of ['translation', 'rotation', 'scale'])
    assert.ok(channels.has(`${bone}.${path}`));
}
assert.deepEqual(channels.get('SPROUT_BODY.weights'), channels.get('SPROUT_CORE.weights'));
for (const { values } of [channels.get('SPROUT_BODY.weights')])
  assert.ok(values.every((value) => value >= 0 && value <= 1));
const publicAsset = resolve(base, '../../../public/buddy/sprout-v007.glb');
assert.equal(sha(publicAsset), manifest.sha256);
for (const fallback of manifest.fallbacks) {
  for (const path of [fallback.path, fallback.public, fallback.inherited_from])
    assert.equal(sha(path), fallback.sha256);
}
const sourceAudit = json(resolve(base, 'proofs/v007-source-audit.json'));
assert.equal(sourceAudit.pass, true);
assert.equal(sourceAudit.source_sha256, manifest.editable_source_sha256);
assert.equal(sourceAudit.asset_sha256, manifest.sha256);
const renderAudit = json(resolve(base, 'proofs/v007-source-render.json'));
assert.equal(renderAudit.pass, true);
assert.equal(renderAudit.source_sha256, manifest.editable_source_sha256);
for (const image of renderAudit.images) assert.equal(sha(image.path), image.sha256);
const report = {
  pass: true,
  assetSha256: manifest.sha256,
  sourceSha256: manifest.editable_source_sha256,
  unchangedFields: frozen,
  originalBinaryPrefixBytesExact: old.binary.length,
  preservedNonSpeakClips: 10,
  allTenNonSpeakSourceExportClipsExact: true,
  sourceExportGeometryMaterialsHierarchyExact: true,
  speakChannels: channels.size,
  allSpeakSamplesExactlyFromBlenderSourceExport: true,
  durationSeconds: 6,
  maxSeamError,
  rootAndFeetConstant: true,
  matchedShellCoreVectors: true,
  noEyeReactionOrGazeChannels: true,
  unchangedPreviousFiles: manifest.preservation.previous_file_hashes,
  sourceSamples: sourceAudit.speak_frames_checked,
  sourceEyeSamples: sourceAudit.retained_happy_eye_samples,
  sourceImagesVerified: renderAudit.images.length,
  fallbacks: manifest.fallbacks,
  scope:
    'Source/export preservation and sampled animation validity; browser/native motion/flow verification recorded separately.',
};
writeFileSync(
  resolve(base, 'proofs/v007-preservation-audit.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    pass: true,
    sha256: manifest.sha256,
    speakChannels: channels.size,
    maxSeamError,
    sourceImages: renderAudit.images.length,
  }),
);
