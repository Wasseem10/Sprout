import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PresentationWindowRegistry } from '../server/computer/presentation-windows';

describe('owned presentation window files', () => {
  it('retains exact project ownership across restarts and separates another owner/project', async () => {
    const localDir = await mkdtemp(path.join(tmpdir(), 'insight-windows-'));
    const cfg = { localDir, owner: 'alice' };
    const id = randomUUID();
    const first = { path: path.join(localDir, 'first.pptx'), sha256: 'a'.repeat(64) };
    const second = { path: path.join(localDir, 'second.pptx'), sha256: 'b'.repeat(64) };
    const registry = new PresentationWindowRegistry(cfg);
    await registry.register(id, first, new AbortController().signal);
    await registry.register(id, second, new AbortController().signal);
    expect(await new PresentationWindowRegistry(cfg).list(id)).toEqual([first, second]);
    expect(await registry.list(randomUUID())).toEqual([]);
    expect(await new PresentationWindowRegistry({ localDir, owner: 'bob' }).list(id)).toEqual([]);
  });
  it('does not register cancelled writes or unowned directory traversal IDs', async () => {
    const localDir = await mkdtemp(path.join(tmpdir(), 'insight-windows-'));
    const registry = new PresentationWindowRegistry({ localDir, owner: 'alice' });
    const id = randomUUID();
    const controller = new AbortController();
    controller.abort();
    await expect(registry.register(id, { path: path.join(localDir, 'deck.pptx'), sha256: 'a'.repeat(64) }, controller.signal)).rejects.toThrow();
    expect(await registry.list(id)).toEqual([]);
    await expect(registry.list('../other')).rejects.toThrow();
  });
});
