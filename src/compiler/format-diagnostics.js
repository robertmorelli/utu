import { computeLineStarts, lineForOffset, renderHighlightedSource } from './source-renderer.js';

export async function formatDiagnostic(diag, { readFile, snapshot, color = true } = {}) {
  return formatOne(diag, { readFile, snapshot, color, cache: new Map() });
}

export async function formatDiagnostics(diags, { readFile, snapshot, color = true } = {}) {
  const cache = new Map();
  const chunks = [];
  for (const diag of diags ?? []) chunks.push(await formatOne(diag, { readFile, snapshot, color, cache }));
  return chunks.join('\n\n');
}

async function formatOne(diag, { readFile, snapshot, color, cache }) {
  const primary = diag?.primary ?? {};
  const file = primary.file ?? '<unknown>';
  const row = primary.row ?? 0;
  const col = primary.col ?? 0;
  const severity = diag?.severity ?? 'error';
  const message = diag?.message ?? diag?.kind ?? 'diagnostic';
  const kind = snapshot && diag?.kind ? `[${diag.kind}]` : '';
  const header = `${file}:${row || 0}:${col || 0}: ${severity}${kind}: ${message}`;

  if (!file || file === '<unknown>' || !row || !col || !readFile) return header;

  const source = await cachedRead(file, readFile, cache);
  if (source == null) return header;

  if (snapshot && primary.start != null && primary.end != null) {
    return formatPretty(diag, source, { snapshot, color, header });
  }

  return formatFallback(header, source, row, col);
}

function formatPretty(diag, source, { snapshot, color, header }) {
  const primary = diag.primary;
  const file = primary.file;
  const starts = computeLineStarts(source);
  const context = contextRange(diag, source, starts);
  const marks = diagnosticMarks(diag);
  const out = [paint(`▌ ${header}`, color, 'flag')];
  out.push(renderHighlightedSource({
    file,
    source,
    snapshot,
    start: context.start,
    end: context.end,
    showLineNumbers: true,
    showDiagnostics: false,
    marks,
    color,
  }));
  const help = helpMessage(diag);
  if (help) out.push(paint(help, color, 'help'));
  return out.filter(Boolean).join('\n');
}

function contextRange(diag, source, starts) {
  if (usableRef(diag.context)) {
    const startLine = lineForOffset(starts, Number(diag.context.start));
    const endLine = lineForOffset(starts, Math.max(Number(diag.context.start), Number(diag.context.end) - 1));
    return {
      start: starts[startLine],
      end: starts[endLine + 1] ?? source.length,
    };
  }

  const startLine = Math.max(0, lineForOffset(starts, Number(diag.primary.start)) - 1);
  const endLine = Math.min(starts.length - 1, lineForOffset(starts, Math.max(Number(diag.primary.start), Number(diag.primary.end) - 1)) + 1);
  return {
    start: starts[startLine],
    end: starts[endLine + 1] ?? source.length,
  };
}

function diagnosticMarks(diag) {
  const marks = [];
  if (usableRef(diag.primary)) {
    marks.push({ ...diag.primary, kind: 'primary', label: shortMessage(diag) });
  }
  for (const related of diag.related ?? []) {
    if (usableRef(related)) marks.push({ ...related, kind: 'related', label: related.label || 'related code' });
  }
  return marks;
}

function usableRef(ref) {
  return ref?.file && ref.start != null && ref.end != null;
}

function shortMessage(diag) {
  if (diag?.data?.expected && diag?.data?.actual) return `expected ${diag.data.expected}, got ${diag.data.actual}`;
  return diag?.message ?? 'error';
}

function helpMessage(diag) {
  const data = diag?.data ?? {};
  if (diag.kind === 'type-mismatch' && data.expected && data.actual) {
    if (data.function) return `check the value returned by or passed to '${data.function}'`;
    if (data.binding) return `change '${data.binding}' to ${data.actual}, or provide a ${data.expected}`;
    return `provide a ${data.expected} here, or change the surrounding type expectation`;
  }
  if (diag.kind === 'wrong-arity' && data.function) return `check the parameter list for '${data.function}'`;
  return '';
}

function paint(text, color, role) {
  if (!color) return text;
  switch (role) {
    case 'flag': return `\x1b[41m\x1b[97m${text}\x1b[0m`;
    case 'help': return `\x1b[33m${text}\x1b[0m`;
    case 'dim': return `\x1b[90m${text}\x1b[0m`;
    default: return text;
  }
}

function formatFallback(header, source, row, col) {
  const line = source.split(/\r?\n/)[row - 1];
  if (line == null) return header;
  const lineNo = String(row);
  const gutter = ' '.repeat(lineNo.length);
  const caretCol = Math.max(1, col);
  return [header, `${gutter} |`, `${lineNo} | ${line}`, `${gutter} | ${' '.repeat(caretCol - 1)}^`].join('\n');
}

async function cachedRead(file, readFile, cache) {
  if (!cache.has(file)) {
    cache.set(file, Promise.resolve(readFile(file)).catch(() => null));
  }
  return cache.get(file);
}
