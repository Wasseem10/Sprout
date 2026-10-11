import { cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowed = [
  'package.json',
  'package-lock.json',
  '.dockerignore',
  'dist',
  'dist-server',
  'data',
  'migrations',
  'deploy/Dockerfile.runtime',
  'deploy/compose.yaml',
  'deploy/compose.runtime.yaml',
  'deploy/Caddyfile',
  'deploy/cloud.env.example',
];

async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Deployment bundle does not accept symlink files.');
    if (entry.isDirectory())
      files.push(...(await inventory(path.join(directory, entry.name), relative)));
    else if (entry.isFile()) {
      const bytes = await readFile(path.join(directory, entry.name));
      files.push({
        path: relative,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    } else throw new Error('Deployment bundle found an unsupported file.');
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

// This allowlist deliberately excludes laptop credentials, logs, native executables,
// screenshots, source image folders, and generated Office files.
export async function prepareBundle(projectRoot = root) {
  for (const required of [
    'dist/index.html',
    'dist-server/server/start.js',
    'dist-server/server/app.js',
  ]) {
    if (!(await stat(path.join(projectRoot, required)).catch(() => null))?.isFile())
      throw new Error('Run npm run build successfully before preparing the deployment bundle.');
  }
  const privateRoot = path.join(projectRoot, '.local');
  await mkdir(privateRoot, { recursive: true });
  const destination = await mkdtemp(path.join(privateRoot, 'vultr-bundle-'));
  for (const relative of allowed) {
    const source = path.join(projectRoot, relative);
    const resolved = await stat(source);
    if (!resolved.isDirectory() && !resolved.isFile()) throw new Error('Invalid deployment input.');
    await mkdir(path.dirname(path.join(destination, relative)), { recursive: true });
    await cp(source, path.join(destination, relative), {
      recursive: resolved.isDirectory(),
      dereference: false,
    });
  }
  const files = await inventory(destination);
  const receipt = {
    preparedAt: new Date().toISOString(),
    desktopExecution: 'local-only',
    buildKind: 'precompiled-runtime',
    hostingProvider: 'not-deployed',
    files,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
  };
  await writeFile(
    path.join(destination, 'bundle-manifest.json'),
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 },
  );
  return { destination, fileCount: files.length, totalBytes: receipt.totalBytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await prepareBundle();
    console.log(JSON.stringify(result));
    console.log(
      'Copy this directory to the owned host, add private deploy/.env.cloud there, then use compose.yaml plus compose.runtime.yaml. This is not a live deployment.',
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Deployment bundle could not be prepared.',
    );
    process.exitCode = 1;
  }
}
