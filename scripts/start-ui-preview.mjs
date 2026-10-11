import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, openSync, closeSync, existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logs = path.join(workspace, '.local', 'ui-preview-logs');
const electron = path.join(workspace, 'node_modules', 'electron', 'dist', 'electron.exe');

async function ready(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}
async function portOccupied(port) {
  return new Promise((resolve) => {
    const connection = createConnection({ host: '127.0.0.1', port });
    const finish = (occupied) => {
      connection.destroy();
      resolve(occupied);
    };
    connection.once('connect', () => finish(true));
    connection.once('error', () => finish(false));
    connection.setTimeout(500, () => finish(false));
  });
}
async function ensureServer(name, port, url, args) {
  if (await ready(url)) return;
  if (await portOccupied(port))
    throw new Error(
      `Port ${port} is occupied but ${name} is unavailable. Close that development server and try again.`,
    );
  mkdirSync(logs, { recursive: true });
  const output = openSync(path.join(logs, `${name}.log`), 'a');
  const child = spawn(process.execPath, args, {
    cwd: workspace,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', output, output],
  });
  child.on('error', (error) => console.error(`${name}: ${error.message}`));
  child.unref();
  closeSync(output);
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await ready(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${name} did not become ready. See .local/ui-preview-logs/${name}.log.`);
}

try {
  if (!existsSync(electron))
    throw new Error('Run npm ci and npm run setup:desktop once before opening the preview.');
  await ensureServer('api', 4311, 'http://127.0.0.1:4311/health', [
    'node_modules/tsx/dist/cli.mjs',
    'watch',
    'server/start.ts',
  ]);
  await ensureServer('ui', 5173, 'http://127.0.0.1:5173/', [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
  ]);
  // Reuse an existing server only when it serves this checkout's authored asset.
  const response = await fetch('http://127.0.0.1:5173/buddy/insight-core-v1.glb', {
    signal: AbortSignal.timeout(5000),
  });
  const served = Buffer.from(await response.arrayBuffer());
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  if (
    !response.ok ||
    digest(served) !==
      digest(readFileSync(path.join(workspace, 'public/buddy/insight-core-v1.glb')))
  ) {
    throw new Error(
      'Port 5173 serves a different UI checkout. Close that preview before starting this one.',
    );
  }
  const child = spawn(
    electron,
    ['.', '--dev', `--user-data-dir=${path.join(workspace, '.local', 'desktop-profile-ui')}`],
    {
      cwd: workspace,
      detached: true,
      windowsHide: false,
      stdio: 'ignore',
    },
  );
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.unref();
  console.log('InsightOS UI opened. Studio: http://127.0.0.1:5173/?studio=buddy');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
