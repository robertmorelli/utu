import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compressedSourceWarnings } from '../src/compiler/source-warnings.js';
import { initParser, createCompiler, emitBinary } from '../src/index.js';
const dense = 'export main() I32 { let first_value = 1; let second_value = 2; let third_value = 3; let fourth_value = 4; let fifth_value = 5; first_value + second_value + third_value + fourth_value + fifth_value; }';
const warnings = compressedSourceWarnings('\n'+dense, 'test.utu');
assert.equal(warnings.length, 1);
assert.equal(warnings[0].severity, 'warning');
assert.equal(warnings[0].primary.row, 2);
assert.equal(warnings[0].primary.start, 1);
for (const source of ['// '+dense, '/*\n'+dense+'\n*/', '\\\\'+dense, 'let text = "'+dense+'";', 'export main() I32 { 1; }', dense.replaceAll('; ', ';\n')]) {
 assert.equal(compressedSourceWarnings(source, 'test.utu').length, 0, source);
}
const parser=await initParser({wasmDir:path.resolve('.')+'/'});
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'utu-source-warning-'));
try {
 const file=path.join(dir,'main.utu');await fs.writeFile(file,dense);
 const compiler=createCompiler({parser,readFile:p=>fs.readFile(p,'utf8'),resolvePath:(from,to)=>path.resolve(path.dirname(from),to),target:'analysis'});
 const result=await compiler.analyzeFile(file);
 assert.equal(result.artifacts.diagnostics.filter(d=>d.kind==='compressed-source').length,1);
 assert.equal(result.artifacts.diagnostics.filter(d=>d.severity==='error').length,0);
 assert.ok(emitBinary(result.doc).length>0,'warning must not prevent code generation');
 for(const id of ['folio','juniper','wayfarer','signal','scope']){
  const source=await fs.readFile(`examples/wutu-five/${id}/main.utu`,'utf8');
  assert.equal(compressedSourceWarnings(source,id).length,0,id);
 }
 console.log('Source warning detection, exclusions, location, diagnostics, and non-fatal codegen passed');
}finally{parser.delete();await fs.rm(dir,{recursive:true,force:true});}
