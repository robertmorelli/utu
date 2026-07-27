// Shared highlighted source renderer for display, diagnostics, and future tooling.
// Presentation policy lives here so CLI display and compiler diagnostics do not drift.

export function renderHighlightedSource({
  file,
  source,
  snapshot,
  sectionTags = null,
  showLineNumbers = true,
  showDiagnostics = false,
  marks = [],
  start = null,
  end = null,
  color = true,
} = {}) {
  const lineStarts = computeLineStarts(source ?? '');
  const width = showLineNumbers ? String(lineStarts.length).length : 0;
  const sections = sectionTags ? displaySections(snapshot, file, sectionTags) : null;
  let printedSection = -1;

  const printableLines = [];
  for (let lineIndex = 0; lineIndex < lineStarts.length; lineIndex++) {
    const lineStart = lineStarts[lineIndex];
    const nextStart = lineStarts[lineIndex + 1] ?? source.length + 1;
    const cappedNext = Math.min(nextStart, source.length);
    const lineEnd = source.charCodeAt(cappedNext - 1) === 10 ? cappedNext - 1 : cappedNext;
    if (start != null && lineEnd < start) continue;
    if (end != null && lineStart > end) continue;
    const sectionIndex = sections ? sections.findIndex(section => rangesOverlap(lineStart, lineEnd, section.start, section.end)) : -1;
    if (sections && sectionIndex < 0) continue;
    printableLines.push({ lineIndex, lineStart, lineEnd, line: source.slice(lineStart, lineEnd), sectionIndex });
  }

  const codeWidth = Math.max(0, ...printableLines.map(item => item.line.length));
  const out = [];
  for (const { lineIndex, lineStart, lineEnd, line, sectionIndex } of printableLines) {
    if (sections && printedSection >= 0 && sectionIndex !== printedSection) out.push('');
    printedSection = sectionIndex;

    const ranges = snapshot?.ranges?.(file, lineStart, lineEnd) ?? [];
    const diagnostics = showDiagnostics ? snapshot?.ranges?.(file, lineStart, lineEnd, { kind: 'diagnostic' }) ?? [] : [];
    const lineMarks = marksForLine(marks, lineStart, lineEnd);
    const prefix = showLineNumbers ? `${String(lineIndex + 1).padStart(width, ' ')} │ ` : '';
    out.push(`${showLineNumbers ? style('#747478', '', color) : ''}${prefix}${colorLine(line, lineStart, ranges, codeWidth, lineMarks, color)}`);

    const labeledMarks = lineMarks.filter(mark => mark.label);
    for (let markIndex = 0; markIndex < labeledMarks.length; markIndex++) {
      const gutter = showLineNumbers ? `${' '.repeat(width)} │ ` : '';
      out.push(`${style('#747478', '', color)}${gutter}${renderAnnotationLine(labeledMarks, markIndex, lineStart, line, color)}`);
    }

    for (const diagnostic of diagnostics) {
      const diagStart = Math.max(0, diagnostic.start - lineStart);
      const diagEnd = Math.max(diagStart + 1, Math.min(line.length, diagnostic.end - lineStart));
      const gutter = showLineNumbers ? `${' '.repeat(width)} │ ` : '';
      out.push(`${style('#747478', '', color)}${gutter}${' '.repeat(diagStart)}${style('#ff4b4b', '', color)}${'^'.repeat(Math.max(1, diagEnd - diagStart))}${reset(color)}`);
    }
  }
  return out.join('\n');
}

export function computeLineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 && i + 1 < source.length) starts.push(i + 1);
  }
  return starts;
}

export function lineForOffset(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= offset && (mid === starts.length - 1 || starts[mid + 1] > offset)) return mid;
    if (starts[mid] > offset) hi = mid - 1;
    else lo = mid + 1;
  }
  return 0;
}

function marksForLine(marks, lineStart, lineEnd) {
  return (marks ?? []).filter(mark => mark.start < lineEnd && lineStart < mark.end);
}

function colorLine(line, lineStart, ranges, codeWidth = line.length, marks = [], color = true) {
  let out = '';
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const offset = lineStart + i;
    const mark = smallestMarkAt(marks, offset);
    const fg = colorForOffset(ranges, offset, color) || style('#ffffff', '', color);
    // Inside diagnostic marks, prefer the diagnostic foreground over syntax
    // foreground so red/yellow spans read like the matching message labels.
    const nextColor = mark ? markStyle(mark, color) : fg;
    if (nextColor !== current) {
      out += reset(color) + nextColor;
      current = nextColor;
    }
    out += line[i];
  }
  if (line.length < codeWidth) out += style('#ffffff', '', color) + ' '.repeat(codeWidth - line.length);
  out += reset(color);
  return out;
}

