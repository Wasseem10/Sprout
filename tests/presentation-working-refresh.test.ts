import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const { createPresentationRefreshManager, validateRefreshInput, PresentationWindowError } = createRequire(import.meta.url)(
  '../electron/presentation-windows.cjs',
);

type ManagedFile = { path: string; sha256: string };
const current = { path: 'C:\\Project\\Pet behavior.pptx', sha256: 'a'.repeat(64) };
const staged = { path: 'C:\\Private\\revisions\\pet-r5.pptx', sha256: 'b'.repeat(64) };
const oldRevision = { path: 'C:\\Project\\pet-r3.pptx', sha256: 'c'.repeat(64) };
const request = {
  projectId: '84754433-5b4c-4dee-9507-cd8a313afdc1',
  current,
  staged,
  previous: [oldRevision],
  executable: 'C:\\Office\\POWERPNT.EXE',
};

function payload(script: string) {
  const encoded = script.match(/FromBase64String\('([^']+)'\)/)?.[1];
  if (!encoded) throw new Error('Native input must be encoded as data.');
  return JSON.parse(Buffer.from(encoded, 'base64').toString());
}

function setup(options: { wasOpen?: boolean; processRunning?: boolean; selectedSlide?: number } = {}) {
  let workingHash = current.sha256;
  let stagedHash = staged.sha256;
  const wasOpen = options.wasOpen ?? true;
  const processRunning = options.processRunning ?? wasOpen;
  const selectedSlide = options.selectedSlide ?? 4;
  const events: string[] = [];
  const runScript = vi.fn(async (script: string, _signal: AbortSignal, _timeout: number): Promise<Record<string, unknown>> => {
    const data = payload(script);
    events.push(data.phase);
    if (data.phase === 'refresh-inventory') return { ready: wasOpen, processRunning };
    if (data.phase === 'focus-buddy') return { focused: true };
    if (data.phase === 'prepare-refresh') return {
      prepared: true, wasOpen, closed: wasOpen && data.closeCurrent,
      path: current.path, ...(wasOpen ? { selectedSlide } : {}),
    };
    throw new Error(`Unexpected native phase: ${data.phase}`);
  });
  const matchesFile = vi.fn(async (file: ManagedFile) => {
    if (file.path === current.path) return file.sha256 === workingHash;
    if (file.path === staged.path) return file.sha256 === stagedHash;
    return false;
  });
  const openManagedPresentation = vi.fn(async (input: { current: ManagedFile; slide?: number; previous: ManagedFile[] }) => {
    events.push('open');
    return { opened: true, selectedSlide: input.slide ?? 1, closed: input.previous.length, retainedModified: 0, warnings: [] };
  });
  const promote = vi.fn(async () => {
    events.push('promote');
    workingHash = stagedHash;
  });
  return {
    events, runScript, matchesFile, openManagedPresentation, promote,
    workingHash: () => workingHash,
    changeWorkingHash: (hash: string) => { workingHash = hash; },
    changeStagedHash: (hash: string) => { stagedHash = hash; },
    refresh: createPresentationRefreshManager({ runScript, matchesFile, openManagedPresentation,
      matchesExecutable: async () => true, platform: 'win32' }),
  };
}

