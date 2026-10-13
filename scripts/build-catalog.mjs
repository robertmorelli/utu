// dist/selfhost/catalog/: the platform's host declarations as the
// self-hosted compiler reads them (src/selfhost/catalog.js). Run by
// `bun run build`, after the platform sources are generated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_SOURCES } from '../src/compiler/platform-sources.generated.js';
import { writeCatalog } from '../src/selfhost/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'dist', 'selfhost', 'catalog');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let bytes = 0;
for (const [name, data] of await writeCatalog(PLATFORM_SOURCES)) {
  fs.writeFileSync(path.join(out, name), data);
  bytes += data.length;
}
console.log(`host declarations catalog: ${bytes} bytes`);
