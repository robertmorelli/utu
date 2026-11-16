var Tt=Symbol("utu.closure");var ae=new WeakMap,le=(n,r,s,b,w)=>{let x=r==null&&!(s&2),v=x&&ae.get(n);if(v)return v;let k=x?(...u)=>n(...u):(...u)=>n(r,...u),S=w?.[(s>>4)-1],d=S?(...u)=>{for(let a=0;a<S.length;a++){let p=S[a];if(p==="b")u[a]=u[a]?1:0;else if(p==="n")u[a]===void 0&&(u[a]=null);else if(p==="h"&&u[a]==null)throw new TypeError(`Wrong type from JavaScript: a closure's argument ${a+1} is ${u[a]}`)}return k(...u)}:k,f=s&1?(...u)=>!!d(...u):s&4?(...u)=>d(...u)>>>0:s&8?(...u)=>BigInt.asUintN(64,d(...u)):d;return f[Tt]=b,x&&ae.set(n,f),f};var ce=(n,...r)=>n(...r);var ue=(n=>globalThis[n]),q=((n,r,s)=>n[r](s)),K=((n,r,s)=>{n[r]=s}),D=((n,r)=>n[r]),fe=((n,r)=>globalThis[n](r)),de=((n,r)=>globalThis.__utuWutu.mount(n,r)),pe=(n=>r=>n(r)?1:0)(n=>globalThis.__utuWutu.memoHit(n)),me=(n=>globalThis.__utuWutu.put(n)),ge=(()=>globalThis.__utuWutu.memoLast()),he=((n,r)=>globalThis.__utuWutu.memoKeep(n,r)),be=(()=>globalThis.__utuWutu.slot()),we=(n=>globalThis.__utuWutu.item(n)),ye=(()=>globalThis.__utuWutu.end()),xe=(n=>globalThis.__utuWutu.begin(n)),ke=(()=>globalThis.__utuWutu.done()),ve=(()=>{if(!document.getElementById("wutu-insj5b")){let n=document.createElement("style");n.id="wutu-insj5b",n.textContent=`@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap") layer(wutu.document);@layer wutu.document{
        
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
                }}.wu7hoyu{min-inline-size:0;}.w1nf506q{padding:1.5rem clamp(1rem, 4vw, 3rem) 3rem;border-block-start:1px solid var(--line);color:var(--muted);font-size:0.9rem;display:flex;flex-wrap:wrap;gap:0.5rem 2rem;justify-content:space-between;}`,document.head.append(n)}}),Se=(()=>{globalThis.__utuWutu??=(function(){let r=new WeakMap,s=new WeakMap,b=new Set,w=new Map,x=new Set,v=[],k=new WeakSet,S=null,d=()=>p.map(e=>e.value.length+":"+e.value).join("|"),f=new WeakMap,u=[],a=null,p=[],O=!1,R=0,T=null,ot=new Map,E=null;function I(){se.autoSave?.()}function rt(e){let t=w.get(e)?.deref();t&&(t.dirty=!0,z(t))}let it=new Set,F=new WeakMap;function st(e,t){F.set(e,t),e.value!==t&&(e.value=t)}function j(e){let t=f.get(e);return t===void 0&&f.set(e,t=e.getAttribute("data-wutu")),t}function at(e,t){let o=e.childNodes;if(o.length===t.length){let g=!0;for(let _=0;g&&_<t.length;_++)g=o[_]===t[_];if(g)return}let i=document.activeElement,c=i&&"selectionStart"in i?[i.selectionStart,i.selectionEnd,i.selectionDirection]:null,l=e.firstChild;for(let g of t){if(g===l){l=l.nextSibling;continue}e.moveBefore&&g.parentNode===e?e.moveBefore(g,l):e.insertBefore(g,l)}let m=new Set(t);for(let g of[...e.childNodes])m.has(g)||(a?a.removals.add(g):(P(g),g.remove()));i?.isConnected&&document.activeElement!==i&&(i.focus({preventScroll:!0}),c?.[0]!=null&&i.setSelectionRange(...c))}function lt(e,t,o,i){if(o&&a){if(a.globalClaims.has(t))throw new Error("Duplicate global Wutu key: "+t);a.globalClaims.add(t)}if(i&&e){if(e.keyed??=new Set,e.keyed.has(t))throw new Error("Duplicate Wutu key: "+p.findLast(c=>c.explicit).value);e.keyed.add(t)}}function ct(e,t,o,i){let c=e?.old[e.wanted.length];if(c?.nodeType===1&&c.localName===o&&j(c)===t&&!e.used.has(c))return c;let l=e&&ut(e).get(t);for(;l&&l.index<l.nodes.length;){let m=l.nodes[l.index++];if(!e.used.has(m)&&m.localName===o)return m}return i?ft(t):void 0}function ut(e){if(e.byKey)return e.byKey;e.byKey=new Map;for(let t of e.old){if(t.nodeType!==1)continue;let o=j(t),i=e.byKey.get(o);i||e.byKey.set(o,i={nodes:[],index:0}),i.nodes.push(t)}return e.byKey}function ft(e){if(a){if(!a.globalNodes){a.globalNodes=new Map;for(let t of a.root?.querySelectorAll("[data-wutu]")??[])a.globalNodes.set(j(t),t)}return a.globalNodes.get(e)}}function dt(e,t){let o=u[0]?.node;if(E?.root!==o&&(E={root:o,index:null,used:new Set}),!E.index){E.index=new Map;for(let c of o?.querySelectorAll("[data-wutu]")??[]){let l=j(c);E.index.has(l)||E.index.set(l,c)}}let i=E.index.get(e);if(!(!i||i.localName!==t||E.used.has(i)))return E.used.add(i),i}function U(e,t,o,i,c){let l=u.at(-1),m=e+(t?":"+t:""),g=!1,_=!1;if(p.length){let A=0;for(let $=0;$<p.length;$++)p[$].global&&(A=$,g=p[$].depth===u.length),p[$].explicit&&(_=p[$].depth===u.length);for(let $=A;$<p.length;$++){let M=p[$];m+=`:${M.explicit?"k":"c"}${M.value.length}:${M.value}`}}lt(l,m,g,_);let h=ct(l,m,o,g);if(c&&l?h??=dt(m,o):h&&a?.retained.add(h),l||(h=a?.root??document.querySelector(`[data-wutu-root="${e}"][data-wutu-prerender]`)),h?.hasAttribute("data-wutu-prerender")){h.removeAttribute("data-wutu-prerender");for(let A of[h,...h.querySelectorAll("[data-wutu-pending]")])!A.hasAttribute("data-wutu-pending")||A.parentNode?.closest("[data-wutu-lazy]")||(A.disabled=!1,A.removeAttribute("data-wutu-pending"))}return(!h||h.localName!==o)&&(h=i()),l&&l.used.add(h),l&&!c&&l.wanted.push(h),f.get(h)!==m&&(h.setAttribute("data-wutu",m),f.set(h,m)),l||(h.getAttribute("data-wutu-root")!==e&&h.setAttribute("data-wutu-root",e),a&&(a.root=h)),h}function J(e,t,o){let i=r.get(e),c=i?null:new Set([...e.attributes].map(l=>l.name).filter(l=>o?o.has(l):!l.startsWith("data-wutu")&&!t.includes(l)));return u.push({node:e,meta:i,before:c,old:e.childNodes,used:new Set,wanted:[],attrs:null,byKey:null,keyed:null}),e}function pt(e,t,o,i){return J(U(o,i,e,()=>t?document.createElementNS("http://www.w3.org/2000/svg",e):document.createElement(e)),[])}let G=new WeakMap;function V(e,t){let o=G.get(e);return o||G.set(e,o=mt(e,t)),o}function mt(e,t){let o=([i,c,...l],m)=>{m=m||i==="svg";let g=m?document.createElementNS("http://www.w3.org/2000/svg",i):document.createElement(i);for(let h in c)H(g,h,c[h]);let _=m&&i!=="foreignObject";for(let h of l)g.append(typeof h=="string"?h:o(h,_));return g};return[o(e,t),Object.keys(e[1])]}function W(e){let t=u.at(-1);if(e?.nodeType){t.wanted.includes(e)||(t.used.add(e),t.wanted.push(e)),a?.retained.add(e);return}let o=String(e??""),i=t.old[t.wanted.length];!i||i.nodeType!==3||t.used.has(i)?i=document.createTextNode(o):i.data!==o&&(i.data=o),t.used.add(i),t.wanted.push(i)}function L(e,t,o){if((u.at(-1).attrs??=new Set).add(t),o===null||o===!1||!Y(e,t,o)){e.removeAttribute(t);return}let i=o===!0?"":String(o);e.getAttribute(t)!==i&&H(e,t,i)}function H(e,t,o){let i={xlink:"http://www.w3.org/1999/xlink",xml:"http://www.w3.org/XML/1998/namespace",xmlns:"http://www.w3.org/2000/xmlns/"}[t.split(":",1)[0]];i&&t.includes(":")?e.setAttributeNS(i,t,o):e.setAttribute(t,o)}let gt=new Set(["href","xlink:href","src","action","formaction","poster","cite","data","background","codebase","longdesc","manifest"]),ht=new Set(["ping","srcset","imagesrcset"]);function Y(e,t,o){return t=t.toLowerCase(),t==="srcdoc"?!1:o===!0?!0:(o=String(o),gt.has(t)?X(e,t,o):ht.has(t)?o.split(/[ ,]+/).every(i=>X(e,t,i)):t!=="content"||e.localName!=="meta"||!/javascript:|vbscript:|data:/.test(Q(o)))}function Q(e,t=1/0){let o="";for(let i of e)if(i>" "&&(o+=i).length>=t)break;return o.toLowerCase()}function X(e,t,o){let i=Q(o,16),c=e.localName;return/^(java|vb)script:/.test(i)?!1:!i.startsWith("data:")||t==="href"&&(c==="a"||c==="area")&&e.hasAttribute("download")?!0:i.startsWith("data:image/svg")?c==="img"||c==="image":/^data:(image|audio|video)[/]/.test(i)}function bt(e,t,o){Y(e,t,o)?e[t]=o:e.removeAttribute(t.toLowerCase())}function Z(e,t,o){if(t==="mount"){if(k.has(e))return;k.add(e);let m=a;queueMicrotask(()=>{let g=T;T=[e,m];try{o(new Event("mount"))}finally{T=g}I(),m&&z(m)});return}let i=t[0]==="~";i&&(t=t.slice(1));let c=s.get(e);c||s.set(e,c=new Map);let l=c.get(t);l||(l={handlers:[],generation:-1,view:a},c.set(t,l),e.addEventListener(t,m=>{let g=!1,_=T;T=[e,l.view];try{for(let[h,A]of[...l.handlers]){A||(g=!0);let $=h(m);$?.then&&$.then(C,M=>{C(),setTimeout(()=>{throw M})})}}finally{T=_,g&&(I(),l.view&&z(l.view))}})),l.generation!==R&&(l.handlers=[],l.generation=R),l.handlers.push([o,i]),l.view=a}function ee(){let e=u.pop(),t=e.node,o=e.attrs??it;if(t.hasAttribute("data-wutu-unmanaged"))return e.meta||t.replaceChildren(),r.set(t,{...r.get(t),attrs:o}),t;let i=e.meta;for(let l of i?i.attrs:e.before)o.has(l)||t.removeAttribute(l);i?i.attrs=o:r.set(t,{attrs:o}),at(t,e.wanted);let c=F.get(t);return c!==void 0&&t.value!==c&&(t.value=c),t}let te=new Map,ne=["end"],y=null;function wt(e){let t=te.get(e);if(!t){let o=2166136261;for(let i=0;i<e.length;i++)o=Math.imul(o^e.charCodeAt(i),16777619);te.set(e,t=[JSON.parse(e),(o>>>0).toString(36)])}y={h:t[1],nodes:[],stack:[{ops:t[0],pc:0,kind:"top"}],outer:y,pending:null}}let oe=new WeakMap;function yt(e,t){let o=oe.get(e);o||oe.set(e,o=[]);let i=o[t];if(!i){i=o[t]=new Set;for(let c=t;c<e.length;c++){let[l,m]=e[c];if(l==="a"||l==="b")i.add(m);else if(l==="m")i.add("class");else if(l!=="n"&&l!=="y")break}}return i}function N(){for(;;){let e=y.stack.at(-1);if(e.pc>=e.ops.length){if(e.kind==="arm"){y.stack.pop();continue}return e.kind==="body"?ne:null}let t=e.ops[e.pc++];switch(t[0]){case"s":{let[o]=V(t[2],!!t[3]);y.nodes[t[1]]=U(`v${y.h}:${t[1]}`,"",o.localName,()=>o.cloneNode(!0),t[1]===0);break}case"o":{let[o,i]=V(t[2],!!t[3]);y.nodes[t[1]]=J(U(`v${y.h}:${t[1]}`,"",o.localName,()=>o.cloneNode(!1),t[1]===0),i,yt(e.ops,e.pc));break}case"c":ee();break;case"t":W(t[1]);break;default:return t}}}function xt(e){if(y?.pending){y.pending=null,W(e),p.pop();return}if(!y){W(e),p.pop();return}let t=N(),o=u.at(-1)?.node;switch(t[0]){case"a":L(o,t[1],e);break;case"m":L(o,"class",t[1]+e);break;case"b":L(o,t[1],!!e);break;case"y":(u.at(-1).attrs??=new Set).add("style"),o.style.setProperty(t[1],e);break;case"w":W(e);break;case"v":Z(y.nodes[t[1]],t[2],e);break;default:throw new Error("Wutu: a value where the template has "+JSON.stringify(t?.[0]))}}function kt(){let e=N();p.push({value:`call:${y.h}:${e[1]}`,explicit:!1}),y.pending=e}function vt(e){let t=N();y.stack.push({ops:e?t[1]:t[2],pc:0,kind:"arm"})}function re(){let e=N();if(e!==ne)return[e,null];let t=y.stack.at(-1);return p.pop(),t.loop[1]===0&&p.pop(),[t.loop,t]}function St(e){let[t,o]=re();o?o.pc=0:y.stack.push({ops:t[3],pc:0,kind:"body",loop:t});let i=String(e),c=t[1];c===0?(p.push({value:`loop:${y.h}:${t[2]}`,explicit:!1}),p.push({value:i,explicit:!1})):p.push({value:i,explicit:!0,global:c===2,depth:u.length})}function $t(){let[,e]=re();e&&y.stack.pop()}function Et(){return y.nodes[N()[1]]}function _t(){for(;N()!==null;);let e=y.nodes[0];return y=y.outer,y||(E=null),e}function B(e){let t=[u,a,p,E],o=document.activeElement;e.cleanupIndex=0,e.cleanupCallbacks??=[],e.intervalsSeen=new Set,e.removals=new Set,e.retained=new Set,e.globalNodes=null,e.globalClaims=new Set,u=[],a=e,p=[],E=null,R++;try{e.root=e.render();for(let i of e.cleanupCallbacks.splice(e.cleanupIndex))i();for(let[i,c]of e.effects)!c.node&&!e.intervalsSeen.has(i)&&(clearInterval(c.id),e.effects.delete(i));for(let i of e.removals)e.retained.has(i)||(P(i),i.remove());o?.isConnected&&document.activeElement!==o&&o.focus({preventScroll:!0})}finally{[u,a,p,E]=t,e.globalNodes=null,e.removals.clear(),e.retained.clear()}return e.root}function At(e,t=""){if(a&&!t)return e();if(t){let c=w.get(t)?.deref();if(c?.root.isConnected)return c.dirty&&(c.dirty=!1,B(c)),c.root}let o={render:e,root:null,scope:t,dirty:!1,cleanupCallbacks:[],effects:new Map},i=B(o);return b.add(new WeakRef(o)),t&&w.set(t,new WeakRef(o)),r.set(i,{...r.get(i),view:o}),i}function ie(){O=!1;let e=[...x];x.clear();for(let t of e)t.root.isConnected&&(t.dirty=!1,B(t));for(let t of v.splice(0))t()}function C(){for(let e of b){let t=e.deref();if(!t){b.delete(e);continue}t.root.isConnected&&x.add(t)}I(),ie()}function z(e){e&&x.add(e),!O&&(O=!0,queueMicrotask(ie))}function P(e){let t=r.get(e)?.view;if(t){for(let o of t.cleanupCallbacks.splice(0))o();for(let o of t.effects.values())clearInterval(o.id);t.effects.clear(),t.scope&&w.delete(t.scope)}for(let o of e.children??[])P(o)}globalThis.addEventListener?.("hashchange",C),globalThis.addEventListener?.("popstate",C);let se={enter:pt,append:W,attr:L,url:bt,listen:Z,leave:ee,mount:At,refresh:C,invalidate:rt,selectValue:st,here:d,put:xt,begin:wt,slot:kt,arm:vt,item:St,end:$t,node:Et,done:_t,storageError:"",notify(){for(let e of b){let t=e.deref();t?.root.isConnected&&z(t)}},interval(e,t,o){let[i,c]=a?[null,a]:T??[];if(!i){if(!c)return;c.intervalsSeen.add(e)}let l=c?.effects??ot,m=l.get(e);if(m?.node===i){m.callback=o;return}m&&clearInterval(m.id);let g={callback:o,id:0,node:i};g.id=setInterval(()=>{if(i&&!i.isConnected){clearInterval(g.id),l.delete(e);return}g.callback(),I(),z(c)},Math.max(16,t)),l.set(e,g)},memoHit(e){if(!e||!a)return!1;let t=a.memo?.get(d());return t?.key!==e||!t.node?.isConnected?!1:(S=t.node,!0)},memoLast(){return S},memoKeep(e,t){e&&a&&(a.memo??=new Map).set(d(),{key:e,node:t})},after(e){v.push(e),z()},focus(e){v.push(()=>document.getElementById(e)?.focus()),z()},cleanup(e){a&&(a.cleanupCallbacks[a.cleanupIndex++]=e)},pushGlobal:e=>p.push({value:String(e),explicit:!0,global:!0,depth:u.length}),pushKey:e=>p.push({value:String(e),explicit:!0,depth:u.length}),pushCall:e=>p.push({value:e,explicit:!1}),popKey:()=>p.pop()};return se})()}),$e=(n=>()=>(r=>typeof r=="string"?r:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${r===null?"null":r instanceof Promise?"a Promise (await it: Promise[Str])":typeof r}`)})())(n()))(()=>location.hash.slice(1)||"/"),Ee=((n,r,s)=>({top:n,left:r,behavior:s})),_e=((n,r,s)=>n[r](s)??null),Ae=((n,r)=>({block:n,inline:r})),Te=((...n)=>globalThis.__wutuLazy("./start.utu","page",n)),ze=((...n)=>globalThis.__wutuLazy("./tour.utu","page",n)),Ne=((...n)=>globalThis.__wutuLazy("./iterators.utu","page",n)),We=((...n)=>globalThis.__wutuLazy("./stdlib.utu","page",n)),Ce=((...n)=>globalThis.__wutuLazy("./javascript.utu","page",n)),Me=((...n)=>globalThis.__wutuLazy("./data.utu","page",n)),Ie=((...n)=>globalThis.__wutuLazy("./web.utu","page",n)),je=((...n)=>globalThis.__wutuLazy("./tooling.utu","page",n)),Le=((...n)=>globalThis.__wutuLazy("./compiler.utu","page",n)),Oe=((...n)=>globalThis.__wutuLazy("./benchmarks.utu","page",n)),Re=(n=>r=>(s=>typeof s=="string"?s:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${s===null?"null":s instanceof Promise?"a Promise (await it: Promise[Str])":typeof s}`)})())(n(r)))(n=>{try{if(!n)return"";let r=JSON.parse(n);if(r.version!==1||(r.data=(s=>s!==null&&typeof s=="object"&&!Array.isArray(s)?{...s,source:s.source}:s)(r.data),!(r.data!==null&&typeof r.data=="object"&&!Array.isArray(r.data)&&typeof r.data.source=="string")))throw Error("Stored schema mismatch");return JSON.stringify(r.data)}catch(r){return globalThis.__utuWutu.storageError=String(r.message??r),""}}),Ue=((n,r)=>(s=>typeof s=="string"?s:(()=>{throw new TypeError("expected string")})())(n[r])),Be=(n=>({source:n})),Pe=((n,r)=>({version:n,data:r})),qe=((n,r,s)=>import(new URL("./playground/playground.js?v=2cff091b8f68",document.baseURI).href).then(b=>b.schedule(n,r,s)).catch(b=>s("Could not load the compiler",String(b),!0))),Ke=(()=>globalThis.__utuWutu.node()),De=(n=>globalThis.__utuWutu.arm(n)),Fe=(()=>{if(!document.getElementById("wutu-124igqj")){let n=document.createElement("style");n.id="wutu-124igqj",n.textContent=`.wa925av{display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:1rem;margin-block:1.5rem;inline-size:min(100%, 76rem);@media (width < 72rem){
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
                        }}.w18jcedk{inline-size:100%;block-size:100%;border:0;background:white;}.w1tku8aq{margin-block-start:0;inline-size:min(100%, 76rem);white-space:pre-wrap;}.wnoe2ce{padding:0.4rem 0.8rem;font:inherit;font-size:0.9rem;color:var(--ink);background:var(--tint);border:1px solid var(--line);cursor:pointer;}`,document.head.append(n)}}),Je=(n=>n instanceof globalThis.KeyboardEvent?n:null),Ge=((n,r)=>n[r]()),Ve=((n,r,s,b,w,x)=>n[r](s,b,w,x)),He=((n,r)=>n[r]?1:0),Ye=(n=>r=>n(BigInt.asUintN(64,r)))(n=>globalThis.__utuWutu.item(n)),Qe=(n=>globalThis.__utuWutu?.after(n)),Xe=(()=>{(function(r){if(r.store)return;r.storageReviveF64=d=>d===null?0:d;let s=new Map,b=180,w;function x(d){let f=String(d.message??d);r.storageError!==f&&(r.storageError=f,r.notify())}function v(){clearTimeout(w),w=0;for(let[d,f]of s)if(!(!f.dirty||f.conflict))try{let u=f.encode();u!==f.last&&(localStorage.setItem(d,u),f.last=u),f.dirty=!1}catch(u){x(u)}}function k(d){let f=s.get(d);f&&(f.conflict=!1,f.dirty=!0,w||(w=setTimeout(v,b)))}r.flush=v,r.save=k,r.autoSave=()=>{for(let[d,f]of s)!f.manual&&!f.conflict&&k(d)},r.store=(d,f,u=!1,a=null)=>{let p=null;try{p=localStorage.getItem(d)}catch{}s.set(d,{encode:f,manual:u,apply:a,last:p,dirty:!1})},r.reload=d=>{let f=s.get(d);if(f)try{let u=localStorage.getItem(d);f.apply?.(u??""),f.last=u,f.dirty=!1,f.conflict=!1,r.storageError="",r.refresh()}catch(u){x(u)}};let S=(...d)=>globalThis.addEventListener?.(...d);S("pagehide",v),S("visibilitychange",()=>{document.visibilityState==="hidden"&&v()}),S("storage",d=>{for(let f of d.key===null?[...s.values()]:[s.get(d.key)])if(f){if(f.dirty){f.conflict=!0,clearTimeout(w),w=0,x("Unsaved local changes conflict with another tab. Reload or explicitly save to keep this tab.");continue}try{f.apply?.(d.newValue??""),f.last=d.newValue,r.storageError="",r.refresh()}catch(u){x(u)}}})})(globalThis.__utuWutu)}),Ze=(n=>r=>(s=>typeof s=="string"?s:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${s===null?"null":s instanceof Promise?"a Promise (await it: Promise[Str])":typeof s}`)})())(n(r)))(n=>{try{return localStorage.getItem(n)??""}catch(r){return globalThis.__utuWutu.storageError=String(r.message??r),""}}),et=(n=>(r,s,b,w)=>n(r,s,!!b,w))((n,r,s,b)=>globalThis.__utuWutu.store(n,r,!!s,b)),tt=(()=>globalThis.__utuWutu?.refresh());function nt(){let n=new Map,r=0;return zt(),(s,b,w)=>{let x=(globalThis.__utuWutu?.here()??"")+"|"+s+"|"+b,v=x+"|"+w.map(a=>a!==null&&typeof a=="object"?"#":String(a)).join(""),k=n.get(x),S=k?.key===v&&k.args.length===w.length&&k.args.every((a,p)=>Object.is(a,w[p]));if(S&&!k.node.hasAttribute("data-wutu-lazy-error"))return k.node;let d=S?k.node:k?document.createElement("div"):[...document.querySelectorAll("[data-wutu-lazy]")].find(a=>a.getAttribute("data-wutu-lazy")===v)??document.createElement("div");d.setAttribute("data-wutu-lazy",v),d.removeAttribute("data-wutu-lazy-error"),n.set(x,{key:v,node:d,args:[...w]});let f=globalThis.__wutuChunks?.[s];if(!f)return console.error("Wutu: no chunk was built for "+s),d;let u=S?(k.tries??0)+1:0;return n.get(x).tries=u,r++,document.documentElement.setAttribute("data-wutu-loading",""),(u?import(f+"?retry="+u):import(f)).then(a=>{let p=a.exports?.[b];if(typeof p!="function")throw a.error??new Error("Wutu: chunk for "+s+" has no "+b);d.replaceChildren(p(...w))}).catch(a=>{d.setAttribute("data-wutu-lazy-error",""),console.error(a)}).finally(()=>{--r===0&&document.documentElement.removeAttribute("data-wutu-loading")}),d}}function zt(){if(typeof window>"u"||navigator.connection?.saveData)return;let n=s=>(window.requestIdleCallback??(b=>setTimeout(b,200)))(s,{timeout:3e3}),r=()=>n(async()=>{for(let s of new Set(Object.values(globalThis.__wutuChunks??{})))await import(s).catch(()=>{})});document.readyState==="complete"?r():window.addEventListener("load",r,{once:!0})}globalThis.__wutuChunks={...globalThis.__wutuChunks,"./start.utu":new URL("./chunks/start-e86bb377fd/app.js",import.meta.url).href,"./tour.utu":new URL("./chunks/tour-4df61ea077/app.js",import.meta.url).href,"./iterators.utu":new URL("./chunks/iterators-1011c789a5/app.js",import.meta.url).href,"./stdlib.utu":new URL("./chunks/stdlib-26ff564486/app.js",import.meta.url).href,"./javascript.utu":new URL("./chunks/javascript-c2899633ca/app.js",import.meta.url).href,"./data.utu":new URL("./chunks/data-23ebb05460/app.js",import.meta.url).href,"./web.utu":new URL("./chunks/web-22769560ca/app.js",import.meta.url).href,"./tooling.utu":new URL("./chunks/tooling-754967ef69/app.js",import.meta.url).href,"./compiler.utu":new URL("./chunks/compiler-dbd68c57de/app.js",import.meta.url).href,"./benchmarks.utu":new URL("./chunks/benchmarks-eaeb563a4f/app.js",import.meta.url).href};globalThis.__wutuLazy??=nt();try{let{instance:n}=await WebAssembly.instantiateStreaming(fetch(new URL("./app.wasm?v=47e615103d62",import.meta.url)),{es:[ue,q,K,D,fe,q,de,pe,me,ge,he,be,we,ye,xe,ke,ve,Se,$e,Ee,_e,Ae,Te,ze,Ne,We,Ce,Me,Ie,je,Le,Oe,Re,Ue,Be,Pe,qe,Ke,De,Fe,D,K,Je,Ge,Ve,He,Ye,Qe,Xe,Ze,et,tt],utu:{closure_new:(s,b,w,x)=>le(s,b,w,x,["..b"]),closure_call_0:ce}},{builtins:["js-string"],importedStringConstants:"'"}),r=n.exports;document.querySelectorAll("[data-utu-static]").forEach(s=>s.remove()),await r.main?.(),document.documentElement.setAttribute("data-utu-ready","")}catch(n){document.documentElement.setAttribute("data-utu-error",String(n.message??n));let r=document.createElement("p");r.setAttribute("role","status"),r.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.",document.body.append(r),console.error(n)}
