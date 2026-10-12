import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import {prerender} from '../tools/dts/prerender.mjs';
import { initParser } from '../src/index.js';
import { buildBrowserApp } from '../tools/dts/build-app.mjs';
export const sites = [
  ['folio','Folio','Your personal reading library','Search your shelf, add books, and track what you finish.','#f4ede2','#994631'],
  ['juniper','Juniper','Kitchen & coffee','Browse the menu and keep a persistent order notebook.','#eef0dd','#375b40'],
  ['wayfarer','Wayfarer','Take the scenic route','Plan three days, track costs, and check off your stops.','#122d36','#a3e2c6'],
  ['signal','Signal / 26','Ideas worth gathering for','Build an agenda, spot clashes, and export your calendar.','#202120','#d5fb61'],
  ['scope','Scope','Independent work, clearly priced','Estimate a project, edit work items, and export a CSV.','#f4f2fa','#7145c8'],
];
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export async function buildFive() {
 const out=path.resolve('dist/wutu-five');
 const parser=await initParser({wasmDir:path.resolve('.')+'/'});
 const reports={};
 try {for(const [id,name,tagline,description,bg,accent] of sites){
  const dir=path.join(out,id), entry=path.resolve(`examples/wutu-five/${id}/main.utu`);
  const report=await buildBrowserApp({entry,outDir:dir,parser});
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(description)}"><meta name="theme-color" content="${bg}"><title>${escape(name)} — ${escape(tagline)}</title><body><noscript>Interactive tools need JavaScript and WebAssembly.</noscript><script type="module" src="./app.js"></script></body></html>`;
  await fs.writeFile(path.join(dir,'index.html'),html);
  const rendered=await prerender(dir);
  report.pageGzip=report.total.gzip+gzipSync(rendered,{level:9}).length;
  reports[id]=report;
  const source=await fs.readFile(entry,'utf8');
  await fs.writeFile(path.join(dir,'main.utu'),source);
  await fs.writeFile(path.join(dir,'source.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(name)} — Wutu source</title><style>body{margin:0;background:#171b22;color:#e0e6ef;font:15px system-ui}header{padding:24px;display:flex;gap:24px;flex-wrap:wrap;border-bottom:1px solid #465365}a{color:#b8d9ff}pre{padding:24px;overflow:auto;font:13px/1.7 ui-monospace,monospace;tab-size:4}h1{font-size:18px;margin:0}</style><header><h1>${escape(name)} · main.utu</h1><a href="./">Open site ↗</a><a href="../">All five sites</a><a href="main.utu" download>Download source</a></header><pre><code>${escape(source)}</code></pre></html>`);
  console.log(`${name}: ${report.pageGzip} bytes gzip including HTML`);
 }}finally{parser.delete();}
 await fs.writeFile(path.join(out,'sizes.json'),JSON.stringify(reports,null,2));
 await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Five sites, written in Wutu</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f0e9;color:#212724;font:16px/1.6 system-ui}main{max-width:1160px;margin:auto;padding:60px 24px}h1{font-size:clamp(42px,7vw,88px);letter-spacing:-.06em;line-height:1.05;max-width:900px;margin:20px 0}header>p{max-width:700px;color:#536058}small{letter-spacing:.15em}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px;margin-top:50px}article{padding:28px;border:1px solid #d6d8ce;border-radius:16px;display:flex;flex-direction:column;gap:16px}article h2{font-size:36px;letter-spacing:-.04em;margin:0}article p{margin:0}article nav{margin-top:auto;display:flex;gap:24px}a{color:inherit;text-underline-offset:5px}article small{letter-spacing:0}footer{margin-top:40px;color:#536058}</style><main><header><small>UTU / WUTU · FIVE WORKING WEBSITES</small><h1>Small builds.<br>Real things to do.</h1><p>Five distinct interfaces, written entirely in Utu and Wutu. Each has working interactions and local storage. Open a site, use it, then read the exact source beside it.</p></header><section>${sites.map(([id,name,tagline,description,bg,accent],i)=>`<article style="background:${bg};color:${id==='signal'||id==='wayfarer'?accent:'#252d28'}"><small>0${i+1} / ${tagline}</small><h2>${name}</h2><p>${description}</p><small>${(reports[id].pageGzip/1000).toFixed(2)} KB gzip · HTML + Wasm + JS + CSS</small><nav><a href="${id}/">Open site ↗</a><a href="${id}/source.html">Read source</a></nav></article>`).join('')}</section><footer>Data stays in this browser. Juniper and Signal are fictional brands with functional planning tools. No accounts, analytics, external fonts, or image downloads. Source viewers are separate from site payloads.</footer></main></html>`);
 return reports;
}
if(process.argv[1]===new URL(import.meta.url).pathname) await buildFive();
