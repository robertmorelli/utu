import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({ entryPoints: [path.join(ROOT, 'src/bindings/generate.js')], bundle: true, write: false, minify: true, platform: 'browser', format: 'esm' });
const typescript = await fs.readFile(path.join(path.dirname(ts.getDefaultLibFilePath({})), 'typescript.js'));
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/javascript');
  if (req.url === '/typescript.js') res.end(typescript);
  else if (req.url === '/bindings.js') res.end(bundle.outputFiles[0].contents);
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>ABI Worker test</title>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  const result = await page.evaluate(origin => new Promise((resolve, reject) => {
    const code = `
      importScripts(${JSON.stringify(origin + '/typescript.js')});
      (async()=>{
        const {generateBindingsFromProgram}=await import(${JSON.stringify(origin + '/bindings.js')});
        const source='export declare function greet(name: string): string;';
        const file='/virtual.d.ts';
        const host={getSourceFile:n=>n===file?ts.createSourceFile(n,source,ts.ScriptTarget.Latest,true):undefined,
          getDefaultLibFileName:()=>'',writeFile(){throw Error('unexpected write')},getCurrentDirectory:()=>'/',getDirectories:()=>[],
          fileExists:n=>n===file,readFile:n=>n===file?source:undefined,getCanonicalFileName:n=>n,useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\\n'};
        const program=ts.createProgram([file],{noLib:true},host);
        const output=generateBindingsFromProgram(ts,program,{files:[file],prefix:'WorkerABI',moduleSpecifier:'greeting'});
        postMessage({source:output.sources.get('WorkerABI'),hasProcess:typeof process!=='undefined'});
      })().catch(error=>postMessage({error:String(error.stack)}));`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const timer = setTimeout(() => { worker.terminate(); URL.revokeObjectURL(url); reject(Error('worker timed out')); }, 30000);
    worker.onmessage = event => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); resolve(event.data); };
    worker.onerror = event => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); reject(Error(event.message)); };
  }), origin);
  assert(!result.error, result.error);
  assert.equal(result.hasProcess, false);
  assert(result.source.includes('fun(Str) Str'));
  assert(result.source.includes('import { greet as __dts_greet }'));
  console.log(`PASS: TypeScript parser/checker and host-neutral linker run in a browser Worker (${bundle.outputFiles[0].contents.length} byte linker)`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
