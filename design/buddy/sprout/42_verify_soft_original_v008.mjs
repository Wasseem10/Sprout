/** Independent preservation proof for the Original material + v007 motion asset. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = json(resolve(base, 'sprout-soft-original-v008.manifest.json'));
function glb(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12);
  return {
    doc: JSON.parse(bytes.toString('utf8', 20, 20 + length)),
    binary: bytes.subarray(28 + length),
  };
}
function accessor(asset, index) {
  const acc = asset.doc.accessors[index];
  assert.ok(!acc.sparse);
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
  const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType] * width;
  assert.ok(Number.isFinite(size));
  const view = asset.doc.bufferViews[acc.bufferView];
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return Buffer.concat(
    Array.from({ length: acc.count }, (_, i) =>
      asset.binary.subarray(
        start + i * (view.byteStride ?? size),
        start + i * (view.byteStride ?? size) + size,
      ),
    ),
  );
}
const old = glb(manifest.baseline_path);
const original = glb(manifest.appearance_reference_path);
const current = glb(manifest.path);
const source = glb(manifest.source_export);
const oldSource = glb(manifest.baseline_source_export);
const originalManifest = json(resolve(base, 'sprout-prism-v005.manifest.json'));
const originalSource = glb(originalManifest.source_export);
assert.equal(sha(manifest.path), manifest.sha256);
assert.equal(sha(manifest.editable_source), manifest.editable_source_sha256);
assert.equal(sha(manifest.source_export), manifest.source_export_sha256);
assert.equal(sha(resolve(base, '../../../public/buddy/sprout-v008.glb')), manifest.sha256);
for (const [path, hash] of Object.entries(manifest.preservation.previous_file_hashes))
  assert.equal(sha(path), hash, path);
for (const key of new Set([...Object.keys(old.doc), ...Object.keys(current.doc)])) {
  if (key !== 'materials') assert.deepEqual(current.doc[key], old.doc[key], key);
}
assert.deepEqual(current.doc.materials, original.doc.materials);
const [start, end] = manifest.preservation.colour_byte_range;
assert.deepEqual(current.binary.subarray(0, start), old.binary.subarray(0, start));
assert.deepEqual(current.binary.subarray(end), old.binary.subarray(end));
assert.deepEqual(current.binary.subarray(start, end), original.binary.subarray(start, end));
for (let i = 0; i < current.doc.accessors.length; i += 1) {
  assert.deepEqual(
    accessor(current, i),
    accessor(i === manifest.preservation.colour_accessor ? original : old, i),
    `runtime accessor ${i}`,
  );
}
// The actual reopened Blender export must retain the same animation/geometry,
// not just the runtime container produced by replacing material data.
for (const key of ['nodes', 'skins', 'meshes', 'textures', 'samplers'])
  assert.deepEqual(source.doc[key], oldSource.doc[key], `source ${key}`);
assert.deepEqual(source.doc.materials, originalSource.doc.materials);
const sourceColour = source.doc.meshes.find((m) => m.name === 'SPROUT_BODY_RuntimeBasis')
  .primitives[0].attributes.COLOR_0;
const originalColour = originalSource.doc.meshes.find((m) => m.name === 'SPROUT_BODY_RuntimeBasis')
  .primitives[0].attributes.COLOR_0;
assert.deepEqual(accessor(source, sourceColour), accessor(originalSource, originalColour));
assert.equal(source.doc.accessors.length, oldSource.doc.accessors.length);
for (let i = 0; i < source.doc.accessors.length; i += 1) {
  if (i !== sourceColour)
    assert.deepEqual(accessor(source, i), accessor(oldSource, i), `source accessor ${i}`);
}
assert.deepEqual(source.doc.animations, oldSource.doc.animations);
assert.equal(current.doc.animations.length, 11);
for (const fallback of manifest.fallbacks) {
  for (const path of [fallback.path, fallback.public, fallback.inherited_from])
    assert.equal(sha(path), fallback.sha256);
}
const renderAudit = json(resolve(base, 'proofs/v008-source-render.json'));
assert.equal(renderAudit.pass, true);
assert.equal(renderAudit.source_sha256, manifest.editable_source_sha256);
assert.equal(renderAudit.asset_sha256, manifest.sha256);
assert.equal(renderAudit.original_source_lighting_transforms_and_values_verified, true);
assert.equal(renderAudit.images.length, 10);
for (const image of renderAudit.images) assert.equal(sha(image.path), image.sha256);
const report = {
  pass: true,
  assetSha256: manifest.sha256,
  sourceSha256: manifest.editable_source_sha256,
  allElevenRuntimeAndSourceAnimationsExactV007: true,
  runtimeAccessorCount: current.doc.accessors.length,
  sourceAccessorCount: source.doc.accessors.length,
  onlyChangedRuntimeBinaryRange: [start, end],
  colourAccessorRestoredExactlyFromV005: manifest.preservation.colour_accessor,
  materialsRestoredExactlyFromV005: true,
  allOtherRuntimeAndSourceAccessorsExactV007: true,
  geometrySkinMorphHierarchyExact: true,
  reopenedSourceRenderImagesVerified: renderAudit.images.length,
  sourceLightingTransformsAndValuesVerified: true,
  previousFileHashes: manifest.preservation.previous_file_hashes,
  fallbacks: manifest.fallbacks,
  scope:
    'Independent source-export and runtime payload preservation, not browser lighting or interaction proof.',
};
writeFileSync(
  resolve(base, 'proofs/v008-preservation-audit.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    pass: true,
    assetSha256: manifest.sha256,
    unchangedClips: 11,
    runtimeAccessors: current.doc.accessors.length,
    sourceAccessors: source.doc.accessors.length,
  }),
);
