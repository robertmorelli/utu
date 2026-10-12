// A stencil erases Utu/markup holes while preserving every CSS character and
// source offset. CSS syntax belongs to the CSS engine, including future rules.
import { dslLiterals } from './dsl-envelope.js';

/** Blank everything outside `ranges` to spaces, keeping line breaks. */
export function stencilCss(source, ranges = [{ start: 0, end: source.length }]) {
  const chars = source.split('').map(c => (c === '\n' || c === '\r' ? c : ' '));
  for (const { start, end } of ranges) for (let i = start; i < end; i++) chars[i] = source[i];
  return chars.join('');
}

/** The editor's CSS document for a Utu file: only `@css` payloads, at their offsets. */
export function cssProjection(source) {
  return stencilCss(source, dslLiterals(source).filter(literal => literal.name === 'css'));
}
