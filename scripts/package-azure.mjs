import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zip } from './zip.mjs';
const root = path.resolve(import.meta.dirname, '..'),
  entries = [];
async function collect(relative) {
  const file = path.join(root, relative),
    info = await stat(file);
  if (info.isDirectory()) {
    for (const entry of await readdir(file, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name === '.bin') continue;
      await collect(path.join(relative, entry.name));
    }
  } else entries.push({ name: relative.replaceAll('\\', '/'), data: await readFile(file) });
}
// Explicit allowlist excludes local credentials, Terraform and developer tools.
for (const file of ['app', 'package.json', 'package-lock.json', 'scripts/bootstrap-database.mjs'])
  await collect(file);
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
for (const [location, metadata] of Object.entries(lock.packages))
  if (location.startsWith('node_modules/') && !metadata.dev) await collect(location);
if (entries.some((e) => /\.(node|exe|dll)$/.test(e.name)))
  throw new Error(
    'Native dependencies found. Build a Linux artifact before deploying to Linux App Service.',
  );
await mkdir(path.join(root, 'dist'), { recursive: true });
const archive = zip(entries);
await writeFile(path.join(root, 'dist', 'app.zip'), archive);
await writeFile(
  path.join(root, 'dist', 'app.sha256'),
  `${createHash('sha256').update(archive).digest('hex')}  app.zip\n`,
);
console.log(
  `Packaged ${entries.length} allowlisted files into dist/app.zip (${Math.round(archive.length / 1024)} KiB). No Terraform or credential files included.`,
);
