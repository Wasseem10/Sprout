import { mkdtemp, cp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const folder = await mkdtemp(path.join(tmpdir(), 'insightos-clean-'));
const entries = [
  'src',
  'shared',
  'server',
  'electron',
  'scripts',
  'tests',
  'public',
  'data',
  'migrations',
  'deploy',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.server.json',
  'vite.config.ts',
  'playwright.config.ts',
  'index.html',
];
for (const entry of entries)
  await cp(path.resolve(entry), path.join(folder, entry), { recursive: true });
async function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
      cwd: folder,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Clean verification command failed (${code}).`)),
    );
  });
}
await run(['ci', '--ignore-scripts']);
await run(['run', 'build']);
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/clean-install.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      status: 'passed',
      method:
        'Fresh source-only temporary copy; npm ci --ignore-scripts then npm run build. No existing node_modules, .env or build outputs reused.',
      desktopRuntime:
        'Separately tested in the main workspace. setup:desktop is required when install scripts are skipped.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Fresh-source install/build passed. Temporary verification copy retained in the OS temp directory.',
);
