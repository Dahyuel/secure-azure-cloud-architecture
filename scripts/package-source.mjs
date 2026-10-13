import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zip } from './zip.mjs';
const root = path.resolve(import.meta.dirname, '..'),
  entries = [];
async function collect(relative) {
  for (const item of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const file = path.join(relative, item.name);
    if (item.isDirectory()) await collect(file);
    else if (item.isFile())
      entries.push({
        name: file.replaceAll('\\', '/'),
        data: await readFile(path.join(root, file)),
      });
  }
}
for (const dir of ['app', 'scripts', 'tests', 'database', 'docs', '.github']) await collect(dir);
for (const file of [
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'package.json',
  'package-lock.json',
  'Dockerfile',
  'compose.yaml',
  '.dockerignore',
  '.gitignore',
  '.gitattributes',
  '.prettierrc.json',
  '.prettierignore',
  '.terraform.lock.hcl',
  'main.tf',
  'variables.tf',
  'outputs.tf',
  'workloads.tf',
  'egress.tf',
  'monitoring.tf',
  'terraform.tfvars.example',
])
  entries.push({ name: file, data: await readFile(path.join(root, file)) });
const artifact = zip(entries);
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist', 'azure-sentinel-lab-source.zip'), artifact);
await writeFile(
  path.join(root, 'dist', 'azure-sentinel-lab-source.sha256'),
  `${createHash('sha256').update(artifact).digest('hex')}  azure-sentinel-lab-source.zip\n`,
);
console.log(
  `Packaged ${entries.length} source files. Local credentials, dependencies, state and Git metadata excluded.`,
);
