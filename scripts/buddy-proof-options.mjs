import path from 'node:path';

// Preserve historical evidence; new runs use a separate versioned output folder.
const argument = (name, fallback) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
};
export const proofAssetFile = argument('asset', 'sprout-v005.glb');
export const proofCanonicalFile = argument('canonical', 'sprout-prism-v005.glb');
const tag = argument('proof-tag', 'glass-sprout-v005');
for (const filename of [proofAssetFile, proofCanonicalFile]) {
  if (!/^sprout-[a-zA-Z0-9-]+\.glb$/.test(filename))
    throw new Error('Proof assets must be owned Sprout GLB filenames.');
}
if (tag && !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(tag)) throw new Error('Invalid proof tag.');
export const proofAssetUrl = `/buddy/${proofAssetFile}`;
export function proofOutputPath(original) {
  const relative = original.replaceAll('\\', '/');
  if (relative !== 'artifacts' && !relative.startsWith('artifacts/'))
    throw new Error('Proof outputs belong in artifacts.');
  return tag
    ? path.join('artifacts', tag, relative.slice('artifacts'.length).replace(/^\//, ''))
    : original;
}
export const proofLocalDirectory = tag ? path.join('.local', tag) : '.local';