describe('single working PowerPoint refresh transaction', () => {
  it('closes only the saved working file before promotion and reopens the same path at its verified selection', async () => {
    const qa = setup();
    const result = await qa.refresh(request, qa.promote);
    expect(qa.events).toEqual(['refresh-inventory', 'focus-buddy', 'prepare-refresh', 'promote', 'open']);
    expect(result).toMatchObject({ promoted: true, opened: true, wasOpen: true,
      current: { path: current.path, sha256: staged.sha256 }, selectedSlide: 4, closed: 1 });
    expect(result.failure).toBeUndefined();
    expect(qa.openManagedPresentation).toHaveBeenCalledWith(expect.objectContaining({
      current: { path: current.path, sha256: staged.sha256 }, previous: [oldRevision], slide: 4,
    }));
    const prepare = qa.runScript.mock.calls.find(([script]) => payload(script).phase === 'prepare-refresh')![0];
    expect(prepare).toContain("[int]$current.Saved -ne -1");
    expect(prepare).toContain('Test-InsightFile $data.staged');
    expect(prepare).toContain('Test-InsightFile $data.current');
    expect(prepare).toContain('$current.Close()');
    expect(prepare).not.toMatch(/\.Quit\(|\.Saved\s*=|\.DisplayAlerts\s*=/);
    const preparationData = payload(prepare);
    expect(preparationData).toMatchObject({ current, staged, closeCurrent: true });
  });

  it('uses an explicit edit target instead of the old selection when reopening', async () => {
    const qa = setup({ selectedSlide: 4 });
    await expect(qa.refresh({ ...request, slide: 7 }, qa.promote)).resolves.toMatchObject({ promoted: true, selectedSlide: 7 });
    expect(qa.openManagedPresentation).toHaveBeenCalledWith(expect.objectContaining({ slide: 7 }));
  });

  it.each(['denied', 'unverified'] as const)('still requires exact-file preparation when optional foreground focus is %s', async (focus) => {
    const qa = setup();
    const original = qa.runScript.getMockImplementation()!;
    qa.runScript.mockImplementation(async (...args) => {
      if (payload(args[0]).phase === 'focus-buddy') {
        if (focus === 'denied') throw new PresentationWindowError('Foreground activation was denied.', 'POWERPOINT_UNVERIFIED');
        return { focused: false };
      }
      return original(...args);
    });
    await expect(qa.refresh(request, qa.promote)).resolves.toMatchObject({ promoted: true, opened: true, selectedSlide: 4 });
    expect(qa.runScript.mock.calls.map(([script]) => payload(script).phase)).toEqual(['refresh-inventory', 'focus-buddy', 'prepare-refresh']);
    expect(qa.promote).toHaveBeenCalledTimes(1);
  });

  it('refuses publication when foreground activation is denied and exact-file COM preparation fails', async () => {
    const qa = setup();
    const original = qa.runScript.getMockImplementation()!;
    qa.runScript.mockImplementation(async (...args) => {
      const phase = payload(args[0]).phase;
      if (phase === 'focus-buddy' || phase === 'prepare-refresh')
        throw new PresentationWindowError('Native preparation was not verified.', 'POWERPOINT_UNVERIFIED');
      return original(...args);
    });
    await expect(qa.refresh(request, qa.promote)).resolves.toMatchObject({ promoted: false, opened: false, failure: { code: 'POWERPOINT_UNVERIFIED' } });
    expect(qa.promote).not.toHaveBeenCalled();
    expect(qa.openManagedPresentation).not.toHaveBeenCalled();
    expect(qa.workingHash()).toBe(current.sha256);
  });

  it('still stops before COM work when interrupted during optional focus', async () => {
    const qa = setup();
    const abort = new AbortController();
    const original = qa.runScript.getMockImplementation()!;
    qa.runScript.mockImplementation(async (...args) => {
      if (payload(args[0]).phase === 'focus-buddy') {
        abort.abort();
        throw new PresentationWindowError('Stopped', 'STOPPED');
      }
      return original(...args);
    });
    await expect(qa.refresh({ ...request, signal: abort.signal }, qa.promote)).resolves.toMatchObject({ promoted: false, stopped: true, failure: { code: 'STOPPED' } });
    expect(qa.runScript.mock.calls.map(([script]) => payload(script).phase)).toEqual(['refresh-inventory', 'focus-buddy']);
    expect(qa.promote).not.toHaveBeenCalled();
  });

  it('updates a closed file with open:false without creating or attaching to Office', async () => {
    const qa = setup({ wasOpen: false, processRunning: false });
    await expect(qa.refresh({ ...request, open: false }, qa.promote)).resolves.toMatchObject({ promoted: true, opened: false, wasOpen: false });
    expect(qa.events).toEqual(['refresh-inventory', 'promote']);
    expect(qa.openManagedPresentation).not.toHaveBeenCalled();
    expect(qa.runScript.mock.calls[0][0]).not.toContain('GetActiveObject');
    expect(qa.runScript.mock.calls[0][0]).not.toContain('New-Object -ComObject');
  });

  it('still refreshes a previously open working file with open:false', async () => {
    const qa = setup();
    await expect(qa.refresh({ ...request, open: false }, qa.promote)).resolves.toMatchObject({ promoted: true, opened: true, selectedSlide: 4 });
    expect(qa.openManagedPresentation).toHaveBeenCalledTimes(1);
  });

  it('keeps an absent working file closed when only unrelated PowerPoint files are open', async () => {
    const qa = setup({ wasOpen: false, processRunning: true });
    await expect(qa.refresh({ ...request, open: false }, qa.promote)).resolves.toMatchObject({ promoted: true, opened: false, wasOpen: false });
    expect(qa.events).toEqual(['refresh-inventory', 'focus-buddy', 'prepare-refresh', 'promote']);
    expect(qa.openManagedPresentation).not.toHaveBeenCalled();
  });

  it('refuses unsaved manual edits without promotion, reopening or pruning any windows', async () => {
    const qa = setup();
    qa.runScript.mockImplementation(async (script) => {
      const data = payload(script);
      if (data.phase === 'refresh-inventory') return { ready: true, processRunning: true };
      if (data.phase === 'focus-buddy') return { focused: true };
      return { prepared: false, reason: 'unsaved', wasOpen: true, closed: false, path: current.path };
    });
    await expect(qa.refresh(request, qa.promote)).resolves.toMatchObject({
      promoted: false, opened: false, retainedModified: 1, failure: { code: 'UNSAVED_CHANGES' },
    });
    expect(qa.promote).not.toHaveBeenCalled();
    expect(qa.openManagedPresentation).not.toHaveBeenCalled();
    expect(qa.workingHash()).toBe(current.sha256);
  });

  it('refuses a visible file missing from the attached COM session rather than replacing bytes under its window', async () => {
    const qa = setup();
    qa.runScript.mockImplementation(async (script) => {
      const data = payload(script);
      if (data.phase === 'refresh-inventory') return { ready: true, processRunning: true };
      if (data.phase === 'focus-buddy') return { focused: true };
      return { prepared: true, wasOpen: false, closed: false, path: current.path };
    });
    await expect(qa.refresh(request, qa.promote)).resolves.toMatchObject({ promoted: false, failure: { code: 'REFRESH_UNVERIFIED' } });
    expect(qa.promote).not.toHaveBeenCalled();
    expect(qa.openManagedPresentation).not.toHaveBeenCalled();
  });

  it.each(['working', 'staged'] as const)('refuses a changed %s file before any native work', async (which) => {
    const qa = setup();
    if (which === 'working') qa.changeWorkingHash('d'.repeat(64));
    else qa.changeStagedHash('d'.repeat(64));
    await expect(qa.refresh(request, qa.promote)).resolves.toMatchObject({
      promoted: false, failure: { code: which === 'working' ? 'CURRENT_CHANGED' : 'STAGED_CHANGED' },
    });
    expect(qa.runScript).not.toHaveBeenCalled();
    expect(qa.promote).not.toHaveBeenCalled();
  });

  it('reopens the previous exact saved file on a precommit publication failure and keeps unrelated revision windows untouched', async () => {
    const qa = setup();
    qa.promote.mockImplementation(async () => { throw new Error('private failed write details'); });
    await expect(qa.refresh({ ...request, slide: 7 }, qa.promote)).resolves.toMatchObject({
      promoted: false, current, opened: true, reopenedPrevious: true, selectedSlide: 4,
      failure: { code: 'REFRESH_FAILED', message: expect.not.stringContaining('private') },
    });
    expect(qa.openManagedPresentation).toHaveBeenCalledWith(expect.objectContaining({ current, previous: [], slide: 4 }));
    expect(qa.workingHash()).toBe(current.sha256);
  });

  it('rechecks the staged bytes after closing and restores the prior view if the stage changed', async () => {
    const qa = setup();
    const original = qa.runScript.getMockImplementation()!;
    qa.runScript.mockImplementation(async (...args) => {
      const result = await original(...args);
      if (payload(args[0]).phase === 'prepare-refresh') qa.changeStagedHash('e'.repeat(64));
      return result;
    });
    await expect(qa.refresh(request, qa.promote)).resolves.toMatchObject({
      promoted: false, reopenedPrevious: true, selectedSlide: 4, failure: { code: 'STAGED_CHANGED' },
    });
    expect(qa.promote).not.toHaveBeenCalled();
    expect(qa.openManagedPresentation).toHaveBeenCalledWith(expect.objectContaining({ current, previous: [] }));
  });

  it('distinguishes a committed edit from a native opening failure without rolling back new bytes', async () => {
    const qa = setup();
    qa.openManagedPresentation.mockRejectedValue(new PresentationWindowError('PowerPoint busy', 'POWERPOINT_BUSY'));
    const result = await qa.refresh(request, qa.promote);
    expect(result).toMatchObject({ promoted: true, opened: false,
      current: { path: current.path, sha256: staged.sha256 }, failure: { code: 'POWERPOINT_BUSY' } });
    expect(result.failure.message).toContain('revision was saved');
    expect(qa.workingHash()).toBe(staged.sha256);
    expect(qa.openManagedPresentation).toHaveBeenCalledTimes(1);
  });

  it('does not report native success when the returned selection differs from the requested target', async () => {
    const qa = setup();
    qa.openManagedPresentation.mockResolvedValue({ opened: true, selectedSlide: 1, closed: 0, retainedModified: 0, warnings: [] });
    await expect(qa.refresh({ ...request, slide: 4 }, qa.promote)).resolves.toMatchObject({
      promoted: true, opened: false, failure: { code: 'OPEN_UNVERIFIED' },
    });
  });

  it('stops before publication without reopening or pruning when cancelled after exact-file closure', async () => {
    const qa = setup();
    const abort = new AbortController();
    const original = qa.runScript.getMockImplementation()!;
    qa.runScript.mockImplementation(async (...args) => {
      const result = await original(...args);
      if (payload(args[0]).phase === 'prepare-refresh') abort.abort();
      return result;
    });
    await expect(qa.refresh({ ...request, signal: abort.signal }, qa.promote)).resolves.toMatchObject({
      promoted: false, stopped: true, failure: { code: 'STOPPED' },
    });
    expect(qa.promote).not.toHaveBeenCalled();
    expect(qa.openManagedPresentation).not.toHaveBeenCalled();
    expect(qa.workingHash()).toBe(current.sha256);
  });

  it('reports a saved revision after cancellation during commit and performs no further native actions', async () => {
    const qa = setup();
    const abort = new AbortController();
    qa.promote.mockImplementation(async () => { qa.changeWorkingHash(staged.sha256); abort.abort(); });
    await expect(qa.refresh({ ...request, signal: abort.signal }, qa.promote)).resolves.toMatchObject({
      promoted: true, opened: false, stopped: true, current: { path: current.path, sha256: staged.sha256 },
      failure: { code: 'STOPPED' },
    });
    expect(qa.openManagedPresentation).not.toHaveBeenCalled();
  });

  it('requires recovery when callback publication fails after a byte swap without claiming a committed edit', async () => {
    const qa = setup();
    qa.promote.mockImplementation(async () => { qa.changeWorkingHash(staged.sha256); throw new Error('adapter threw after commit'); });
    await expect(qa.refresh(request, qa.promote)).resolves.toMatchObject({
      promoted: false, opened: false, recoveryRequired: true,
      failure: { code: 'PUBLICATION_RECOVERY_REQUIRED', message: expect.not.stringContaining('revision was saved') },
    });
    expect(qa.openManagedPresentation).not.toHaveBeenCalled();
    expect(qa.workingHash()).toBe(staged.sha256);
  });

  it('preserves an explicit backend recovery-required result without reopening or inferring success from a matching old hash', async () => {
    const qa = setup();
    qa.promote.mockImplementation(async () => {
      throw new PresentationWindowError('Publication recovery is required.', 'PUBLICATION_RECOVERY_REQUIRED');
    });
    await expect(qa.refresh(request, qa.promote)).resolves.toMatchObject({
      promoted: false, opened: false, recoveryRequired: true, failure: { code: 'PUBLICATION_RECOVERY_REQUIRED' },
    });
    expect(qa.openManagedPresentation).not.toHaveBeenCalled();
  });

  it('rejects an obsolete repeat using the prior working hash before closing the refreshed window', async () => {
    const qa = setup();
    await qa.refresh(request, qa.promote);
    qa.runScript.mockClear();
    qa.promote.mockClear();
    await expect(qa.refresh(request, qa.promote)).resolves.toMatchObject({ promoted: false, failure: { code: 'CURRENT_CHANGED' } });
    expect(qa.runScript).not.toHaveBeenCalled();
    expect(qa.promote).not.toHaveBeenCalled();
  });

  it('keeps native selection and leaves a same-hash open document unclosed', async () => {
    const qa = setup();
    qa.changeStagedHash(current.sha256);
    await expect(qa.refresh({ ...request, staged: { ...staged, sha256: current.sha256 } }, qa.promote)).resolves.toMatchObject({
      promoted: true, opened: true, selectedSlide: 4,
    });
    expect(payload(qa.runScript.mock.calls.find(([script]) => payload(script).phase === 'prepare-refresh')![0]).closeCurrent).toBe(false);
  });

  it.each([
    { staged: current },
    { staged: oldRevision },
    { staged: { ...staged, path: 'C:\\Private\\bad.ps1' } },
    { open: 'yes' },
    { current: { ...current, sha256: 'wrong' } },
  ])('rejects invalid refresh ownership input %j', (override) => {
    expect(() => validateRefreshInput({ ...request, ...override })).toThrow();
  });
});
