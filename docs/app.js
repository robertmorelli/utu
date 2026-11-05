var Tt=Symbol("utu.closure");var se=new WeakMap,le=(n,r,s,y)=>{let b=r==null&&!(s&2),x=b&&se.get(n);if(x)return x;let v=b?(...u)=>n(...u):(...u)=>n(r,...u),k=s>>4&8191,$=s>>17&8191,f=k|$?(...u)=>{for(let c=0,p=k,T=$;p|T;c++,p>>=1,T>>=1)if(T&1&&u[c]===void 0)u[c]=null;else if(p&1&&u[c]==null)throw new TypeError(`Wrong type from JavaScript: a closure's argument ${c+1} is ${u[c]}`);return v(...u)}:v,d=s&1?(...u)=>!!f(...u):s&4?(...u)=>f(...u)>>>0:s&8?(...u)=>BigInt.asUintN(64,f(...u)):f;return d[Tt]=y,b&&se.set(n,d),d};var ce=(n,...r)=>n(...r);var ue=(n=>globalThis[n]),P=((n,r,s)=>n[r](s)),K=((n,r,s)=>{n[r]=s}),F=((n,r)=>n[r]),de=((n,r)=>globalThis[n](r)),fe=((n,r)=>globalThis.__utuWutu.mount(n,r)),pe=(n=>r=>n(r)?1:0)(n=>globalThis.__utuWutu.memoHit(n)),me=(n=>globalThis.__utuWutu.put(n)),ge=(()=>globalThis.__utuWutu.memoLast()),he=((n,r)=>globalThis.__utuWutu.memoKeep(n,r)),be=(()=>globalThis.__utuWutu.slot()),we=(n=>globalThis.__utuWutu.item(n)),ye=(()=>globalThis.__utuWutu.end()),xe=(n=>globalThis.__utuWutu.begin(n)),ke=(()=>globalThis.__utuWutu.done()),ve=(()=>{if(!document.getElementById("wutu-insj5b")){let n=document.createElement("style");n.id="wutu-insj5b",n.textContent=`@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap") layer(wutu.document);@layer wutu.document{
        
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
                }}.wu7hoyu{min-inline-size:0;}.w1nf506q{padding:1.5rem clamp(1rem, 4vw, 3rem) 3rem;border-block-start:1px solid var(--line);color:var(--muted);font-size:0.9rem;display:flex;flex-wrap:wrap;gap:0.5rem 2rem;justify-content:space-between;}`,document.head.append(n)}}),Se=(()=>{globalThis.__utuWutu??=(function(){let r=new WeakMap,s=new WeakMap,y=new Set,b=new Map,x=new Set,v=[],k=new WeakSet,$=null,f=()=>p.map(e=>e.value.length+":"+e.value).join("|"),d=new WeakMap,u=[],c=null,p=[],T=!1,R=0,z=null,ot=new Map,E=null;function j(){ae.autoSave?.()}function rt(e){let t=b.get(e)?.deref();t&&(t.dirty=!0,N(t))}let it=new Set,D=new WeakMap;function at(e,t){D.set(e,t),e.value!==t&&(e.value=t)}function L(e){let t=d.get(e);return t===void 0&&d.set(e,t=e.getAttribute("data-wutu")),t}function st(e,t){let o=e.childNodes;if(o.length===t.length){let g=!0;for(let _=0;g&&_<t.length;_++)g=o[_]===t[_];if(g)return}let i=document.activeElement,l=i&&"selectionStart"in i?[i.selectionStart,i.selectionEnd,i.selectionDirection]:null,a=e.firstChild;for(let g of t){if(g===a){a=a.nextSibling;continue}e.moveBefore&&g.parentNode===e?e.moveBefore(g,a):e.insertBefore(g,a)}let m=new Set(t);for(let g of[...e.childNodes])m.has(g)||(c?c.removals.add(g):(q(g),g.remove()));i?.isConnected&&document.activeElement!==i&&(i.focus({preventScroll:!0}),l?.[0]!=null&&i.setSelectionRange(...l))}function lt(e,t,o,i){if(o&&c){if(c.globalClaims.has(t))throw new Error("Duplicate global Wutu key: "+t);c.globalClaims.add(t)}if(i&&e){if(e.keyed??=new Set,e.keyed.has(t))throw new Error("Duplicate Wutu key: "+p.findLast(l=>l.explicit).value);e.keyed.add(t)}}function ct(e,t,o,i){let l=e?.old[e.wanted.length];if(l?.nodeType===1&&l.localName===o&&L(l)===t&&!e.used.has(l))return l;let a=e&&ut(e).get(t);for(;a&&a.index<a.nodes.length;){let m=a.nodes[a.index++];if(!e.used.has(m)&&m.localName===o)return m}return i?dt(t):void 0}function ut(e){if(e.byKey)return e.byKey;e.byKey=new Map;for(let t of e.old){if(t.nodeType!==1)continue;let o=L(t),i=e.byKey.get(o);i||e.byKey.set(o,i={nodes:[],index:0}),i.nodes.push(t)}return e.byKey}function dt(e){if(c){if(!c.globalNodes){c.globalNodes=new Map;for(let t of c.root?.querySelectorAll("[data-wutu]")??[])c.globalNodes.set(L(t),t)}return c.globalNodes.get(e)}}function ft(e,t){let o=u[0]?.node;if(E?.root!==o&&(E={root:o,index:null,used:new Set}),!E.index){E.index=new Map;for(let l of o?.querySelectorAll("[data-wutu]")??[]){let a=L(l);E.index.has(a)||E.index.set(a,l)}}let i=E.index.get(e);if(!(!i||i.localName!==t||E.used.has(i)))return E.used.add(i),i}function U(e,t,o,i,l){let a=u.at(-1),m=e+(t?":"+t:""),g=!1,_=!1;if(p.length){let A=0;for(let S=0;S<p.length;S++)p[S].global&&(A=S,g=p[S].depth===u.length),p[S].explicit&&(_=p[S].depth===u.length);for(let S=A;S<p.length;S++){let I=p[S];m+=`:${I.explicit?"k":"c"}${I.value.length}:${I.value}`}}lt(a,m,g,_);let h=ct(a,m,o,g);if(l&&a?h??=ft(m,o):h&&c?.retained.add(h),a||(h=c?.root??document.querySelector(`[data-wutu-root="${e}"][data-wutu-prerender]`)),h?.hasAttribute("data-wutu-prerender")){h.removeAttribute("data-wutu-prerender");for(let A of[h,...h.querySelectorAll("[data-wutu-pending]")])!A.hasAttribute("data-wutu-pending")||A.parentNode?.closest("[data-wutu-lazy]")||(A.disabled=!1,A.removeAttribute("data-wutu-pending"))}return(!h||h.localName!==o)&&(h=i()),a&&a.used.add(h),a&&!l&&a.wanted.push(h),d.get(h)!==m&&(h.setAttribute("data-wutu",m),d.set(h,m)),a||(h.getAttribute("data-wutu-root")!==e&&h.setAttribute("data-wutu-root",e),c&&(c.root=h)),h}function J(e,t,o){let i=r.get(e),l=i?null:new Set([...e.attributes].map(a=>a.name).filter(a=>o?o.has(a):!a.startsWith("data-wutu")&&!t.includes(a)));return u.push({node:e,meta:i,before:l,old:e.childNodes,used:new Set,wanted:[],attrs:null,byKey:null,keyed:null}),e}function pt(e,t,o,i){return J(U(o,i,e,()=>t?document.createElementNS("http://www.w3.org/2000/svg",e):document.createElement(e)),[])}let G=new WeakMap;function V(e,t){let o=G.get(e);return o||G.set(e,o=mt(e,t)),o}function mt(e,t){let o=([i,l,...a],m)=>{m=m||i==="svg";let g=m?document.createElementNS("http://www.w3.org/2000/svg",i):document.createElement(i);for(let h in l)H(g,h,l[h]);let _=m&&i!=="foreignObject";for(let h of a)g.append(typeof h=="string"?h:o(h,_));return g};return[o(e,t),Object.keys(e[1])]}function M(e){let t=u.at(-1);if(e?.nodeType){t.wanted.includes(e)||(t.used.add(e),t.wanted.push(e)),c?.retained.add(e);return}let o=String(e??""),i=t.old[t.wanted.length];!i||i.nodeType!==3||t.used.has(i)?i=document.createTextNode(o):i.data!==o&&(i.data=o),t.used.add(i),t.wanted.push(i)}function O(e,t,o){if((u.at(-1).attrs??=new Set).add(t),o===null||o===!1||!Y(e,t,o)){e.removeAttribute(t);return}let i=o===!0?"":String(o);e.getAttribute(t)!==i&&H(e,t,i)}function H(e,t,o){let i={xlink:"http://www.w3.org/1999/xlink",xml:"http://www.w3.org/XML/1998/namespace",xmlns:"http://www.w3.org/2000/xmlns/"}[t.split(":",1)[0]];i&&t.includes(":")?e.setAttributeNS(i,t,o):e.setAttribute(t,o)}let gt=new Set(["href","xlink:href","src","action","formaction","poster","cite","data","background","codebase","longdesc","manifest"]),ht=new Set(["ping","srcset","imagesrcset"]);function Y(e,t,o){return t=t.toLowerCase(),t==="srcdoc"?!1:o===!0?!0:(o=String(o),gt.has(t)?X(e,t,o):ht.has(t)?o.split(/[ ,]+/).every(i=>X(e,t,i)):t!=="content"||e.localName!=="meta"||!/javascript:|vbscript:|data:/.test(Q(o)))}function Q(e,t=1/0){let o="";for(let i of e)if(i>" "&&(o+=i).length>=t)break;return o.toLowerCase()}function X(e,t,o){let i=Q(o,16),l=e.localName;return/^(java|vb)script:/.test(i)?!1:!i.startsWith("data:")||t==="href"&&(l==="a"||l==="area")&&e.hasAttribute("download")?!0:i.startsWith("data:image/svg")?l==="img"||l==="image":/^data:(image|audio|video)[/]/.test(i)}function bt(e,t,o){Y(e,t,o)?e[t]=o:e.removeAttribute(t.toLowerCase())}function Z(e,t,o){if(t==="mount"){if(k.has(e))return;k.add(e);let m=c;queueMicrotask(()=>{let g=z;z=[e,m];try{o(new Event("mount"))}finally{z=g}j(),m&&N(m)});return}let i=t[0]==="~";i&&(t=t.slice(1));let l=s.get(e);l||s.set(e,l=new Map);let a=l.get(t);a||(a={handlers:[],generation:-1,view:c},l.set(t,a),e.addEventListener(t,m=>{let g=!1,_=z;z=[e,a.view];try{for(let[h,A]of[...a.handlers]){A||(g=!0);let S=h(m);S?.then&&S.then(C,I=>{C(),setTimeout(()=>{throw I})})}}finally{z=_,g&&(j(),a.view&&N(a.view))}})),a.generation!==R&&(a.handlers=[],a.generation=R),a.handlers.push([o,i]),a.view=c}function ee(){let e=u.pop(),t=e.node,o=e.attrs??it;if(t.hasAttribute("data-wutu-unmanaged"))return e.meta||t.replaceChildren(),r.set(t,{...r.get(t),attrs:o}),t;let i=e.meta;for(let a of i?i.attrs:e.before)o.has(a)||t.removeAttribute(a);i?i.attrs=o:r.set(t,{attrs:o}),st(t,e.wanted);let l=D.get(t);return l!==void 0&&t.value!==l&&(t.value=l),t}let te=new Map,ne=["end"],w=null;function wt(e){let t=te.get(e);if(!t){let o=2166136261;for(let i=0;i<e.length;i++)o=Math.imul(o^e.charCodeAt(i),16777619);te.set(e,t=[JSON.parse(e),(o>>>0).toString(36)])}w={h:t[1],nodes:[],stack:[{ops:t[0],pc:0,kind:"top"}],outer:w,pending:null}}let oe=new WeakMap;function yt(e,t){let o=oe.get(e);o||oe.set(e,o=[]);let i=o[t];if(!i){i=o[t]=new Set;for(let l=t;l<e.length;l++){let[a,m]=e[l];if(a==="a"||a==="b")i.add(m);else if(a==="m")i.add("class");else if(a!=="n"&&a!=="y")break}}return i}function W(){for(;;){let e=w.stack.at(-1);if(e.pc>=e.ops.length){if(e.kind==="arm"){w.stack.pop();continue}return e.kind==="body"?ne:null}let t=e.ops[e.pc++];switch(t[0]){case"s":{let[o]=V(t[2],!!t[3]);w.nodes[t[1]]=U(`v${w.h}:${t[1]}`,"",o.localName,()=>o.cloneNode(!0),t[1]===0);break}case"o":{let[o,i]=V(t[2],!!t[3]);w.nodes[t[1]]=J(U(`v${w.h}:${t[1]}`,"",o.localName,()=>o.cloneNode(!1),t[1]===0),i,yt(e.ops,e.pc));break}case"c":ee();break;case"t":M(t[1]);break;default:return t}}}function xt(e){if(w?.pending){w.pending=null,M(e),p.pop();return}if(!w){M(e),p.pop();return}let t=W(),o=u.at(-1)?.node;switch(t[0]){case"a":O(o,t[1],e);break;case"m":O(o,"class",t[1]+e);break;case"b":O(o,t[1],!!e);break;case"y":(u.at(-1).attrs??=new Set).add("style"),o.style.setProperty(t[1],e);break;case"w":M(e);break;case"v":Z(w.nodes[t[1]],t[2],e);break;default:throw new Error("Wutu: a value where the template has "+JSON.stringify(t?.[0]))}}function kt(){let e=W();p.push({value:`call:${w.h}:${e[1]}`,explicit:!1}),w.pending=e}function vt(e){let t=W();w.stack.push({ops:e?t[1]:t[2],pc:0,kind:"arm"})}function re(){let e=W();if(e!==ne)return[e,null];let t=w.stack.at(-1);return p.pop(),t.loop[1]===0&&p.pop(),[t.loop,t]}function St(e){let[t,o]=re();o?o.pc=0:w.stack.push({ops:t[3],pc:0,kind:"body",loop:t});let i=String(e),l=t[1];l===0?(p.push({value:`loop:${w.h}:${t[2]}`,explicit:!1}),p.push({value:i,explicit:!1})):p.push({value:i,explicit:!0,global:l===2,depth:u.length})}function $t(){let[,e]=re();e&&w.stack.pop()}function Et(){return w.nodes[W()[1]]}function _t(){for(;W()!==null;);let e=w.nodes[0];return w=w.outer,w||(E=null),e}function B(e){let t=[u,c,p,E],o=document.activeElement;e.cleanupIndex=0,e.cleanupCallbacks??=[],e.intervalsSeen=new Set,e.removals=new Set,e.retained=new Set,e.globalNodes=null,e.globalClaims=new Set,u=[],c=e,p=[],E=null,R++;try{e.root=e.render();for(let i of e.cleanupCallbacks.splice(e.cleanupIndex))i();for(let[i,l]of e.effects)!l.node&&!e.intervalsSeen.has(i)&&(clearInterval(l.id),e.effects.delete(i));for(let i of e.removals)e.retained.has(i)||(q(i),i.remove());o?.isConnected&&document.activeElement!==o&&o.focus({preventScroll:!0})}finally{[u,c,p,E]=t,e.globalNodes=null,e.removals.clear(),e.retained.clear()}return e.root}function At(e,t=""){if(c&&!t)return e();if(t){let l=b.get(t)?.deref();if(l?.root.isConnected)return l.dirty&&(l.dirty=!1,B(l)),l.root}let o={render:e,root:null,scope:t,dirty:!1,cleanupCallbacks:[],effects:new Map},i=B(o);return y.add(new WeakRef(o)),t&&b.set(t,new WeakRef(o)),r.set(i,{...r.get(i),view:o}),i}function ie(){T=!1;let e=[...x];x.clear();for(let t of e)t.root.isConnected&&(t.dirty=!1,B(t));for(let t of v.splice(0))t()}function C(){for(let e of y){let t=e.deref();if(!t){y.delete(e);continue}t.root.isConnected&&x.add(t)}j(),ie()}function N(e){e&&x.add(e),!T&&(T=!0,queueMicrotask(ie))}function q(e){let t=r.get(e)?.view;if(t){for(let o of t.cleanupCallbacks.splice(0))o();for(let o of t.effects.values())clearInterval(o.id);t.effects.clear(),t.scope&&b.delete(t.scope)}for(let o of e.children??[])q(o)}globalThis.addEventListener?.("hashchange",C),globalThis.addEventListener?.("popstate",C);let ae={enter:pt,append:M,attr:O,url:bt,listen:Z,leave:ee,mount:At,refresh:C,invalidate:rt,selectValue:at,here:f,put:xt,begin:wt,slot:kt,arm:vt,item:St,end:$t,node:Et,done:_t,storageError:"",notify(){for(let e of y){let t=e.deref();t?.root.isConnected&&N(t)}},interval(e,t,o){let[i,l]=c?[null,c]:z??[];if(!i){if(!l)return;l.intervalsSeen.add(e)}let a=l?.effects??ot,m=a.get(e);if(m?.node===i){m.callback=o;return}m&&clearInterval(m.id);let g={callback:o,id:0,node:i};g.id=setInterval(()=>{if(i&&!i.isConnected){clearInterval(g.id),a.delete(e);return}g.callback(),j(),N(l)},Math.max(16,t)),a.set(e,g)},memoHit(e){if(!e||!c)return!1;let t=c.memo?.get(f());return t?.key!==e||!t.node?.isConnected?!1:($=t.node,!0)},memoLast(){return $},memoKeep(e,t){e&&c&&(c.memo??=new Map).set(f(),{key:e,node:t})},after(e){v.push(e),N()},focus(e){v.push(()=>document.getElementById(e)?.focus()),N()},cleanup(e){c&&(c.cleanupCallbacks[c.cleanupIndex++]=e)},pushGlobal:e=>p.push({value:String(e),explicit:!0,global:!0,depth:u.length}),pushKey:e=>p.push({value:String(e),explicit:!0,depth:u.length}),pushCall:e=>p.push({value:e,explicit:!1}),popKey:()=>p.pop()};return ae})()}),$e=(n=>()=>(r=>typeof r=="string"?r:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${r===null?"null":r instanceof Promise?"a Promise (await it: Promise[Str])":typeof r}`)})())(n()))(()=>location.hash.slice(1)||"/"),Ee=((n,r,s)=>({top:n,left:r,behavior:s})),_e=((n,r,s)=>n[r](s)??null),Ae=((n,r)=>({block:n,inline:r})),Te=((...n)=>globalThis.__wutuLazy("./start.utu","page",n)),ze=((...n)=>globalThis.__wutuLazy("./tour.utu","page",n)),Ne=((...n)=>globalThis.__wutuLazy("./iterators.utu","page",n)),We=((...n)=>globalThis.__wutuLazy("./stdlib.utu","page",n)),Me=((...n)=>globalThis.__wutuLazy("./javascript.utu","page",n)),Ce=((...n)=>globalThis.__wutuLazy("./data.utu","page",n)),Ie=((...n)=>globalThis.__wutuLazy("./web.utu","page",n)),je=((...n)=>globalThis.__wutuLazy("./tooling.utu","page",n)),Le=((...n)=>globalThis.__wutuLazy("./compiler.utu","page",n)),Oe=((...n)=>globalThis.__wutuLazy("./benchmarks.utu","page",n)),Re=(n=>r=>(s=>typeof s=="string"?s:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${s===null?"null":s instanceof Promise?"a Promise (await it: Promise[Str])":typeof s}`)})())(n(r)))(n=>{try{if(!n)return"";let r=JSON.parse(n);if(r.version!==1||(r.data=r.data!==null&&typeof r.data=="object"&&!Array.isArray(r.data)?{...r.data,source:r.data.source}:r.data,!(r.data!==null&&typeof r.data=="object"&&!Array.isArray(r.data)&&typeof r.data.source=="string")))throw Error("Stored schema mismatch");return JSON.stringify(r.data)}catch(r){return globalThis.__utuWutu.storageError=String(r.message??r),""}}),Ue=((n,r)=>(s=>typeof s=="string"?s:(()=>{throw new TypeError("expected string")})())(n[r])),Be=(n=>({source:n})),qe=((n,r)=>({version:n,data:r})),Pe=((n,r,s)=>import(new URL("./playground/playground.js?v=6df1372c4534",document.baseURI).href).then(y=>y.schedule(n,r,s)).catch(y=>s("Could not load the compiler",String(y),!0))),Ke=(()=>globalThis.__utuWutu.node()),Fe=(n=>globalThis.__utuWutu.arm(n)),De=(()=>{if(!document.getElementById("wutu-124igqj")){let n=document.createElement("style");n.id="wutu-124igqj",n.textContent=`.wa925av{display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:1rem;margin-block:1.5rem;inline-size:min(100%, 76rem);@media (width < 72rem){
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
                        }}.w18jcedk{inline-size:100%;block-size:100%;border:0;background:white;}.w1tku8aq{margin-block-start:0;inline-size:min(100%, 76rem);white-space:pre-wrap;}.wnoe2ce{padding:0.4rem 0.8rem;font:inherit;font-size:0.9rem;color:var(--ink);background:var(--tint);border:1px solid var(--line);cursor:pointer;}`,document.head.append(n)}}),Je=(n=>n instanceof globalThis.KeyboardEvent?n:null),Ge=((n,r)=>n[r]()),Ve=((n,r,s,y,b,x)=>n[r](s,y,b,x)),He=((n,r)=>n[r]?1:0),Ye=(n=>r=>n(BigInt.asUintN(64,r)))(n=>globalThis.__utuWutu.item(n)),Qe=(n=>globalThis.__utuWutu?.after(n)),Xe=(()=>{(function(r){if(r.store)return;r.storageReviveF64=f=>f===null?0:f;let s=new Map,y=180,b;function x(f){let d=String(f.message??f);r.storageError!==d&&(r.storageError=d,r.notify())}function v(){clearTimeout(b),b=0;for(let[f,d]of s)if(!(!d.dirty||d.conflict))try{let u=d.encode();u!==d.last&&(localStorage.setItem(f,u),d.last=u),d.dirty=!1}catch(u){x(u)}}function k(f){let d=s.get(f);d&&(d.conflict=!1,d.dirty=!0,b||(b=setTimeout(v,y)))}r.flush=v,r.save=k,r.autoSave=()=>{for(let[f,d]of s)!d.manual&&!d.conflict&&k(f)},r.store=(f,d,u=!1,c=null)=>{let p=null;try{p=localStorage.getItem(f)}catch{}s.set(f,{encode:d,manual:u,apply:c,last:p,dirty:!1})},r.reload=f=>{let d=s.get(f);if(d)try{let u=localStorage.getItem(f);d.apply?.(u??""),d.last=u,d.dirty=!1,d.conflict=!1,r.storageError="",r.refresh()}catch(u){x(u)}};let $=(...f)=>globalThis.addEventListener?.(...f);$("pagehide",v),$("visibilitychange",()=>{document.visibilityState==="hidden"&&v()}),$("storage",f=>{for(let d of f.key===null?[...s.values()]:[s.get(f.key)])if(d){if(d.dirty){d.conflict=!0,clearTimeout(b),b=0,x("Unsaved local changes conflict with another tab. Reload or explicitly save to keep this tab.");continue}try{d.apply?.(f.newValue??""),d.last=f.newValue,r.refresh()}catch(u){x(u)}}})})(globalThis.__utuWutu)}),Ze=(n=>r=>(s=>typeof s=="string"?s:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${s===null?"null":s instanceof Promise?"a Promise (await it: Promise[Str])":typeof s}`)})())(n(r)))(n=>{try{return localStorage.getItem(n)??""}catch(r){return globalThis.__utuWutu.storageError=String(r.message??r),""}}),et=(n=>(r,s,y,b)=>n(r,s,!!y,b))((n,r,s,y)=>globalThis.__utuWutu.store(n,r,!!s,y)),tt=(()=>globalThis.__utuWutu?.refresh());function nt(){let n=new Map,r=0;return(s,y,b)=>{let x=(globalThis.__utuWutu?.here()??"")+"|"+s+"|"+y,v=x+"|"+b.map(c=>c!==null&&typeof c=="object"?"#":String(c)).join(""),k=n.get(x),$=k?.key===v&&k.args.length===b.length&&k.args.every((c,p)=>Object.is(c,b[p]));if($&&!k.node.hasAttribute("data-wutu-lazy-error"))return k.node;let f=$?k.node:k?document.createElement("div"):[...document.querySelectorAll("[data-wutu-lazy]")].find(c=>c.getAttribute("data-wutu-lazy")===v)??document.createElement("div");f.setAttribute("data-wutu-lazy",v),f.removeAttribute("data-wutu-lazy-error"),n.set(x,{key:v,node:f,args:[...b]});let d=globalThis.__wutuChunks?.[s];if(!d)return console.error("Wutu: no chunk was built for "+s),f;let u=$?(k.tries??0)+1:0;return n.get(x).tries=u,r++,document.documentElement.setAttribute("data-wutu-loading",""),(u?import(d+"?retry="+u):import(d)).then(c=>{let p=c.exports?.[y];if(typeof p!="function")throw c.error??new Error("Wutu: chunk for "+s+" has no "+y);f.replaceChildren(p(...b))}).catch(c=>{f.setAttribute("data-wutu-lazy-error",""),console.error(c)}).finally(()=>{--r===0&&document.documentElement.removeAttribute("data-wutu-loading")}),f}}globalThis.__wutuChunks={...globalThis.__wutuChunks,"./start.utu":new URL("./chunks/start-5f8ea07eb6/app.js",import.meta.url).href,"./tour.utu":new URL("./chunks/tour-6e4cdb4b2f/app.js",import.meta.url).href,"./iterators.utu":new URL("./chunks/iterators-b31d6f8672/app.js",import.meta.url).href,"./stdlib.utu":new URL("./chunks/stdlib-8fef2b51ac/app.js",import.meta.url).href,"./javascript.utu":new URL("./chunks/javascript-6c8a5ad502/app.js",import.meta.url).href,"./data.utu":new URL("./chunks/data-91ac11fcbd/app.js",import.meta.url).href,"./web.utu":new URL("./chunks/web-73ae936a4b/app.js",import.meta.url).href,"./tooling.utu":new URL("./chunks/tooling-aedc4ab8e4/app.js",import.meta.url).href,"./compiler.utu":new URL("./chunks/compiler-b36853bb11/app.js",import.meta.url).href,"./benchmarks.utu":new URL("./chunks/benchmarks-6c344eaa62/app.js",import.meta.url).href};globalThis.__wutuLazy??=nt();try{let{instance:n}=await WebAssembly.instantiateStreaming(fetch(new URL("./app.wasm?v=18e1168686c8",import.meta.url)),{es:[ue,P,K,F,de,P,fe,pe,me,ge,he,be,we,ye,xe,ke,ve,Se,$e,Ee,_e,Ae,Te,ze,Ne,We,Me,Ce,Ie,je,Le,Oe,Re,Ue,Be,qe,Pe,Ke,Fe,De,F,K,Je,Ge,Ve,He,Ye,Qe,Xe,Ze,et,tt],utu:{closure_new:le,closure_call_0:ce}},{builtins:["js-string"],importedStringConstants:"'"}),r=n.exports;document.querySelectorAll("[data-utu-static]").forEach(s=>s.remove()),await r.main?.(),document.documentElement.setAttribute("data-utu-ready","")}catch(n){document.documentElement.setAttribute("data-utu-error",String(n.message??n));let r=document.createElement("p");r.setAttribute("role","status"),r.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.",document.body.append(r),console.error(n)}
