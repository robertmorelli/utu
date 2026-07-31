// All utu benchmarks under d8, SpiderMonkey, or JavaScriptCore.
const argv = typeof scriptArgs !== 'undefined' ? scriptArgs : Array.from(arguments);
const root = argv[0], samples = Number(argv[1] || 20), warmups = Number(argv[2] || 5);
const readBytes = p => typeof readbuffer === 'function' ? new Uint8Array(readbuffer(p)) : read(p, 'binary');
const join = (a, b) => a.replace(/\/$/, '') + '/' + b;
const options = { builtins: ['js-string'], importedStringConstants: "'" };
const instances = {};
for (const stem of ['scalar', 'strings', 'analyzer', 'sieve', 'deltablue']) {
  const module = new WebAssembly.Module(readBytes(join(root, stem + '-utu.wasm')), options);
  instances[stem] = new WebAssembly.Instance(module, {}).exports;
}
function asciiPiece(length) { const seed = 'utu-wasm-rope-0123456789abcdef'; return seed.repeat(Math.ceil(length / seed.length)).slice(0, length); }
function checksumString(value) { return value.length ^ value.charCodeAt(value.length >> 1) ^ value.charCodeAt(value.length - 1); }
function analyzerInput(length) { const block = `// generated source fixture 104729\nfn transform_item(value_17: I32) I32 {\n  let scaled = value_17 * 31 + 7;\n  if scaled > 4096 { return scaled - 113; }\n  for (0..<12) |index| { scaled = scaled + index; };\n  let message = "utu \\183 parser [fixture]"; /* balanced comment */\n  scaled;\n}\n`; return block.repeat(Math.ceil(length / block.length)).slice(0, length); }
const base = asciiPiece(65536), analyzer = analyzerInput(256 * 1024);
const cases = [
  ['scalar recurrence', () => instances.scalar.run(1000000), 1899557000],
  ['middle insert: tiny chunks', () => checksumString(instances.strings.run(base, asciiPiece(8), 8192)), 131142],
  ['middle insert: medium chunks', () => checksumString(instances.strings.run(base, asciiPiece(32), 2048)), 131075],
  ['middle insert: large chunks', () => checksumString(instances.strings.run(base, asciiPiece(1024), 64)), 131140],
  ['source analyzer', () => instances.analyzer.run(analyzer), 1301565917],
  ['prime sieve', () => instances.sieve.run(100000), 9592],
  ['DeltaBlue chain', () => instances.deltablue.main(0, 20), 0],
  ['DeltaBlue projection', () => instances.deltablue.main(1, 20), 0],
];
function median(a) { const s = a.slice().sort((x,y)=>x-y), i = s.length >> 1; return s.length % 2 ? s[i] : (s[i-1]+s[i])/2; }
const results = {};
for (const [name, run, expected] of cases) {
  const actual = Number(run()); if (actual !== expected) throw new Error(name + ': expected ' + expected + ', got ' + actual);
  for (let i=0;i<warmups;i++) run();
  const times=[]; for(let i=0;i<samples;i++){const start=performance.now();run();times.push(performance.now()-start);}
  results[name] = { median: median(times), best: Math.min.apply(Math,times), result: actual };
}
print(JSON.stringify({ samples, warmups, results }));
