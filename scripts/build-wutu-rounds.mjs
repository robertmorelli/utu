import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {initParser} from '../src/index.js';
import {buildBrowserApp} from '../tools/dts/build-app.mjs';
import {prerender} from '../tools/dts/prerender.mjs';
export const rounds={
 one:[['atlas','Atlas','A travel shortlist'],['pantry','Pantry','Kitchen inventory'],['meter','Meter','A weekly habit journal'],['ledger','Ledger','A spending notebook'],['studio','Studio','A small project board']],
 two:[['venue','Venue','A seating planner'],['grove','Grove','Plant care reminders'],['tempo','Tempo','An interval studio'],['pitch','Pitch','A project quote builder'],['readroom','Readroom','A reading journal']],
};
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export async function buildRound(round){
 const root=path.resolve(`dist/wutu-round-${round}`),parser=await initParser({wasmDir:path.resolve('.')+'/'}),reports={};
 try{for(const [id,title,description]of rounds[round]){
  const entry=path.resolve(`examples/wutu-round-${round}/${id}/main.utu`),outDir=path.join(root,id);
  const report=await buildBrowserApp({entry,outDir,parser});
  await fs.writeFile(path.join(outDir,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${description}"><title>${title} / Wutu</title><body><noscript>Interactive tools require JavaScript.</noscript><script type="module" src="./app.js"></script></body></html>`);
  const html=await prerender(outDir);report.pageGzip=report.total.gzip+gzipSync(html,{level:9}).length;reports[id]=report;
  const source=await fs.readFile(entry,'utf8');await fs.writeFile(path.join(outDir,'main.utu'),source);
  const theme=await fs.readFile(`examples/wutu-round-${round}/theme.utu`,'utf8');
  await fs.writeFile(path.join(outDir,'source.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} source</title><style>body{margin:0;background:#172324;color:#e1e9de;font:16px system-ui}header{padding:24px;display:flex;gap:2rem;flex-wrap:wrap}a{color:#c7e6bf}pre{padding:24px;overflow:auto;font:13px/1.7 monospace}h2{padding:0 24px}</style><header><strong>${title} / Source</strong><a href="./">Open site</a><a href="../">All five</a></header><h2>main.utu</h2><pre id="main"><code>${esc(source)}</code></pre><h2>Shared theme.utu</h2><pre><code>${esc(theme)}</code></pre></html>`);
  console.log(`${title}: ${report.pageGzip} bytes gzip including HTML`);
 }}finally{parser.delete();}
 await fs.writeFile(path.join(root,'sizes.json'),JSON.stringify(reports,null,2));
 await fs.writeFile(path.join(root,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wutu / Round ${round}</title><style>*{box-sizing:border-box}body{margin:0;background:#f1f0e8;color:#273f32;font:17px/1.6 system-ui}main{max-width:1200px;margin:auto;padding:70px 24px}h1{font:clamp(45px,7vw,90px)/1.05 Georgia;letter-spacing:-.05em}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}article{padding:28px;background:white;border:1px solid #cbd5c7;border-radius:14px}a{color:inherit}nav{display:flex;gap:24px}h2{font-size:34px}small{color:#667267}</style><main><small>UTU + WUTU / BUILD ROUND ${round.toUpperCase()}</small><h1>Five more ways<br>to make a little space.</h1><p>Working tools with shared CSS, scoped updates, and explicit persistence.</p><section>${rounds[round].map(([id,title,description])=>`<article><h2>${title}</h2><p>${description}</p><p><small>${(reports[id].pageGzip/1000).toFixed(2)} KB gzip, complete page</small></p><nav><a href="${id}/">Open site ↗</a><a href="${id}/source.html">Source</a></nav></article>`).join('')}</section></main></html>`);
 return reports;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await buildRound(process.argv[2]??'one');
