// src/selfhost/blame.js — a size profile: every byte of a module, and of its
// JS glue, blamed on the source it came from. It answers "why is my binary
// this big".
//
// The build that is blamed ran on the tools (loadNodeCompiler), asked to blame
// (`blame: true`: a source map, which changes nothing built); the tools then
// read its state and the module (selfhost/tools/blame*.utu) and write the
// report. Here, what they cannot do: the brotli estimate and the glue's
// sizes (the glue is made in JS, src/runtime/host-imports.js).

import { FUN_CHECK, glueModuleSource, glueName, splitBody } from '../runtime/host-imports.js';

const encoder = new TextEncoder();

/**
 * Blame the build the tools `utu` just made: `wasm` (as written: the
 * build's module, maybe with a section added), its `spec`, and `files` (as
 * compile gives them; a file of the build's may be given as several, each
 * with its own key, at its byte `offset` in the build's src; the page shows
 * the `text` of each that has one). `relative`:
 * how a file is labelled. `brotli`: estimate each byte's brotli share.
 * Returns the report as JSON, as a page, and its top `n` of each list as text.
 */
export async function blame(utu, { wasm, spec, files, name = 'module.wasm', relative = key => key, brotli = true }) {
  utu.blame_begin(name);
  for (const f of files) {
    utu.blame_file(f.key, relative(f.key), f.offset, f.bytes.length);
    if (f.text != null) utu.blame_text(f.text);
  }
  utu.blame_wasm_room(wasm.length);
  new Uint8Array(utu.blame_in.buffer, 0, wasm.length).set(wasm);
  if (brotli) {
    const { total, chunk, costs } = await estimateCompressed(wasm);
    utu.blame_brotli(total, chunk);
    for (const cost of costs) utu.blame_cost(cost);
  }
  const glue = glueSizes(spec);
  utu.blame_glue_size(glue.bytes);
  for (const [field, bytes] of glue.bindings) utu.blame_glue(field, bytes);
  const wrong = utu.blame_run();
  if (wrong) throw new Error(wrong);
  return { json: () => utu.blame_json(), html: () => utu.blame_html(), top: (n = 10) => utu.blame_top(n) };
}

/**
 * The glue module's source (glueSource of the spec): its UTF-8 size, and
 * each @es binding's export in it, as [field, bytes]; the hoisted imports
 * and the joins are the rest.
 */
function glueSizes(spec) {
  const source = glueModuleSource(spec.es ?? {});
  if (!source) return { bytes: 0, bindings: [] };
  const size = text => encoder.encode(text).length;
  const hoisted = new Set();
  const bindings = [];
  let check = false;
  for (const fields of Object.values(spec.es ?? {})) {
    for (const [field, body] of Object.entries(fields ?? {})) {
      const { imports, expr } = splitBody(body);
      for (const decl of imports) hoisted.add(decl);
      check ||= expr.includes('$utuFn(');
      bindings.push([field, size(`export const ${glueName(field)} = (\n${expr}\n);`)]);
    }
  }
  const bytes = size(source);
  const parts = (hoisted.size ? size(`${[...hoisted].join('\n')}\n\n`) : 0) + (check ? size(`${FUN_CHECK}\n\n`) : 0)
    + bindings.reduce((n, [, b]) => n + b, 0) + Math.max(0, 2 * bindings.length - 1);
  if (parts !== bytes) throw new Error(`glue blame covers ${parts} of ${bytes} bytes`);
  return { bytes, bindings };
}

/**
 * The module's brotli cost, chunk by chunk: one brotli stream (quality 9)
 * flushed every `chunk` bytes gives each chunk's cost given all before it;
 * the tools spread each over its bytes, scaled so the whole is the
 * quality-11 size (`total`). An estimate: a bucket's real cost depends on
 * what else is there.
 */
async function estimateCompressed(bytes, { chunk = 2048 } = {}) {
  const zlib = await import('node:zlib');
  const { constants } = zlib;
  const total = zlib.brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  const stream = zlib.createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } });
  let out = 0;
  stream.on('data', d => { out += d.length; });
  const costs = [];
  for (let at = 0; at < bytes.length; at += chunk) {
    const before = out;
    stream.write(bytes.subarray(at, at + chunk));
    await new Promise(resolve => stream.flush(constants.BROTLI_OPERATION_FLUSH, resolve));
    costs.push(out - before);
  }
  stream.end();
  await new Promise(resolve => stream.on('end', resolve));
  return { total, chunk, costs };
}
