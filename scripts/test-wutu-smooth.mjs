import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {chromium,webkit} from 'playwright';
import {formatWutuSource,wutuCompletions,wutuIslands} from '../src/compiler/wutu-tooling.js';
import {parseWutu} from '../src/compiler/wutu-parse.js';
const root=path.resolve('dist/wutu-reactive');
const source=await fs.readFile('examples/wutu-reactive/main.utu','utf8');
assert.equal(formatWutuSource(formatWutuSource(source)),formatWutuSource(source));
assert.ok(wutuCompletions(source,source.indexOf('bind:value')).some(c=>c.label==='bind:checked'));
assert.deepEqual(wutuCompletions(source,0),[]);
assert.deepEqual(wutuIslands('// @wutu/\\ fake \\/;\nlet s="@wutu/\\ fake \\/";'),[]);
const commented='let node=@wutu/\\ main { // Keep this\n "Hi"; } \\/;';
assert.equal(formatWutuSource(commented),commented);
const raw='let node=@wutu/\\ main { "path\\\\"; span {"Safe";} } \\/;';
assert.equal(formatWutuSource(formatWutuSource(raw)),formatWutuSource(raw));
assert.throws(()=>parseWutu('main { aria-hidden = "true" aspect-ratio: 0.68; }'),/semicolon|expected.*;/i);
const server=http.createServer(async(req,res)=>{try{const p=new URL(req.url,'http://local').pathname;const f=path.resolve(root,'.'+(p==='/'?'/index.html':p));if(!f.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',f.endsWith('.wasm')?'application/wasm':f.endsWith('.js')?'text/javascript':'text/html');res.end(await fs.readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const engine=process.argv.includes('--webkit')?webkit:chromium,browser=await engine.launch();
try{
 const nojs=await browser.newPage({javaScriptEnabled:false});await nojs.goto(origin);assert.equal(await nojs.locator('li').count(),2);assert.ok(await nojs.getByRole('button',{name:'Add task'}).isDisabled());await nojs.close();
 const unavailable=await browser.newPage();await unavailable.route('**/app.wasm',route=>route.fulfill({contentType:'application/wasm',body:'unavailable'}));await unavailable.goto(origin);await unavailable.getByRole('status').filter({hasText:'could not start'}).waitFor();assert.equal(await unavailable.locator('li').count(),2);await unavailable.close();
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Hold hydration, retain server DOM references, then release the loader.
 let release;const barrier=new Promise(r=>release=r);await page.route('**/app.js',async route=>{await barrier;await route.continue();});
 await page.goto(origin,{waitUntil:'commit'});await page.locator('li').first().waitFor();
 await page.evaluate(()=>{window.beforeRoot=document.querySelector('main');window.beforeItem=document.querySelector('li');});release();
 const ready=()=>page.waitForFunction(()=>document.documentElement.hasAttribute('data-utu-ready'));
 await ready();assert.ok(await page.evaluate(()=>beforeRoot===document.querySelector('main')&&beforeItem===document.querySelector('li')));
 assert.ok(await page.getByRole('button',{name:'Add task'}).isEnabled());assert.equal(await page.locator('li .badge').count(),4);
 // Reordering must preserve both node identity and focused input.
 await page.evaluate(()=>{window.firstItem=document.querySelector('li');window.firstBadge=firstItem.querySelector('.badge');window.focused=firstItem.querySelector('input');focused.focus();[...document.querySelectorAll('button')].find(b=>b.textContent==='Reverse tasks').click();});
 await page.waitForFunction(()=>document.querySelectorAll('li')[1]===firstItem);
 assert.ok(await page.evaluate(()=>document.activeElement===focused&&firstItem.querySelector('.badge')===firstBadge));
 await page.getByLabel('Search',{exact:true}).fill('Try');assert.equal(await page.locator('li').count(),1);assert.equal(await page.locator('#changes').textContent(),'1');
 await page.getByLabel('Search',{exact:true}).fill('');assert.equal(await page.locator('#changes').textContent(),'2');
 await page.getByLabel('Budget',{exact:true}).fill('42');assert.equal(await page.locator('#budget').textContent(),'42');
 await page.getByRole('button',{name:'Focus independent field'}).click();assert.ok(await page.getByLabel('Independent field').evaluate(el=>el===document.activeElement));
 await page.getByLabel('New task',{exact:true}).fill('Persisted <safe>');await page.getByRole('button',{name:'Add task'}).click();assert.equal(await page.locator('li').count(),3);assert.equal(await page.getByLabel('New task',{exact:true}).inputValue(),'');
 await page.reload();await ready();assert.equal(await page.locator('li').count(),3);assert.equal(await page.getByLabel('Budget',{exact:true}).inputValue(),'42');
 await page.evaluate(()=>localStorage.setItem('wutu-smooth-v1',JSON.stringify({version:1,data:{tasks:'bad'}})));await page.reload();await ready();assert.equal(await page.locator('li').count(),2);assert.match(await page.locator('#storage').textContent(),/schema mismatch/);
 await page.getByLabel('New task',{exact:true}).fill('Recovery');await page.getByRole('button',{name:'Add task'}).click();assert.equal(await page.locator('li').count(),3);
 assert.deepEqual(errors,[]);
 const denied=await browser.newPage();await denied.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('Storage denied');};});await denied.goto(origin);await denied.waitForFunction(()=>document.documentElement.hasAttribute('data-utu-ready'));await denied.getByLabel('New task',{exact:true}).fill('Session only');await denied.getByRole('button',{name:'Add task'}).click();assert.equal(await denied.locator('li').count(),3);await denied.waitForFunction(()=>document.querySelector('#storage').textContent.includes('Storage denied'));assert.match(await denied.locator('#storage').textContent(),/Storage denied/);
 console.log(`${engine.name()}: formatting, completion, strict separators, prerender, hydration identity, keyed focus, forms, event composition, typed storage and recovery passed`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
