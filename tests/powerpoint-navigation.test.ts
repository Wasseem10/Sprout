import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  validateSlideNavigation,
  createPowerPointNavigator,
  PowerPointNavigationError,
} = require('../electron/powerpoint-navigation.cjs');

describe('native PowerPoint slide navigation validation', () => {
  it('accepts a finite slide or relative navigation without requiring a selected folder', () => {
    expect(validateSlideNavigation(2)).toEqual({ slide: 2 });
    expect(validateSlideNavigation('next', 'insight-demo.pptx')).toEqual({
      slide: 'next',
      filename: 'insight-demo.pptx',
    });
    expect(validateSlideNavigation('previous')).toEqual({ slide: 'previous' });
    expect(validateSlideNavigation('first')).toEqual({ slide: 'first' });
    expect(validateSlideNavigation('last')).toEqual({ slide: 'last' });
  });
  it('rejects invalid slide numbers and unrelated desktop commands', () => {
    for (const value of [0, -1, 501, 2.5, NaN, '2', 'open chrome'])
      expect(() => validateSlideNavigation(value)).toThrow(/Choose a slide/);
  });
  it('rejects paths, wildcard filenames, and arbitrary PowerShell payloads', () => {
    for (const filename of [
      '../other.pptx',
      'C:\\other.pptx',
      '*.pptx',
      'other.pdf',
      'x"; invoke-expression.pptx',
      '',
    ])
      expect(() => validateSlideNavigation(2, filename)).toThrow(/filename/);
  });
});

const located = {
  slide: 3,
  slideCount: 4,
  filename: 'insight-revision.pptx',
  fullName: 'C:\\Insight\\insight-revision.pptx',
  title: 'Insight revision',
  target: { x: 160, y: 330 },
  focusTarget: { x: 700, y: 50 },
  slideShow: false,
};
const selected = { ...located, verified: true, method: 'thumbnail' };
function inputFromScript(script: string) {
  const encoded = script.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)![1];
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}
function protocol(dependencies: Record<string, unknown> = {}) {
  const runScript = vi.fn(async (script: string): Promise<Record<string, unknown>> =>
    script.includes('$method =') ? selected : located,
  );
  const runPointerCommand = vi.fn(async () => undefined);
  const delay = vi.fn(async (_ms: number) => undefined);
  return {
    runScript,
    runPointerCommand,
    delay,
    navigate: createPowerPointNavigator({ runScript, runPointerCommand, delay, ...dependencies }),
  };
}

