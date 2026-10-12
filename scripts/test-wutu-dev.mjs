import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const dir=await fs.mkdtemp(path.resolve('.wutu-preview-test-'));
const entry=path.join(dir,'main.utu');
const source=text=>`using Browser from std:Browser; export main() void {let app=@wutu/\\ @reactive; main {h1 {"${text}";} input {<aria-label="Draft";} } \\/;Browser.document.body.append(app);}`;
await fs.writeFile(entry,source('First build'));
const child=spawn(process.execPath,['cli/wutu.mjs','dev',entry,'--out',path.join(dir,'output'),'--port','0'],{stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
const browser=await chromium.launch();
try{
 const deadline=Date.now()+30000;while(!/Wutu preview: (http:\/\/[^\s]+)/.test(log)){if(Date.now()>deadline)throw Error(log);await new Promise(r=>setTimeout(r,100));}
 const origin=/Wutu preview: (http:\/\/[^\s]+)/.exec(log)[1],page=await browser.newPage();await page.goto(origin);await page.getByText('First build',{exact:true}).waitFor();await page.getByLabel('Draft').fill('Keep this draft');
 await fs.writeFile(entry,source('Broken').replace('"Broken";','"Broken"'));
 await page.locator('#__wutu_error').waitFor();assert.match(await page.locator('#__wutu_error').textContent(),/main\.utu:\d+:\d+/);assert.equal(await page.locator('h1').textContent(),'First build');
 await fs.writeFile(entry,source('Recovered build'));await page.getByText('Recovered build',{exact:true}).waitFor();assert.equal(await page.locator('#__wutu_error').count(),0);await page.waitForFunction(()=>document.querySelector('input').value==='Keep this draft');
 console.log('Development preview: rebuild, positioned diagnostic overlay, last-good output, and recovery passed');
}finally{child.kill('SIGINT');await browser.close();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await fs.rm(dir,{recursive:true,force:true});}
