import { createRequire } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { createPresentationWindowManager, validateInput } = createRequire(import.meta.url)(
  '../electron/presentation-windows.cjs',
);
const current = { path: 'C:\\Project\\revision-3.pptx', sha256: 'c'.repeat(64) };
const first = { path: 'C:\\Project\\revision-1.pptx', sha256: 'a'.repeat(64) };
const second = { path: 'C:\\Project\\revision-2.pptx', sha256: 'b'.repeat(64) };
const input = {
  projectId: '84754433-5b4c-4dee-9507-cd8a313afdc1',
  current,
  previous: [first, second],
  slide: 2,
};
function payload(script: string) {
  const encoded = script.match(/FromBase64String\('([^']+)'\)/)?.[1];
  expect(encoded).toBeTruthy();
  return JSON.parse(Buffer.from(encoded!, 'base64').toString());
}
function setup() {
  const runScript = vi.fn(
    async (
      script: string,
    ): Promise<{
      opened: boolean;
      path: string;
      selectedSlide?: number;
      outcomes?: { path: string; status: string }[];
    }> => {
      const data = payload(script);
      return data.phase === 'open'
        ? { opened: true, path: data.current.path, selectedSlide: data.slide }
        : {
            opened: true,
            path: data.current.path,
            outcomes: data.previous.map((file: { path: string }) => ({
              path: file.path,
              status: 'closed',
            })),
          };
    },
  );
  const matchesFile = vi.fn(async (_file: { path: string; sha256: string }) => true);
  return {
    runScript,
    matchesFile,
    open: createPresentationWindowManager({ runScript, matchesFile, platform: 'win32' }),
  };
}

