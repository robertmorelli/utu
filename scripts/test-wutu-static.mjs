import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {buildBrowserApp} from '../tools/dts/build-app.mjs';
import {prerender} from '../tools/dts/prerender.mjs';
const dir=await fs.mkdtemp(path.resolve('.tmp-wutu-static-'));
let server,browser;
try{
 const entry=path.join(dir,'main.utu'),out=path.join(dir,'out');
 await fs.writeFile(entry,'using Browser from std:Browser; export main() void {Browser.document.body.append(@wutu/\\ main {h1 {"Static content";} button {"Action";} } \\/);}');
 await buildBrowserApp({entry,outDir:out});await fs.writeFile(path.join(out,'index.html'),'<!doctype html><html><body><script type="module" src="./app.js"></script></body></html>');
 const html=await prerender(out);assert.ok(html.includes('Static content'));assert.ok(html.includes('data-wutu-prerender'));assert.ok(html.includes('data-wutu-pending'));
 server=http.createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1);res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':name.endsWith('.js')?'text/javascript':'text/html');res.end(await fs.readFile(path.join(out,name)));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.documentElement.hasAttribute('data-utu-ready'));assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('[data-wutu-pending],[data-wutu-prerender]').count(),0);assert.ok(await page.locator('button').isEnabled());
 console.log('Static prerender preserves readable HTML, starts without duplicate content, and enables its controls');
 // A value inside a raw-text element (a noscript's p) is escaped prerendered: loaded, it closes nothing.
 const raw=path.join(dir,'raw'),rawOut=path.join(raw,'out');await fs.mkdir(raw);
 await fs.writeFile(path.join(raw,'main.utu'),'using Browser from std:Browser; export main() void {let v = "</noscript></style><img src=x onerror=\\"window.__pwn=1\\">"; Browser.document.body.append(@wutu/\\ main {noscript {p {title = v; = v;}} style {"p { color: red; }";} } \\/);}');
 await buildBrowserApp({entry:path.join(raw,'main.utu'),outDir:rawOut});await fs.writeFile(path.join(rawOut,'index.html'),'<!doctype html><html><body><script type="module" src="./app.js"></script></body></html>');
 const rawHtml=await prerender(rawOut);assert.ok(rawHtml.includes('&lt;/noscript&gt;'),rawHtml);
 const loaded=await browser.newPage();await loaded.route('**/*.js',r=>r.abort());await loaded.setContent(rawHtml);await loaded.waitForTimeout(200);
 assert.equal(await loaded.evaluate(()=>window.__pwn??null),null);assert.equal(await loaded.locator('img').count(),0);
 console.log('A value inside a noscript prerenders escaped and runs nothing');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
