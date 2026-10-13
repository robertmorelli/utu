// The catalog (most of a megabyte) loads only when a program imports it.
const catalog = () => import('./browser-catalog.generated.js');

async function decode(base64, label) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const abi = JSON.parse(await new Response(stream).text());
  if (abi.version !== 1) throw new Error(`Unsupported ${label} declaration ABI version`);
  return abi;
}
/** Decode once, and retry after a failure instead of caching it. */
function lazy(load) {
  let promise;
  return () => promise ??= load().catch(error => { promise = undefined; throw error; });
}

/** Only declarations are shared; type identities and emitted operations are per compilation. */
export const loadBrowserABI = lazy(async () => decode((await catalog()).BROWSER_ABI_GZIP, 'browser'));
const loadWorkerABI = lazy(async () => decode((await catalog()).WORKER_ABI_GZIP, 'worker'));

/** A module exposing part of a declaration graph. Standard types keep one identity across views. */
function view(prefix, abi, keep) {
  const pick = table => Object.fromEntries(Object.entries(table).filter(([name]) => keep(name)));
  return { source: `mod ${prefix} {}`, abi: { ...abi, prefix, exports: pick(abi.exports), names: pick(abi.names),
    mutableGlobals: abi.mutableGlobals.filter(keep) } };
}

/** `std:Browser` — the DOM and every standard JavaScript API a browser page has. */
export async function browserSource() {
  return { source: 'mod Browser {}', abi: await loadBrowserABI() };
}

/** `std:JS` — the ECMAScript standard library alone (Array, Map, JSON, Math, Promise, …). */
export const jsSource = lazy(async () => {
  const abi = await loadBrowserABI();
  const ecmascript = new Set(abi.ecmascript ?? []);
  return view('JS', abi, name => ecmascript.has(name));
});

/**
 * The web APIs every modern JavaScript runtime provides — Node, Bun, Deno,
 * browsers and workers — following the WinterTC minimum common API.
 */
export const WEB_COMMON = [
  'AbortController', 'AbortSignal', 'Blob', 'ByteLengthQueuingStrategy', 'CompressionStream',
  'CountQueuingStrategy', 'Crypto', 'CryptoKey', 'CustomEvent', 'DOMException', 'DecompressionStream',
  'Event', 'EventTarget', 'File', 'FormData', 'Headers', 'MessageChannel', 'MessageEvent', 'MessagePort',
  'ReadableByteStreamController', 'ReadableStream', 'ReadableStreamBYOBReader', 'ReadableStreamBYOBRequest',
  'ReadableStreamDefaultController', 'ReadableStreamDefaultReader', 'Request', 'RequestInit', 'Response',
  'ResponseInit', 'SubtleCrypto', 'TextDecoder', 'TextDecoderStream', 'TextEncoder', 'TextEncoderStream',
  'TransformStream', 'TransformStreamDefaultController', 'URL', 'URLSearchParams', 'WebAssembly',
  'WritableStream', 'WritableStreamDefaultController', 'WritableStreamDefaultWriter',
  'atob', 'btoa', 'clearInterval', 'clearTimeout', 'console', 'crypto', 'fetch', 'navigator', 'performance',
  'queueMicrotask', 'reportError', 'setInterval', 'setTimeout', 'structuredClone',
];

/** `std:Web` — the common web platform APIs, for any JavaScript host. */
export const webSource = lazy(async () => {
  const common = new Set(WEB_COMMON);
  return view('Web', await loadBrowserABI(), name => common.has(name));
});

/** `std:Worker` — a web worker's global scope (`self`, `postMessage`, `importScripts`, …). */
export const workerSource = lazy(async () => ({ source: 'mod Worker {}', abi: await loadWorkerABI() }));
