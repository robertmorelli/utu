export async function formatDiagnostic(diag, { readFile }) {
  return formatOne(diag, { readFile, cache: new Map() });
}

export async function formatDiagnostics(diags, { readFile }) {
  const cache = new Map();
  const chunks = [];
  for (const diag of diags ?? []) chunks.push(await formatOne(diag, { readFile, cache }));
  return chunks.join('\n\n');
}

async function formatOne(diag, { readFile, cache }) {
  const primary = diag?.primary ?? {};
  const file = primary.file ?? '<unknown>';
  const row = primary.row ?? 0;
  const col = primary.col ?? 0;
  const severity = diag?.severity ?? 'error';
  const message = diag?.message ?? diag?.kind ?? 'diagnostic';
  const header = `${file}:${row || 0}:${col || 0}: ${severity}: ${message}`;

  if (!file || file === '<unknown>' || !row || !col || !readFile) return header;

  const source = await cachedRead(file, readFile, cache);
  if (source == null) return header;

  const line = source.split(/\r?\n/)[row - 1];
  if (line == null) return header;

  const lineNo = String(row);
  const gutter = ' '.repeat(lineNo.length);
  const caretCol = Math.max(1, col);
  return [
    header,
    `${gutter} |`,
    `${lineNo} | ${line}`,
    `${gutter} | ${' '.repeat(caretCol - 1)}^`,
  ].join('\n');
}

async function cachedRead(file, readFile, cache) {
  if (!cache.has(file)) {
    cache.set(file, Promise.resolve(readFile(file)).catch(() => null));
  }
  return cache.get(file);
}
