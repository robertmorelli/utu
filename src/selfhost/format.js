// src/selfhost/format.js — diagnostics as a person reads them.
//
//   main.utu:3:12: error: Unknown type 'Box'
//      3 |     let b = Box.make(1);
//        |             ^^^

/**
 * Each diagnostic with where it is and the line it is on, underlined.
 * `files` maps a file key to its text; `relative` shortens a key for display.
 */
export function formatDiagnostics(diagnostics, files, { color = false, relative = key => key } = {}) {
  const paint = (code, text) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
  return diagnostics.map(d => {
    const label = paint('1;31', `${d.severity ?? 'error'}:`);
    const text = d.file != null ? files.get(d.file) : null;
    if (text == null || d.start == null) return `${d.file != null ? `${relative(d.file)}: ` : ''}${label} ${paint('1', d.message)}`;
    const head = `${paint('1', `${relative(d.file)}:${d.line}:${d.column}:`)} ${label} ${paint('1', d.message)}`;
    const lineStart = d.start - (d.column - 1);
    const lineEnd = text.indexOf('\n', lineStart);
    const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
    // The underline ends at the line's end when the span goes past it.
    const width = Math.max(1, Math.min(d.end, lineStart + line.length) - d.start);
    const gutter = String(d.line).length;
    const tabs = s => s.replace(/\t/g, '    ');
    return [
      head,
      `${paint('2', `${String(d.line).padStart(gutter + 1)} |`)} ${tabs(line)}`,
      `${paint('2', `${' '.repeat(gutter + 1)} |`)} ${' '.repeat(tabs(line.slice(0, d.column - 1)).length)}${paint('31', '^'.repeat(width))}`,
    ].join('\n');
  }).join('\n\n');
}
