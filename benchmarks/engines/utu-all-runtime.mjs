// All utu benchmarks under Bun, Node, or Deno.
const isDeno = typeof Deno !== 'undefined';
const argv = isDeno ? Deno.args : process.argv.slice(2);
const [root, samplesText='20', warmupsText='5'] = argv;
const samples=Number(samplesText), warmups=Number(warmupsText);
const readBytes = isDeno ? p => Deno.readFile(p) : async p => new Uint8Array(await (await import('node:fs/promises')).readFile(p));
const options={builtins:['js-string'], importedStringConstants:"'"}, instances={};
for(const stem of ['scalar','strings','analyzer','sieve','deltablue']) { const module=await WebAssembly.compile(await readBytes(`${root}/${stem}-utu.wasm`),options); instances[stem]=(await WebAssembly.instantiate(module,{})).exports; }
function asciiPiece(length){const seed='utu-wasm-rope-0123456789abcdef';return seed.repeat(Math.ceil(length/seed.length)).slice(0,length)}
function checksumString(value){return value.length^value.charCodeAt(value.length>>1)^value.charCodeAt(value.length-1)}
function analyzerInput(length){const block=`// generated source fixture 104729\nfn transform_item(value_17: I32) I32 {\n  let scaled = value_17 * 31 + 7;\n  if scaled > 4096 { return scaled - 113; }\n  for (0..<12) |index| { scaled = scaled + index; };\n  let message = "utu \\183 parser [fixture]"; /* balanced comment */\n  scaled;\n}\n`;return block.repeat(Math.ceil(length/block.length)).slice(0,length)}
const base=asciiPiece(65536),analyzer=analyzerInput(256*1024);
const cases=[
 ['scalar recurrence',()=>instances.scalar.run(1000000),1899557000],
 ['middle insert: tiny chunks',()=>checksumString(instances.strings.run(base,asciiPiece(8),8192)),131142],
 ['middle insert: medium chunks',()=>checksumString(instances.strings.run(base,asciiPiece(32),2048)),131075],
 ['middle insert: large chunks',()=>checksumString(instances.strings.run(base,asciiPiece(1024),64)),131140],
 ['source analyzer',()=>instances.analyzer.run(analyzer),1301565917],
 ['prime sieve',()=>instances.sieve.run(100000),9592],
 ['DeltaBlue chain',()=>instances.deltablue.main(0,20),0],
 ['DeltaBlue projection',()=>instances.deltablue.main(1,20),0],
];
function median(a){const s=[...a].sort((x,y)=>x-y),i=s.length>>1;return s.length%2?s[i]:(s[i-1]+s[i])/2}
const results={};
for(const [name,run,expected] of cases){const actual=Number(run());if(actual!==expected)throw new Error(`${name}: expected ${expected}, got ${actual}`);for(let i=0;i<warmups;i++)run();const times=[];for(let i=0;i<samples;i++){const start=performance.now();run();times.push(performance.now()-start)}results[name]={median:median(times),best:Math.min(...times),result:actual}}
console.log(JSON.stringify({samples,warmups,results}));
