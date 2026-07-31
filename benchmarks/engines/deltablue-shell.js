// Portable harness for d8, SpiderMonkey's js shell, and JavaScriptCore's jsc.
const argv = typeof scriptArgs !== 'undefined' ? scriptArgs : Array.from(arguments);
const wasmPath = argv[0];
const samples = Number(argv[1] || 20);
const warmups = Number(argv[2] || 5);
const iterations = Number(argv[3] || 20);
const bytes = typeof readbuffer === 'function' ? new Uint8Array(readbuffer(wasmPath)) : read(wasmPath, 'binary');
const module = new WebAssembly.Module(bytes);
const instance = new WebAssembly.Instance(module, {});

function time(run) { const start = performance.now(); run(); return performance.now() - start; }
function median(values) { const sorted = values.slice().sort((a, b) => a - b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; }
function measure(kind) {
  const run = () => instance.exports.main(kind, iterations);
  const expected = run();
  if (String(expected) !== '0') throw new Error(`DeltaBlue returned ${expected}`);
  for (let i = 0; i < warmups; i++) run();
  const times = [];
  for (let i = 0; i < samples; i++) times.push(time(run));
  return { median: median(times), best: Math.min.apply(Math, times), result: String(expected) };
}

print(JSON.stringify({ samples, warmups, iterations, chain: measure(0), projection: measure(1) }));
