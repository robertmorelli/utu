// The playground's compiler side, loaded by docs/src/playground.utu on first
// use. The compiler is utu's self-hosted one (a WasmGC module); the module it
// builds runs in the page's sandboxed iframe (#play-preview), which loads
// preview-runtime.js. build-docs copies this file to docs/playground/ and
// stamps the ./vendor and ./preview-runtime.js references with content hashes.
import { PLATFORM_SOURCES, catalogStdlib, compile, formatDiagnostics, loadCompiler } from './vendor/selfhost/utu.js?v=64d15de25d08';

const FILENAME = 'file:///playground/main.utu';
const RUNTIME = new URL('./preview-runtime.js?v=c5727cf6aae9', import.meta.url).href;

// The browser's declarations, fetched as a program needs them.
const stdlib = catalogStdlib(PLATFORM_SOURCES, name =>
  fetch(new URL(`./vendor/selfhost/catalog/${name}?v=872cf7c4f2df`, import.meta.url))
    .then(response => response.arrayBuffer())
    .then(bytes => new Uint8Array(bytes)));

let compiler;
let timer;
let generation = 0;
let listening;

async function loadUtu() {
  const [wasm, spec] = await Promise.all([
    fetch(new URL('./vendor/utu.wasm?v=7944e8032611', import.meta.url)).then(response => response.arrayBuffer()),
    fetch(new URL('./vendor/utu.host.json?v=f2b00a7b738b', import.meta.url)).then(response => response.json()),
  ]);
  return loadCompiler(wasm, spec);
}

async function build(source) {
  compiler ??= await loadUtu();
  const started = performance.now();
  const { wasm, spec, diagnostics, files } = await compile(compiler, FILENAME, {
    stdlib,
    readFile: async file => {
      if (file === FILENAME) return source;
      throw new Error(`The playground has one file; it cannot load ${file}`);
    },
    resolvePath: (from, relative) => new URL(relative, from).toString(),
  });
  if (!wasm) {
    const texts = new Map(files.map(file => [file.key, file.text]));
    return { error: formatDiagnostics(diagnostics, texts, { relative: key => key === FILENAME ? 'main.utu' : key }) };
  }
  return { wasm, spec, ms: performance.now() - started };
}

/** Run a built module in the preview frame; `done` hears how it went. */
function show(frame, result, current, done) {
  if (listening) window.removeEventListener('message', listening);
  listening = event => {
    if (event.source !== frame.contentWindow || current !== generation) return;
    if (event.data?.type === 'wutu-ready') {
      frame.contentWindow.postMessage({ type: 'wutu-run', wasm: result.wasm, spec: result.spec }, '*');
    } else if (event.data?.type === 'wutu-result') {
      window.removeEventListener('message', listening);
      listening = undefined;
      if (event.data.ok) done(`Built in ${result.ms.toFixed(0)} ms · ${result.wasm.byteLength} bytes of Wasm`, '', false);
      else done('It built, but threw while running', event.data.error, true);
    }
  };
  window.addEventListener('message', listening);
  frame.srcdoc = '<!doctype html><html lang="en"><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<body><script src="${RUNTIME}"></script></body></html>`;
}

// The compiler keeps its data in many memories (multi-memory), which not
// every engine has yet: a two-memory module that only validates where it does.
const MULTI_MEMORY = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 5, 2, 0, 1, 0, 1]));

async function run(source, done) {
  const current = ++generation;
  if (!MULTI_MEMORY) {
    return done('This browser cannot run the compiler yet',
      'The playground runs utu\'s self-hosted compiler, which uses WebAssembly multi-memory. '
      + 'Safari does not support it yet; open this page in Chrome, Edge, or Firefox.', true);
  }
  done('Building…', '', false);
  try {
    const result = await build(source);
    if (current !== generation) return;
    if (result.error) return done('It does not build yet', result.error, true);
    const frame = document.getElementById('play-preview');
    if (frame) show(frame, result, current, done);
  } catch (error) {
    if (current === generation) done('The compiler stopped', String(error?.stack ?? error), true);
  }
}

/** Build `source` after `delay` ms of quiet; a newer call replaces this one. */
export function schedule(source, delay, done) {
  clearTimeout(timer);
  timer = setTimeout(() => void run(source, done), delay);
}
