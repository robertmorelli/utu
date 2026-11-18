var Ut=Symbol("utu.closure");var be=new WeakMap,we=(o,r,l,y,k)=>{let T=r==null&&!(l&2),W=T&&be.get(o);if(W)return W;let v=T?(...f)=>o(...f):(...f)=>o(r,...f),_=k?.[(l>>4)-1],u=_?(...f)=>{for(let p=0;p<_.length;p++){let A=_[p];if(A==="b")f[p]=f[p]?1:0;else if(A==="n")f[p]===void 0&&(f[p]=null);else if(A==="h"&&f[p]==null)throw new TypeError(`Wrong type from JavaScript: a closure's argument ${p+1} is ${f[p]}`)}return v(...f)}:v,d=l&1?(...f)=>!!u(...f):l&4?(...f)=>u(...f)>>>0:l&8?(...f)=>BigInt.asUintN(64,u(...f)):u;return d[Ut]=y,T&&be.set(o,d),d};var ye=(o,...r)=>o(...r),Ot={U8:"Uint8Array",I8:"Int8Array",U16:"Uint16Array",I16:"Int16Array",I32:"Int32Array",U32:"Uint32Array",I64:"BigInt64Array",U64:"BigUint64Array",F32:"Float32Array",F64:"Float64Array"};function xe(o,r={}){for(let{name:y,kind:k,host:T,data:W}of o??[]){if(!T)continue;let v=Math.max(1,Math.ceil((W?W.length*3/4:0)/65536)),_=new WebAssembly.Memory({initial:v,maximum:65535}),u=globalThis[Ot[k]],d=u.BYTES_PER_ELEMENT,f=p=>{let A=Math.ceil(p/65536)-_.buffer.byteLength/65536;A>0&&_.grow(A)};r[`mem_${y}`]=_,r[`mem_copy_in_${y}`]=p=>{if(typeof p=="string")return f(p.length*3),Math.floor(new TextEncoder().encodeInto(p,new Uint8Array(_.buffer)).written/d);let A=p instanceof ArrayBuffer?new Uint8Array(p):new Uint8Array(p.buffer,p.byteOffset,p.byteLength);return f(A.byteLength),new Uint8Array(_.buffer).set(A),Math.floor(A.byteLength/d)},r[`mem_view_${y}`]=(p,A)=>new u(_.buffer,p*d,A-p)}return r}var ke=(o=>globalThis[o]),Q=((o,r,l)=>o[r](l)),X=((o,r,l)=>{o[r]=l}),Z=((o,r)=>o[r]),Se=((o,r)=>globalThis[o](r)),$e=((o,r)=>globalThis.__utuWutu.mount(o,r)),ve=(o=>r=>o(r)?1:0)(o=>globalThis.__utuWutu.memoHit(o)),Ae=(o=>globalThis.__utuWutu.put(o)),Te=(()=>globalThis.__utuWutu.memoLast()),Ee=((o,r)=>globalThis.__utuWutu.memoKeep(o,r)),_e=(()=>globalThis.__utuWutu.slot()),Ne=(o=>globalThis.__utuWutu.item(o)),ze=(()=>globalThis.__utuWutu.end()),We=(o=>globalThis.__utuWutu.begin(o)),Me=(()=>globalThis.__utuWutu.done()),Ce=(()=>{if(!document.getElementById("wutu-insj5b")){let o=document.createElement("style");o.id="wutu-insj5b",o.setAttribute("data-wutu-style",""),o.textContent=`@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap") layer(wutu.document);@layer wutu.document{
        
        :root {
            --bg: #f7f6f2;
            --ink: #1f2535;
            --muted: #656c7e;
            --line: #dcd9d1;
            --tint: #edebe4;
            --blue: #2d53c4;
            --orange: #e4772c;
            --sun: #f2a33a;
            --code-bg: #171c30;
            --code-ink: #e4e7f2;
            --code-k: #c8bdff;
            --code-s: #a7dfb1;
            --code-c: #7d86a1;
            --code-T: #ffd48a;
            --code-n: #ffb3b3;
            --code-a: #ff9ed6;
            --code-d: #8fd6ff;
            --code-y: #a6d4ff;
            --code-f: #e4e7f2;
            color-scheme: light dark;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #121724;
                --ink: #e2e4eb;
                --muted: #9ba2b6;
                --line: #2a3246;
                --tint: #1d2437;
                --blue: #93b0ff;
                --orange: #f0924e;
                --code-bg: #090c17;
            }
        }
        * {
            box-sizing: border-box;
        }
        html {
            -webkit-text-size-adjust: 100%;
        }
        body {
            margin: 0;
            background: var(--bg);
            color: var(--ink);
            font: 400 1.0625rem/1.6 "Bricolage Grotesque", system-ui, sans-serif;
            font-optical-sizing: auto;
        }
        a {
            color: var(--blue);
            text-underline-offset: 0.2em;
            text-decoration-thickness: 1px;
            text-decoration-color: color-mix(in srgb, var(--blue) 45%, transparent);
        }
        a:hover {
            text-decoration-color: currentColor;
        }
        :focus-visible {
            outline: 2px solid var(--orange);
            outline-offset: 3px;
        }
        h1, h2, h3, p, ul, ol, table {
            margin: 0;
            overflow-wrap: anywhere;
        }
        h1 {
            font-weight: 600;
            font-size: clamp(2.2rem, 1.4rem + 3vw, 3.5rem);
            line-height: 1.04;
            letter-spacing: -0.03em;
        }
        h2 {
            font-weight: 600;
            font-size: 1.45rem;
            line-height: 1.2;
            letter-spacing: -0.015em;
            margin-block: 3.5rem 1rem;
        }
        h2:first-of-type {
            margin-block-start: 3rem;
        }
        p + p {
            margin-block-start: 1rem;
        }
        .page {
            max-inline-size: 64rem;
            padding: clamp(2rem, 6vw, 5rem) clamp(1.25rem, 5vw, 4rem) 6rem;
        }
        .page > :is(p, ul, ol, h2, h3, .further) {
            max-inline-size: 44rem;
        }
        .page-head + p {
            margin-block-start: 2rem;
        }
        .page.playground {
            max-inline-size: 84rem;
        }
        .page.playground > p {
            max-inline-size: 44rem;
        }
        .page-head {
            display: grid;
            gap: 1.1rem;
            padding-block-end: 2rem;
            border-block-end: 1px solid var(--line);
        }
        .lede {
            font-size: 1.15rem;
            line-height: 1.5;
            color: var(--muted);
            max-inline-size: 36rem;
        }
        .further {
            margin-block-start: 1.75rem;
            padding-inline-start: 1rem;
            border-inline-start: 3px solid var(--orange);
            color: var(--muted);
        }
        .further + .further {
            margin-block-start: 0.75rem;
        }
        code {
            font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.86em;
        }
        p code, li code, td code, th code {
            background: var(--tint);
            padding: 0.1em 0.35em;
        }
        pre.code {
            margin: 1.4rem 0;
            padding: 1.2rem 1.4rem;
            background: var(--code-bg);
            color: var(--code-ink);
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            font: 400 0.84rem/1.65 "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
            tab-size: 4;
        }
        pre.code code {
            font-size: inherit;
        }
        @media (width < 40rem) {
            pre.code {
                font-size: 0.78rem;
                padding: 0.9rem 1rem;
            }
        }
        pre.code .k {
            color: var(--code-k);
        }
        pre.code .s {
            color: var(--code-s);
        }
        pre.code .c {
            color: var(--code-c);
            font-style: italic;
        }
        pre.code .T {
            color: var(--code-T);
        }
        pre.code .n {
            color: var(--code-n);
        }
        pre.code .a {
            color: var(--code-a);
            font-weight: 500;
        }
        pre.code .d {
            color: var(--code-d);
            font-weight: 500;
        }
        pre.code .y {
            color: var(--code-y);
        }
        pre.code .f {
            color: var(--code-f);
        }
        table {
            border-collapse: collapse;
            inline-size: 100%;
            margin-block: 1.4rem;
            font-size: 0.95rem;
        }
        th, td {
            text-align: start;
            vertical-align: top;
            padding: 0.7rem 0.75rem 0.7rem 0;
            border-block-end: 1px solid var(--line);
        }
        th {
            font-weight: 600;
            white-space: nowrap;
        }
        thead th {
            color: var(--muted);
            font-weight: 500;
            font-size: 0.85rem;
        }
        table.wide {
            overflow-wrap: normal;
        }
        table.wide td, table.wide thead th {
            text-align: end;
            font-variant-numeric: tabular-nums;
            padding-inline: 0.75rem 0;
        }
        table.wide th {
            white-space: normal;
        }
        table.wide thead th {
            font-size: 0.9em;
        }
        @media (width < 40rem) {
            table.wide {
                font-size: 0.74rem;
            }
            table.wide th, table.wide td {
                padding-inline: 0.3rem 0;
            }
        }
        @media (width < 22rem) {
            table.wide {
                font-size: 0.66rem;
            }
        }
        ul, ol {
            padding-inline-start: 1.25rem;
        }
        li + li {
            margin-block-start: 0.45rem;
        }
        .principles li {
            padding-inline-start: 0.35rem;
        }
        .principles li::marker {
            color: var(--orange);
            font-weight: 600;
        }
        .home {
            padding: clamp(2rem, 6vw, 5rem) clamp(1.25rem, 5vw, 4rem) 5rem;
            max-inline-size: 74rem;
            display: grid;
            gap: clamp(4rem, 8vw, 7rem);
        }
        .hero {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: clamp(2.5rem, 6vw, 5rem);
            align-items: center;
        }
        @media (width < 60rem) {
            .hero {
                grid-template-columns: minmax(0, 1fr);
            }
        }
        .pitch {
            display: grid;
            gap: 1.75rem;
            align-content: start;
        }
        .pitch .sun {
            inline-size: clamp(5rem, 9vw, 7rem);
            block-size: auto;
            display: block;
        }
        .pitch h1 {
            font-size: clamp(2.5rem, 1.4rem + 3.8vw, 4.4rem);
            font-weight: 600;
            max-inline-size: 12em;
        }
        .pitch .lede {
            font-size: 1.12rem;
            max-inline-size: 32rem;
        }
        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem 1.75rem;
            align-items: center;
            margin-block-start: 0.5rem;
        }
        .button {
            display: inline-block;
            padding: 0.8rem 1.4rem;
            background: var(--orange);
            color: #1f2535;
            text-decoration: none;
            font-weight: 600;
        }
        .button:hover {
            background: var(--sun);
        }
        .sample {
            display: grid;
            gap: 0.85rem;
        }
        .sample pre.code {
            margin: 0;
            font-size: 0.8rem;
        }
        .caption {
            color: var(--muted);
            font-size: 0.95rem;
            max-inline-size: 30rem;
        }
        .points {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
            gap: clamp(2.5rem, 5vw, 4rem);
        }
        .point {
            display: grid;
            gap: 1rem;
            align-content: start;
        }
        .point h2 {
            margin: 0;
            font-size: 1.4rem;
            max-inline-size: 22ch;
        }
        .point pre.code {
            margin: 0.25rem 0;
        }
        .measured {
            display: grid;
            gap: 0.75rem;
        }
        .measured h2, .map h2 {
            margin: 0;
        }
        .measured table {
            margin-block: 1rem 0;
            max-inline-size: 52rem;
        }
        .measured th {
            font-size: 1.5rem;
            font-weight: 600;
            letter-spacing: -0.02em;
            padding-inline-end: 1.5rem;
            font-variant-numeric: tabular-nums;
            color: var(--orange);
        }
        .measured td {
            color: var(--muted);
        }
        .map ul {
            list-style: none;
            padding: 0;
            margin-block-start: 1.25rem;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
            gap: 0 2.5rem;
        }
        .map li {
            display: grid;
            gap: 0.2rem;
            padding-block: 1rem;
            border-block-start: 1px solid var(--line);
            margin: 0;
        }
        .map li a {
            font-weight: 600;
            font-size: 1.05rem;
        }
        .map li span {
            color: var(--muted);
            font-size: 0.95rem;
        }
    }.w1qs58sx{display:grid;grid-template-columns:17rem minmax(0, 1fr);min-block-size:100dvh;@media (width < 64rem){
            grid-template-columns: minmax(0, 1fr);
        }}.wgnb6mj{position:sticky;top:0;block-size:100dvh;overflow-y:auto;display:flex;flex-direction:column;gap:1.5rem;padding:1.5rem 1.25rem;border-inline-end:1px solid var(--line);@media (width < 64rem){
                position: static;
                block-size: auto;
                gap: 0.9rem;
                padding: 1rem 1rem 0;
                border-inline-end: 0;
                border-block-end: 1px solid var(--line);
            }}.wozgk8k{display:flex;align-items:center;gap:0.7rem;color:var(--ink);text-decoration:none;font-weight:600;font-size:1.5rem;letter-spacing:-0.03em;&:hover{
                    color: var(--ink);
                }& > svg{
                    inline-size: 2.1rem;
                    block-size: 2.1rem;
                    flex: none;
                }}.wtecrl2{font-weight:400;font-size:0.95rem;color:var(--muted);letter-spacing:0;}.w12ouhtb{display:grid;@media (width < 64rem){
                    display: flex;
                    gap: 0;
                    overflow-x: auto;
                    scrollbar-width: none;
                    margin-inline: -1rem;
                    padding-inline: 1rem;
                }}.w1t0d0nu{display:block;padding:0.5rem 0.75rem;text-decoration:none;font-size:0.98rem;white-space:nowrap;color:var(--muted);border-inline-start:3px solid transparent;&:hover{
                            color: var(--ink);
                        }&.here{
                            background: var(--tint);
                            color: var(--ink);
                            font-weight: 600;
                            border-inline-start-color: var(--orange);
                        }@media (width < 64rem){
                            border-inline-start: 0;
                            border-block-end: 3px solid transparent;
                            @ &.here {
                                background: transparent;
                                border-block-end-color: var(--orange);
                            }
                        }}.w14c5k7f{margin-block-start:auto;font-size:0.85rem;color:var(--muted);line-height:1.5;@media (width < 64rem){
                    display: none;
                }}.wu7hoyu{min-inline-size:0;}.w1nf506q{padding:1.5rem clamp(1rem, 4vw, 3rem) 3rem;border-block-start:1px solid var(--line);color:var(--muted);font-size:0.9rem;display:flex;flex-wrap:wrap;gap:0.5rem 2rem;justify-content:space-between;}`,document.head.append(o)}}),Ie=(()=>{globalThis.__utuWutu??=(function(){let r=new WeakMap,l=new WeakMap;function y(e,t=!0){if(e.pending)return t?[e.start,...e.pending,e.end]:e.pending;let n=[];for(let i=t?e.start:e.start.nextSibling;i;i=i.nextSibling){if(i===e.end){t&&n.push(i);break}n.push(i)}return n}function k(e){if(Array.isArray(e))return e.every(k);let t=r.get(e);return t?t.start.isConnected&&t.end.isConnected:!!e?.isConnected}function T(e){let t=r.get(e);return t?y(t,!1).flatMap(n=>n.nodeType===1?[n,...n.querySelectorAll("[data-wutu]")]:[]):e?.querySelectorAll?.("[data-wutu]")??[]}function W(){let e=$.at(-1),t=0,n=!1,i=!1;for(let m=0;m<x.length;m++)x[m].global&&(t=m,n=x[m].depth===$.length),x[m].explicit&&(i=x[m].depth===$.length);let a=e?x.slice(t).map(m=>`${m.explicit?"k":"c"}${m.value.length}:${m.value}`).join(":"):h?.scope??"",s=`wutu:${b.h}:${encodeURIComponent(a)}`;ne(e,s,n,i);let g=m=>{let S=new Map;for(let z of m)if(z.nodeType===8&&z.data.startsWith("wutu:")){let R=S.get(z.data);R||S.set(z.data,R={nodes:[],index:0}),R.nodes.push(z)}return S},E=m=>{let S=m.get(s);for(;S&&S.index<S.nodes.length;){let z=S.nodes[S.index++];if(!e?.used.has(z)&&!N?.used.has(z))return z}},w=e&&E(e.ranges??=g(e.old));if(!w&&!e&&(w=r.get(h?.root)?.start),!w){let m=$[0]?.node;if((!N||N.root!==m)&&(N={root:m,index:null,used:new Set}),!N.comments){let S=[],z=U=>{U.nodeType===8&&(e||!l.has(U))&&S.push(U);for(let Rt of U.childNodes??[])z(Rt)},R=r.get(m);if(R)for(let U of y(R,!1))z(U);else z(m??document);N.comments=g(S)}w=E(N.comments)}let c=w&&l.get(w);if(!c&&w){let m=w.nextSibling;for(;m&&!(m.nodeType===8&&m.data==="/"+s);)m=m.nextSibling;m&&(c={start:w,end:m,value:document.createDocumentFragment()})}if(!c){let m=document.createDocumentFragment();c={value:m,start:document.createComment(s),end:document.createComment("/"+s)},m.append(c.start,c.end)}r.set(c.value,c),l.set(c.start,c),e&&e.used.add(c.start),N?.used.add(c.start),b.fragment=c,$.push({node:c.value,range:c,old:y(c,!1),used:new Set,wanted:[],byKey:null,keyed:null})}let v=new WeakMap,_=new WeakMap,u=new Set,d=new Map,f=new Set,p=[],A=new WeakSet,O=null,M=()=>x.map(e=>e.value.length+":"+e.value).join("|"),q=new WeakMap,$=[],h=null,x=[],F=!1,J=0,C=null,mt=new Map,N=null;function P(){Y.autoSave?.()}function gt(e){let t=d.get(e)?.deref();t&&(t.dirty=!0,I(t))}let ht=new Set,ee=new WeakMap;function bt(e,t){ee.set(e,t),e.value!==t&&(e.value=t)}function K(e){let t=q.get(e);return t===void 0&&q.set(e,t=e.getAttribute("data-wutu")),t}function te(e,t,n=null){let i=n?y(n,!1):e.childNodes;if(i.length===t.length){let w=!0;for(let c=0;w&&c<t.length;c++)w=i[c]===t[c];if(w)return}let a=document.activeElement,s=a&&"selectionStart"in a?[a.selectionStart,a.selectionEnd,a.selectionDirection]:null,g=n?n.start.nextSibling:e.firstChild;for(let w of t){if(w===g){g=g.nextSibling;continue}e.moveBefore&&w.parentNode===e?e.moveBefore(w,g):e.insertBefore(w,g)}let E=new Set(t);for(let w of[...i])E.has(w)||w.nodeType===1&&(w.nodeName==="HEAD"||w.hasAttribute("data-wutu-style"))||(h?h.removals.add(w):(H(w),w.remove()));a?.isConnected&&document.activeElement!==a&&(a.focus({preventScroll:!0}),s?.[0]!=null&&a.setSelectionRange(...s))}function ne(e,t,n,i){if(n&&h){if(h.globalClaims.has(t))throw Error("Duplicate global Wutu key: "+t);h.globalClaims.add(t)}if(i&&e){if(e.keyed??=new Set,e.keyed.has(t))throw Error("Duplicate Wutu key: "+x.findLast(a=>a.explicit).value);e.keyed.add(t)}}function wt(e,t,n,i){let a=e?.old[e.wanted.length];if(a?.nodeType===1&&a.localName===n&&K(a)===t&&!e.used.has(a))return a;let s=e&&yt(e).get(t);for(;s&&s.index<s.nodes.length;){let g=s.nodes[s.index++];if(!e.used.has(g)&&g.localName===n)return g}return i?xt(t):void 0}function yt(e){if(e.byKey)return e.byKey;e.byKey=new Map;for(let t of e.old){if(t.nodeType!==1)continue;let n=K(t),i=e.byKey.get(n);i||e.byKey.set(n,i={nodes:[],index:0}),i.nodes.push(t)}return e.byKey}function xt(e){if(h){if(!h.globalNodes){h.globalNodes=new Map;for(let t of T(h.root))h.globalNodes.set(K(t),t)}return h.globalNodes.get(e)}}function kt(e,t){let n=$[0]?.node;if(N?.root!==n&&(N={root:n,index:null,used:new Set}),!N.index){N.index=new Map;for(let a of T(n)){let s=K(a);N.index.has(s)||N.index.set(s,a)}}let i=N.index.get(e);if(!(!i||i.localName!==t||N.used.has(i)))return N.used.add(i),i}function G(e,t,n,i,a){let s=$.at(-1),g=e+(t?":"+t:""),E=!1,w=!1;if(x.length){let m=0;for(let S=0;S<x.length;S++)x[S].global&&(m=S,E=x[S].depth===$.length),x[S].explicit&&(w=x[S].depth===$.length);for(let S=m;S<x.length;S++){let z=x[S];g+=`:${z.explicit?"k":"c"}${z.value.length}:${z.value}`}}ne(s,g,E,w);let c=wt(s,g,n,E);if(a&&s?c??=kt(g,n):c&&h?.retained.add(c),s||(c=h?.root??document.querySelector(`[data-wutu-root="${e}"][data-wutu-prerender]`)),c?.hasAttribute("data-wutu-prerender")){c.removeAttribute("data-wutu-prerender");for(let m of[c,...c.querySelectorAll("[data-wutu-pending]")])!m.hasAttribute("data-wutu-pending")||m.parentNode?.closest("[data-wutu-lazy]")||(m.disabled=!1,m.removeAttribute("data-wutu-pending"))}return(!c||c.localName!==n)&&(c=i()),s&&s.used.add(c),s&&!a&&(s.wanted.push(c),s.appended?.add(c)),q.get(c)!==g&&(c.setAttribute("data-wutu",g),q.set(c,g)),s||(c.getAttribute("data-wutu-root")!==e&&c.setAttribute("data-wutu-root",e),h&&(h.root=c)),c}function oe(e,t,n){let i=v.get(e),a=i?null:new Set([...e.attributes].map(s=>s.name).filter(s=>n?n.has(s):!s.startsWith("data-wutu")&&!t.includes(s)));return $.push({node:e,meta:i,before:a,old:e.childNodes,used:new Set,wanted:[],attrs:null,byKey:null,keyed:null}),e}function St(e,t,n,i){return oe(G(n,i,e,()=>t?document.createElementNS("http://www.w3.org/2000/svg",e):document.createElement(e)),[])}let re=new WeakMap;function ie(e,t){let n=re.get(e);return n||re.set(e,n=$t(e,t)),n}function $t(e,t){let n=([i,a,...s],g)=>{g=g||i==="svg";let E=g?document.createElementNS("http://www.w3.org/2000/svg",i):document.createElement(i);for(let c in a)ae(E,c,a[c]);let w=g&&i!=="foreignObject";for(let c of s)E.append(typeof c=="string"?c:n(c,w));return E};return[n(e,t),Object.keys(e[1])]}function j(e){let t=$.at(-1),n=r.get(e);if(n||Array.isArray(e)||e?.nodeType===11){for(let s of n?y(n):Array.isArray(e)?e:[...e.childNodes])j(s);return}if(e?.nodeType){t.appended??=new Set(t.wanted),t.appended.has(e)||(t.appended.add(e),t.used.add(e),t.wanted.push(e)),h?.retained.add(e);return}let i=String(e??""),a=t.old[t.wanted.length];!a||a.nodeType!==3||t.used.has(a)?a=document.createTextNode(i):a.data!==i&&(a.data=i),t.used.add(a),t.wanted.push(a)}function D(e,t,n){if(($.at(-1).attrs??=new Set).add(t),n===null||n===!1||!se(e,t,n)){e.removeAttribute(t);return}let i=n===!0?"":String(n);e.getAttribute(t)!==i&&ae(e,t,i)}function ae(e,t,n){let i={xlink:"http://www.w3.org/1999/xlink",xml:"http://www.w3.org/XML/1998/namespace",xmlns:"http://www.w3.org/2000/xmlns/"}[t.split(":",1)[0]];i&&t.includes(":")?e.setAttributeNS(i,t,n):e.setAttribute(t,n)}let vt=new Set(["href","xlink:href","src","action","formaction","poster","cite","data","background","codebase","longdesc","manifest"]),At=new Set(["ping","srcset","imagesrcset"]);function se(e,t,n){return t=t.toLowerCase(),t==="srcdoc"?!1:n===!0?!0:(n=String(n),vt.has(t)?ce(e,t,n):At.has(t)?n.split(/[ ,]+/).every(i=>ce(e,t,i)):t!=="content"||e.localName!=="meta"||!/javascript:|vbscript:|data:/.test(le(n)))}function le(e,t=1/0){let n="";for(let i of e)if(i>" "&&(n+=i).length>=t)break;return n.toLowerCase()}function ce(e,t,n){let i=le(n,16),a=e.localName;return/^(java|vb)script:/.test(i)?!1:!i.startsWith("data:")||t==="href"&&(a==="a"||a==="area")&&e.hasAttribute("download")?!0:i.startsWith("data:image/svg")?a==="img"||a==="image":/^data:(image|audio|video)[/]/.test(i)}function Tt(e,t,n){se(e,t,n)?e[t]=n:e.removeAttribute(t.toLowerCase())}function ue(e,t,n){if(t==="mount"){if(A.has(e))return;A.add(e);let g=h;queueMicrotask(()=>{let E=C;C=[e,g];try{n(new Event("mount"))}finally{C=E}P(),g&&I(g)});return}let i=t[0]==="~";i&&(t=t.slice(1));let a=_.get(e);a||_.set(e,a=new Map);let s=a.get(t);s||(s={handlers:[],generation:-1,view:h},a.set(t,s),e.addEventListener(t,g=>{let E=!1,w=C;C=[e,s.view];try{for(let[c,m]of[...s.handlers]){m||(E=!0);let S=c(g);S?.then&&S.then(B,z=>{B(),setTimeout(()=>{throw z})})}}finally{C=w,E&&(P(),s.view&&I(s.view))}})),s.generation!==J&&(s.handlers=[],s.generation=J),s.handlers.push([n,i]),s.view=h}function de(){let e=$.pop(),t=e.node,n=e.attrs??ht;if(t.hasAttribute("data-wutu-unmanaged"))return e.meta||t.replaceChildren(),v.set(t,{...v.get(t),attrs:n}),t;let i=e.meta;for(let s of i?i.attrs:e.before)n.has(s)||t.removeAttribute(s);i?i.attrs=n:v.set(t,{attrs:n}),te(t,e.wanted);let a=ee.get(t);return a!==void 0&&t.value!==a&&(t.value=a),t}let fe=new Map,pe=["end"],b=null;function Et(e){let t=fe.get(e);if(!t){let n=2166136261;for(let i=0;i<e.length;i++)n=Math.imul(n^e.charCodeAt(i),16777619);fe.set(e,t=[JSON.parse(e),(n>>>0).toString(36)])}b={h:t[1],nodes:[],stack:[{ops:t[0],pc:0,kind:"top"}],outer:b,pending:null,depth:$.length,fragment:null}}let me=new WeakMap;function _t(e,t){let n=me.get(e);n||me.set(e,n=[]);let i=n[t];if(!i){i=n[t]=new Set;for(let a=t;a<e.length;a++){let[s,g]=e[a];if(s==="a"||s==="b")i.add(g);else if(s==="m")i.add("class");else if(s!=="n"&&s!=="y")break}}return i}function L(){for(;;){let e=b.stack.at(-1);if(e.pc>=e.ops.length){if(e.kind==="arm"){b.stack.pop();continue}return e.kind==="body"?pe:null}let t=e.ops[e.pc++];switch(t[0]){case"r":W();break;case"s":{let[n]=ie(t[2],!!t[3]);b.nodes[t[1]]=G(`v${b.h}:${t[1]}`,"",n.localName,()=>n.cloneNode(!0),$.length===b.depth);break}case"o":{let[n,i]=ie(t[2],!!t[3]);b.nodes[t[1]]=oe(G(`v${b.h}:${t[1]}`,"",n.localName,()=>n.cloneNode(!1),$.length===b.depth),i,_t(e.ops,e.pc));break}case"c":de();break;case"t":j(t[1]);break;default:return t}}}function Nt(e){if(b?.pending){b.pending=null,j(e),x.pop();return}if(!b){j(e),x.pop();return}let t=L(),n=$.at(-1)?.node;switch(t[0]){case"a":D(n,t[1],e);break;case"m":D(n,"class",t[1]+e);break;case"b":D(n,t[1],!!e);break;case"y":($.at(-1).attrs??=new Set).add("style"),n.style.setProperty(t[1],e);break;case"w":j(e);break;case"v":ue(b.nodes[t[1]],t[2],e);break;default:throw Error("Wutu: a value where the template has "+JSON.stringify(t?.[0]))}}function zt(){let e=L();x.push({value:`call:${b.h}:${e[1]}`,explicit:!1}),b.pending=e}function Wt(e){let t=L();b.stack.push({ops:e?t[1]:t[2],pc:0,kind:"arm"})}function ge(){let e=L();if(e!==pe)return[e,null];let t=b.stack.at(-1);return x.pop(),t.loop[1]===0&&x.pop(),[t.loop,t]}function Mt(e){let[t,n]=ge();n?n.pc=0:b.stack.push({ops:t[3],pc:0,kind:"body",loop:t});let i=String(e),a=t[1];a===0?(x.push({value:`loop:${b.h}:${t[2]}`,explicit:!1}),x.push({value:i,explicit:!1})):x.push({value:i,explicit:!0,global:a===2,depth:$.length})}function Ct(){let[,e]=ge();e&&b.stack.pop()}function It(){return b.nodes[L()[1]]}function jt(){for(;L()!==null;);let e=b.nodes[0];if(b.fragment){let t=$.pop(),n=b.fragment;if(te(n.start.parentNode,t.wanted,n),h&&(n.pending=t.wanted,(h.pendingRanges??=new Set).add(n)),e=n.value,b.depth===0)for(let i of t.wanted)i.nodeType===1&&i.setAttribute("data-wutu-root",`fragment:${b.h}`)}return b=b.outer,b||(N=null),e}function V(e){let t=[$,h,x,N,b],n=document.activeElement;e.cleanupIndex=0,e.cleanupCallbacks??=[],e.intervalsSeen=new Set,e.removals=new Set,e.pendingRanges=null,e.retained=new Set,e.globalNodes=null,e.globalClaims=new Set,$=[],h=e,x=[],N=null,J++;try{e.root=e.render();for(let i of e.cleanupCallbacks.splice(e.cleanupIndex))i();for(let[i,a]of e.effects)!a.node&&!e.intervalsSeen.has(i)&&(clearInterval(a.id),e.effects.delete(i));for(let i of e.removals)e.retained.has(i)||(H(i),i.remove());n?.isConnected&&document.activeElement!==n&&n.focus({preventScroll:!0})}finally{if([$,h,x,N,b]=t,e.globalNodes=null,e.pendingRanges)for(let i of e.pendingRanges)i.pending=null;e.pendingRanges=null,e.removals.clear(),e.retained.clear()}return e.root}function Lt(e,t=""){if(h&&!t)return e();if(t){let s=d.get(t)?.deref();if(s&&k(s.root))return s.dirty&&(s.dirty=!1,V(s)),s.root}let n={render:e,root:null,scope:t,dirty:!1,cleanupCallbacks:[],effects:new Map},i=V(n);u.add(new WeakRef(n)),t&&d.set(t,new WeakRef(n));let a=r.get(i)?.start??i;return v.set(a,{...v.get(a),view:n}),i}function he(){F=!1;let e=[...f];f.clear();for(let t of e)k(t.root)&&(t.dirty=!1,V(t));for(let t of p.splice(0))t()}function B(){for(let e of u){let t=e.deref();if(!t){u.delete(e);continue}k(t.root)&&f.add(t)}P(),he()}function I(e){e&&f.add(e),!F&&(F=!0,queueMicrotask(he))}function H(e){let t=v.get(e)?.view;if(t){for(let n of t.cleanupCallbacks.splice(0))n();for(let n of t.effects.values())clearInterval(n.id);t.effects.clear(),t.scope&&d.delete(t.scope)}for(let n of e.childNodes??[])H(n)}globalThis.addEventListener?.("hashchange",B),globalThis.addEventListener?.("popstate",B);let Y={enter:St,append:j,attr:D,url:Tt,listen:ue,leave:de,mount:Lt,refresh:B,invalidate:gt,selectValue:bt,here:M,put:Nt,begin:Et,slot:zt,arm:Wt,item:Mt,end:Ct,node:It,done:jt,nodes(e){let t=r.get(e);return t?y(t):Array.isArray(e)?e.flatMap(Y.nodes):e?.nodeType===11?[...e.childNodes]:[e]},storageError:"",notify(){for(let e of u){let t=e.deref();t&&k(t.root)&&I(t)}},interval(e,t,n){let[i,a]=h?[null,h]:C??[];if(!i){if(!a)return;a.intervalsSeen.add(e)}let s=a?.effects??mt,g=s.get(e);if(g?.node===i){g.callback=n;return}g&&clearInterval(g.id);let E={callback:n,id:0,node:i};E.id=setInterval(()=>{if(i&&!i.isConnected){clearInterval(E.id),s.delete(e);return}E.callback(),P(),I(a)},Math.max(16,t)),s.set(e,E)},memoHit(e){if(!e||!h)return!1;let t=h.memo?.get(M());return t?.key!==e||!k(t.node)?!1:(O=t.node,!0)},memoLast(){return O},memoKeep(e,t){e&&h&&(h.memo??=new Map).set(M(),{key:e,node:t})},after(e){p.push(e),I()},focus(e){p.push(()=>document.getElementById(e)?.focus()),I()},cleanup(e){h&&(h.cleanupCallbacks[h.cleanupIndex++]=e)},pushGlobal:e=>x.push({value:String(e),explicit:!0,global:!0,depth:$.length}),pushKey:e=>x.push({value:String(e),explicit:!0,depth:$.length}),pushCall:e=>x.push({value:e,explicit:!1}),popKey:()=>x.pop()};return Y})()}),je=(o=>()=>(r=>typeof r=="string"?r:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${r===null?"null":r instanceof Promise?"a Promise (await it: Promise[Str])":typeof r}`)})())(o()))(()=>location.hash.slice(1)||"/"),Le=((o,r,l)=>({top:o,left:r,behavior:l})),Re=((o,r,l)=>o[r](l)??null),Ue=((o,r)=>({block:o,inline:r})),Oe=((...o)=>globalThis.__wutuLazy("./start.utu","page",o)),Be=((...o)=>globalThis.__wutuLazy("./tour.utu","page",o)),qe=((...o)=>globalThis.__wutuLazy("./iterators.utu","page",o)),Pe=((...o)=>globalThis.__wutuLazy("./stdlib.utu","page",o)),Ke=((...o)=>globalThis.__wutuLazy("./javascript.utu","page",o)),De=((...o)=>globalThis.__wutuLazy("./data.utu","page",o)),Fe=((...o)=>globalThis.__wutuLazy("./web.utu","page",o)),Je=((...o)=>globalThis.__wutuLazy("./tooling.utu","page",o)),Ge=((...o)=>globalThis.__wutuLazy("./compiler.utu","page",o)),Ve=((...o)=>globalThis.__wutuLazy("./benchmarks.utu","page",o)),He=(o=>r=>(l=>typeof l=="string"?l:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${l===null?"null":l instanceof Promise?"a Promise (await it: Promise[Str])":typeof l}`)})())(o(r)))(o=>{try{if(!o)return"";let r=JSON.parse(o);if(r.version!==1||(r.data=(l=>l!==null&&typeof l=="object"&&!Array.isArray(l)?{...l,source:l.source}:l)(r.data),!(r.data!==null&&typeof r.data=="object"&&!Array.isArray(r.data)&&typeof r.data.source=="string")))throw Error("Stored schema mismatch");return JSON.stringify(r.data)}catch(r){return globalThis.__utuWutu.storageError=String(r.message??r),""}}),Ye=((o,r)=>(l=>typeof l=="string"?l:(()=>{throw new TypeError("expected string")})())(o[r])),Qe=(o=>({source:o})),Xe=((o,r)=>({version:o,data:r})),Ze=((o,r,l)=>import(new URL("./playground/playground.js?v=e82d5fb53b30",document.baseURI).href).then(y=>y.schedule(o,r,l)).catch(y=>l("Could not load the compiler",String(y),!0))),et=(()=>globalThis.__utuWutu.node()),tt=(o=>globalThis.__utuWutu.arm(o)),nt=(()=>{if(!document.getElementById("wutu-124igqj")){let o=document.createElement("style");o.id="wutu-124igqj",o.setAttribute("data-wutu-style",""),o.textContent=`.wa925av{display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:1rem;margin-block:1.5rem;inline-size:min(100%, 76rem);@media (width < 72rem){
                    grid-template-columns: minmax(0, 1fr);
                }}.w1on24p4{position:relative;block-size:36rem;background:var(--code-bg);@media (width < 72rem){
                        block-size: 26rem;
                    }}.w14u8av8{position:absolute;inset:0;margin:0;overflow:hidden;white-space:pre;pointer-events:none;}.wjbsjym{position:absolute;inset:0;inline-size:100%;block-size:100%;margin:0;padding:1.1rem 1.25rem;border:0;outline:none;resize:none;overflow:auto;white-space:pre;background:transparent;color:transparent;caret-color:var(--code-ink);font:400 0.84rem/1.65 "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;tab-size:4;@media (width < 40rem){
                            font-size: 0.78rem;
                            padding: 0.9rem 1rem;
                        }&::selection{
                            background: rgba(143, 214, 255, 0.3);
                            color: transparent;
                        }&:focus-visible{
                            box-shadow: inset 0 0 0 2px var(--orange);
                        }}.witmaio{display:grid;grid-template-rows:auto minmax(0, 1fr);block-size:36rem;border:1px solid var(--line);background:white;@media (width < 72rem){
                        block-size: 30rem;
                    }}.w176nekw{margin:0;padding:0.5rem 0.75rem;font-size:0.85rem;color:var(--muted);background:var(--bg);border-block-end:1px solid var(--line);&.failed{
                            color: var(--orange);
                            font-weight: 600;
                        }}.w18jcedk{inline-size:100%;block-size:100%;border:0;background:white;}.w1tku8aq{margin-block-start:0;inline-size:min(100%, 76rem);white-space:pre-wrap;}.wnoe2ce{padding:0.4rem 0.8rem;font:inherit;font-size:0.9rem;color:var(--ink);background:var(--tint);border:1px solid var(--line);cursor:pointer;}`,document.head.append(o)}}),ot=(o=>o instanceof globalThis.KeyboardEvent?o:null),rt=((o,r)=>o[r]()),it=((o,r,l,y,k,T)=>o[r](l,y,k,T)),at=((o,r)=>o[r]?1:0),st=(o=>r=>o(BigInt.asUintN(64,r)))(o=>globalThis.__utuWutu.item(o)),lt=(o=>globalThis.__utuWutu?.after(o)),ct=(()=>{(function(r){if(r.store)return;r.storageReviveF64=u=>u===null?0:u;let l=new Map,y=180,k;function T(u){let d=String(u.message??u);r.storageError!==d&&(r.storageError=d,r.notify())}function W(){clearTimeout(k),k=0;for(let[u,d]of l)if(!(!d.dirty||d.conflict))try{let f=d.encode();f!==d.last&&(localStorage.setItem(u,f),d.last=f),d.dirty=!1}catch(f){T(f)}}function v(u){let d=l.get(u);d&&(d.conflict=!1,d.dirty=!0,k||(k=setTimeout(W,y)))}r.flush=W,r.save=v,r.autoSave=()=>{for(let[u,d]of l)!d.manual&&!d.conflict&&v(u)},r.store=(u,d,f=!1,p=null)=>{let A=null;try{A=localStorage.getItem(u)}catch{}l.set(u,{encode:d,manual:f,apply:p,last:A,dirty:!1})},r.reload=u=>{let d=l.get(u);if(d)try{let f=localStorage.getItem(u);d.apply?.(f??""),d.last=f,d.dirty=!1,d.conflict=!1,r.storageError="",r.refresh()}catch(f){T(f)}};let _=(...u)=>globalThis.addEventListener?.(...u);_("pagehide",W),_("visibilitychange",()=>{document.visibilityState==="hidden"&&W()}),_("storage",u=>{for(let d of u.key===null?[...l.values()]:[l.get(u.key)])if(d){if(d.dirty){d.conflict=!0,clearTimeout(k),k=0,T("Unsaved local changes conflict with another tab. Reload or explicitly save to keep this tab.");continue}try{d.apply?.(u.newValue??""),d.last=u.newValue,r.storageError="",r.refresh()}catch(f){T(f)}}})})(globalThis.__utuWutu)}),ut=(o=>r=>(l=>typeof l=="string"?l:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${l===null?"null":l instanceof Promise?"a Promise (await it: Promise[Str])":typeof l}`)})())(o(r)))(o=>{try{return localStorage.getItem(o)??""}catch(r){return globalThis.__utuWutu.storageError=String(r.message??r),""}}),dt=(o=>(r,l,y,k)=>o(r,l,!!y,k))((o,r,l,y)=>globalThis.__utuWutu.store(o,r,!!l,y)),ft=(()=>globalThis.__utuWutu?.refresh());function pt(){let o=new Map,r=0;return Bt(),(l,y,k)=>{let T=(globalThis.__utuWutu?.here()??"")+"|"+l+"|"+y,W=T+"|"+k.map(p=>p!==null&&typeof p=="object"?"#":String(p)).join(""),v=o.get(T),_=v?.key===W&&v.args.length===k.length&&v.args.every((p,A)=>Object.is(p,k[A]));if(_&&!v.node.hasAttribute("data-wutu-lazy-error"))return v.node;let u=_?v.node:v?document.createElement("div"):[...document.querySelectorAll("[data-wutu-lazy]")].find(p=>p.getAttribute("data-wutu-lazy")===W)??document.createElement("div");u.setAttribute("data-wutu-lazy",W),u.removeAttribute("data-wutu-lazy-error"),o.set(T,{key:W,node:u,args:[...k]});let d=globalThis.__wutuChunks?.[l];if(!d)return console.error("Wutu: no chunk was built for "+l),u;let f=_?(v.tries??0)+1:0;return o.get(T).tries=f,r++,document.documentElement.setAttribute("data-wutu-loading",""),(f?import(d+"?retry="+f):import(d)).then(p=>{let A=p.exports?.[y];if(typeof A!="function")throw p.error??new Error("Wutu: chunk for "+l+" has no "+y);let O=A(...k);u.replaceChildren(...globalThis.__utuWutu?.nodes(O)??[O]);for(let M of u.querySelectorAll("[data-wutu-pending]"))M.closest("[data-wutu-lazy]")===u&&(M.disabled=!1,M.removeAttribute("data-wutu-pending"))}).catch(p=>{u.setAttribute("data-wutu-lazy-error",""),console.error(p)}).finally(()=>{--r===0&&document.documentElement.removeAttribute("data-wutu-loading")}),u}}function Bt(){if(typeof window>"u"||navigator.connection?.saveData)return;let o=l=>(window.requestIdleCallback??(y=>setTimeout(y,200)))(l,{timeout:3e3}),r=()=>o(async()=>{for(let l of new Set(Object.values(globalThis.__wutuChunks??{})))await import(l).catch(()=>{})});document.readyState==="complete"?r():window.addEventListener("load",r,{once:!0})}globalThis.__wutuChunks={...globalThis.__wutuChunks,"./start.utu":new URL("./chunks/start-7f5a4adeed/app.js",import.meta.url).href,"./tour.utu":new URL("./chunks/tour-e83684e7cd/app.js",import.meta.url).href,"./iterators.utu":new URL("./chunks/iterators-88f9b72dc3/app.js",import.meta.url).href,"./stdlib.utu":new URL("./chunks/stdlib-5b5beede5b/app.js",import.meta.url).href,"./javascript.utu":new URL("./chunks/javascript-9de6df9033/app.js",import.meta.url).href,"./data.utu":new URL("./chunks/data-bed871d60e/app.js",import.meta.url).href,"./web.utu":new URL("./chunks/web-4f75b4b98b/app.js",import.meta.url).href,"./tooling.utu":new URL("./chunks/tooling-c5e9b1a06d/app.js",import.meta.url).href,"./compiler.utu":new URL("./chunks/compiler-dcbbbac410/app.js",import.meta.url).href,"./benchmarks.utu":new URL("./chunks/benchmarks-56fbe63928/app.js",import.meta.url).href};globalThis.__wutuLazy??=pt();try{let{instance:o}=await WebAssembly.instantiateStreaming(fetch(new URL("./app.wasm?v=13d3b5864b15",import.meta.url)),{es:[ke,Q,X,Z,Se,Q,$e,ve,Ae,Te,Ee,_e,Ne,ze,We,Me,Ce,Ie,je,Le,Re,Ue,Oe,Be,qe,Pe,Ke,De,Fe,Je,Ge,Ve,He,Ye,Qe,Xe,Ze,et,tt,nt,Z,X,ot,rt,it,at,st,lt,ct,ut,dt,ft],utu:xe([{name:"records",kind:"U8",host:!0}],{closure_new:(l,y,k,T)=>we(l,y,k,T,["..b"]),closure_call_0:ye})},{builtins:["js-string"],importedStringConstants:"'"}),r=o.exports;document.querySelectorAll("[data-utu-static]").forEach(l=>l.remove()),await r.main?.(),document.documentElement.setAttribute("data-utu-ready","")}catch(o){document.documentElement.setAttribute("data-utu-error",String(o.message??o));let r=document.createElement("p");r.setAttribute("role","status"),r.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.",document.body.append(r),console.error(o)}
