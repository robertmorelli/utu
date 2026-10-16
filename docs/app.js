var we=Object.defineProperty;var _e=(i,s)=>{for(var m in s)we(i,m,{get:s[m],enumerable:!0})};function Q(i,s={}){if(!i)return s;i.new&&(s.closure_new=(p,b,y)=>{let _=b==null&&!(y&2)?(...k)=>p(...k):(...k)=>p(b,...k);return y&1?(...k)=>!!_(...k):_});let m=(p,...b)=>p(...b);for(let p of i.calls??[])s[p]=m;return s}function X(i,s){let m={};for(let[p,b]of Object.entries(i??{})){m[p]={};for(let y of Object.keys(b??{})){if(!(y in s))continue;let _=s[y];m[p][y]=typeof _=="function"?_:()=>_}}return m}var U={};_e(U,{__es_0:()=>xe,__es_1:()=>ke,__es_11:()=>We,__es_12:()=>Ce,__es_17:()=>Ue,__es_18:()=>Re,__es_2:()=>ve,__es_3:()=>Ae,__es_4:()=>Se,__es_5:()=>ze,__es_6:()=>Ee,__es_7:()=>Me,__foreign_0:()=>Ie,__foreign_1:()=>Ne,__foreign_2:()=>Te,__foreign_3:()=>Oe,__foreign_4:()=>je,__foreign_5:()=>$e,__foreign_6:()=>Be});var xe=((i,s)=>globalThis.__utuWutu.mount(i,s)),ke=(()=>globalThis.__utuWutu.slot()),ve=(i=>globalThis.__utuWutu.put(i)),Ae=(i=>globalThis.__utuWutu.item(i)),Se=(()=>globalThis.__utuWutu.end()),ze=(i=>globalThis.__utuWutu.begin(i)),Ee=(()=>globalThis.__utuWutu.done()),Me=(()=>{if(!document.getElementById("wutu-141049t")){let i=document.createElement("style");i.id="wutu-141049t",i.textContent=`
        @import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap");
        :root {
            --bg: #eef0f4;
            --surface: #ffffff;
            --ink: #141a2b;
            --muted: #5b6579;
            --line: #d5d9e3;
            --accent: #4a3dd6;
            --accent-soft: #e6e3fb;
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
                --bg: #0e1220;
                --surface: #151a2c;
                --ink: #e6e8f1;
                --muted: #99a1b8;
                --line: #272e49;
                --accent: #aaa0ff;
                --accent-soft: #23264a;
                --code-bg: #090c17;
            }
        }
        * {
            box-sizing: border-box;
        }
        html {
            -webkit-text-size-adjust: 100%;
            scroll-behavior: smooth;
        }
        @media (prefers-reduced-motion: reduce) {
            html {
                scroll-behavior: auto;
            }
        }
        body {
            margin: 0;
            background: var(--bg);
            color: var(--ink);
            font: 400 1.0625rem/1.6 "Bricolage Grotesque", system-ui, sans-serif;
            font-optical-sizing: auto;
        }
        a {
            color: var(--accent);
            text-underline-offset: 0.2em;
            text-decoration-thickness: 1px;
        }
        a:hover {
            text-decoration-thickness: 2px;
        }
        :focus-visible {
            outline: 3px solid var(--accent);
            outline-offset: 3px;
            border-radius: 2px;
        }
        h1, h2, h3, p, ul, ol, table {
            margin: 0;
            overflow-wrap: anywhere;
        }
        h1 {
            font-weight: 500;
            font-size: clamp(2.2rem, 1.4rem + 3vw, 3.6rem);
            line-height: 1.05;
            letter-spacing: -0.035em;
        }
        h2 {
            font-weight: 600;
            font-size: 1.55rem;
            line-height: 1.2;
            letter-spacing: -0.02em;
            margin-block: 3rem 0.9rem;
        }
        h2:first-of-type {
            margin-block-start: 2.25rem;
        }
        p + p {
            margin-block-start: 0.9rem;
        }
        .page {
            max-inline-size: 46rem;
            padding: clamp(1.5rem, 5vw, 4rem) clamp(1rem, 4vw, 3rem) 5rem;
        }
        .page-head {
            display: grid;
            gap: 1rem;
            padding-block-end: 1.5rem;
            border-block-end: 1px solid var(--line);
        }
        .lede {
            font-size: 1.2rem;
            line-height: 1.5;
            color: var(--muted);
            max-inline-size: 38rem;
        }
        .further {
            margin-block-start: 1.5rem;
            padding-inline-start: 1rem;
            border-inline-start: 3px solid var(--accent-soft);
            color: var(--muted);
        }
        .further + .further {
            margin-block-start: 0.6rem;
        }
        code {
            font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.86em;
        }
        p code, li code, td code, th code {
            background: var(--accent-soft);
            padding: 0.08em 0.35em;
            border-radius: 0.3em;
        }
        pre.code {
            margin: 1.25rem 0;
            padding: 1.1rem 1.25rem;
            background: var(--code-bg);
            color: var(--code-ink);
            border-radius: 0.65rem;
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
            font-weight: 500;
        }
        pre.code .y {
            color: var(--code-y);
        }
        pre.code .f {
            color: var(--code-f);
        }
        pre.shell {
            color: var(--code-ink);
        }
        table {
            border-collapse: collapse;
            inline-size: 100%;
            margin-block: 1.25rem;
            font-size: 0.95rem;
        }
        th, td {
            text-align: start;
            vertical-align: top;
            padding: 0.6rem 0.75rem 0.6rem 0;
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
            margin-block-start: 0.4rem;
        }
        .principles li {
            padding-inline-start: 0.35rem;
        }
        .principles li::marker {
            color: var(--accent);
            font-weight: 600;
        }
        .home {
            padding: clamp(1.5rem, 5vw, 4rem) clamp(1rem, 4vw, 3rem) 4rem;
            max-inline-size: 72rem;
            display: grid;
            gap: clamp(3rem, 7vw, 5.5rem);
        }
        .hero {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: clamp(2rem, 5vw, 4rem);
            align-items: start;
        }
        @media (width < 60rem) {
            .hero {
                grid-template-columns: minmax(0, 1fr);
            }
        }
        .pitch {
            display: grid;
            gap: 1.5rem;
            align-content: start;
            padding-block-start: 1rem;
        }
        .pitch h1 {
            font-size: clamp(2.6rem, 1.5rem + 4.2vw, 4.8rem);
            font-weight: 450;
            max-inline-size: 11em;
        }
        .pitch .lede {
            font-size: 1.15rem;
            max-inline-size: 34rem;
        }
        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem 1.75rem;
            align-items: center;
        }
        .button {
            display: inline-block;
            padding: 0.8rem 1.4rem;
            border-radius: 0.6rem;
            background: var(--accent);
            color: var(--bg);
            text-decoration: none;
            font-weight: 600;
        }
        .button:hover {
            filter: brightness(1.08);
        }
        .envelope {
            position: relative;
            display: grid;
            gap: 0.75rem;
            padding-inline: clamp(0rem, 2vw, 1.5rem);
        }
        .envelope pre.code {
            margin: 0;
            font-size: 0.8rem;
        }
        .bracket {
            font: 400 clamp(3rem, 6vw, 5rem)/0.8 "IBM Plex Mono", ui-monospace, monospace;
            color: var(--accent);
            user-select: none;
            line-height: 0.75;
        }
        .bracket.open {
            justify-self: start;
            margin-inline-start: -0.1em;
        }
        .bracket.close {
            justify-self: end;
            margin-inline-end: -0.1em;
        }
        .caption {
            color: var(--muted);
            font-size: 0.95rem;
            max-inline-size: 30rem;
        }
        .points {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
            gap: clamp(2rem, 4vw, 3.5rem);
        }
        .point {
            display: grid;
            gap: 0.9rem;
            align-content: start;
        }
        .point h2 {
            margin: 0;
            font-size: 1.45rem;
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
            margin-block: 0.75rem 0;
            max-inline-size: 52rem;
        }
        .measured th {
            font-size: 1.5rem;
            font-weight: 500;
            letter-spacing: -0.02em;
            padding-inline-end: 1.5rem;
            font-variant-numeric: tabular-nums;
        }
        .measured td {
            color: var(--muted);
        }
        .map ul {
            list-style: none;
            padding: 0;
            margin-block-start: 1rem;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
            gap: 1rem 2.5rem;
        }
        .map li {
            display: grid;
            gap: 0.15rem;
            padding-block: 0.75rem;
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
        }}.wqbk89c{position:sticky;top:0;block-size:100dvh;overflow-y:auto;display:flex;flex-direction:column;gap:1.5rem;padding:1.75rem 1.5rem;border-inline-end:1px solid var(--line);@media (width < 64rem){
                position: static;
                block-size: auto;
                gap: 0.9rem;
                padding: 1rem 1rem 0.75rem;
                border-inline-end: 0;
                border-block-end: 1px solid var(--line);
                background: var(--bg);
            }}.wdb7r3s{display:flex;align-items:baseline;gap:0.6rem;color:var(--ink);text-decoration:none;font-weight:700;font-size:1.5rem;letter-spacing:-0.03em;}.w1ab12w6{font:500 1.05rem "IBM Plex Mono", ui-monospace, monospace;color:var(--accent);letter-spacing:0;}.w119mzep{font-weight:400;font-size:0.9rem;color:var(--muted);letter-spacing:0;}.wscv5xn{display:grid;gap:0.1rem;@media (width < 64rem){
                    display: flex;
                    gap: 0.35rem;
                    overflow-x: auto;
                    scrollbar-width: none;
                    margin-inline: -1rem;
                    padding-inline: 1rem;
                }}.wkqu3zs{display:block;padding:0.45rem 0.7rem;border-radius:0.5rem;color:var(--ink);text-decoration:none;font-size:0.98rem;white-space:nowrap;&:hover{
                            background: var(--accent-soft);
                        }&.here{
                            background: var(--accent);
                            color: var(--surface);
                            font-weight: 600;
                        }@media (prefers-color-scheme: dark){
                            @ &.here {
                                color: var(--bg);
                            }
                        }}.w14c5k7f{margin-block-start:auto;font-size:0.85rem;color:var(--muted);line-height:1.5;@media (width < 64rem){
                    display: none;
                }}.wu7hoyu{min-inline-size:0;}.wgt71xe{padding:2rem clamp(1rem, 4vw, 3rem) 3rem;border-block-start:1px solid var(--line);color:var(--muted);font-size:0.9rem;display:flex;flex-wrap:wrap;gap:0.5rem 2rem;justify-content:space-between;}`,document.head.append(i)}}),Ie=(i=>globalThis[i]),Ne=((i,s)=>i[s]),Te=((i,s,m)=>i[s](m)),We=(()=>{globalThis.__utuWutu??=(function(){let s=new WeakMap,m=new WeakMap,p=new Set,b=new Map,y=new Set,_=[],k=new Set,S=new WeakMap,R=new Map,h=[],c=null,l=[],N=!1,T=0;function Z(e){if(k.has(e)||(k.add(e),[...document.querySelectorAll("style")].some(t=>t.textContent===e)))return;let n=document.createElement("style");n.textContent=e,document.head.append(n)}function W(){H.autoSave?.()}function ee(e){let n=b.get(e)?.deref();n&&(n.dirty=!0,A(n))}let ne=new Set;function C(e){let n=S.get(e);return n===void 0&&S.set(e,n=e.getAttribute("data-wutu")),n}function te(e,n){let t=e.childNodes;if(t.length===n.length){let u=!0;for(let a=0;u&&a<n.length;a++)u=t[a]===n[a];if(u)return}let o=document.activeElement,r=o&&"selectionStart"in o?[o.selectionStart,o.selectionEnd,o.selectionDirection]:null,f=e.firstChild;for(let u of n){if(u===f){f=f.nextSibling;continue}e.moveBefore&&u.parentNode===e?e.moveBefore(u,f):e.insertBefore(u,f)}let g=new Set(n);for(let u of[...e.childNodes])g.has(u)||(c?c.removals.add(u):($(u),u.remove()));o?.isConnected&&document.activeElement!==o&&(o.focus({preventScroll:!0}),r?.[0]!=null&&o.setSelectionRange(...r))}function oe(e,n,t,o){if(t&&c){if(c.globalClaims.has(n))throw new Error("Duplicate global Wutu key: "+n);c.globalClaims.add(n)}if(o&&e){if(e.keyed??=new Set,e.keyed.has(n))throw new Error("Duplicate Wutu key: "+l.findLast(r=>r.explicit).value);e.keyed.add(n)}}function re(e,n,t,o){let r=e?.old[e.wanted.length];if(r?.nodeType===1&&r.localName===t&&C(r)===n&&!e.used.has(r))return r;let f=e&&ie(e).get(n);for(;f&&f.index<f.nodes.length;){let g=f.nodes[f.index++];if(!e.used.has(g)&&g.localName===t)return g}return o?se(n):void 0}function ie(e){if(e.byKey)return e.byKey;e.byKey=new Map;for(let n of e.old){if(n.nodeType!==1)continue;let t=C(n),o=e.byKey.get(t);o||e.byKey.set(t,o={nodes:[],index:0}),o.nodes.push(n)}return e.byKey}function se(e){if(c){if(!c.globalNodes){c.globalNodes=new Map;for(let n of c.root?.querySelectorAll("[data-wutu]")??[])c.globalNodes.set(C(n),n)}return c.globalNodes.get(e)}}function z(e,n,t,o){let r=h.at(-1),f=e+(n?":"+n:""),g=!1,u=!1;if(l.length){let x=0;for(let w=0;w<l.length;w++)l[w].global&&(x=w,g=l[w].depth===h.length),l[w].explicit&&(u=l[w].depth===h.length);for(let w=x;w<l.length;w++){let B=l[w];f+=`:${B.explicit?"k":"c"}${B.value.length}:${B.value}`}}oe(r,f,g,u);let a=re(r,f,t,g);return a&&c?.retained.add(a),r||(a=c?.root??document.querySelector(`[data-wutu-root="${e}"][data-wutu-prerender]`)),a&&!S.has(a)&&(a.removeAttribute("data-wutu-prerender"),a.hasAttribute("data-wutu-pending")&&(a.disabled=!1,a.removeAttribute("data-wutu-pending"))),(!a||a.localName!==t)&&(a=o()),r&&(r.used.add(a),r.wanted.push(a)),S.get(a)!==f&&(a.setAttribute("data-wutu",f),S.set(a,f)),r||(a.getAttribute("data-wutu-root")!==e&&a.setAttribute("data-wutu-root",e),c&&(c.root=a)),a}function O(e,n){let t=s.get(e),o=t?null:new Set([...e.attributes].map(r=>r.name).filter(r=>!r.startsWith("data-wutu")&&!n.includes(r)));return h.push({node:e,meta:t,before:o,old:e.childNodes,used:new Set,wanted:[],attrs:null,byKey:null,keyed:null}),e}function ae(e,n,t,o){return O(z(t,o,e,()=>n?document.createElementNS("http://www.w3.org/2000/svg",e):document.createElement(e)),[])}function P(e,n){let t=R.get(e);return t||R.set(e,t=F(JSON.parse(e),n)),t}let L=new WeakMap;function q(e,n){let t=L.get(e);return t||L.set(e,t=F(e,n)),t}function F(e,n){let t=([o,r,...f],g)=>{g=g||o==="svg";let u=g?document.createElementNS("http://www.w3.org/2000/svg",o):document.createElement(o);for(let x in r)u.setAttribute(x,r[x]);let a=g&&o!=="foreignObject";for(let x of f)u.append(typeof x=="string"?x:t(x,a));return u};return[t(e,n),Object.keys(e[1])]}function ce(e,n,t){let[o,r]=P(e,n);return O(z(t,"",o.localName,()=>o.cloneNode(!1)),r)}function le(e,n,t){let[o]=P(e,n);return z(t,"",o.localName,()=>o.cloneNode(!0))}function E(e){let n=h.at(-1);if(e?.nodeType){n.wanted.includes(e)||(n.used.add(e),n.wanted.push(e));return}let t=String(e??""),o=n.old[n.wanted.length];!o||o.nodeType!==3||n.used.has(o)?o=document.createTextNode(t):o.data!==t&&(o.data=t),n.used.add(o),n.wanted.push(o)}function I(e,n,t){if((h.at(-1).attrs??=new Set).add(n),t===null||t===!1){e.removeAttribute(n);return}let o=t===!0?"":String(t);e.getAttribute(n)!==o&&e.setAttribute(n,o)}function G(e,n,t){let o=m.get(e);o||m.set(e,o=new Map);let r=o.get(n);r||(r={handlers:[],generation:-1,view:c},o.set(n,r),e.addEventListener(n,f=>{try{for(let g of[...r.handlers]){let u=g(f);u?.then&&u.then(M,a=>{M(),setTimeout(()=>{throw a})})}}finally{W(),r.view&&A(r.view)}})),r.generation!==T&&(r.handlers=[],r.generation=T),r.handlers.push(t),r.view=c}function K(){let e=h.pop(),n=e.node,t=e.attrs??ne,o=e.meta;for(let r of o?o.attrs:e.before)t.has(r)||n.removeAttribute(r);return o?o.attrs=t:s.set(n,{attrs:t}),te(n,e.wanted),n}let D=new Map,J=["end"],d=null;function de(e){let n=D.get(e);if(!n){let t=2166136261;for(let o=0;o<e.length;o++)t=Math.imul(t^e.charCodeAt(o),16777619);D.set(e,n=[JSON.parse(e),(t>>>0).toString(36)])}d={h:n[1],nodes:[],stack:[{ops:n[0],pc:0,kind:"top"}],outer:d,pending:null}}function v(){for(;;){let e=d.stack.at(-1);if(e.pc>=e.ops.length){if(e.kind==="arm"){d.stack.pop();continue}return e.kind==="body"?J:null}let n=e.ops[e.pc++];switch(n[0]){case"s":{let[t]=q(n[2],!!n[3]);d.nodes[n[1]]=z(`v${d.h}:${n[1]}`,"",t.localName,()=>t.cloneNode(!0));break}case"o":{let[t,o]=q(n[2],!!n[3]);d.nodes[n[1]]=O(z(`v${d.h}:${n[1]}`,"",t.localName,()=>t.cloneNode(!1)),o);break}case"c":K();break;case"t":E(n[1]);break;default:return n}}}function ue(e){if(d?.pending){d.pending=null,E(e),l.pop();return}if(!d){E(e),l.pop();return}let n=v(),t=h.at(-1)?.node;switch(n[0]){case"a":I(t,n[1],e);break;case"m":I(t,"class",n[1]+e);break;case"b":I(t,n[1],!!e);break;case"y":t.style.setProperty(n[1],e);break;case"w":E(e);break;case"v":G(d.nodes[n[1]],n[2],e);break;default:throw new Error("Wutu: a value where the template has "+JSON.stringify(n?.[0]))}}function fe(){let e=v();l.push({value:`call:${d.h}:${e[1]}`,explicit:!1}),d.pending=e}function me(e){let n=v();d.stack.push({ops:e?n[1]:n[2],pc:0,kind:"arm"})}function Y(){let e=v();if(e!==J)return[e,null];let n=d.stack.at(-1);return l.pop(),n.loop[1]===0&&l.pop(),[n.loop,n]}function pe(e){let[n,t]=Y();t?t.pc=0:d.stack.push({ops:n[3],pc:0,kind:"body",loop:n});let o=String(e),r=n[1];r===0?(l.push({value:`loop:${d.h}:${n[2]}`,explicit:!1}),l.push({value:o,explicit:!1})):l.push({value:o,explicit:!0,global:r===2,depth:h.length})}function ge(){let[,e]=Y();e&&d.stack.pop()}function he(){return d.nodes[v()[1]]}function be(){for(;v()!==null;);let e=d.nodes[0];return d=d.outer,e}function j(e){let n=[h,c,l],t=document.activeElement;e.cleanupIndex=0,e.cleanupCallbacks??=[],e.removals=new Set,e.retained=new Set,e.globalNodes=null,e.globalClaims=new Set,h=[],c=e,l=[],T++;try{e.root=e.render();for(let o of e.cleanupCallbacks.splice(e.cleanupIndex))o();for(let o of e.removals)e.retained.has(o)||($(o),o.remove());t?.isConnected&&document.activeElement!==t&&t.focus({preventScroll:!0})}finally{[h,c,l]=n,e.globalNodes=null,e.removals.clear(),e.retained.clear()}return e.root}function ye(e,n=""){if(c&&!n)return e();if(n){let r=b.get(n)?.deref();if(r?.root.isConnected)return r.dirty&&(r.dirty=!1,j(r)),r.root}let t={render:e,root:null,scope:n,dirty:!1,cleanups:[],cleanupCallbacks:[],effects:new Map},o=j(t);return p.add(new WeakRef(t)),n&&b.set(n,new WeakRef(t)),s.set(o,{...s.get(o),view:t}),o}function V(){N=!1;let e=[...y];y.clear();for(let n of e)n.root.isConnected&&(n.dirty=!1,j(n));for(let n of _.splice(0))n()}function M(){for(let e of p){let n=e.deref();if(!n){p.delete(e);continue}n.root.isConnected&&y.add(n)}W(),V()}function A(e){e&&y.add(e),!N&&(N=!0,queueMicrotask(V))}function $(e){let n=s.get(e)?.view;if(n){for(let t of[...n.cleanups.splice(0),...n.cleanupCallbacks.splice(0)])t();n.scope&&b.delete(n.scope)}for(let t of e.children??[])$(t)}addEventListener("hashchange",M),addEventListener("popstate",M);let H={enter:ae,shell:ce,still:le,append:E,attr:I,listen:G,leave:K,mount:ye,refresh:M,invalidate:ee,style:Z,put:ue,begin:de,slot:fe,arm:me,item:pe,end:ge,node:he,done:be,storageError:"",notify(){for(let e of p){let n=e.deref();n?.root.isConnected&&A(n)}},interval(e,n,t){let o=c;if(!o||o.effects.has(e))return;let r=setInterval(()=>{t(),W(),A(o)},Math.max(16,n));o.effects.set(e,r),o.cleanups.push(()=>clearInterval(r))},after(e){_.push(e),A()},focus(e){_.push(()=>document.getElementById(e)?.focus()),A()},cleanup(e){c&&(c.cleanupCallbacks[c.cleanupIndex++]=e)},pushGlobal:e=>l.push({value:String(e),explicit:!0,global:!0,depth:h.length}),pushKey:e=>l.push({value:String(e),explicit:!0,depth:h.length}),pushCall:e=>l.push({value:e,explicit:!1}),popKey:()=>l.pop()};return H})()}),Ce=(()=>location.hash.slice(1)||"/"),Oe=((i,s,m)=>{i[s]=m}),je=((i,s,m)=>({top:i,left:s,behavior:m})),$e=((i,s,m)=>i[s](m)??null),Be=((i,s)=>({block:i,inline:s})),Ue=(i=>globalThis.__utuWutu.item(i)),Re=(i=>globalThis.__utuWutu?.after(i));try{let i=X({es:{__es_0:"",__es_1:"",__es_2:"",__es_3:"",__es_4:"",__es_5:"",__es_6:"",__es_7:"",__foreign_0:"",__foreign_1:"",__foreign_2:"",__es_11:"",__es_12:"",__foreign_3:"",__foreign_4:"",__foreign_5:"",__foreign_6:"",__es_17:"",__es_18:""}},U);i.utu=Q({new:!0,calls:[]},i.utu);let s=await WebAssembly.compileStreaming(fetch(new URL("./app.wasm",import.meta.url)),{builtins:["js-string"],importedStringConstants:"'"}),p=(await WebAssembly.instantiate(s,i)).exports;document.querySelectorAll("[data-utu-static]").forEach(b=>b.remove()),await p.main?.(),document.documentElement.setAttribute("data-utu-ready","")}catch(i){document.documentElement.setAttribute("data-utu-error",String(i.message??i));let s=document.createElement("p");s.setAttribute("role","status"),s.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.",document.body.append(s),console.error(i)}
