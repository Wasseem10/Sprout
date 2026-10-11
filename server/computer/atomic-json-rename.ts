import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

/** Antivirus/sync readers can briefly lock Windows manifests. Never unlink the old file. */
export async function renamePresentationManifest(from: string, to: string): Promise<void> {
  const waits = [25, 50, 100, 200, 400];
  for (let attempt = 0; ; attempt++) {
    try { await rename(from, to); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || attempt >= waits.length) throw error;
      await delay(waits[attempt]);
    }
  }
}
