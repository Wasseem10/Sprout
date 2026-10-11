import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Syntax/readiness check only. Never render real local credentials with compose config.
const environment = {
  ...process.env,
  INSIGHTOS_DOMAIN: 'insight.example.com',
  CLIENT_ORIGIN: 'https://insight.example.com',
  SESSION_PASSPHRASE: 'synthetic-config-check-passphrase',
  HF_TOKEN: 'synthetic-config-check-token',
  HF_MODEL_ID: 'Qwen/Qwen3-Coder-30B-A3B-Instruct:scaleway',
  HF_VISION_MODEL_ID: 'Qwen/Qwen3-VL-30B-A3B-Instruct:deepinfra',
  HF_ENDPOINT_URL: 'https://router.huggingface.co/v1/chat/completions',
  APP_MODE: 'sample',
  DATABASE_URL: '',
};
try {
  const raw = execFileSync(
    'docker',
    [
      'compose',
      '--env-file',
      'deploy/cloud.env.example',
      '-f',
      'deploy/compose.yaml',
      'config',
      '--format',
      'json',
    ],
    { cwd: root, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const parsed = JSON.parse(raw),
    app = parsed.services.app,
    proxy = parsed.services.proxy;
  assert.equal(app.environment.HOST, '0.0.0.0');
  assert.equal(app.environment.CLIENT_ORIGIN, 'https://insight.example.com');
  assert.equal(app.environment.INSIGHTOS_CLOUD_URL, '');
  assert.equal(app.environment.INSIGHTOS_APP_URL, '');
  assert.equal(app.read_only, true);
  assert.equal(app.ports?.length ?? 0, 0);
  assert.equal(proxy.depends_on.app.condition, 'service_healthy');
  assert.deepEqual(proxy.ports.map((port) => String(port.published)).sort(), ['443', '80']);
  assert(app.volumes.some((volume) => volume.target === '/app/.local'));
  const runtime = JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '--env-file',
        'deploy/cloud.env.example',
        '-f',
        'deploy/compose.yaml',
        '-f',
        'deploy/compose.runtime.yaml',
        'config',
        '--format',
        'json',
      ],
      { cwd: root, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );
  assert.equal(runtime.services.app.build.dockerfile, 'deploy/Dockerfile.runtime');
  assert.equal(runtime.services.app.environment.INSIGHTOS_CLOUD_URL, '');
  assert.equal(runtime.services.app.ports?.length ?? 0, 0);
  console.log(
    'Both source and precompiled Compose parsed: HTTPS proxy, private app port, persistent data, healthy startup, local-only desktop, and synthetic credentials. Image/runtime still require a running Linux Docker daemon.',
  );
} catch {
  console.error(
    'Deployment config check failed. Install Docker Compose and check deploy/compose.yaml. No real credentials were printed.',
  );
  process.exitCode = 1;
}
