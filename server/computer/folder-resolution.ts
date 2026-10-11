import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export type SpokenFolderLocation = 'desktop' | 'documents' | 'downloads';
type KnownFolderPaths = Partial<Record<SpokenFolderLocation, string>>;
export class FolderResolutionError extends Error {}
const runFile = promisify(execFile);
const locationSuffix =
  /\s+(?:that(?:'s| is)\s+)?(?:on|in|at)\s+(?:my|the|your)?\s*(?:desktop|documents?|downloads?)(?:\s+folder)?[.!?]*$/i;

export function spokenFolderLocation(request: string): SpokenFolderLocation | null {
  const found = request.match(
    /\b(?:on|in|at)\s+(?:my|the|your)?\s*(desktop|documents?|downloads?)\b/i,
  )?.[1];
  if (!found) return null;
  return /^desktop$/i.test(found)
    ? 'desktop'
    : /^documents?$/i.test(found)
      ? 'documents'
      : 'downloads';
}

export function spokenFolderName(request: string): string | null {
  const absolute =
    request.match(/["“]([A-Za-z]:[\\/][^"”]+)["”]/)?.[1] ??
    request.match(
      /(?:folder|from|in)\s+([A-Za-z]:[\\/].+?)(?=\s+(?:and|then|use|with)\b|$)/i,
    )?.[1] ??
    (/^[A-Za-z]:[\\/]/.test(request.trim()) ? request.trim() : null);
  if (absolute) return absolute.trim().replace(/[.!?]+$/, '');
  if (
    !/\bfolder\b/i.test(request) &&
    !/^(?:it(?:'s| is)|the folder is)\s+(?:called|named)\b/i.test(request.trim())
  )
    return null;

  // A location refines an earlier named folder; it is never itself a folder name.
  const withoutLocation = request
    .replace(locationSuffix, '')
    .trim()
    .replace(/[.!?]+$/, '');
  const named =
    withoutLocation.match(
      /folder\s+(?:called|named)\s+["“]?(.+?)(?=["”]|[,.;]|\s+(?:and|with|to|then)\b|$)/i,
    )?.[1] ??
    withoutLocation.match(/["“]([^"”]+)["”]\s+folder/i)?.[1] ??
    withoutLocation.match(/\bfolder\s+["“]([^"”]+)["”]/i)?.[1] ??
    withoutLocation.match(
      /\bfolder\s+(?!(?:and|with|to|then|using|use|on|in|at|is|are|images?|pictures?|photos?|assets?)\b)([^,.!?"“”]+?)(?=\s+(?:and|with|to|then|using|use)\b|[,.;!?]|$)/i,
    )?.[1] ??
    withoutLocation
      .split(/\bfolder\b/i)[0]
      .match(/\b(?:my|the|from|in)\s+((?:(?!\b(?:my|the|from|in)\b)[^,.!?"“”]){2,80})\s*$/i)?.[1] ??
    withoutLocation.match(
      /^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:open|go to|use|select)\s+(?:my\s+|the\s+)?(.+?)\s+folder$/i,
    )?.[1] ??
    withoutLocation.match(
      /^((?!i\b|can\b|could\b|would\b|make\b|create\b|prepare\b|build\b|open\b|go\b|use\b|select\b|find\b|folder\b|on\b|in\b|at\b)[^,.!?"“”]{2,80})\s+folder(?:\s+is)?$/i,
    )?.[1] ??
    withoutLocation.match(
      /^(?:it(?:'s| is)|the folder is)(?:\s+(?:called|named))?\s+["“]?([^"”]+?)["”]?$/i,
    )?.[1];
  const name = named?.trim().replace(/^(?:my|the)\s+/i, '');
  if (
    !name ||
    /^(?:my|the|this|that|your|it|folder|desktop|documents?|downloads?|on|in|at)$/i.test(name)
  )
    return null;
  if (/^(?:on|in|at)\s+(?:my|the|your)?\s*(?:desktop|documents?|downloads?)$/i.test(name))
    return null;
  return name;
}

const folderKey = (name: string) =>
  name
    .normalize('NFKC')
    .toLowerCase()
    .replace(
      /\bq[\s-]*(one|two|three|four|[1-4])\b/g,
      (_all, value: string) =>
        `q${({ one: 1, two: 2, three: 3, four: 4 } as Record<string, number>)[value] ?? value}`,
    )
    .replace(/[^\p{L}\p{N}]/gu, '');

let knownFolderPromise: Promise<KnownFolderPaths> | undefined;
async function windowsKnownFolders() {
  if (process.platform !== 'win32') return {};
  return (knownFolderPromise ??= (async () => {
    try {
      const script =
        "$folders = Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'; @{ desktop = [Environment]::GetFolderPath('DesktopDirectory'); documents = [Environment]::GetFolderPath('MyDocuments'); downloads = [Environment]::ExpandEnvironmentVariables($folders.'{374DE290-123F-4565-9164-39C4925E467B}') } | ConvertTo-Json -Compress";
      const { stdout } = await runFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, timeout: 5000, maxBuffer: 16384 },
      );
      const parsed = JSON.parse(stdout.trim());
      return Object.fromEntries(
        Object.entries(parsed).filter(
          ([key, value]) =>
            ['desktop', 'documents', 'downloads'].includes(key) &&
            typeof value === 'string' &&
            path.isAbsolute(value),
        ),
      ) as KnownFolderPaths;
    } catch {
      return {};
    }
  })());
}

function defaultRoots(location: SpokenFolderLocation | null | undefined, known: KnownFolderPaths) {
  const home = homedir();
  const kinds: SpokenFolderLocation[] = location
    ? [location]
    : ['desktop', 'documents', 'downloads'];
  const names = { desktop: 'Desktop', documents: 'Documents', downloads: 'Downloads' };
  const drives = [
    process.env.OneDrive,
    process.env.OneDriveConsumer,
    process.env.OneDriveCommercial,
    path.join(home, 'OneDrive'),
  ].filter((root): root is string => !!root);
  return [
    ...(!location ? [process.cwd()] : []),
    ...kinds
      .flatMap((kind) => [
        known[kind],
        path.join(home, names[kind]),
        ...drives.map((drive) => path.join(drive, names[kind])),
      ])
      .filter((root): root is string => !!root),
  ];
}

async function ordinaryDirectory(folder: string): Promise<string | null> {
  try {
    const stat = await lstat(folder);
    return stat.isDirectory() && !stat.isSymbolicLink() ? await realpath(folder) : null;
  } catch {
    return null;
  }
}

const locationPhrase = (location: SpokenFolderLocation) =>
  location === 'desktop'
    ? 'on your Desktop'
    : `in your ${location === 'documents' ? 'Documents' : 'Downloads'}`;

// Resolve only directory names. Do not read source files, follow symbolic links,
// or recursively crawl the user's computer. The selected folder is already trusted.
export async function findLocalPresentationFolder(
  name: string,
  selected?: string,
  roots?: string[],
  location?: SpokenFolderLocation | null,
  knownFolders?: KnownFolderPaths,
): Promise<string> {
  if (path.isAbsolute(name)) {
    const stat = await lstat(name).catch(() => {
      throw new FolderResolutionError(
        'I could not open that folder. Check its path and that it exists.',
      );
    });
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new FolderResolutionError('Use an ordinary local folder.');
    return realpath(name);
  }
  const inferred = spokenFolderLocation(name),
    parsed = spokenFolderName(`Open my ${name} folder`);
  if (inferred && parsed) name = parsed;
  location ??= inferred;
  const key = folderKey(name);
  if (!key || /[\\/]/.test(name))
    throw new FolderResolutionError(
      'What is the folder called? You can say its name and where it is, such as Marketing on my Desktop.',
    );
  if (selected && !location && folderKey(path.basename(selected)) === key) {
    const resolved = await ordinaryDirectory(selected);
    if (resolved) return resolved;
  }
  // Explicit roots retain their search boundary. Injected known paths let isolated
  // callers model redirected Windows folders without reading the user's profile.
  const known = knownFolders ?? (roots ? {} : await windowsKnownFolders());
  const base = roots ?? defaultRoots(location, known);
  const preferred = location ? known[location] : undefined;
  const preferredRoot =
    preferred && base.some((root) => path.resolve(root) === path.resolve(preferred))
      ? preferred
      : undefined;
  const matches = new Set<string>();
  let visited = 0;
  const scanned = new Set<string>();
  const scan = async (root: string, depth: number): Promise<void> => {
    if (++visited > 180) return;
    try {
      const resolved = await ordinaryDirectory(root);
      if (!resolved) return;
      const fingerprint = `${resolved.toLowerCase()}:${depth}`;
      if (scanned.has(fingerprint)) return;
      scanned.add(fingerprint);
      for (const entry of await readdir(resolved, { withFileTypes: true })) {
        if (
          !entry.isDirectory() ||
          entry.isSymbolicLink() ||
          entry.name.startsWith('.') ||
          /^(?:node_modules|AppData|Windows|Program Files)$/i.test(entry.name)
        )
          continue;
        const child = path.join(resolved, entry.name);
        if (folderKey(entry.name) === key) {
          const resolvedChild = await ordinaryDirectory(child);
          if (resolvedChild) matches.add(resolvedChild);
        } else if (depth > 0) await scan(child, depth - 1);
      }
    } catch {
      /* unavailable locations do not prevent finding another */
    }
  };
  const resolvedMatch = (): string | undefined => {
    if (matches.size > 1)
      throw new FolderResolutionError(
        location
          ? `I found more than one ${name} folder ${locationPhrase(location)}. Say the full path of the folder you want so I can tell them apart.`
          : `I found more than one ${name} folder. Is it on your Desktop, in Documents, or in Downloads?`,
      );
    return [...matches][0];
  };
  // A spoken personal location means the Windows known folder first. A stale
  // selection or legacy OneDrive/home directory must not override a match there.
  if (preferredRoot) {
    await scan(preferredRoot, 0);
    if (!matches.size) await scan(preferredRoot, 1);
    const preferredMatch = resolvedMatch();
    if (preferredMatch) return preferredMatch;
  }
  if (
    selected &&
    folderKey(path.basename(selected)) === key &&
    base.some((root) => {
      const relative = path.relative(root, selected);
      return (
        relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      );
    })
  ) {
    const resolved = await ordinaryDirectory(selected);
    if (resolved) return resolved;
  }
  for (const root of [...new Set(base)]) await scan(root, 0);
  if (!matches.size) for (const root of [...new Set(base)]) await scan(root, 1);
  const match = resolvedMatch();
  if (!match)
    throw new FolderResolutionError(
      location
        ? `I could not find ${name} ${locationPhrase(location)}. Say a different folder name or its full path.`
        : `I could not find ${name}. Is it on your Desktop, in Documents, or in Downloads?`,
    );
  return match;
}
