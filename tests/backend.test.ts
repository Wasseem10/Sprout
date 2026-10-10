import { it, expect, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildApp } from '../server/app';
import { config } from '../server/config';
import { emptyWorkspace } from '../shared/schema';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
});
async function setup(live = false, dir?: string) {
  const app = await buildApp({
    ...config(),
    localDir: dir ?? (await mkdtemp(path.join(tmpdir(), 'insightos-'))),
    mode: live ? 'live' : 'sample',
    passphrase: '',
    neonUrl: '',
    hfToken: '',
    dbHost: '',
    dbToken: '',
    dbWarehouse: '',
  });
  apps.push(app);
  await app.ready();
  const session = await app.inject({ method: 'POST', url: '/api/session', payload: {} });
  return { app, cookie: session.headers['set-cookie']!.toString().split(';')[0] };
}
it('requires a session and rejects cross-origin mutations', async () => {
  const { app, cookie } = await setup();
  expect((await app.inject({ url: '/api/projects' })).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/session',
        headers: { origin: 'https://untrusted.example' },
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
  expect((await app.inject({ url: '/api/projects', headers: { cookie } })).statusCode).toBe(200);
});
it('imports sample data and executes the actual refinement', async () => {
  const { app, cookie } = await setup(),
    headers = { cookie };
  const data = (await app.inject({ url: '/api/sample', headers })).json();
  const result = (
    await app.inject({
      method: 'POST',
      url: '/api/analyze',
      headers,
      payload: { dataset: data.dataset, comparison: { ...data.comparison, commonLocations: true } },
    })
  ).json().result;
  expect(result.currentTotal).toBe(141000);
  expect(result.provider).toBe('local-sample');
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/import',
    headers,
    payload: { name: 'wrong.csv', text: 'date,revenue\n2026-01-01,1' },
  });
  expect(invalid.statusCode).toBe(400);
});
it('reloads saved data, preferences, task metadata and history after a backend restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'insightos-persistence-'));
  let session = await setup(false, dir);
  const data = (
    await session.app.inject({ url: '/api/sample', headers: { cookie: session.cookie } })
  ).json();
  const state = { ...emptyWorkspace(), title: 'Persistent test', dataset: data.dataset };
  const saved = (
    await session.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: session.cookie },
      payload: {
        state,
        history: [emptyWorkspace()],
        preferences: { largeText: true, reducedMotion: true, speechEnabled: false },
        lastTask: {
          phase: 'cancelled',
          detail: 'Stopped by user',
          updatedAt: new Date().toISOString(),
        },
      },
    })
  ).json();
  await session.app.close();
  session = await setup(false, dir);
  const restored = (
    await session.app.inject({
      url: '/api/projects/' + saved.id,
      headers: { cookie: session.cookie },
    })
  ).json();
  expect(restored.project.state.dataset.rows).toHaveLength(39);
  expect(restored.project.history).toHaveLength(1);
  expect(restored.project.state.title).toBe('Persistent test');
  expect(restored.project.preferences.largeText).toBe(true);
  expect(restored.project.lastTask.phase).toBe('cancelled');
  expect(
    (
      await session.app.inject({
        url: '/api/projects/..%2f..%2f.env',
        headers: { cookie: session.cookie },
      })
    ).statusCode,
  ).not.toBe(200);
});
it('live mode never silently falls back to sample planning or analytics', async () => {
  const { app, cookie } = await setup(true);
  const data = (await app.inject({ url: '/api/sample', headers: { cookie } })).json();
  const plan = await app.inject({
    method: 'POST',
    url: '/api/plan',
    headers: { cookie },
    payload: { request: 'Compare revenue', state: { ...emptyWorkspace(), dataset: data.dataset } },
  });
  expect(plan.statusCode).toBe(400);
  expect(plan.json().error).toContain('HF_TOKEN');
  const analysis = await app.inject({
    method: 'POST',
    url: '/api/analyze',
    headers: { cookie },
    payload: data,
  });
  expect(analysis.statusCode).toBe(400);
  expect(analysis.json().error).toContain('DATABRICKS');
});

it('returns an actionable folder error for presentations without a workspace', async () => {
  const { app, cookie } = await setup();
  const response = await app.inject({
    method: 'POST',
    url: '/api/computer/request',
    headers: { cookie },
    payload: { request: 'Can you make me a PowerPoint on George Washington?' },
  });
  expect(response.statusCode).toBe(400);
  expect(response.json().error).toContain('Computer needs a folder');
});
