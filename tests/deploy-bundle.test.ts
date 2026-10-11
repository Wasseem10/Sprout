import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareBundle } from '../deploy/prepare-bundle.mjs';

const roots: string[] = [];
type BundleReceipt = {
  hostingProvider: string;
  files: { path: string; sha256: string }[];
};
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'insight-deploy-bundle-'));
  roots.push(root);
  for (const file of [
    'package.json',
    'package-lock.json',
    '.dockerignore',
    'dist/index.html',
    'dist-server/server/start.js',
    'dist-server/server/app.js',
    'data/operations-synthetic.csv',
    'migrations/001-projects.sql',
    'deploy/Dockerfile.runtime',
    'deploy/compose.yaml',
    'deploy/compose.runtime.yaml',
    'deploy/Caddyfile',
    'deploy/cloud.env.example',
  ]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), `synthetic fixture for ${file}`);
  }
  return root;
}

it('bundles only runtime inputs and never copies laptop settings or private receipts', async () => {
  const root = await fixture();
  for (const file of [
    '.env',
    '.local/session-key',
    '.local/private-receipt.json',
    'deploy/.env.cloud',
    'artifacts/screenshot.png',
  ]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), 'private-value-must-not-be-in-deployment');
  }
  const result = await prepareBundle(root);
  const manifest: BundleReceipt = JSON.parse(
    await readFile(path.join(result.destination, 'bundle-manifest.json'), 'utf8'),
  );
  expect(manifest.hostingProvider).toBe('not-deployed');
  expect(manifest.files.some((file) => file.path === 'dist-server/server/start.js')).toBe(true);
  expect(manifest.files.some((file) => file.path === 'deploy/compose.runtime.yaml')).toBe(true);
  expect(
    manifest.files.some(
      (file) =>
        file.path === '.env' ||
        file.path === 'deploy/.env.cloud' ||
        file.path.startsWith('.local/'),
    ),
  ).toBe(false);
  for (const file of manifest.files)
    expect(await readFile(path.join(result.destination, file.path), 'utf8')).not.toContain(
      'private-value-must-not-be-in-deployment',
    );
  expect(await readdir(result.destination)).not.toContain('.local');
  expect(result.fileCount).toBe(manifest.files.length);
});

it('requires compiled UI and server output before copying anything', async () => {
  const root = await fixture();
  await rm(path.join(root, 'dist-server/server/start.js'));
  await expect(prepareBundle(root)).rejects.toThrow('Run npm run build');
  expect(await readdir(root)).not.toContain('.local');
});

it('creates a separate bundle instead of mutating previous deployments', async () => {
  const root = await fixture();
  const first = await prepareBundle(root),
    second = await prepareBundle(root);
  expect(first.destination).not.toBe(second.destination);
  expect(await readFile(path.join(first.destination, 'dist/index.html'), 'utf8')).toBe(
    await readFile(path.join(root, 'dist/index.html'), 'utf8'),
  );
  const receipt: BundleReceipt = JSON.parse(
    await readFile(path.join(first.destination, 'bundle-manifest.json'), 'utf8'),
  );
  expect(receipt.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
});
