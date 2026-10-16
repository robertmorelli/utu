var we=Object.defineProperty;var _e=(i,s)=>{for(var f in s)we(i,f,{get:s[f],enumerable:!0})};function Q(i,s={}){if(!i)return s;i.new&&(s.closure_new=(p,b,y)=>{let _=b==null&&!(y&2)?(...k)=>p(...k):(...k)=>p(b,...k);return y&1?(...k)=>!!_(...k):_});let f=(p,...b)=>p(...b);for(let p of i.calls??[])s[p]=f;return s}function X(i,s){let f={};for(let[p,b]of Object.entries(i??{})){f[p]={};for(let y of Object.keys(b??{})){if(!(y in s))continue;let _=s[y];f[p][y]=typeof _=="function"?_:()=>_}}return f}var U={};_e(U,{__es_10:()=>Ne,__es_11:()=>We,__es_12:()=>Ce,__es_13:()=>Oe,__es_14:()=>je,__es_15:()=>$e,__es_19:()=>Le,__es_20:()=>Pe,__es_6:()=>Ee,__es_7:()=>Ie,__es_8:()=>Me,__es_9:()=>Te,__foreign_0:()=>xe,__foreign_1:()=>ke,__foreign_2:()=>ve,__foreign_3:()=>Ae,__foreign_4:()=>Se,__foreign_5:()=>ze,__foreign_6:()=>Be,__foreign_7:()=>Ue,__foreign_8:()=>Re});var xe=(i=>globalThis[i]),ke=((i,s,f)=>i[s](f)),ve=((i,s,f)=>{i[s]=f}),Ae=((i,s)=>i[s]),Se=((i,s)=>globalThis[i](s)),ze=((i,s,f)=>i[s](f)),Ee=((i,s)=>globalThis.__utuWutu.mount(i,s)),Ie=(()=>globalThis.__utuWutu.slot()),Me=(i=>globalThis.__utuWutu.put(i)),Te=(i=>globalThis.__utuWutu.item(i)),Ne=(()=>globalThis.__utuWutu.end()),We=(i=>globalThis.__utuWutu.begin(i)),Ce=(()=>globalThis.__utuWutu.done()),Oe=(()=>{if(!document.getElementById("wutu-18l7t6j")){let i=document.createElement("style");i.id="wutu-18l7t6j",i.textContent=`
        @import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap");
        :root {
            --bg: #f7f6f2;
            --ink: #1f2535;
            --muted: #656c7e;
            --line: #dcd9d1;
            --tint: #edebe4;
            --blue: #2d53c4;
            --orange: #e4772c;
            --sun: #f2a33a;
            --code-bg: #1b2236;
            --code-ink: #dfe3ee;
            --code-k: #f2a36b;
            --code-a: #f6b86a;
            --code-d: #ffffff;
            --code-T: #93b6ff;
            --code-s: #b9cdf5;
            --code-y: #c9cfdc;
            --code-n: #ecd3a0;
            --code-c: #7f889f;
            --code-f: #dfe3ee;
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
                --code-bg: #0c1120;
                --code-c: #737d96;
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
            max-inline-size: 44rem;
            padding: clamp(2rem, 6vw, 5rem) clamp(1.25rem, 5vw, 4rem) 6rem;
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
            overflow-x: auto;
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
    .w1qs58sx{display:grid;grid-template-columns:17rem minmax(0, 1fr);min-block-size:100dvh;@media (width < 64rem){
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
                }}.wu7hoyu{min-inline-size:0;}.w1nf506q{padding:1.5rem clamp(1rem, 4vw, 3rem) 3rem;border-block-start:1px solid var(--line);color:var(--muted);font-size:0.9rem;display:flex;flex-wrap:wrap;gap:0.5rem 2rem;justify-content:space-between;}`,document.head.append(i)}}),je=(()=>{globalThis.__utuWutu??=(function(){let s=new WeakMap,f=new WeakMap,p=new Set,b=new Map,y=new Set,_=[],k=new Set,S=new WeakMap,R=new Map,h=[],l=null,c=[],T=!1,N=0;function Z(e){if(k.has(e)||(k.add(e),[...document.querySelectorAll("style")].some(t=>t.textContent===e)))return;let n=document.createElement("style");n.textContent=e,document.head.append(n)}function W(){H.autoSave?.()}function ee(e){let n=b.get(e)?.deref();n&&(n.dirty=!0,A(n))}let ne=new Set;function C(e){let n=S.get(e);return n===void 0&&S.set(e,n=e.getAttribute("data-wutu")),n}function te(e,n){let t=e.childNodes;if(t.length===n.length){let u=!0;for(let a=0;u&&a<n.length;a++)u=t[a]===n[a];if(u)return}let o=document.activeElement,r=o&&"selectionStart"in o?[o.selectionStart,o.selectionEnd,o.selectionDirection]:null,m=e.firstChild;for(let u of n){if(u===m){m=m.nextSibling;continue}e.moveBefore&&u.parentNode===e?e.moveBefore(u,m):e.insertBefore(u,m)}let g=new Set(n);for(let u of[...e.childNodes])g.has(u)||(l?l.removals.add(u):($(u),u.remove()));o?.isConnected&&document.activeElement!==o&&(o.focus({preventScroll:!0}),r?.[0]!=null&&o.setSelectionRange(...r))}function oe(e,n,t,o){if(t&&l){if(l.globalClaims.has(n))throw new Error("Duplicate global Wutu key: "+n);l.globalClaims.add(n)}if(o&&e){if(e.keyed??=new Set,e.keyed.has(n))throw new Error("Duplicate Wutu key: "+c.findLast(r=>r.explicit).value);e.keyed.add(n)}}function re(e,n,t,o){let r=e?.old[e.wanted.length];if(r?.nodeType===1&&r.localName===t&&C(r)===n&&!e.used.has(r))return r;let m=e&&ie(e).get(n);for(;m&&m.index<m.nodes.length;){let g=m.nodes[m.index++];if(!e.used.has(g)&&g.localName===t)return g}return o?se(n):void 0}function ie(e){if(e.byKey)return e.byKey;e.byKey=new Map;for(let n of e.old){if(n.nodeType!==1)continue;let t=C(n),o=e.byKey.get(t);o||e.byKey.set(t,o={nodes:[],index:0}),o.nodes.push(n)}return e.byKey}function se(e){if(l){if(!l.globalNodes){l.globalNodes=new Map;for(let n of l.root?.querySelectorAll("[data-wutu]")??[])l.globalNodes.set(C(n),n)}return l.globalNodes.get(e)}}function z(e,n,t,o){let r=h.at(-1),m=e+(n?":"+n:""),g=!1,u=!1;if(c.length){let x=0;for(let w=0;w<c.length;w++)c[w].global&&(x=w,g=c[w].depth===h.length),c[w].explicit&&(u=c[w].depth===h.length);for(let w=x;w<c.length;w++){let B=c[w];m+=`:${B.explicit?"k":"c"}${B.value.length}:${B.value}`}}oe(r,m,g,u);let a=re(r,m,t,g);return a&&l?.retained.add(a),r||(a=l?.root??document.querySelector(`[data-wutu-root="${e}"][data-wutu-prerender]`)),a&&!S.has(a)&&(a.removeAttribute("data-wutu-prerender"),a.hasAttribute("data-wutu-pending")&&(a.disabled=!1,a.removeAttribute("data-wutu-pending"))),(!a||a.localName!==t)&&(a=o()),r&&(r.used.add(a),r.wanted.push(a)),S.get(a)!==m&&(a.setAttribute("data-wutu",m),S.set(a,m)),r||(a.getAttribute("data-wutu-root")!==e&&a.setAttribute("data-wutu-root",e),l&&(l.root=a)),a}function O(e,n){let t=s.get(e),o=t?null:new Set([...e.attributes].map(r=>r.name).filter(r=>!r.startsWith("data-wutu")&&!n.includes(r)));return h.push({node:e,meta:t,before:o,old:e.childNodes,used:new Set,wanted:[],attrs:null,byKey:null,keyed:null}),e}function ae(e,n,t,o){return O(z(t,o,e,()=>n?document.createElementNS("http://www.w3.org/2000/svg",e):document.createElement(e)),[])}function L(e,n){let t=R.get(e);return t||R.set(e,t=F(JSON.parse(e),n)),t}let P=new WeakMap;function q(e,n){let t=P.get(e);return t||P.set(e,t=F(e,n)),t}function F(e,n){let t=([o,r,...m],g)=>{g=g||o==="svg";let u=g?document.createElementNS("http://www.w3.org/2000/svg",o):document.createElement(o);for(let x in r)u.setAttribute(x,r[x]);let a=g&&o!=="foreignObject";for(let x of m)u.append(typeof x=="string"?x:t(x,a));return u};return[t(e,n),Object.keys(e[1])]}function le(e,n,t){let[o,r]=L(e,n);return O(z(t,"",o.localName,()=>o.cloneNode(!1)),r)}function ce(e,n,t){let[o]=L(e,n);return z(t,"",o.localName,()=>o.cloneNode(!0))}function E(e){let n=h.at(-1);if(e?.nodeType){n.wanted.includes(e)||(n.used.add(e),n.wanted.push(e));return}let t=String(e??""),o=n.old[n.wanted.length];!o||o.nodeType!==3||n.used.has(o)?o=document.createTextNode(t):o.data!==t&&(o.data=t),n.used.add(o),n.wanted.push(o)}function M(e,n,t){if((h.at(-1).attrs??=new Set).add(n),t===null||t===!1){e.removeAttribute(n);return}let o=t===!0?"":String(t);e.getAttribute(n)!==o&&e.setAttribute(n,o)}function G(e,n,t){let o=f.get(e);o||f.set(e,o=new Map);let r=o.get(n);r||(r={handlers:[],generation:-1,view:l},o.set(n,r),e.addEventListener(n,m=>{try{for(let g of[...r.handlers]){let u=g(m);u?.then&&u.then(I,a=>{I(),setTimeout(()=>{throw a})})}}finally{W(),r.view&&A(r.view)}})),r.generation!==N&&(r.handlers=[],r.generation=N),r.handlers.push(t),r.view=l}function K(){let e=h.pop(),n=e.node,t=e.attrs??ne,o=e.meta;for(let r of o?o.attrs:e.before)t.has(r)||n.removeAttribute(r);return o?o.attrs=t:s.set(n,{attrs:t}),te(n,e.wanted),n}let D=new Map,J=["end"],d=null;function de(e){let n=D.get(e);if(!n){let t=2166136261;for(let o=0;o<e.length;o++)t=Math.imul(t^e.charCodeAt(o),16777619);D.set(e,n=[JSON.parse(e),(t>>>0).toString(36)])}d={h:n[1],nodes:[],stack:[{ops:n[0],pc:0,kind:"top"}],outer:d,pending:null}}function v(){for(;;){let e=d.stack.at(-1);if(e.pc>=e.ops.length){if(e.kind==="arm"){d.stack.pop();continue}return e.kind==="body"?J:null}let n=e.ops[e.pc++];switch(n[0]){case"s":{let[t]=q(n[2],!!n[3]);d.nodes[n[1]]=z(`v${d.h}:${n[1]}`,"",t.localName,()=>t.cloneNode(!0));break}case"o":{let[t,o]=q(n[2],!!n[3]);d.nodes[n[1]]=O(z(`v${d.h}:${n[1]}`,"",t.localName,()=>t.cloneNode(!1)),o);break}case"c":K();break;case"t":E(n[1]);break;default:return n}}}function ue(e){if(d?.pending){d.pending=null,E(e),c.pop();return}if(!d){E(e),c.pop();return}let n=v(),t=h.at(-1)?.node;switch(n[0]){case"a":M(t,n[1],e);break;case"m":M(t,"class",n[1]+e);break;case"b":M(t,n[1],!!e);break;case"y":t.style.setProperty(n[1],e);break;case"w":E(e);break;case"v":G(d.nodes[n[1]],n[2],e);break;default:throw new Error("Wutu: a value where the template has "+JSON.stringify(n?.[0]))}}function fe(){let e=v();c.push({value:`call:${d.h}:${e[1]}`,explicit:!1}),d.pending=e}function me(e){let n=v();d.stack.push({ops:e?n[1]:n[2],pc:0,kind:"arm"})}function Y(){let e=v();if(e!==J)return[e,null];let n=d.stack.at(-1);return c.pop(),n.loop[1]===0&&c.pop(),[n.loop,n]}function pe(e){let[n,t]=Y();t?t.pc=0:d.stack.push({ops:n[3],pc:0,kind:"body",loop:n});let o=String(e),r=n[1];r===0?(c.push({value:`loop:${d.h}:${n[2]}`,explicit:!1}),c.push({value:o,explicit:!1})):c.push({value:o,explicit:!0,global:r===2,depth:h.length})}function ge(){let[,e]=Y();e&&d.stack.pop()}function he(){return d.nodes[v()[1]]}function be(){for(;v()!==null;);let e=d.nodes[0];return d=d.outer,e}function j(e){let n=[h,l,c],t=document.activeElement;e.cleanupIndex=0,e.cleanupCallbacks??=[],e.removals=new Set,e.retained=new Set,e.globalNodes=null,e.globalClaims=new Set,h=[],l=e,c=[],N++;try{e.root=e.render();for(let o of e.cleanupCallbacks.splice(e.cleanupIndex))o();for(let o of e.removals)e.retained.has(o)||($(o),o.remove());t?.isConnected&&document.activeElement!==t&&t.focus({preventScroll:!0})}finally{[h,l,c]=n,e.globalNodes=null,e.removals.clear(),e.retained.clear()}return e.root}function ye(e,n=""){if(l&&!n)return e();if(n){let r=b.get(n)?.deref();if(r?.root.isConnected)return r.dirty&&(r.dirty=!1,j(r)),r.root}let t={render:e,root:null,scope:n,dirty:!1,cleanups:[],cleanupCallbacks:[],effects:new Map},o=j(t);return p.add(new WeakRef(t)),n&&b.set(n,new WeakRef(t)),s.set(o,{...s.get(o),view:t}),o}function V(){T=!1;let e=[...y];y.clear();for(let n of e)n.root.isConnected&&(n.dirty=!1,j(n));for(let n of _.splice(0))n()}function I(){for(let e of p){let n=e.deref();if(!n){p.delete(e);continue}n.root.isConnected&&y.add(n)}W(),V()}function A(e){e&&y.add(e),!T&&(T=!0,queueMicrotask(V))}function $(e){let n=s.get(e)?.view;if(n){for(let t of[...n.cleanups.splice(0),...n.cleanupCallbacks.splice(0)])t();n.scope&&b.delete(n.scope)}for(let t of e.children??[])$(t)}addEventListener("hashchange",I),addEventListener("popstate",I);let H={enter:ae,shell:le,still:ce,append:E,attr:M,listen:G,leave:K,mount:ye,refresh:I,invalidate:ee,style:Z,put:ue,begin:de,slot:fe,arm:me,item:pe,end:ge,node:he,done:be,storageError:"",notify(){for(let e of p){let n=e.deref();n?.root.isConnected&&A(n)}},interval(e,n,t){let o=l;if(!o||o.effects.has(e))return;let r=setInterval(()=>{t(),W(),A(o)},Math.max(16,n));o.effects.set(e,r),o.cleanups.push(()=>clearInterval(r))},after(e){_.push(e),A()},focus(e){_.push(()=>document.getElementById(e)?.focus()),A()},cleanup(e){l&&(l.cleanupCallbacks[l.cleanupIndex++]=e)},pushGlobal:e=>c.push({value:String(e),explicit:!0,global:!0,depth:h.length}),pushKey:e=>c.push({value:String(e),explicit:!0,depth:h.length}),pushCall:e=>c.push({value:e,explicit:!1}),popKey:()=>c.pop()};return H})()}),$e=(()=>location.hash.slice(1)||"/"),Be=((i,s,f)=>({top:i,left:s,behavior:f})),Ue=((i,s,f)=>i[s](f)??null),Re=((i,s)=>({block:i,inline:s})),Le=(i=>globalThis.__utuWutu.item(i)),Pe=(i=>globalThis.__utuWutu?.after(i));try{let i=X({es:{__foreign_0:"",__foreign_1:"",__foreign_2:"",__foreign_3:"",__foreign_4:"",__foreign_5:"",__es_6:"",__es_7:"",__es_8:"",__es_9:"",__es_10:"",__es_11:"",__es_12:"",__es_13:"",__es_14:"",__es_15:"",__foreign_6:"",__foreign_7:"",__foreign_8:"",__es_19:"",__es_20:""}},U);i.utu=Q({new:!0,calls:[]},i.utu);let s=await WebAssembly.compileStreaming(fetch(new URL("./app.wasm?v=f78445eaa98e",import.meta.url)),{builtins:["js-string"],importedStringConstants:"'"}),p=(await WebAssembly.instantiate(s,i)).exports;document.querySelectorAll("[data-utu-static]").forEach(b=>b.remove()),await p.main?.(),document.documentElement.setAttribute("data-utu-ready","")}catch(i){document.documentElement.setAttribute("data-utu-error",String(i.message??i));let s=document.createElement("p");s.setAttribute("role","status"),s.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.",document.body.append(s),console.error(i)}
