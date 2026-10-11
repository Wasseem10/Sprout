import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseStudioFile } from './studio-assistant.js';
import { PresentationFailureError } from '../../shared/presentation-failure.js';

export class StudioSourceChoice extends Error {
  constructor(message: string) { super(message); this.name = 'StudioSourceChoice'; }
}
export type LocalStudioSource = { root: string; filename: string; sha256: string; datasetId: string; sourceSheet: string };
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
// Exact bundled demonstration bytes only; user-provided filenames never establish synthetic provenance.
const bundledSyntheticSha256 = '2035b5777839fd7034062531b524786b112151648a53aa38dd37a39805ea0c06';
const supported = (name: string) => !/[\\/:<>"|?*\u0000-\u001f]/.test(name) && /\.(csv|xlsx)$/i.test(name);
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/** Reads only a direct, ordinary file in an explicitly resolved folder. Parsing keeps Studio's existing boundary. */
export async function loadLocalStudioSource(root: string, requested: string | undefined, signal: AbortSignal) {
  signal.throwIfAborted();
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new PresentationFailureError('missing_source', 'Choose an ordinary local folder containing the revenue table.');
  const resolvedRoot = await realpath(root);
  let filename = requested;
  if (filename && !supported(filename)) throw new StudioSourceChoice('What is the exact CSV or XLSX filename in that folder?');
  if (!filename) {
    const entries = await readdir(resolvedRoot, { withFileTypes: true });
    signal.throwIfAborted();
    if (entries.length > 200) throw new StudioSourceChoice('That folder has many files. What is the exact CSV or XLSX filename?');
    const choices = entries.filter(entry => entry.isFile() && !entry.isSymbolicLink() && supported(entry.name) && !entry.name.startsWith('~$')).map(entry => entry.name).sort();
    if (choices.length !== 1) throw new StudioSourceChoice(choices.length ? `Which source file should I use: ${choices.slice(0, 6).join(', ')}${choices.length > 6 ? ', or another file' : ''}?` : 'There is no CSV or XLSX file in that folder. Tell me another folder or an exact supported filename.');
    filename = choices[0];
  }
  const file = path.join(resolvedRoot, filename);
  let bytes: Buffer;
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 || !samePath(await realpath(file), file)) throw new Error('Not an ordinary bounded source file.');
    bytes = await readFile(file);
  } catch (cause) { throw new PresentationFailureError('missing_source', `I could not read ${filename} as a local file of at most 1 MB. Choose another CSV or XLSX file.`, 'terminal', { cause }); }
  signal.throwIfAborted();
  const parsed = await parseStudioFile(filename, bytes);
  if (digest(bytes) === bundledSyntheticSha256) parsed.dataset.synthetic = true;
  signal.throwIfAborted();
  const binding: LocalStudioSource = { root: resolvedRoot, filename, sha256: digest(bytes), datasetId: parsed.dataset.id, sourceSheet: parsed.sheet };
  return { ...parsed, binding };
}

/** Bounded synchronous byte guard at the existing atomic publication boundary; no directory traversal or parsing. */
export function assertLocalStudioSourceCurrent(source: LocalStudioSource): void {
  try {
    const file = path.join(source.root, source.filename), stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 || !samePath(realpathSync(file), file) || digest(readFileSync(file)) !== source.sha256) throw new Error('Source bytes changed.');
  } catch (cause) { throw new PresentationFailureError('stale_revision', 'The source file changed while the chart was being verified. The saved chart is unchanged; ask me to refresh it again.', 'terminal', { cause }); }
}
