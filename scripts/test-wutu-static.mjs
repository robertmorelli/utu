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
 const html=await prerender(out);assert.ok(html.includes('Static content'));assert.ok(html.includes('data-utu-static'));
 server=http.createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1);res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':name.endsWith('.js')?'text/javascript':'text/html');res.end(await fs.readFile(path.join(out,name)));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.documentElement.hasAttribute('data-utu-ready'));assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('[data-utu-static]').count(),0);
 console.log('Static prerender preserves readable HTML and starts without duplicate content');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
