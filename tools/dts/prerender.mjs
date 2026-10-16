import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

// Build-only browser rendering. Nothing from Playwright is shipped to the client.
export async function prerender(outDir) {
  const root=path.resolve(outDir);
  const server=http.createServer(async(req,res)=>{
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
      if(!file.startsWith(root+path.sep))throw Error('outside output directory');
      res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':'text/html');
      res.end(await fs.readFile(file));
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch();const page=await browser.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>document.documentElement.hasAttribute('data-utu-ready')||document.documentElement.hasAttribute('data-utu-error'));
    // Lazy modules (using … lazy) arrive in chunks after main.
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-wutu-loading'));
    const failure=await page.locator('html').getAttribute('data-utu-error');if(failure)throw Error(failure);
    if(errors.length)throw Error(errors.join('\n'));
    const html=await page.evaluate(()=>{
      const clone=document.documentElement.cloneNode(true);
      clone.removeAttribute('data-utu-ready');
      for(const child of clone.querySelector('body').children)if(!['SCRIPT','STYLE','NOSCRIPT'].includes(child.tagName)&&!child.matches('[data-wutu-root]')&&!child.querySelector('[data-wutu-root]'))child.setAttribute('data-utu-static','');
      for(const root of clone.querySelectorAll('[data-wutu-root]'))root.setAttribute('data-wutu-prerender','');
      const originals=document.querySelectorAll('input,textarea,select');
      clone.querySelectorAll('input,textarea,select').forEach((el,i)=>{
        const original=originals[i];
        if(el.localName==='textarea')el.textContent=original.value;
        else if(el.localName==='select')Array.from(el.options).forEach((opt,j)=>opt.toggleAttribute('selected',original.options[j].selected));
        else {el.setAttribute('value',original.value);el.toggleAttribute('checked',original.checked);}
      });
      // Avoid accepting edits before Wasm has attached handlers. Links and content stay usable.
      for(const control of clone.querySelectorAll('[data-wutu-root] button,[data-wutu-root] input,[data-wutu-root] select,[data-wutu-root] textarea')) {
        if(!control.disabled){control.disabled=true;control.setAttribute('data-wutu-pending','');}
      }
      return '<!doctype html>'+clone.outerHTML;
    });
    await fs.writeFile(path.join(root,'index.html'),html);
    return html;
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