function renderAnnotationLine(marks, markIndex, lineStart, line, color) {
  const current = marks[markIndex];
  const currentStart = Math.max(0, current.start - lineStart);
  const currentEnd = Math.max(currentStart + 1, Math.min(line.length || currentStart + 1, current.end - lineStart));
  const label = current.label.padEnd(Math.max(current.label.length, currentEnd - currentStart), ' ');
  const cells = [];

  // Later stacked messages get a quiet bridge through earlier annotation rows,
  // so their source span and eventual message read as one connected island.
  for (const mark of marks.slice(markIndex + 1)) {
    const start = Math.max(0, mark.start - lineStart);
    const end = Math.max(start + 1, Math.min(line.length || start + 1, mark.end - lineStart));
    for (let i = start; i < end; i++) {
      cells[i] ??= { ch: ' ', mark };
    }
  }

  for (let i = 0; i < label.length; i++) {
    cells[currentStart + i] = { ch: label[i], mark: current };
  }

  let last = -1;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i]) {
      last = i;
      break;
    }
  }
  if (last < 0) return '';

  let out = '';
  let currentStyle = '';
  for (let i = 0; i <= last; i++) {
    const cell = cells[i] ?? { ch: ' ', mark: null };
    const nextStyle = cell.mark ? markStyle(cell.mark, color) : '';
    if (nextStyle !== currentStyle) {
      out += reset(color) + nextStyle;
      currentStyle = nextStyle;
    }
    out += cell.ch;
  }
  return out + reset(color);
}

function smallestMarkAt(marks, offset) {
  let best = null;
  for (const mark of marks) {
    if (mark.start > offset || offset >= mark.end) continue;
    if (!best || (mark.end - mark.start) < (best.end - best.start)) best = mark;
  }
  return best;
}

function colorForOffset(ranges, offset, color) {
  let best = null;
  for (const range of ranges) {
    if (range.start > offset || offset >= range.end) continue;
    if (!colorForRange(range, color)) continue;
    if (!best || isBetterRange(range, best)) best = range;
  }
  return best ? colorForRange(best, color) : '';
}

function isBetterRange(candidate, current) {
  const candidateSize = candidate.end - candidate.start;
  const currentSize = current.end - current.start;
  if (candidateSize !== currentSize) return candidateSize < currentSize;
  return rolePriority(candidate.role) > rolePriority(current.role);
}

function rolePriority(role) {
  switch (role) {
    case 'function': return 30;
    case 'type': return 25;
    case 'constant': return 20;
    case 'variable': return 10;
    default: return 0;
  }
}

function colorForRange(range, color) {
  switch (range.role) {
    case 'attribute': return style('#b181ec', '', color);
    case 'comment': return style('#c4c4c4', '', color);
    case 'constant': return style('#b181ec', '', color);
    case 'constant.builtin': return style('#fe7ab2', '\x1b[3m', color);
    case 'constant.numeric': return style('#fdffab', '', color);
    case 'function': return style('#9ce7ff', '', color);
    case 'keyword': return style('#fe7ab2', '\x1b[3m', color);
    case 'keyword.control': return style('#ffd596', '\x1b[3m', color);
    case 'keyword.control.import': return style('#fe7ab2', '\x1b[3m', color);
    case 'keyword.operator': return style('#ffaff3', '\x1b[3m', color);
    case 'keyword.storage': return style('#ffd596', '\x1b[3m', color);
    case 'operator': return style('#ffaff3', '', color);
    case 'property': return style('#ffffff', '', color);
    case 'punctuation.bracket': return style('#ffffff', '', color);
    case 'punctuation.delimiter': return style('#ffffff', '', color);
    case 'string': return style('#c8ffa7', '', color);
    case 'type': return style('#ffddfa', '', color);
    case 'variable': return style('#ffffff', '', color);
    default: return '';
  }
}

function markStyle(mark, color) {
  if (!color) return '';
  if (mark.kind === 'related') return '\x1b[43m\x1b[30m';
  return '\x1b[41m\x1b[97m';
}

function style(colorName, extra = '', color = true) {
  if (!color) return '';
  return `\x1b[0m${ansiColor(colorName)}${extra}`;
}

function reset(color = true) {
  return color ? '\x1b[0m' : '';
}

function ansiColor(color) {
  switch (color) {
    case '#747478': return '\x1b[90m';
    case '#b181ec': return '\x1b[36m';
    case '#c4c4c4': return '\x1b[90m';
    case '#fe7ab2': return '\x1b[35m';
    case '#fdffab': return '\x1b[93m';
    case '#9ce7ff': return '\x1b[94m';
    case '#ffd596': return '\x1b[33m';
    case '#ffaff3': return '\x1b[95m';
    case '#c8ffa7': return '\x1b[92m';
    case '#ffddfa': return '\x1b[95m';
    case '#ffffff': return '\x1b[39m';
    case '#ff4b4b': return '\x1b[31m';
    default: return '\x1b[39m';
  }
}

function displaySections(snapshot, file, sectionTags) {
  return (snapshot?.entries ?? [])
    .filter(entry => entry.file === file && (entry.kind === 'ir' || entry.kind === 'section') && sectionTags.has(entry.tag))
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((entry, index, all) => !all.some((other, otherIndex) => otherIndex < index && other.start <= entry.start && entry.end <= other.end));
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
