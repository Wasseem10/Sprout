import { readFile, mkdir, writeFile } from 'node:fs/promises';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const packages = Object.entries(lock.packages)
  .filter(([key]) => key.startsWith('node_modules/'))
  .map(([key, value]) => ({
    name: value.name ?? key.slice(key.lastIndexOf('node_modules/') + 13),
    version: value.version,
    license: value.license ?? 'See package license files',
    developmentOnly: !!value.dev,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/dependency-licenses.json',
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'Installed package-lock.json metadata; original license files remain authoritative.',
      packages,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Inventoried ${packages.length} dependency license records.`);
