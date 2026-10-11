import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import validator from 'gltf-validator';

const input = path.resolve(process.argv[2] ?? 'public/buddy/sprout-v002.glb');
const output = path.resolve(process.argv[3] ?? 'artifacts/sprout-gltf-validation.json');
const bytes = await readFile(input);
const report = await validator.validateBytes(new Uint8Array(bytes), {
  uri: path.basename(input),
  maxIssues: 1000,
});
await writeFile(output, JSON.stringify({
  input,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  validator: validator.version(),
  ...report,
}, null, 2) + '\n');
console.log(JSON.stringify({ output, errors: report.issues.numErrors,
  warnings: report.issues.numWarnings, infos: report.issues.numInfos,
  messages: report.issues.messages.slice(0, 12) }));
if (report.issues.numErrors) process.exitCode = 1;