describe('bounded PowerPoint open/busy recovery', () => {
  it('retries the expected new filename while it opens, then clicks and verifies it once', async () => {
    const p = protocol();
    p.runScript
      .mockRejectedValueOnce(
        new PowerPointNavigationError('Still opening', 'PRESENTATION_NOT_READY'),
      )
      .mockRejectedValueOnce(
        new PowerPointNavigationError('Call rejected by callee', 'POWERPOINT_BUSY'),
      );
    const result = await p.navigate(3, 'insight-revision.pptx');
    expect(result).toMatchObject({
      filename: 'insight-revision.pptx',
      slide: 3,
      verified: true,
      clicked: true,
    });
    expect(p.runScript).toHaveBeenCalledTimes(4);
    expect(p.delay.mock.calls.map((call) => call[0])).toEqual([500, 1000]);
    expect(p.runPointerCommand).toHaveBeenCalledExactlyOnceWith(
      'click',
      160,
      330,
      expect.any(AbortSignal),
    );
    for (const [script] of p.runScript.mock.calls)
      expect(inputFromScript(script).filename).toBe('insight-revision.pptx');
    expect(p.runScript.mock.calls[0][0]).toContain('foreach ($candidate in $ppt.Presentations)');
    expect(p.runScript.mock.calls[0][0]).toContain("Stop-InsightSlide 'PRESENTATION_AMBIGUOUS'");
  });

  it('pins the same full path and absolute slide when verification retries after COM busy', async () => {
    const p = protocol();
    p.runScript
      .mockResolvedValueOnce(located)
      .mockRejectedValueOnce(
        new PowerPointNavigationError('RPC busy after click', 'POWERPOINT_BUSY'),
      )
      .mockResolvedValueOnce(selected);
    await expect(p.navigate('next', 'insight-revision.pptx')).resolves.toMatchObject({
      slide: 3,
      verified: true,
    });
    expect(p.runPointerCommand).toHaveBeenCalledTimes(1);
    for (const [script] of p.runScript.mock.calls.slice(1))
      expect(inputFromScript(script)).toEqual({
        slide: 3,
        filename: located.filename,
        fullName: located.fullName,
      });
  });

  it('waits for the thumbnail selection to commit without clicking twice', async () => {
    const p = protocol();
    p.runScript
      .mockResolvedValueOnce(located)
      .mockRejectedValueOnce(
        new PowerPointNavigationError('Selection not committed', 'SLIDE_SELECTION_PENDING'),
      )
      .mockResolvedValueOnce(selected);
    await expect(p.navigate(3, located.filename)).resolves.toMatchObject({ verified: true });
    expect(p.runPointerCommand).toHaveBeenCalledTimes(1);
  });

  it('does not choose an unrelated active deck returned by a bad native response', async () => {
    const p = protocol();
    p.runScript.mockResolvedValueOnce({
      ...located,
      filename: 'other.pptx',
      fullName: 'C:\\Other\\other.pptx',
    });
    await expect(p.navigate(3, located.filename)).rejects.toMatchObject({
      code: 'PRESENTATION_CHANGED',
    });
    expect(p.runPointerCommand).not.toHaveBeenCalled();
    expect(p.runScript).toHaveBeenCalledTimes(1);
  });

  it('rejects ambiguous duplicate filenames without retrying or selecting either deck', async () => {
    const p = protocol();
    p.runScript.mockRejectedValue(
      new PowerPointNavigationError('Two open decks have that filename', 'PRESENTATION_AMBIGUOUS'),
    );
    await expect(p.navigate(3, located.filename)).rejects.toMatchObject({
      code: 'PRESENTATION_AMBIGUOUS',
    });
    expect(p.runScript).toHaveBeenCalledTimes(1);
    expect(p.runPointerCommand).not.toHaveBeenCalled();
    expect(p.delay).not.toHaveBeenCalled();
  });

  it('stops promptly when no active deck and no expected filename were provided', async () => {
    const p = protocol();
    p.runScript.mockRejectedValue(
      new PowerPointNavigationError('No active presentation', 'POWERPOINT_UNAVAILABLE'),
    );
    await expect(p.navigate(3)).rejects.toMatchObject({ code: 'POWERPOINT_UNAVAILABLE' });
    expect(p.runScript).toHaveBeenCalledTimes(1);
    expect(p.runPointerCommand).not.toHaveBeenCalled();
  });

  it('uses a finite retry limit and returns an explicit unverified-selection failure', async () => {
    const p = protocol();
    p.runScript.mockRejectedValue(new PowerPointNavigationError('Timed out', 'POWERPOINT_BUSY'));
    await expect(p.navigate(3, located.filename)).rejects.toMatchObject({
      code: 'POWERPOINT_NOT_READY',
      stage: 'locate',
    });
    expect(p.runScript).toHaveBeenCalledTimes(5);
    expect(p.runPointerCommand).not.toHaveBeenCalled();
    expect(p.delay).toHaveBeenCalledTimes(4);
  });

  it('bounds total elapsed work even when native execution stalls at every attempt', async () => {
    let time = 0;
    const runScript = vi.fn(async (_script, _signal, timeout) => {
      time += timeout;
      throw new PowerPointNavigationError('Timed out', 'POWERPOINT_BUSY');
    });
    const delay = vi.fn(async (ms) => {
      time += ms;
    });
    const p = protocol({ runScript, delay, now: () => time });
    await expect(p.navigate(3, located.filename)).rejects.toMatchObject({
      code: 'POWERPOINT_NOT_READY',
    });
    expect(time).toBeLessThanOrEqual(28_000);
    expect(runScript.mock.calls.length).toBeLessThanOrEqual(5);
    expect(p.runPointerCommand).not.toHaveBeenCalled();
  });

  it('cancels during the opening retry without a later click or success', async () => {
    const abort = new AbortController();
    const runScript = vi.fn(async () => {
      throw new PowerPointNavigationError('Still opening', 'PRESENTATION_NOT_READY');
    });
    const delay = vi.fn(async () => abort.abort());
    const p = protocol({ runScript, delay });
    await expect(p.navigate(3, located.filename, abort.signal)).rejects.toMatchObject({
      code: 'STOPPED',
    });
    expect(runScript).toHaveBeenCalledTimes(1);
    expect(p.runPointerCommand).not.toHaveBeenCalled();
  });

  it('rejects a different deck or unverified slide after the pointer action', async () => {
    const p = protocol();
    p.runScript
      .mockResolvedValueOnce(located)
      .mockResolvedValueOnce({ ...selected, fullName: 'C:\\Another\\insight-revision.pptx' });
    await expect(p.navigate(3, located.filename)).rejects.toMatchObject({
      code: 'PRESENTATION_CHANGED',
    });
    expect(p.runPointerCommand).toHaveBeenCalledTimes(1);
    const q = protocol();
    q.runScript
      .mockResolvedValueOnce(located)
      .mockResolvedValueOnce({ ...selected, verified: false });
    await expect(q.navigate(3, located.filename)).rejects.toMatchObject({
      code: 'UNVERIFIED_SELECTION',
    });
  });
});
