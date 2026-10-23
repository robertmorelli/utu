var gt=Symbol("utu.closure");var ee=(n,o,a,b)=>{let k=o==null&&!(a&2)?(...w)=>n(...w):(...w)=>n(o,...w),x=a&1?(...w)=>!!k(...w):k;return x[gt]=b,x};var te=(n,...o)=>n(...o);var ne=(n=>globalThis[n]),U=((n,o,a)=>n[o](a)),B=((n,o,a)=>{n[o]=a}),P=((n,o)=>n[o]),oe=((n,o)=>globalThis[n](o)),re=((n,o)=>globalThis.__utuWutu.mount(n,o)),ie=(n=>o=>n(o)?1:0)(n=>globalThis.__utuWutu.memoHit(n)),ae=(n=>globalThis.__utuWutu.put(n)),se=(()=>globalThis.__utuWutu.memoLast()),le=((n,o)=>globalThis.__utuWutu.memoKeep(n,o)),ce=(()=>globalThis.__utuWutu.slot()),ue=(n=>globalThis.__utuWutu.item(n)),de=(()=>globalThis.__utuWutu.end()),fe=(n=>globalThis.__utuWutu.begin(n)),pe=(()=>globalThis.__utuWutu.done()),me=(()=>{if(!document.getElementById("wutu-insj5b")){let n=document.createElement("style");n.id="wutu-insj5b",n.textContent=`@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap") layer(wutu.document);@layer wutu.document{
        
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
                }}.wu7hoyu{min-inline-size:0;}.w1nf506q{padding:1.5rem clamp(1rem, 4vw, 3rem) 3rem;border-block-start:1px solid var(--line);color:var(--muted);font-size:0.9rem;display:flex;flex-wrap:wrap;gap:0.5rem 2rem;justify-content:space-between;}`,document.head.append(n)}}),ge=(()=>{globalThis.__utuWutu??=(function(){let o=new WeakMap,a=new WeakMap,b=new Set,k=new Map,x=new Set,w=[],_=new WeakSet,$=null,f=()=>p.map(e=>e.value.length+":"+e.value).join("|"),u=new WeakMap,c=[],d=null,p=[],C=!1,I=0;function W(){Z.autoSave?.()}function He(e){let t=k.get(e)?.deref();t&&(t.dirty=!0,E(t))}let Ye=new Set,q=new WeakMap;function Qe(e,t){q.set(e,t),e.value!==t&&(e.value=t)}function j(e){let t=u.get(e);return t===void 0&&u.set(e,t=e.getAttribute("data-wutu")),t}function Xe(e,t){let r=e.childNodes;if(r.length===t.length){let h=!0;for(let m=0;h&&m<t.length;m++)h=r[m]===t[m];if(h)return}let i=document.activeElement,l=i&&"selectionStart"in i?[i.selectionStart,i.selectionEnd,i.selectionDirection]:null,s=e.firstChild;for(let h of t){if(h===s){s=s.nextSibling;continue}e.moveBefore&&h.parentNode===e?e.moveBefore(h,s):e.insertBefore(h,s)}let y=new Set(t);for(let h of[...e.childNodes])y.has(h)||(d?d.removals.add(h):(R(h),h.remove()));i?.isConnected&&document.activeElement!==i&&(i.focus({preventScroll:!0}),l?.[0]!=null&&i.setSelectionRange(...l))}function Ze(e,t,r,i){if(r&&d){if(d.globalClaims.has(t))throw new Error("Duplicate global Wutu key: "+t);d.globalClaims.add(t)}if(i&&e){if(e.keyed??=new Set,e.keyed.has(t))throw new Error("Duplicate Wutu key: "+p.findLast(l=>l.explicit).value);e.keyed.add(t)}}function et(e,t,r,i){let l=e?.old[e.wanted.length];if(l?.nodeType===1&&l.localName===r&&j(l)===t&&!e.used.has(l))return l;let s=e&&tt(e).get(t);for(;s&&s.index<s.nodes.length;){let y=s.nodes[s.index++];if(!e.used.has(y)&&y.localName===r)return y}return i?nt(t):void 0}function tt(e){if(e.byKey)return e.byKey;e.byKey=new Map;for(let t of e.old){if(t.nodeType!==1)continue;let r=j(t),i=e.byKey.get(r);i||e.byKey.set(r,i={nodes:[],index:0}),i.nodes.push(t)}return e.byKey}function nt(e){if(d){if(!d.globalNodes){d.globalNodes=new Map;for(let t of d.root?.querySelectorAll("[data-wutu]")??[])d.globalNodes.set(j(t),t)}return d.globalNodes.get(e)}}function L(e,t,r,i){let l=c.at(-1),s=e+(t?":"+t:""),y=!1,h=!1;if(p.length){let v=0;for(let S=0;S<p.length;S++)p[S].global&&(v=S,y=p[S].depth===c.length),p[S].explicit&&(h=p[S].depth===c.length);for(let S=v;S<p.length;S++){let N=p[S];s+=`:${N.explicit?"k":"c"}${N.value.length}:${N.value}`}}Ze(l,s,y,h);let m=et(l,s,r,y);if(m&&d?.retained.add(m),l||(m=d?.root??document.querySelector(`[data-wutu-root="${e}"][data-wutu-prerender]`)),m?.hasAttribute("data-wutu-prerender")){m.removeAttribute("data-wutu-prerender");for(let v of[m,...m.querySelectorAll("[data-wutu-pending]")])!v.hasAttribute("data-wutu-pending")||v.parentNode?.closest("[data-wutu-lazy]")||(v.disabled=!1,v.removeAttribute("data-wutu-pending"))}return(!m||m.localName!==r)&&(m=i()),l&&(l.used.add(m),l.wanted.push(m)),u.get(m)!==s&&(m.setAttribute("data-wutu",s),u.set(m,s)),l||(m.getAttribute("data-wutu-root")!==e&&m.setAttribute("data-wutu-root",e),d&&(d.root=m)),m}function K(e,t,r){let i=o.get(e),l=i?null:new Set([...e.attributes].map(s=>s.name).filter(s=>r?r.has(s):!s.startsWith("data-wutu")&&!t.includes(s)));return c.push({node:e,meta:i,before:l,old:e.childNodes,used:new Set,wanted:[],attrs:null,byKey:null,keyed:null}),e}function ot(e,t,r,i){return K(L(r,i,e,()=>t?document.createElementNS("http://www.w3.org/2000/svg",e):document.createElement(e)),[])}let D=new WeakMap;function J(e,t){let r=D.get(e);return r||D.set(e,r=rt(e,t)),r}function rt(e,t){let r=([i,l,...s],y)=>{y=y||i==="svg";let h=y?document.createElementNS("http://www.w3.org/2000/svg",i):document.createElement(i);for(let v in l)h.setAttribute(v,l[v]);let m=y&&i!=="foreignObject";for(let v of s)h.append(typeof v=="string"?v:r(v,m));return h};return[r(e,t),Object.keys(e[1])]}function T(e){let t=c.at(-1);if(e?.nodeType){t.wanted.includes(e)||(t.used.add(e),t.wanted.push(e));return}let r=String(e??""),i=t.old[t.wanted.length];!i||i.nodeType!==3||t.used.has(i)?i=document.createTextNode(r):i.data!==r&&(i.data=r),t.used.add(i),t.wanted.push(i)}function M(e,t,r){if((c.at(-1).attrs??=new Set).add(t),r===null||r===!1){e.removeAttribute(t);return}let i=r===!0?"":String(r);e.getAttribute(t)!==i&&e.setAttribute(t,i)}function F(e,t,r){if(t==="mount"){if(_.has(e))return;_.add(e);let y=d;queueMicrotask(()=>{r(new Event("mount")),W(),y&&E(y)});return}let i=t[0]==="~";i&&(t=t.slice(1));let l=a.get(e);l||a.set(e,l=new Map);let s=l.get(t);s||(s={handlers:[],generation:-1,view:d},l.set(t,s),e.addEventListener(t,y=>{let h=!1;try{for(let[m,v]of[...s.handlers]){v||(h=!0);let S=m(y);S?.then&&S.then(A,N=>{A(),setTimeout(()=>{throw N})})}}finally{h&&(W(),s.view&&E(s.view))}})),s.generation!==I&&(s.handlers=[],s.generation=I),s.handlers.push([r,i]),s.view=d}function G(){let e=c.pop(),t=e.node,r=e.attrs??Ye;if(t.hasAttribute("data-wutu-unmanaged"))return e.meta||t.replaceChildren(),o.set(t,{...o.get(t),attrs:r}),t;let i=e.meta;for(let s of i?i.attrs:e.before)r.has(s)||t.removeAttribute(s);i?i.attrs=r:o.set(t,{attrs:r}),Xe(t,e.wanted);let l=q.get(t);return l!==void 0&&t.value!==l&&(t.value=l),t}let V=new Map,H=["end"],g=null;function it(e){let t=V.get(e);if(!t){let r=2166136261;for(let i=0;i<e.length;i++)r=Math.imul(r^e.charCodeAt(i),16777619);V.set(e,t=[JSON.parse(e),(r>>>0).toString(36)])}g={h:t[1],nodes:[],stack:[{ops:t[0],pc:0,kind:"top"}],outer:g,pending:null}}let Y=new WeakMap;function at(e,t){let r=Y.get(e);r||Y.set(e,r=[]);let i=r[t];if(!i){i=r[t]=new Set;for(let l=t;l<e.length;l++){let[s,y]=e[l];if(s==="a"||s==="b")i.add(y);else if(s==="m")i.add("class");else if(s!=="n"&&s!=="y")break}}return i}function z(){for(;;){let e=g.stack.at(-1);if(e.pc>=e.ops.length){if(e.kind==="arm"){g.stack.pop();continue}return e.kind==="body"?H:null}let t=e.ops[e.pc++];switch(t[0]){case"s":{let[r]=J(t[2],!!t[3]);g.nodes[t[1]]=L(`v${g.h}:${t[1]}`,"",r.localName,()=>r.cloneNode(!0));break}case"o":{let[r,i]=J(t[2],!!t[3]);g.nodes[t[1]]=K(L(`v${g.h}:${t[1]}`,"",r.localName,()=>r.cloneNode(!1)),i,at(e.ops,e.pc));break}case"c":G();break;case"t":T(t[1]);break;default:return t}}}function st(e){if(g?.pending){g.pending=null,T(e),p.pop();return}if(!g){T(e),p.pop();return}let t=z(),r=c.at(-1)?.node;switch(t[0]){case"a":M(r,t[1],e);break;case"m":M(r,"class",t[1]+e);break;case"b":M(r,t[1],!!e);break;case"y":(c.at(-1).attrs??=new Set).add("style"),r.style.setProperty(t[1],e);break;case"w":T(e);break;case"v":F(g.nodes[t[1]],t[2],e);break;default:throw new Error("Wutu: a value where the template has "+JSON.stringify(t?.[0]))}}function lt(){let e=z();p.push({value:`call:${g.h}:${e[1]}`,explicit:!1}),g.pending=e}function ct(e){let t=z();g.stack.push({ops:e?t[1]:t[2],pc:0,kind:"arm"})}function Q(){let e=z();if(e!==H)return[e,null];let t=g.stack.at(-1);return p.pop(),t.loop[1]===0&&p.pop(),[t.loop,t]}function ut(e){let[t,r]=Q();r?r.pc=0:g.stack.push({ops:t[3],pc:0,kind:"body",loop:t});let i=String(e),l=t[1];l===0?(p.push({value:`loop:${g.h}:${t[2]}`,explicit:!1}),p.push({value:i,explicit:!1})):p.push({value:i,explicit:!0,global:l===2,depth:c.length})}function dt(){let[,e]=Q();e&&g.stack.pop()}function ft(){return g.nodes[z()[1]]}function pt(){for(;z()!==null;);let e=g.nodes[0];return g=g.outer,e}function O(e){let t=[c,d,p],r=document.activeElement;e.cleanupIndex=0,e.cleanupCallbacks??=[],e.intervalsSeen=new Set,e.removals=new Set,e.retained=new Set,e.globalNodes=null,e.globalClaims=new Set,c=[],d=e,p=[],I++;try{e.root=e.render();for(let i of e.cleanupCallbacks.splice(e.cleanupIndex))i();for(let[i,l]of e.effects)e.intervalsSeen.has(i)||(clearInterval(l.id),e.effects.delete(i));for(let i of e.removals)e.retained.has(i)||(R(i),i.remove());r?.isConnected&&document.activeElement!==r&&r.focus({preventScroll:!0})}finally{[c,d,p]=t,e.globalNodes=null,e.removals.clear(),e.retained.clear()}return e.root}function mt(e,t=""){if(d&&!t)return e();if(t){let l=k.get(t)?.deref();if(l?.root.isConnected)return l.dirty&&(l.dirty=!1,O(l)),l.root}let r={render:e,root:null,scope:t,dirty:!1,cleanupCallbacks:[],effects:new Map},i=O(r);return b.add(new WeakRef(r)),t&&k.set(t,new WeakRef(r)),o.set(i,{...o.get(i),view:r}),i}function X(){C=!1;let e=[...x];x.clear();for(let t of e)t.root.isConnected&&(t.dirty=!1,O(t));for(let t of w.splice(0))t()}function A(){for(let e of b){let t=e.deref();if(!t){b.delete(e);continue}t.root.isConnected&&x.add(t)}W(),X()}function E(e){e&&x.add(e),!C&&(C=!0,queueMicrotask(X))}function R(e){let t=o.get(e)?.view;if(t){for(let r of t.cleanupCallbacks.splice(0))r();for(let r of t.effects.values())clearInterval(r.id);t.effects.clear(),t.scope&&k.delete(t.scope)}for(let r of e.children??[])R(r)}globalThis.addEventListener?.("hashchange",A),globalThis.addEventListener?.("popstate",A);let Z={enter:ot,append:T,attr:M,listen:F,leave:G,mount:mt,refresh:A,invalidate:He,selectValue:Qe,here:f,put:st,begin:it,slot:lt,arm:ct,item:ut,end:dt,node:ft,done:pt,storageError:"",notify(){for(let e of b){let t=e.deref();t?.root.isConnected&&E(t)}},interval(e,t,r){let i=d;if(!i)return;i.intervalsSeen.add(e);let l=i.effects.get(e);if(l){l.callback=r;return}let s={callback:r,id:0};s.id=setInterval(()=>{s.callback(),W(),E(i)},Math.max(16,t)),i.effects.set(e,s)},memoHit(e){if(!e||!d)return!1;let t=d.memo?.get(f());return t?.key!==e||!t.node?.isConnected?!1:($=t.node,!0)},memoLast(){return $},memoKeep(e,t){e&&d&&(d.memo??=new Map).set(f(),{key:e,node:t})},after(e){w.push(e),E()},focus(e){w.push(()=>document.getElementById(e)?.focus()),E()},cleanup(e){d&&(d.cleanupCallbacks[d.cleanupIndex++]=e)},pushGlobal:e=>p.push({value:String(e),explicit:!0,global:!0,depth:c.length}),pushKey:e=>p.push({value:String(e),explicit:!0,depth:c.length}),pushCall:e=>p.push({value:e,explicit:!1}),popKey:()=>p.pop()};return Z})()}),he=(n=>()=>(o=>typeof o=="string"?o:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${o===null?"null":o instanceof Promise?"a Promise (await it: Promise[Str])":typeof o}`)})())(n()))(()=>location.hash.slice(1)||"/"),be=((n,o,a)=>({top:n,left:o,behavior:a})),we=((n,o,a)=>n[o](a)??null),ye=((n,o)=>({block:n,inline:o})),ke=((...n)=>globalThis.__wutuLazy("./start.utu","page",n)),xe=((...n)=>globalThis.__wutuLazy("./tour.utu","page",n)),ve=((...n)=>globalThis.__wutuLazy("./iterators.utu","page",n)),$e=((...n)=>globalThis.__wutuLazy("./stdlib.utu","page",n)),Se=((...n)=>globalThis.__wutuLazy("./javascript.utu","page",n)),_e=((...n)=>globalThis.__wutuLazy("./data.utu","page",n)),Ee=((...n)=>globalThis.__wutuLazy("./web.utu","page",n)),ze=((...n)=>globalThis.__wutuLazy("./tooling.utu","page",n)),Te=((...n)=>globalThis.__wutuLazy("./compiler.utu","page",n)),Ae=((...n)=>globalThis.__wutuLazy("./benchmarks.utu","page",n)),Ne=(n=>o=>(a=>typeof a=="string"?a:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${a===null?"null":a instanceof Promise?"a Promise (await it: Promise[Str])":typeof a}`)})())(n(o)))(n=>{try{if(!n)return"";let o=JSON.parse(n);if(o.version!==1||!(o.data!==null&&typeof o.data=="object"&&!Array.isArray(o.data)&&typeof o.data.source=="string"))throw Error("Stored schema mismatch");return JSON.stringify(o.data)}catch(o){return globalThis.__utuWutu.storageError=String(o.message??o),""}}),We=((n,o)=>(a=>typeof a=="string"?a:(()=>{throw new TypeError("expected string")})())(n[o])),Me=(n=>o=>(a=>typeof a=="string"?a:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${a===null?"null":a instanceof Promise?"a Promise (await it: Promise[Str])":typeof a}`)})())(n(o)))(n=>{try{return localStorage.getItem(n)??""}catch(o){return globalThis.__utuWutu.storageError=String(o.message??o),""}}),Ce=(n=>(o,a,b,k)=>n(o,a,!!b,k))((n,o,a,b)=>globalThis.__utuWutu.store(n,o,!!a,b)),Ie=(n=>({source:n})),je=((n,o)=>({version:n,data:o})),Le=((n,o,a)=>import(new URL("./playground/playground.js?v=9ed575993858",document.baseURI).href).then(b=>b.schedule(n,o,a)).catch(b=>a("Could not load the compiler",String(b),!0))),Oe=(()=>globalThis.__utuWutu.node()),Re=(n=>globalThis.__utuWutu.arm(n)),Ue=(()=>{if(!document.getElementById("wutu-124igqj")){let n=document.createElement("style");n.id="wutu-124igqj",n.textContent=`.wa925av{display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:1rem;margin-block:1.5rem;inline-size:min(100%, 76rem);@media (width < 72rem){
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
                        }}.w18jcedk{inline-size:100%;block-size:100%;border:0;background:white;}.w1tku8aq{margin-block-start:0;inline-size:min(100%, 76rem);white-space:pre-wrap;}.wnoe2ce{padding:0.4rem 0.8rem;font:inherit;font-size:0.9rem;color:var(--ink);background:var(--tint);border:1px solid var(--line);cursor:pointer;}`,document.head.append(n)}}),Be=(n=>n instanceof globalThis.KeyboardEvent?n:null),Pe=((n,o)=>n[o]()),qe=((n,o,a,b,k,x)=>n[o](a,b,k,x)),Ke=((n,o)=>n[o]?1:0),De=(n=>o=>n(BigInt.asUintN(64,o)))(n=>globalThis.__utuWutu.item(n)),Je=(n=>globalThis.__utuWutu?.after(n)),Fe=(()=>{(function(o){if(o.store)return;let a=new Map,b=180,k;function x(f){let u=String(f.message??f);o.storageError!==u&&(o.storageError=u,o.notify())}function w(){clearTimeout(k);for(let[f,u]of a)if(!(!u.dirty||u.conflict))try{let c=u.encode();c!==u.last&&(localStorage.setItem(f,c),u.last=c),u.dirty=!1}catch(c){x(c)}}function _(f){let u=a.get(f);u&&(u.conflict=!1,u.dirty=!0,clearTimeout(k),k=setTimeout(w,b))}o.flush=w,o.save=_,o.autoSave=()=>{for(let[f,u]of a)!u.manual&&!u.conflict&&_(f)},o.store=(f,u,c=!1,d=null)=>{let p=null;try{p=localStorage.getItem(f)}catch{}a.set(f,{encode:u,manual:c,apply:d,last:p,dirty:!1})},o.reload=f=>{let u=a.get(f);if(u)try{let c=localStorage.getItem(f);u.apply?.(c??""),u.last=c,u.dirty=!1,u.conflict=!1,o.storageError="",o.refresh()}catch(c){x(c)}};let $=(...f)=>globalThis.addEventListener?.(...f);$("pagehide",w),$("visibilitychange",()=>{document.visibilityState==="hidden"&&w()}),$("storage",f=>{let u=a.get(f.key);if(u){if(u.dirty){u.conflict=!0,clearTimeout(k),x("Unsaved local changes conflict with another tab. Reload or explicitly save to keep this tab.");return}try{u.apply?.(f.newValue??""),u.last=f.newValue,o.refresh()}catch(c){x(c)}}})})(globalThis.__utuWutu)}),Ge=(()=>globalThis.__utuWutu?.refresh());function Ve(){let n=new Map,o=0;return(a,b,k)=>{let x=globalThis.__utuWutu.here()+"|"+a+"|"+b,w=x+"|"+k.map(c=>c!==null&&typeof c=="object"?"#":String(c)).join(""),_=n.get(x);if(_?.key===w&&!_.node.hasAttribute("data-wutu-lazy-error"))return _.node;let $=_?.key===w?_.node:[...document.querySelectorAll("[data-wutu-lazy]")].find(c=>c.getAttribute("data-wutu-lazy")===w)??document.createElement("div");$.setAttribute("data-wutu-lazy",w),$.removeAttribute("data-wutu-lazy-error"),n.set(x,{key:w,node:$});let f=globalThis.__wutuChunks?.[a];if(!f)return console.error("Wutu: no chunk was built for "+a),$;let u=_?.key===w?(_.tries??0)+1:0;return n.get(x).tries=u,o++,document.documentElement.setAttribute("data-wutu-loading",""),(u?import(f+"?retry="+u):import(f)).then(c=>{let d=c.exports?.[b];if(typeof d!="function")throw c.error??new Error("Wutu: chunk for "+a+" has no "+b);$.replaceChildren(d(...k))}).catch(c=>{$.setAttribute("data-wutu-lazy-error",""),console.error(c)}).finally(()=>{--o===0&&document.documentElement.removeAttribute("data-wutu-loading")}),$}}globalThis.__wutuChunks={...globalThis.__wutuChunks,"./start.utu":new URL("./chunks/start-28300d9e04/app.js",import.meta.url).href,"./tour.utu":new URL("./chunks/tour-c179b39e03/app.js",import.meta.url).href,"./iterators.utu":new URL("./chunks/iterators-9fddf8f7c4/app.js",import.meta.url).href,"./stdlib.utu":new URL("./chunks/stdlib-a9b9cbd986/app.js",import.meta.url).href,"./javascript.utu":new URL("./chunks/javascript-74ca33eed1/app.js",import.meta.url).href,"./data.utu":new URL("./chunks/data-202c5bfe64/app.js",import.meta.url).href,"./web.utu":new URL("./chunks/web-ef954e2710/app.js",import.meta.url).href,"./tooling.utu":new URL("./chunks/tooling-527092a793/app.js",import.meta.url).href,"./compiler.utu":new URL("./chunks/compiler-a62a3ff5fe/app.js",import.meta.url).href,"./benchmarks.utu":new URL("./chunks/benchmarks-d4d0734d05/app.js",import.meta.url).href};globalThis.__wutuLazy??=Ve();try{let{instance:n}=await WebAssembly.instantiateStreaming(fetch(new URL("./app.wasm?v=f4dbf0fa4177",import.meta.url)),{es:[ne,U,B,P,oe,U,re,ie,ae,se,le,ce,ue,de,fe,pe,me,ge,he,be,we,ye,ke,xe,ve,$e,Se,_e,Ee,ze,Te,Ae,Ne,We,Me,Ce,Ie,je,Le,Oe,Re,Ue,P,B,Be,Pe,qe,Ke,De,Je,Fe,Ge],utu:{closure_new:ee,closure_call_0:te}},{builtins:["js-string"],importedStringConstants:"'"}),o=n.exports;document.querySelectorAll("[data-utu-static]").forEach(a=>a.remove()),await o.main?.(),document.documentElement.setAttribute("data-utu-ready","")}catch(n){document.documentElement.setAttribute("data-utu-error",String(n.message??n));let o=document.createElement("p");o.setAttribute("role","status"),o.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.",document.body.append(o),console.error(n)}
