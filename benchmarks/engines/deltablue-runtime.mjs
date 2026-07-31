// Runtime harness for Bun, Node, and Deno.
const isDeno = typeof Deno !== 'undefined';
const argv = isDeno ? Deno.args : process.argv.slice(2);
const [wasmPath, samplesText = '20', warmupsText = '5', iterationsText = '20'] = argv;
const samples = Number(samplesText), warmups = Number(warmupsText), iterations = Number(iterationsText);
const bytes = isDeno
  ? await Deno.readFile(wasmPath)
  : new Uint8Array(await (await import('node:fs/promises')).readFile(wasmPath));
const { instance } = await WebAssembly.instantiate(bytes);

function time(run) { const start = performance.now(); run(); return performance.now() - start; }
function median(values) { const sorted = [...values].sort((a, b) => a - b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; }
function measure(kind) {
  const run = () => instance.exports.main(kind, iterations);
  const expected = run();
  if (String(expected) !== '0') throw new Error(`DeltaBlue returned ${expected}`);
  for (let i = 0; i < warmups; i++) run();
  const times = [];
  for (let i = 0; i < samples; i++) times.push(time(run));
  return { median: median(times), best: Math.min(...times), result: String(expected) };
}

console.log(JSON.stringify({ samples, warmups, iterations, chain: measure(0), projection: measure(1) }));
