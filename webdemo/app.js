import { PLATFORM_SOURCES, catalogStdlib, compile as build, formatDiagnostics, loadCompiler } from './vendor/selfhost/utu.js';

// The browser's declarations, fetched ready to read (compressed in transit).
const stdlib = catalogStdlib(PLATFORM_SOURCES, name =>
  fetch(`./vendor/selfhost/catalog/${name}`).then(response => response.arrayBuffer()).then(bytes => new Uint8Array(bytes)));

const filename = 'file:///playground/main.utu';
const editor = document.querySelector('#editor');
let frame = document.querySelector('#preview');
const diagnostics = document.querySelector('#diagnostics');
const status = document.querySelector('#status');
const sample = `using Browser from std:Browser;

struct State:
    | count: I32

export main() void {
    let state = State { count: 0 };
    Browser.document.body.append(@wutu/\\
    @reactive;
    main {
        font-family: system-ui;
        max-width: 42rem;
        margin: 4rem auto;
        padding: 2rem;
        background: honeydew;
        border-radius: 1.5rem;
        h1 { "Hello, Wutu"; }
        p { "Clicks: "; $[state.count.to_f64().toString()]; }
        button {
            padding: 0.75rem 1rem;
            background: seagreen;
            color: white;
            border: 0;
            border-radius: 0.5rem;
            "Click me";
            on click { state.count += 1; };
        }
    }
    \\/);
}
`;

// The self-hosted compiler: a WasmGC module, loaded once.
let compiler;
let generation = 0;
let pending;
let activeMessageHandler;
const saved = localStorage.getItem('wutu-webdemo-source');
editor.value = saved ?? sample;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
}

async function loadUtu() {
  const [wasm, spec] = await Promise.all([
    fetch('./vendor/utu.wasm').then(response => response.arrayBuffer()),
    fetch('./vendor/utu.host.json').then(response => response.json()),
  ]);
  return loadCompiler(wasm, spec);
}

async function compile(source) {
  compiler ??= await loadUtu();
  const started = performance.now();
  const { wasm, spec, diagnostics: found, files } = await build(compiler, filename, {
    stdlib,
    readFile: async file => {
      if (file === filename) return source;
      throw new Error(`This playground uses one file. Could not load ${file}`);
    },
    resolvePath: (from, relative) => new URL(relative, from).toString(),
  });
  if (!wasm) {
    const texts = new Map(files.map(file => [file.key, file.text]));
    throw new Error(formatDiagnostics(found, texts, { relative: key => key === filename ? 'main.utu' : key }));
  }
  return { wasm, spec, ms: performance.now() - started };
}

async function run() {
  const current = ++generation;
  if (activeMessageHandler) window.removeEventListener('message', activeMessageHandler);
  activeMessageHandler = undefined;
  const source = editor.value;
  setStatus('Compiling…');
  diagnostics.textContent = '';
  try {
    const result = await compile(source);
    if (current !== generation) return;
    const previous = frame;
    const replacement = document.createElement('iframe');
    replacement.id = 'preview';
    replacement.title = 'Wutu website preview';
    replacement.setAttribute('sandbox', 'allow-scripts');
    replacement.srcdoc = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><script src="./vendor/preview-runtime.js"></script></body></html>`;
    const onMessage = event => {
      if (event.source !== replacement.contentWindow || current !== generation) return;
      if (event.data?.type === 'wutu-ready') {
        replacement.contentWindow.postMessage({ type: 'wutu-run', wasm: result.wasm, spec: result.spec }, '*');
      } else if (event.data?.type === 'wutu-result') {
        window.removeEventListener('message', onMessage);
        activeMessageHandler = undefined;
        if (event.data.ok) {
          setStatus('Preview ready', 'ok');
          diagnostics.textContent = `Compiled in ${result.ms.toFixed(1)} ms · ${result.wasm.byteLength} bytes of wasm`;
        } else {
          setStatus('Runtime error', 'error');
          diagnostics.textContent = event.data.error;
        }
      }
    };
    activeMessageHandler = onMessage;
    window.addEventListener('message', onMessage);
    previous.replaceWith(replacement);
    frame = replacement;
  } catch (error) {
    if (current !== generation) return;
    setStatus('Compile error', 'error');
    diagnostics.textContent = error.message ?? String(error);
  }
}

editor.addEventListener('input', () => {
  localStorage.setItem('wutu-webdemo-source', editor.value);
  clearTimeout(pending);
  pending = setTimeout(run, 700);
});
editor.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    clearTimeout(pending);
    void run();
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    const start = editor.selectionStart;
    editor.setRangeText('    ', start, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input'));
  }
});
void run();
