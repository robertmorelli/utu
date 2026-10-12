// index.html for a Foundry build: the game data and starter map are embedded
// as JSON script tags, identically for every implementation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FOUNDRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function writePage(out, { script, css, head = '' }) {
  const game = await fs.readFile(path.join(FOUNDRY, 'data/game.json'), 'utf8');
  const starter = execFileSync('node', [path.join(FOUNDRY, 'tools/scenario.mjs'), 'starter'], { encoding: 'utf8' });
  const safe = text => text.replaceAll('</', '<\\/');
  if (css) await fs.copyFile(path.join(FOUNDRY, 'data/style.css'), path.join(out, 'style.css'));
  await fs.writeFile(path.join(out, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Foundry</title>
${css ? '<link rel="stylesheet" href="style.css">' : ''}${head}
<script type="application/json" id="game">${safe(game.trim())}</script>
<script type="application/json" id="starter">${safe(starter)}</script>
</head>
<body>
<script type="module" src="${script}"></script>
</body>
</html>
`);
}
