import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ComputerController } from '../server/computer/controller';
import { config } from '../server/config';
import { buildApp } from '../server/app';
import { legacyDeckProjection, type OrderedPresentationDeck } from '../shared/presentation-deck';
import type { ComputerState, PresentationArtifactIdentity } from '../shared/computer';

const projectId = 'f95c21c1-f63b-49fb-ae9a-a690990c085d';
const identity: PresentationArtifactIdentity = { projectId, revision: 3, sha256: 'a'.repeat(64) };
const controllers: ComputerController[] = [];
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const controller of controllers.splice(0)) await controller.close();
  for (const app of apps.splice(0)) await app.close();
});

function fixture(structured = true) {
  const controller = new ComputerController({ ...config(), host: '127.0.0.1', hfToken: '', neonUrl: '', dbToken: '', cloudUrl: '' });
  controllers.push(controller);
  const orderedDeck: OrderedPresentationDeck = {
    schemaVersion: 2, title: 'Pet behavior', theme: 'blue', textScale: 1, allowImageReuse: false,
    slides: [
      { id: 'cover', type: 'cover', title: 'Pet behavior', subtitle: 'Understanding common signals' },
      { id: 'dogs', type: 'text', title: 'Dogs', points: ['Watch body language in context.'] },
      { id: 'cats', type: 'text', title: 'Cats', points: ['Observe changes in familiar behavior.'] },
    ],
  };
  controller.state.presentation = {
    filename: 'Pet behavior.pptx', title: orderedDeck.title, slideCount: 3,
    slideTitles: orderedDeck.slides.map((slide) => slide.title), sha256: identity.sha256,
    opened: true, selectedSlide: 1, desktopNavigation: { status: 'verified', slide: 1 },
    ...(structured ? { project: { revision: identity.revision, folder: 'Project', basis: 'Supplied content', assets: [], deck: legacyDeckProjection(orderedDeck), orderedDeck } } : {}),
  };
  if (structured) (controller as unknown as { pictureProjectId: string }).pictureProjectId = projectId;
  return controller;
}

describe('native presentation artifact identity', () => {
  it('accepts captured identity and attaches it to an ordered navigation intent', async () => {
    const controller = fixture();
    const result = await controller.action({ tool: 'goToSlide', slide: 2 }, new AbortController().signal);
    expect(result.desktopIntent).toMatchObject({ kind: 'slide', filename: 'Pet behavior.pptx', identity });
    const selected = controller.recordSelectedSlide('Pet behavior.pptx', 2, identity);
    expect(selected.presentation?.desktopNavigation).toEqual({ status: 'verified', slide: 2 });
    const failed = controller.recordPresentationNavigationFailure('Pet behavior.pptx', 'PowerPoint is busy.', 3, identity);
    expect(failed.presentation?.selectedSlide).toBeUndefined();
    expect(failed.presentation?.desktopNavigation).toEqual({ status: 'failed', requestedSlide: 3, message: 'PowerPoint is busy.' });
  });

  it.each([
    ['missing identity', undefined],
    ['old revision', { ...identity, revision: 2 }],
    ['different bytes', { ...identity, sha256: 'b'.repeat(64) }],
    ['different project', { ...identity, projectId: '7e428cfa-c4c4-46f8-90fb-ddb57a410073' }],
  ] as const)('rejects success and failure with %s without changing state', (_name, received) => {
    const controller = fixture();
    const before = controller.snapshot();
    expect(() => controller.recordSelectedSlide('Pet behavior.pptx', 2, received)).toThrow(/current presentation changed/);
    expect(() => controller.recordPresentationNavigationFailure('Pet behavior.pptx', 'Old failure', 2, received)).toThrow(/current presentation changed/);
    expect(controller.snapshot()).toEqual(before);
  });

  it('rejects a late callback after the same working filename advances to a new revision', () => {
    const controller = fixture();
    const captured = controller.presentationSelectionIdentity()!;
    const presentation = controller.state.presentation!;
    presentation.project!.revision++;
    presentation.sha256 = 'c'.repeat(64);
    const current = controller.snapshot();
    expect(captured).toEqual(identity);
    expect(() => controller.recordSelectedSlide(presentation.filename, 3, captured)).toThrow(/changed/);
    expect(() => controller.recordPresentationNavigationFailure(presentation.filename, 'Old failure', 3, captured)).toThrow(/changed/);
    expect(controller.snapshot()).toEqual(current);
    expect(controller.recordSelectedSlide(presentation.filename, 2, controller.presentationSelectionIdentity()).presentation?.selectedSlide).toBe(2);
  });

  it('uses filename-only callbacks exclusively for legacy nonproject files', () => {
    const controller = fixture(false);
    expect(controller.presentationSelectionIdentity()).toBeUndefined();
    expect(controller.recordSelectedSlide('Pet behavior.pptx', 2).presentation?.selectedSlide).toBe(2);
    expect(() => controller.recordSelectedSlide('Pet behavior.pptx', 3, identity)).toThrow(/changed/);
    expect(controller.recordPresentationNavigationFailure('Pet behavior.pptx', 'Busy', 'last').presentation?.desktopNavigation?.status).toBe('failed');
    controller.state.presentation = fixture().snapshot().presentation;
    // Orphaned structured state must not silently downgrade to legacy matching.
    expect(() => controller.recordSelectedSlide('Pet behavior.pptx', 1)).toThrow(/changed/);
  });

  it('validates and forwards the identity on both authenticated callback endpoints', async () => {
    const state: ComputerState = { folder: null, code: null, browser: null, screen: null };
    const selected = vi.spyOn(ComputerController.prototype, 'recordSelectedSlide').mockReturnValue(state);
    const failed = vi.spyOn(ComputerController.prototype, 'recordPresentationNavigationFailure').mockReturnValue(state);
    const app = await buildApp({ ...config(), localDir: await mkdtemp(path.join(tmpdir(), 'insight-selection-identity-')), host: '127.0.0.1', passphrase: '', mode: 'sample', hfToken: '', neonUrl: '', dbToken: '', cloudUrl: '' });
    apps.push(app);
    const session = await app.inject({ method: 'POST', url: '/api/session', payload: {} });
    const headers = { cookie: session.headers['set-cookie']!.toString().split(';')[0] };
    expect((await app.inject({ method: 'POST', url: '/api/computer/selected-slide', headers, payload: { filename: 'Pet behavior.pptx', slide: 2, identity } })).statusCode).toBe(200);
    expect(selected).toHaveBeenLastCalledWith('Pet behavior.pptx', 2, identity);
    expect((await app.inject({ method: 'POST', url: '/api/computer/presentation-navigation-failure', headers, payload: { filename: 'Pet behavior.pptx', message: 'Busy', requestedSlide: 'last', identity } })).statusCode).toBe(200);
    expect(failed).toHaveBeenLastCalledWith('Pet behavior.pptx', 'Busy', 'last', identity);
    for (const endpoint of ['selected-slide', 'presentation-navigation-failure']) {
      const payload = endpoint === 'selected-slide' ? { filename: 'Pet behavior.pptx', slide: 2 } : { filename: 'Pet behavior.pptx', message: 'Busy' };
      expect((await app.inject({ method: 'POST', url: `/api/computer/${endpoint}`, headers, payload: { ...payload, identity: { ...identity, sha256: 'invalid' } } })).statusCode).toBe(400);
    }
    expect(selected).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(1);
  });
});