describe('owned PowerPoint revision window lifecycle', () => {
  function nativeFixture(stage = 'com-open') {
    const diagnostics = {
      phase: 'open',
      stage,
      code: 'COMException',
      causes: [{ type: 'COMException', message: 'Presentations.Open is disabled.', hresult: -2147188160 }],
    };
    const scripts: string[] = [];
    const executeFile = vi.fn(async (_command: string, _args: string[], _options: { env: Record<string, string> }, script: string) => {
      const data = payload(script);
      const result = data.phase === 'locate-document' ? { ready: false } : data.phase === 'await-document' ? { ready: true } : data.phase === 'focus-buddy' ? { focused: true } : data.phase === 'open'
        ? { error: 'The PowerPoint revision could not be verified.', diagnostics }
        : {
            opened: true,
            path: current.path,
            selectedSlide: 2,
            outcomes: data.previous.map((file: { path: string }) => ({ path: file.path, status: 'closed' })),
          };
      return { stdout: JSON.stringify(result) };
    });
    const transport = async (command: string, args: string[], options: { env: Record<string, string> }) => {
      const script = await readFile(args[args.indexOf('-File') + 1], 'utf8');
      scripts.push(script);
      return executeFile(command, args, options, script);
    };
    const matchesFile = vi.fn(async (_file: { path: string; sha256: string }) => true);
    const matchesExecutable = vi.fn(async (_path: string) => true);
    const launchPowerPoint = vi.fn(async (_executable: string, _presentation: string, _signal: AbortSignal) => {});
    const waitForRetry = vi.fn(async (_ms: number, _signal: AbortSignal) => {});
    return {
      executeFile,
      scripts,
      matchesFile,
      matchesExecutable,
      launchPowerPoint,
      waitForRetry,
      diagnostics,
      open: createPresentationWindowManager({ executeFile: transport, matchesFile, matchesExecutable, launchPowerPoint, waitForRetry, platform: 'win32' }),
      phases: () => scripts.map(script => payload(script).phase),
    };
  }

  it('falls back from COM Open to a bounded exact-file shell open and verifies it before pruning', async () => {
    const qa = nativeFixture();
    await expect(qa.open(input)).resolves.toMatchObject({ opened: true, selectedSlide: 2, closed: 2 });
    expect(qa.phases()).toEqual(['open', 'shell-open', 'prune']);
    expect(qa.matchesFile.mock.calls.slice(0, 2).map(([file]) => file)).toEqual([current, current]);
    const fallback = qa.scripts.find(script => payload(script).phase === 'shell-open')!;
    expect(fallback).toContain('Start-Process -FilePath ([string]$data.current.path)');
    expect(fallback).toContain('AddMilliseconds(4500)');
    expect(fallback).toContain('Find-InsightPresentation $ppt $data.current.path');
    expect(fallback).toContain("Set-InsightStage 'verify-open-file'");
  });

  it('keeps native COM diagnostics private and never shell-opens after a slide verification failure', async () => {
    const qa = nativeFixture('select-slide');
    const error = await qa.open(input).catch((value: unknown) => value);
    expect(error).toMatchObject({
      code: 'POWERPOINT_UNVERIFIED',
      cause: { diagnostics: qa.diagnostics },
    });
    expect(error.message).not.toContain('Presentations.Open is disabled');
    expect(qa.phases()).toEqual(['open']);
  });

  it('launches the validated installed PowerPoint executable when associations cannot be relied on', async () => {
    const qa = nativeFixture();
    const executable = 'C:\\Program Files\\Microsoft Office\\root\\Office16\\POWERPNT.EXE';
    await expect(qa.open({ ...input, executable })).resolves.toMatchObject({ opened: true, closed: 2 });
    expect(qa.matchesExecutable).toHaveBeenCalledWith(executable);
    expect(qa.launchPowerPoint).toHaveBeenCalledExactlyOnceWith(executable, current.path, expect.any(AbortSignal));
    const fallback = qa.scripts.find(script => payload(script).phase === 'shell-open')!;
    expect(payload(fallback).executable).toBe(executable);
    expect(payload(fallback).externalLaunched).toBe(true);
    expect(fallback).toContain('Start-Process -FilePath ([string]$data.executable) -ArgumentList');
    expect(fallback).not.toContain(executable);
    const unavailable = nativeFixture();
    unavailable.matchesExecutable.mockResolvedValue(false);
    await expect(unavailable.open({ ...input, executable })).rejects.toMatchObject({ code: 'APPLICATION_UNAVAILABLE' });
    expect(unavailable.phases()).toEqual([]);
    expect(unavailable.launchPowerPoint).not.toHaveBeenCalled();
  });

  it('strips backend credentials and Electron node mode from every native helper and Office child environment', async () => {
    const blocked = ['HF_TOKEN', 'DATABRICKS_TOKEN', 'ELEVENLABS_API_KEY', 'DATABASE_URL', 'SESSION_PASSPHRASE', 'ELECTRON_RUN_AS_NODE'];
    try {
      for (const name of blocked) vi.stubEnv(name, 'synthetic-test-value');
      vi.stubEnv('INSIGHT_WINDOW_TEST_SENTINEL', 'preserved');
      vi.stubEnv('SystemRoot', 'C:\\Windows');
      const qa = nativeFixture();
      await qa.open(input);
      for (const call of qa.executeFile.mock.calls as unknown as [string, string[], { env: Record<string, string> }][]) {
        for (const name of blocked) expect(Object.keys(call[2].env).map(key => key.toUpperCase())).not.toContain(name);
        expect(call[2].env.INSIGHT_WINDOW_TEST_SENTINEL).toBe('preserved');
        expect(Object.entries(call[2].env).find(([key]) => key.toUpperCase() === 'SYSTEMROOT')?.[1]).toBe('C:\\Windows');
      }
    } finally { vi.unstubAllEnvs(); }
  });

  it('rechecks current bytes before shell fallback and never opens or prunes a changed file', async () => {
    const qa = nativeFixture();
    qa.matchesFile.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(qa.open(input)).rejects.toMatchObject({ code: 'CURRENT_CHANGED' });
    expect(qa.phases()).toEqual(['open']);
  });

  it('does not verify or prune after an independent Office launch fails or is cancelled', async () => {
    const executable = 'C:\\Office\\POWERPNT.EXE';
    const failed = nativeFixture();
    failed.launchPowerPoint.mockRejectedValueOnce(new Error('Application unavailable'));
    await expect(failed.open({ ...input, executable })).rejects.toThrow('Application unavailable');
    expect(failed.phases()).toEqual(['locate-document']);
    const cancelled = nativeFixture();
    const abort = new AbortController();
    cancelled.launchPowerPoint.mockImplementationOnce(async () => { abort.abort(); });
    await expect(cancelled.open({ ...input, executable, signal: abort.signal })).rejects.toMatchObject({ code: 'STOPPED' });
    expect(cancelled.phases()).toEqual(['locate-document']);
  });

  it('reports process error codes without retaining encoded commands in private failure messages', async () => {
    const qa = nativeFixture();
    qa.executeFile.mockRejectedValueOnce(Object.assign(new Error('Command failed: encoded-command-with-private-file-paths'), {
      code: 'ETIMEDOUT', signal: 'SIGTERM', killed: true,
      stdout: '__INSIGHT_WINDOW_PROGRESS__{"phase":"shell-open","stage":"enumerate-current"}\n',
    }));
    const error = await qa.open(input).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'POWERPOINT_BUSY', cause: { diagnostics: {
      phase: 'shell-open', stage: 'enumerate-current',
      process: { code: 'ETIMEDOUT', signal: 'SIGTERM', killed: true },
    } } });
    expect(error.cause.message).not.toContain('encoded-command');
    expect(qa.phases()).toEqual(['open']);
  });

  it('retains both opening diagnostics and does not prune when the shell-launched file remains unverified', async () => {
    const qa = nativeFixture();
    qa.executeFile.mockImplementationOnce(async () => ({
      stdout: JSON.stringify({ error: 'COM opening failed.', diagnostics: qa.diagnostics }),
    })).mockImplementationOnce(async () => ({
      stdout: JSON.stringify({ error: 'Shell opening unverified.', diagnostics: { phase: 'shell-open', stage: 'shell-verify' } }),
    })).mockImplementationOnce(async () => ({
      stdout: JSON.stringify({ error: 'Shell opening unverified.', diagnostics: { phase: 'shell-open', stage: 'shell-verify' } }),
    }));
    await expect(qa.open(input)).rejects.toMatchObject({
      code: 'POWERPOINT_UNVERIFIED',
      cause: { diagnostics: { phase: 'shell-open', stage: 'shell-verify', initialOpenFailure: qa.diagnostics } },
      initialOpenFailure: { cause: { diagnostics: qa.diagnostics } },
    });
    expect(qa.phases()).toEqual(['open', 'shell-open', 'shell-open']);
  });

  it('reacquires a fresh PowerPoint connection once after launch without opening another window', async () => {
    const qa = nativeFixture();
    qa.executeFile.mockResolvedValueOnce({ stdout: JSON.stringify({ ready: false }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ ready: true }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ focused: true }) })
      .mockRejectedValueOnce(Object.assign(new Error('First verification proxy timed out'), { code: 'ETIMEDOUT', killed: true }));
    await expect(qa.open({ ...input, executable: 'C:\\Office\\POWERPNT.EXE' })).resolves.toMatchObject({ opened: true, selectedSlide: 2, closed: 2 });
    expect(qa.phases()).toEqual(['locate-document', 'await-document', 'focus-buddy', 'shell-open', 'shell-open', 'prune']);
    expect(qa.launchPowerPoint).toHaveBeenCalledTimes(1);
    expect(qa.waitForRetry.mock.calls.map(([ms]) => ms)).toEqual([400]);
    const repeatedVerification = qa.scripts[4];
    expect(payload(repeatedVerification).externalLaunched).toBe(true);
  });

  it('keeps native command arguments short for a full long-path registry and removes every private script', async () => {
    const qa = nativeFixture();
    const previous = Array.from({ length: 16 }, (_, index) => ({
      path: `C:\\${'long-project-folder\\'.repeat(80)}revision-${index}.pptx`,
      sha256: 'a'.repeat(64),
    }));
    await expect(qa.open({ ...input, previous })).resolves.toMatchObject({ opened: true, closed: 16 });
    expect(qa.scripts.some(script => script.length > 32000)).toBe(true);
    for (const [, args] of qa.executeFile.mock.calls) {
      expect(args.join(' ').length).toBeLessThan(2000);
      expect(args).not.toContain('-EncodedCommand');
      const file = args[args.indexOf('-File') + 1];
      await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(stat(path.dirname(file))).rejects.toMatchObject({ code: 'ENOENT' });
    }
    expect(qa.scripts.every(script => script.startsWith('\uFEFF'))).toBe(true);
  });

  it('removes its private script even when the native process fails', async () => {
    const qa = nativeFixture();
    qa.executeFile.mockRejectedValueOnce(Object.assign(new Error('native failure'), { code: 'ETIMEDOUT' }));
    await expect(qa.open(input)).rejects.toMatchObject({ code: 'POWERPOINT_BUSY' });
    const args = qa.executeFile.mock.calls[0][1];
    await expect(stat(args[args.indexOf('-File') + 1])).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('honors interruption during the bounded readiness retry without verification or cleanup afterwards', async () => {
    const qa = nativeFixture();
    const abort = new AbortController();
    qa.executeFile.mockResolvedValueOnce({ stdout: JSON.stringify({ ready: false }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ ready: true }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ focused: true }) })
      .mockRejectedValueOnce(Object.assign(new Error('Proxy not ready'), { code: 'ETIMEDOUT', killed: true }));
    qa.waitForRetry.mockImplementationOnce(async () => { abort.abort(); });
    await expect(qa.open({ ...input, executable: 'C:\\Office\\POWERPNT.EXE', signal: abort.signal })).rejects.toMatchObject({ code: 'STOPPED' });
    expect(qa.phases()).toEqual(['locate-document', 'await-document', 'focus-buddy', 'shell-open']);
    expect(qa.launchPowerPoint).toHaveBeenCalledTimes(1);
  });

  it('attempts readiness focus only on the exact owned buddy and still verifies the file when focus is denied', async () => {
    const qa = nativeFixture();
    await qa.open({ ...input, executable: 'C:\\Office\\POWERPNT.EXE' });
    expect(qa.phases()).toEqual(['locate-document', 'await-document', 'focus-buddy', 'shell-open', 'prune']);
    expect(qa.scripts[2]).toContain('String.Equals(filename.ToString(),expectedExe,StringComparison.OrdinalIgnoreCase)');
    expect(qa.scripts[2]).toContain('StartsWith("InsightOS",StringComparison.OrdinalIgnoreCase)');
    expect(qa.scripts[2]).toContain('$matches.Count -ne 1');
    expect(qa.scripts[2]).toContain('GetForegroundWindow() -ne $target');
    expect(qa.scripts[2]).not.toContain('GetActiveObject');
    const unavailable = nativeFixture();
    unavailable.executeFile.mockResolvedValueOnce({ stdout: JSON.stringify({ ready: true }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ focused: false }) });
    await expect(unavailable.open({ ...input, executable: 'C:\\Office\\POWERPNT.EXE' })).resolves.toMatchObject({ opened: true, selectedSlide: 2, closed: 2 });
    expect(unavailable.phases()).toEqual(['locate-document', 'focus-buddy', 'shell-open', 'prune']);
  });

  it('does not prune after denied readiness focus when the exact-file verification also fails', async () => {
    const qa = nativeFixture();
    qa.executeFile.mockResolvedValueOnce({ stdout: JSON.stringify({ ready: true }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ error: 'Foreground focus was denied.', diagnostics: { phase: 'focus-buddy', stage: 'prepare-visible-document' } }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ error: 'File verification failed.', diagnostics: { phase: 'shell-open', stage: 'verify-open-file' } }) });
    await expect(qa.open({ ...input, executable: 'C:\\Office\\POWERPNT.EXE' })).rejects.toMatchObject({ code: 'POWERPOINT_UNVERIFIED' });
    expect(qa.phases()).toEqual(['locate-document', 'focus-buddy', 'shell-open']);
    expect(qa.launchPowerPoint).not.toHaveBeenCalled();
  });

  it('stops before file verification or cleanup if interrupted during the optional readiness focus', async () => {
    const qa = nativeFixture();
    const abort = new AbortController();
    qa.executeFile.mockResolvedValueOnce({ stdout: JSON.stringify({ ready: true }) })
      .mockImplementationOnce(async () => {
        abort.abort();
        throw Object.assign(new Error('Stopped'), { code: 'ABORT_ERR' });
      });
    await expect(qa.open({ ...input, executable: 'C:\\Office\\POWERPNT.EXE', signal: abort.signal })).rejects.toMatchObject({ code: 'STOPPED' });
    expect(qa.phases()).toEqual(['locate-document', 'focus-buddy']);
    expect(qa.launchPowerPoint).not.toHaveBeenCalled();
  });

  it('reuses a visible matching document without another launch and gates COM on document readiness', async () => {
    const existing = nativeFixture();
    existing.executeFile.mockResolvedValueOnce({ stdout: JSON.stringify({ ready: true }) });
    await expect(existing.open({ ...input, executable: 'C:\\Office\\POWERPNT.EXE' })).resolves.toMatchObject({ opened: true });
    expect(existing.launchPowerPoint).not.toHaveBeenCalled();
    expect(existing.phases()).toEqual(['locate-document', 'focus-buddy', 'shell-open', 'prune']);
    const splash = nativeFixture();
    splash.executeFile.mockResolvedValueOnce({ stdout: JSON.stringify({ ready: false }) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ ready: false, diagnostics: { phase: 'await-document', stage: 'wait-visible-document', waitedMs: 25000 } }) });
    await expect(splash.open({ ...input, executable: 'C:\\Office\\POWERPNT.EXE' })).rejects.toMatchObject({
      code: 'POWERPOINT_BUSY', cause: { diagnostics: { phase: 'await-document', waitedMs: 25000 } },
    });
    expect(splash.phases()).toEqual(['locate-document', 'await-document']);
    expect(splash.launchPowerPoint).toHaveBeenCalledTimes(1);
    expect(splash.scripts.every(script => !script.includes('GetActiveObject'))).toBe(true);
  });

  it('verifies the current exact file before closing only bounded explicitly registered previous paths', async () => {
    const qa = setup();
    await expect(qa.open(input)).resolves.toEqual({
      opened: true,
      selectedSlide: 2,
      closed: 2,
      retainedModified: 0,
      warnings: [],
    });
    expect(qa.runScript).toHaveBeenCalledTimes(2);
    expect(payload(qa.runScript.mock.calls[0][0]).phase).toBe('open');
    expect(payload(qa.runScript.mock.calls[1][0])).toMatchObject({
      phase: 'prune',
      current,
      previous: [first, second],
    });
    const script = qa.runScript.mock.calls[1][0];
    expect(script).toContain('[int]$prior.Saved -ne -1');
    expect(script).toContain('Test-InsightFile $expected');
    expect(script).toContain('[Security.Cryptography.SHA256]::Create()');
    expect(script).toContain('$stream.Dispose()');
    expect(script).toContain('$hasher.Dispose()');
    expect(script).not.toContain('Get-FileHash');
    expect(script).toContain('[string]$prior.FullName -ine [string]$expected.path');
    expect(script).not.toMatch(/\.Quit\(|\.Saved\s*=|DisplayAlerts\s*=/);
    expect(script).not.toContain('revision-*');
    for (const call of qa.runScript.mock.calls as unknown as [string, AbortSignal, number][]) {
      expect(call[1]).toBeInstanceOf(AbortSignal);
      expect(call[2]).toBeLessThanOrEqual(45000);
    }
  });

  it('preserves changed-on-disk and unsaved manual edits while closing another unchanged revision', async () => {
    const qa = setup();
    const third = { path: 'C:\\Project\\revision-manual.pptx', sha256: 'd'.repeat(64) };
    qa.matchesFile.mockImplementation(async (file: any) => file.path !== first.path);
    qa.runScript.mockImplementation(async (script: string) => {
      const data = payload(script);
      return data.phase === 'open'
        ? { opened: true, path: current.path, selectedSlide: 2 }
        : {
            opened: true,
            path: current.path,
            outcomes: [
              { path: second.path, status: 'modified' },
              { path: third.path, status: 'closed' },
            ],
          };
    });
    const result = await qa.open({ ...input, previous: [first, second, third] });
    expect(result).toMatchObject({ opened: true, closed: 1, retainedModified: 2 });
    expect(payload(qa.runScript.mock.calls[1][0]).previous).toEqual([second, third]);
    expect(result.warnings.join(' ')).toContain('unsaved edits');
  });

  it('never prunes when current disk bytes, opened full path or selected slide are unverified', async () => {
    const changed = setup();
    changed.matchesFile.mockResolvedValue(false);
    await expect(changed.open(input)).rejects.toMatchObject({ code: 'CURRENT_CHANGED' });
    expect(changed.runScript).not.toHaveBeenCalled();
    for (const reply of [
      { opened: true, path: 'C:\\Unrelated\\revision-3.pptx', selectedSlide: 2 },
      { opened: true, path: current.path, selectedSlide: 1 },
      { opened: false, path: current.path, selectedSlide: 2 },
    ]) {
      const qa = setup();
      qa.runScript.mockResolvedValueOnce(reply);
      await expect(qa.open(input)).rejects.toMatchObject({ code: 'OPEN_UNVERIFIED' });
      expect(qa.runScript).toHaveBeenCalledTimes(1);
    }
  });

  it('does not close earlier windows after cancellation between verified opening and cleanup', async () => {
    const qa = setup();
    const abort = new AbortController();
    qa.runScript.mockImplementationOnce(async () => {
      abort.abort();
      return { opened: true, path: current.path, selectedSlide: 2 };
    });
    await expect(qa.open({ ...input, signal: abort.signal })).rejects.toMatchObject({
      code: 'STOPPED',
    });
    expect(qa.runScript).toHaveBeenCalledTimes(1);
  });

  it('propagates cancellation during cleanup without a success claim', async () => {
    const qa = setup();
    const abort = new AbortController();
    qa.runScript.mockImplementation(async (script: string) => {
      if (payload(script).phase === 'prune') abort.abort();
      return { opened: true, path: current.path, selectedSlide: 2, outcomes: [] };
    });
    await expect(qa.open({ ...input, signal: abort.signal })).rejects.toMatchObject({
      code: 'STOPPED',
    });
  });

  it('retains truthful opening evidence but reports cleanup failure instead of inventing closed windows', async () => {
    const qa = setup();
    qa.runScript.mockImplementation(async (script: string) => {
      if (payload(script).phase === 'prune') throw new Error('COM busy');
      return { opened: true, path: current.path, selectedSlide: 2 };
    });
    await expect(qa.open(input)).resolves.toMatchObject({
      opened: true,
      selectedSlide: 2,
      closed: 0,
      warnings: [expect.stringContaining('may remain')],
    });
  });

  it('does not count unknown or duplicated native cleanup paths as verified closures', async () => {
    const qa = setup();
    qa.runScript.mockImplementation(async (script: string) =>
      payload(script).phase === 'open'
        ? { opened: true, path: current.path, selectedSlide: 2 }
        : {
            opened: true,
            path: current.path,
            outcomes: [
              { path: first.path, status: 'closed' },
              { path: 'C:\\Other\\unrelated.pptx', status: 'closed' },
            ],
          },
    );
    const result = await qa.open(input);
    expect(result.closed).toBe(0);
    expect(result.warnings.join(' ')).toContain('not verified');
  });

  it('rejects duplicate/current closure candidates, unbounded history and nonordinary paths', () => {
    for (const request of [
      { ...input, previous: [current] },
      { ...input, previous: [first, { ...first, path: first.path.toUpperCase() }] },
      { ...input, previous: Array.from({ length: 17 }, () => first) },
      { ...input, current: { ...current, path: 'revision.pptx' } },
      { ...input, current: { ...current, path: 'C:\\Project\\file:stream.pptx' } },
      { ...input, current: { ...current, path: 'C:\\Project\\*.pptx' } },
      { ...input, slide: 0 },
      { ...input, executable: 'C:\\Other\\arbitrary.exe' },
      { ...input, executable: 'POWERPNT.EXE' },
    ])
      expect(() => validateInput(request)).toThrow();
  });

  it('passes shell punctuation as encoded JSON data, without interpolating it into executable syntax', async () => {
    const qa = setup();
    const special = { ...current, path: "C:\\Project\\Speaker's $(example) ` file.pptx" };
    await qa.open({ ...input, current: special, previous: [] });
    expect(payload(qa.runScript.mock.calls[0][0]).current).toEqual(special);
    expect(qa.runScript.mock.calls[0][0]).not.toContain(special.path);
  });
});
