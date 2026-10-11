import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  findLocalPresentationFolder,
  spokenFolderLocation,
  spokenFolderName,
} from '../server/computer/folder-resolution';

describe('spoken folder references', () => {
  it.each([
    ['Use the image in my marketing folder', 'marketing', null],
    ['Can you open my Marketing folder on my desktop?', 'Marketing', 'desktop'],
    ['Open folder Marketing on my desktop.', 'Marketing', 'desktop'],
    ['Marketing folder on my desktop.', 'Marketing', 'desktop'],
    ['Marketing folder is on my desktop.', 'Marketing', 'desktop'],
    ['Open Marketing folder', 'Marketing', null],
    ['Open my Q3 Demo folder in Documents', 'Q3 Demo', 'documents'],
    ['Use my Marketing folder in my Downloads', 'Marketing', 'downloads'],
    ['folder on my desktop?', null, 'desktop'],
    ['On my desktop', null, 'desktop'],
    ["It's on my desktop", null, 'desktop'],
    ['Can you open my folder?', null, null],
    ["It's called Marketing", 'Marketing', null],
    ['And use my screen.', null, null],
  ])('parses %s without confusing its location for its name', (request, name, location) => {
    expect(spokenFolderName(request)).toBe(name);
    expect(spokenFolderLocation(request)).toBe(location);
  });
});

