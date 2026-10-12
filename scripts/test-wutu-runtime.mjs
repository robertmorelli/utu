import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {createWutuRuntime,installWutuStorage} from '../src/runtime/wutu.js';
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
 const page=await browser.newPage();
 await page.route('http://runtime.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
 await page.goto('http://runtime.test/');
 const result=await page.evaluate(async ([source,storage])=>{
  const api=(0,eval)(`(${source})`)();(0,eval)(`(${storage})`)(api);let value='initial',applied='',renders=0,cleaned=0,showCleanup=true;
  const root=api.mount(()=>{renders++;api.enter('main',false,'root','');api.append(api.storageError);if(showCleanup)api.cleanup(()=>cleaned++);return api.leave();},'test');document.body.append(root);
  api.store('manual',()=>value,true,raw=>{applied=raw;});api.save('manual');api.flush();
  const initial=localStorage.getItem('manual');
  let writes=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){writes++;return original.apply(this,args);};
  api.save('manual');api.save('manual');api.flush();const dedup=writes;
  dispatchEvent(new StorageEvent('storage',{key:'manual',newValue:'remote'}));const incoming=applied;
  value='local';api.save('manual');dispatchEvent(new StorageEvent('storage',{key:'manual',newValue:'conflicting'}));api.flush();await Promise.resolve();
  const conflict={writes,applied,visible:root.textContent.includes('conflict')};api.save('manual');api.flush();const explicit=localStorage.getItem('manual');
  api.store('automatic',()=>value,false,raw=>{applied=raw;});api.save('automatic');dispatchEvent(new StorageEvent('storage',{key:'automatic',newValue:'another'}));api.refresh();api.flush();const automatic=localStorage.getItem('automatic');
  showCleanup=false;api.invalidate('test');await Promise.resolve();const cleanupCount=cleaned;
  let duplicate='';try{api.mount(()=>{api.enter('section',false,'dup','');for(let i=0;i<2;i++){api.enter('div',false,'parent'+i,'');api.pushGlobal('same');api.enter('p',false,'item','');api.leave();api.popKey();api.leave();}return api.leave();},'duplicates');}catch(e){duplicate=e.message;}
  return {initial,dedup,incoming,conflict,explicit,automatic,cleanupCount,duplicate};
 },[createWutuRuntime.toString(),installWutuStorage.toString()]);
 assert.equal(result.initial,'initial');assert.equal(result.dedup,0);assert.equal(result.incoming,'remote');assert.deepEqual(result.conflict,{writes:0,applied:'remote',visible:true});assert.equal(result.explicit,'local');assert.equal(result.automatic,null);assert.equal(result.cleanupCount,1);assert.match(result.duplicate,/Duplicate global/);
 console.log(`${engine.name()}: storage deduplication, incoming data, manual/automatic conflict protection, visible errors, cleanup and global key diagnostics passed`);
 }finally{await browser.close();}
}
