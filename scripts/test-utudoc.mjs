// tools/utudoc: a documented file as Typst (its doc comments as written,
// signatures colored and linked, `@Name` resolved, fields documented under
// their struct), and, when typst is installed, as a PDF.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-doc-'));
try {
  await fs.writeFile(path.join(dir, 'geometry.utu'), `//! Plane geometry: *points*. See @distance.

/// A point in the plane.
struct Point:
    /// Its horizontal coordinate.
    | x : F64
    | y : F64

/// The distance between \`a\` and \`b\`: $ sqrt(x^2 + y^2) $
fn distance(a: Point, b: Point) F64 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    (dx * dx + dy * dy).sqrt();
}

export lib {
    /// From the origin; see @Point and @nowhere.
    fn norm(x: F64, y: F64) F64 { distance(Point { x: x, y: y }, Point { x: 0.0, y: 0.0 }); }
}
`);
  await fs.writeFile(path.join(dir, 'broken.utu'), 'fn (\n');
  const run = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'utudoc', 'utudoc.mjs'), dir, '-o', path.join(dir, 'docs.pdf'), '--title', 'Geometry'], { encoding: 'utf8' });
  assert.match(run.stderr, /skipping .*broken\.utu, which does not parse/);
  const typ = await fs.readFile(path.join(dir, 'docs.typ'), 'utf8');
  const label = name => new RegExp(`#raw\\("${name}"\\) .*<(utu-\\d+)>`).exec(typ)?.[1];
  // Each declaration, its doc comment as written.
  for (const name of ['Point', 'x', 'distance', 'norm']) assert.ok(label(name), name);
  assert.ok(!label('y'), 'a field without a doc comment is in its struct\'s signature only');
  assert.match(typ, /The distance between `a` and `b`: \$ sqrt\(x\^2 \+ y\^2\) \$/);
  assert.match(typ, /Plane geometry: \*points\*/);
  // Signatures: colored, their types linked to their declarations.
  assert.match(typ, new RegExp(`#link\\(<${label('Point')}>\\)\\[#text\\(fill: rgb\\("#0b7285"\\)\\)\\[#raw\\("Point"\\)\\]\\]`));
  assert.match(typ, /#text\(fill: rgb\("#8b2fa3"\)\)\[#raw\("fn"\)\]/);
  // `@Name` resolves; a name nothing declares is code.
  assert.match(typ, new RegExp(`See #link\\(<${label('distance')}>\\)\\[#raw\\("distance"\\)\\]`));
  assert.match(typ, /and #raw\("nowhere"\)/);
  if (run.status === 0 && !/not installed/.test(run.stdout)) {
    const pdf = await fs.readFile(path.join(dir, 'docs.pdf'));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    console.log('utudoc: doc comments, colored and linked signatures, @references, and the PDF');
  } else {
    assert.match(run.stdout, /typst is not installed/);
    console.log('utudoc: doc comments, colored and linked signatures, @references (typst is not installed: no PDF)');
  }
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
