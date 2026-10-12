import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const root=path.resolve('dist/wutu-more');
const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://local').pathname);const file=path.resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));if(!file.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':file.endsWith('.utu')?'text/plain':'text/html');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const engine=process.argv.includes('--webkit')?webkit:chromium,browser=await engine.launch();
const origin=`http://127.0.0.1:${server.address().port}`,observations={engine:engine.name()};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>document.documentElement.hasAttribute('data-utu-ready'));
 const visit=async id=>{await page.goto(`${origin}/${id}/`);await ready();};
 const reload=async()=>{await page.reload();await ready();};
 const shots=async id=>{await page.screenshot({path:path.join(root,id,`${engine.name()}-desktop.png`),fullPage:true});await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${id}: mobile overflow`);await page.screenshot({path:path.join(root,id,`${engine.name()}-mobile.png`),fullPage:true});await page.setViewportSize({width:1440,height:1000});};
 await visit('dispatch');assert.equal(await page.locator('.card').count(),4);await shots('dispatch');
 await page.getByLabel('What needs doing?').fill('Ship <the> website');await page.getByLabel('Discipline').selectOption('Development');await page.getByRole('button',{name:'Add to the board'}).click();assert.equal(await page.locator('.card').count(),5);assert.equal(await page.getByLabel('What needs doing?').inputValue(),'');
 await page.evaluate(()=>window.oldCard=[...document.querySelectorAll('.card')].find(n=>n.textContent.includes('Ship <the> website')));
 await page.getByRole('button',{name:'Move Ship <the> website',exact:true}).click();
 assert.ok(await page.getByRole('region',{name:'02 / In progress'}).getByText('Ship <the> website',{exact:true}).isVisible());
 observations.crossLanePreservesNode=await page.evaluate(()=>oldCard.isConnected);
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Move Ship <the> website');
 observations.focusAfterLaneMove=await page.evaluate(()=>document.activeElement.tagName);
 await page.getByRole('button',{name:'Move Ship <the> website',exact:true}).click();assert.ok(await page.getByRole('region',{name:'03 / Finished'}).getByText('Ship <the> website',{exact:true}).isVisible());
 await reload();assert.equal(await page.locator('.card').count(),5);
 await page.getByLabel('Find a card').fill('SHIP');assert.equal(await page.locator('.card').count(),1);await page.getByLabel('Find a card').fill('');await page.getByRole('button',{name:'Delete Ship <the> website',exact:true}).click();assert.equal(await page.locator('.card').count(),4);
 // Count renderer work for an unrelated draft edit on a populated board.
 await page.evaluate(()=>{globalThis.__utuWutu.flush();const envelope=JSON.parse(localStorage.getItem('dispatch-v1'));envelope.data.cards=Array.from({length:200},(_,i)=>({id:String(i),title:`Task ${i}`,category:'Design',stage:'todo'}));localStorage.setItem('dispatch-v1',JSON.stringify(envelope));});await reload();
 observations.draftEdit=await page.evaluate(async()=>{const runtime=globalThis.__utuWutu,original=runtime.enter,write=Storage.prototype.setItem;let count=0,writes=0,serializedCharacters=0;Storage.prototype.setItem=function(key,value){writes++;serializedCharacters+=value.length;return write.call(this,key,value);};runtime.enter=(...args)=>{count++;return original(...args);};const field=document.querySelector('input[required]');field.value='a';field.dispatchEvent(new Event('input',{bubbles:true}));await Promise.resolve();runtime.enter=original;Storage.prototype.setItem=write;return {nodesVisited:count,storageWrites:writes,serializedCharacters};});
 await visit('supper');assert.equal(await page.locator('.ingredient').count(),6);await shots('supper');
 await page.getByRole('button',{name:'More servings'}).click();assert.equal(await page.locator('#servings').textContent(),'3 servings');assert.ok((await page.locator('.ingredient').first().textContent()).includes('270.0 g'));
 await page.locator('.ingredient input').first().check();await page.getByRole('button',{name:'Next step'}).click();await reload();assert.ok(await page.locator('.ingredient input').first().isChecked());assert.ok((await page.locator('progress').getAttribute('value'))==='2');assert.equal(await page.locator('#servings').textContent(),'3 servings');
 await page.getByRole('button',{name:'Reset shopping list'}).click();assert.equal(await page.locator('.ingredient input:checked').count(),0);
 for(let i=0;i<2;i++)await page.getByRole('button',{name:'Fewer servings'}).click();assert.ok(await page.getByRole('button',{name:'Fewer servings'}).isDisabled());
 await page.getByRole('button',{name:'Next step'}).click();await page.getByRole('button',{name:'Next step'}).click();assert.ok(await page.getByRole('button',{name:'Next step'}).isDisabled());
 await page.evaluate(()=>{globalThis.__utuWutu.flush();const data=JSON.parse(localStorage.getItem('supper-v1'));data.data.step=999;data.data.servings=-3;localStorage.setItem('supper-v1',JSON.stringify(data));});await reload();assert.equal(await page.locator('progress').getAttribute('value'),'1');assert.equal(await page.locator('#servings').textContent(),'2 servings');
 await visit('split');assert.equal(await page.locator('#total').textContent(),'$270.00');assert.deepEqual(await page.locator('.transfer').allTextContents(),['Ben → Ada   $30.00','Cleo → Ada   $60.00']);await shots('split');
 await page.getByLabel('What was it for?').fill('Dinner');await page.getByLabel('Amount ($)',{exact:true}).fill('30.01');await page.getByLabel('Who paid?').selectOption('Cleo');await page.getByRole('button',{name:'Add expense'}).click();assert.equal(await page.locator('#total').textContent(),'$300.01');await reload();assert.equal(await page.locator('.expense').count(),4);
 await page.getByRole('button',{name:'Remove Dinner',exact:true}).click();assert.equal(await page.locator('#total').textContent(),'$270.00');
 await page.getByLabel('What was it for?').fill('Invalid');await page.getByLabel('Amount ($)',{exact:true}).fill('0');await page.getByRole('button',{name:'Add expense'}).click();assert.equal(await page.locator('.expense').count(),3);
 // Verify cent conservation against an independent equal-share calculation.
 for(const amounts of [[0,0,0],[1,0,0],[2,0,0],[100,100,100],[10001,777,4222],[10000000,10000000,9999999]]){
  await page.evaluate(amounts=>{globalThis.__utuWutu.flush();const envelope=JSON.parse(localStorage.getItem('split-v1'));envelope.data.expenses=amounts.map((cents,i)=>({id:String(i),title:'Test '+i,payer:['Ada','Ben','Cleo'][i],cents}));localStorage.setItem('split-v1',JSON.stringify(envelope));},amounts);await reload();
  const sum=amounts.reduce((a,b)=>a+b),remaining=amounts.map((n,i)=>n-Math.floor(sum/3)-(i<sum%3?1:0));
  for(const text of await page.locator('.transfer').allTextContents()) {const [,from,to,value]=/^(Ada|Ben|Cleo) → (Ada|Ben|Cleo)\s+\$(\d+\.\d\d)$/.exec(text);const n=Math.round(Number(value)*100);remaining[['Ada','Ben','Cleo'].indexOf(from)]+=n;remaining[['Ada','Ben','Cleo'].indexOf(to)]-=n;}
  assert.deepEqual(remaining,[0,0,0]);
 }
 for(const id of ['dispatch','supper','split']){
  await page.goto(`${origin}/${id}/source.html`);assert.equal(await page.locator('pre code').textContent(),await fs.readFile(`examples/wutu-more/${id}/main.utu`,'utf8'));
  const plain=await browser.newPage({javaScriptEnabled:false});await plain.goto(`${origin}/${id}/`);assert.equal(await plain.locator('h1').count(),1);await plain.close();
 }
 const reports=JSON.parse(await fs.readFile(path.join(root,'sizes.json'),'utf8'));for(const [id,r]of Object.entries(reports))assert.ok(r.pageGzip<15000,`${id}: exceeds 15KB complete gzip payload`);
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,`observations-${engine.name()}.json`),JSON.stringify(observations,null,2));
 console.log(`${engine.name()}: all three sites passed interaction, persistence, settlement arithmetic, mobile layout, prerender, source parity, and size tests`);console.log(observations);
}finally{await browser.close();await new Promise(r=>server.close(r));}