describe('bounded folder resolution', () => {
  it.each(['desktop', 'documents', 'downloads'] as const)(
    'prefers the actual Windows known %s over legacy roots and a stale selection',
    async (location) => {
      const home = await mkdtemp(path.join(tmpdir(), 'insight-known-precedence-'));
      const legacy = path.join(home, 'Legacy', location),
        known = path.join(home, 'Redirected', location);
      const legacyFolder = path.join(legacy, 'Marketing'),
        knownFolder = path.join(known, 'Marketing');
      await mkdir(legacyFolder, { recursive: true });
      await mkdir(knownFolder, { recursive: true });
      expect(
        await findLocalPresentationFolder('Marketing', legacyFolder, [legacy, known], location, {
          [location]: known,
        }),
      ).toBe(await realpath(knownFolder));
    },
  );
  it('uses other roots as fallback when the known location has no matching folder', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'insight-known-fallback-'));
    const legacy = path.join(home, 'Desktop'),
      known = path.join(home, 'RedirectedDesktop');
    const folder = path.join(legacy, 'Marketing');
    await mkdir(folder, { recursive: true });
    await mkdir(known);
    expect(
      await findLocalPresentationFolder('Marketing', undefined, [legacy, known], 'desktop', {
        desktop: known,
      }),
    ).toBe(await realpath(folder));
  });
  it('does not use an injected known folder outside an explicit roots boundary', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'insight-known-boundary-'));
    const allowed = path.join(home, 'Allowed'),
      known = path.join(home, 'Outside');
    await mkdir(path.join(allowed, 'Marketing'), { recursive: true });
    await mkdir(path.join(known, 'Marketing'), { recursive: true });
    expect(
      await findLocalPresentationFolder('Marketing', undefined, [allowed], 'desktop', {
        desktop: known,
      }),
    ).toBe(await realpath(path.join(allowed, 'Marketing')));
  });
  it('asks for a full path when a specified location still has same-priority matches', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'insight-known-ambiguity-'));
    const known = path.join(home, 'Desktop'),
      legacy = path.join(home, 'LegacyDesktop');
    await mkdir(path.join(known, 'Marketing'), { recursive: true });
    await mkdir(path.join(known, 'Market-ing'), { recursive: true });
    await mkdir(path.join(legacy, 'Marketing'), { recursive: true });
    const result = findLocalPresentationFolder('Marketing', undefined, [legacy, known], 'desktop', {
      desktop: known,
    });
    await expect(result).rejects.toThrow('on your Desktop. Say the full path');
    await expect(result).rejects.not.toThrow('Is it on your Desktop');
  });
  it('asks for a full path when fallback roots remain ambiguous in the specified location', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'insight-location-ambiguity-'));
    const first = path.join(home, 'FirstDesktop'),
      second = path.join(home, 'SecondDesktop');
    await mkdir(path.join(first, 'Marketing'), { recursive: true });
    await mkdir(path.join(second, 'Marketing'), { recursive: true });
    await expect(
      findLocalPresentationFolder('Marketing', undefined, [first, second], 'desktop'),
    ).rejects.toThrow('on your Desktop. Say the full path');
  });
  it('keeps hidden folders and deeper descendants outside the bounded search', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'insight-location-depth-'));
    const known = path.join(home, 'Desktop');
    await mkdir(path.join(known, '.Hidden', 'Marketing'), { recursive: true });
    await mkdir(path.join(known, 'First', 'Second', 'Marketing'), { recursive: true });
    await expect(
      findLocalPresentationFolder('Marketing', undefined, [known], 'desktop', { desktop: known }),
    ).rejects.toThrow('Say a different folder name or its full path');
  });
  it('does not prefer a symbolic-link child of the known location', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'insight-known-child-link-'));
    const known = path.join(home, 'Desktop'),
      legacy = path.join(home, 'LegacyDesktop'),
      outside = path.join(home, 'Elsewhere', 'Marketing');
    await mkdir(known);
    await mkdir(path.join(legacy, 'Marketing'), { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(
      outside,
      path.join(known, 'Marketing'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(
      await findLocalPresentationFolder('Marketing', undefined, [known, legacy], 'desktop', {
        desktop: known,
      }),
    ).toBe(await realpath(path.join(legacy, 'Marketing')));
  });
  it('does not prefer a symbolic-link known-location root', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'insight-known-root-link-'));
    const known = path.join(home, 'LinkedDesktop'),
      legacy = path.join(home, 'LegacyDesktop'),
      outside = path.join(home, 'Elsewhere');
    await mkdir(path.join(legacy, 'Marketing'), { recursive: true });
    await mkdir(path.join(outside, 'Marketing'), { recursive: true });
    await symlink(outside, known, process.platform === 'win32' ? 'junction' : 'dir');
    expect(
      await findLocalPresentationFolder('Marketing', undefined, [known, legacy], 'desktop', {
        desktop: known,
      }),
    ).toBe(await realpath(path.join(legacy, 'Marketing')));
  });
  it('finds case-insensitive spoken names without reading file content', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'insight-known-folder-'));
    const desktop = path.join(home, 'OneDrive', 'Desktop');
    const folder = path.join(desktop, 'Marketing');
    await mkdir(folder, { recursive: true });
    expect(await findLocalPresentationFolder('marketing', undefined, [desktop], 'desktop')).toBe(
      await realpath(folder),
    );
    expect(await findLocalPresentationFolder('Marketing on my desktop', undefined, [desktop])).toBe(
      await realpath(folder),
    );
  });
  it('asks for a spoken location when multiple folders match, instead of demanding a path', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'insight-folder-ambiguity-'));
    const desktop = path.join(home, 'Desktop'),
      documents = path.join(home, 'Documents');
    await mkdir(path.join(desktop, 'Marketing'), { recursive: true });
    await mkdir(path.join(documents, 'Marketing'), { recursive: true });
    await expect(
      findLocalPresentationFolder('Marketing', undefined, [desktop, documents]),
    ).rejects.toThrow('Is it on your Desktop');
    expect(await findLocalPresentationFolder('Marketing', undefined, [desktop], 'desktop')).toBe(
      await realpath(path.join(desktop, 'Marketing')),
    );
    expect(
      await findLocalPresentationFolder(
        'Marketing',
        path.join(documents, 'Marketing'),
        [desktop],
        'desktop',
      ),
    ).toBe(await realpath(path.join(desktop, 'Marketing')));
  });
  it('retains the existing boundary against traversing linked directories', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'insight-folder-link-'));
    const desktop = path.join(home, 'Desktop'),
      outside = path.join(home, 'Elsewhere', 'Marketing');
    await mkdir(desktop);
    await mkdir(outside, { recursive: true });
    await symlink(
      outside,
      path.join(desktop, 'Marketing'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(findLocalPresentationFolder('Marketing', undefined, [desktop])).rejects.toThrow(
      'I could not find',
    );
  });
});
