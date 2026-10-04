import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, {
    withFileTypes: true
  })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) await walk(path);else if (entry.isFile() && /\.(m?js)$/.test(entry.name)) files.push(path);
  }
}
await walk(root);
for (const path of files) {
  const result = spawnSync(process.execPath, ['--check', path], {
    stdio: 'inherit'
  });
  if (result.status) process.exit(result.status);
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)) {
  await readFile(resolve(root, match[1]));
}
console.log(`Checked ${files.length} JavaScript modules and local HTML assets.`);
