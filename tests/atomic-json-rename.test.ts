import { afterEach, expect, it, vi } from 'vitest';
import { rename } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { renamePresentationManifest } from '../server/computer/atomic-json-rename';
vi.mock('node:fs/promises', () => ({ rename: vi.fn() }));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });
it('retries only transient Windows sharing failures, with the original source and destination', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EPERM' })).mockResolvedValueOnce(undefined);
  await renamePresentationManifest('new.tmp', 'working.json');
  expect(vi.mocked(rename).mock.calls).toEqual([['new.tmp', 'working.json'], ['new.tmp', 'working.json']]);
  expect(setTimeout).toHaveBeenCalledOnce();
});
it('bounds retries and returns the original filesystem failure', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  const error = Object.assign(new Error('still locked'), { code: 'EACCES' });
  vi.mocked(rename).mockRejectedValue(error);
  await expect(renamePresentationManifest('new.tmp', 'working.json')).rejects.toBe(error);
  expect(rename).toHaveBeenCalledTimes(6);
  expect(setTimeout).toHaveBeenCalledTimes(5);
});
it('does not retry missing files or other filesystem failures', async () => {
  const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
  vi.mocked(rename).mockRejectedValue(error);
  await expect(renamePresentationManifest('new.tmp', 'working.json')).rejects.toBe(error);
  expect(rename).toHaveBeenCalledOnce();
  expect(setTimeout).not.toHaveBeenCalled();
});
