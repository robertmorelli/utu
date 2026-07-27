// code-surfaces.js — every place in a document that holds executable code
//
// Three separate bugs this session were the same mistake: a pass walked
// `ir-fn` and forgot one of the other surfaces. Under the `normal` / `test` /
// `bench` targets `bring-target-to-top-level.js` rewrites the entry surfaces
// into ordinary functions, so a pass that only walks `ir-fn` looks correct —
// but under `analysis`, the target editors use, the surfaces are still
// themselves. The result each time was code that compiled and ran correctly
// while the editor reported errors all over it:
//
//   • identifiers inside `test` bodies never bound
//   • expressions inside `test` bodies never typed
//   • the body of `export main` never typed
//
// A pass that consumes this list cannot make that mistake a fourth time.
//
// Not included: `ir-global` initialisers (an expression, not a body) and
// `ir-closure` bodies (nested inside a body, reached by the recursive walk).

import { bodyOf } from './ir-helpers.js';

/**
 * Call `visit(body, surface)` for every executable block in the document.
 *
 * `surface` is the declaration the block belongs to — an `ir-fn`,
 * `ir-export-main`, `ir-test`, or `ir-bench`. Callers that need parameters or
 * a declared return type read them off it.
 *
 * @param {Element} root
 * @param {(body: Element, surface: Element) => void} visit
 */
export function forEachCodeBody(root, visit) {
  // Functions anywhere at top level, including inside an entry surface.
  for (const fn of root.querySelectorAll('ir-fn')) {
    const body = bodyOf(fn);
    if (body) visit(body, fn);
  }

  // `export main(...) T { … }` holds its block directly.
  for (const main of root.querySelectorAll('ir-export-main')) {
    const body = bodyOf(main);
    if (body) visit(body, main);
  }

  // `test "…" { … }` and `bench "…" { … measure { … } }`.
  for (const surface of root.querySelectorAll('ir-test, ir-bench')) {
    for (const body of surface.querySelectorAll(':scope > ir-block, :scope > ir-measure > ir-block')) {
      visit(body, surface);
    }
  }
}
