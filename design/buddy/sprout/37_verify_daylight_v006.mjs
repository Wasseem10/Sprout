/** Audit the material-only variant against immutable v005 and source export. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const manifest = readJson(resolve(base, 'sprout-daylight-v006.manifest.json'));
function glb(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  const length = bytes.readUInt32LE(12);
  return {
    doc: JSON.parse(bytes.toString('utf8', 20, 20 + length)),
    binary: bytes.subarray(28 + length),
  };
}
const old = glb(manifest.baseline_path);
const current = glb(manifest.path);
const source = glb(manifest.source_export);
assert.equal(sha(manifest.path), manifest.sha256);
assert.equal(sha(manifest.editable_source), manifest.editable_source_sha256);
assert.equal(sha(manifest.source_export), manifest.source_export_sha256);
for (const [file, hash] of Object.entries(manifest.preservation.v005_file_hashes))
  assert.equal(sha(file), hash, file);
const fields = [
  'nodes',
  'skins',
  'animations',
  'meshes',
  'accessors',
  'bufferViews',
  'images',
  'textures',
];
for (const field of fields) assert.deepEqual(current.doc[field], old.doc[field], field);
const colourAccessor = old.doc.accessors[manifest.preservation.changed_accessor];
const colourView = old.doc.bufferViews[colourAccessor.bufferView];
const start = colourView.byteOffset ?? 0;
const end = start + colourView.byteLength;
assert.equal(current.binary.length, old.binary.length);
assert.ok(current.binary.subarray(0, start).equals(old.binary.subarray(0, start)));
assert.ok(current.binary.subarray(end).equals(old.binary.subarray(end)));
assert.ok(!current.binary.subarray(start, end).equals(old.binary.subarray(start, end)));
for (let index = 0; index < current.doc.materials.length; index += 1) {
  const material = current.doc.materials[index];
  if (material.name.includes('Daylight')) {
    assert.deepEqual(
      material,
      source.doc.materials.find((m) => m.name === material.name),
    );
  } else {
    assert.deepEqual(material, old.doc.materials[index]);
  }
}
assert.equal(current.doc.animations.length, 11);
const publicDir = resolve(base, '../../../public/buddy');
const copies = [
  [manifest.path, resolve(publicDir, 'sprout-v006.glb')],
  [
    resolve(base, 'proofs/sprout-v006-idle-fallback.png'),
    resolve(base, 'sprout-daylight-v006.png'),
    resolve(publicDir, 'sprout-v006.png'),
  ],
  [
    resolve(base, 'proofs/sprout-v006-sleep-fallback.png'),
    resolve(base, 'sprout-daylight-sleep-v006.png'),
    resolve(publicDir, 'sprout-v006-sleep.png'),
  ],
];
const assets = copies.map((paths) => {
  const hash = sha(paths[0]);
  for (const file of paths) assert.equal(sha(file), hash);
  return { files: paths, sha256: hash, bytes: readFileSync(paths[0]).length };
});
const fallback = readJson(resolve(base, 'proofs/v006-daylight-fallback.json'));
assert.equal(fallback.source_sha256, manifest.editable_source_sha256);
assert.equal(fallback.asset_sha256, manifest.sha256);
assert.equal(fallback.images.length, 2);
for (const image of fallback.images) assert.equal(sha(image.png), image.sha256);
const report = {
  pass: true,
  currentSha256: manifest.sha256,
  baselineSha256: manifest.baseline_sha256,
  unchangedFields: fields,
  binaryIdenticalOutsideShellColour: true,
  byteException: { start, end, accessor: manifest.preservation.changed_accessor },
  materialsFromEditableSourceExport: true,
  v005FilesIntact: manifest.preservation.v005_file_hashes,
  originalTextureAndElevenAnimationsExact: true,
  sourceEyeActionSamples: fallback.source_action_samples,
  assets,
  scope:
    'Asset integrity, source material provenance and source-backed fallbacks; browser/native look and rendering speed verified separately.',
};
writeFileSync(
  resolve(base, 'proofs/v006-preservation-audit.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify({ pass: true, sha256: manifest.sha256, assets }));
