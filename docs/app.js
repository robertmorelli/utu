var xe=Object.defineProperty;var ve=(n,o)=>{for(var s in o)xe(n,s,{get:o[s],enumerable:!0})};var X=Symbol("utu.closure");function Z(n,o={}){if(!n)return o;n.new&&(o.closure_new=(f,h,b,y)=>{let v=h==null&&!(b&2)?(...m)=>f(...m):(...m)=>f(h,...m),x=b&1?(...m)=>!!v(...m):v;return x[X]=y,x}),o.closure_rec=f=>f?.[X]??null;let s=(f,...h)=>f(...h);for(let f of n.calls??[])o[f]=s;return o}function ee(n,o){let s={};for(let[f,h]of Object.entries(n??{})){s[f]={};for(let b of Object.keys(h??{})){if(!(b in o))continue;let y=o[b];s[f][b]=typeof y=="function"?y:()=>y}}return s}var U={};ve(U,{__es_10:()=>je,__es_11:()=>Le,__es_12:()=>Oe,__es_13:()=>$e,__es_14:()=>Re,__es_15:()=>Ue,__es_16:()=>Be,__es_17:()=>Pe,__es_18:()=>qe,__es_22:()=>Fe,__es_23:()=>Ge,__es_24:()=>Ve,__es_25:()=>He,__es_26:()=>Ye,__es_27:()=>Qe,__es_28:()=>Xe,__es_29:()=>Ze,__es_30:()=>et,__es_31:()=>tt,__es_32:()=>nt,__es_34:()=>rt,__es_35:()=>it,__es_38:()=>lt,__es_39:()=>ct,__es_40:()=>ut,__es_41:()=>dt,__es_49:()=>_t,__es_54:()=>wt,__es_55:()=>yt,__es_56:()=>kt,__es_6:()=>Ne,__es_7:()=>Me,__es_8:()=>Ce,__es_9:()=>Ie,__foreign_0:()=>Se,__foreign_1:()=>Ee,__foreign_10:()=>st,__foreign_11:()=>at,__foreign_12:()=>ft,__foreign_13:()=>mt,__foreign_14:()=>pt,__foreign_15:()=>gt,__foreign_16:()=>ht,__foreign_17:()=>bt,__foreign_2:()=>ze,__foreign_3:()=>Te,__foreign_4:()=>Ae,__foreign_5:()=>We,__foreign_6:()=>Ke,__foreign_7:()=>De,__foreign_8:()=>Je,__foreign_9:()=>ot});var Se=(n=>globalThis[n]),Ee=((n,o,s)=>n[o](s)),ze=((n,o,s)=>{n[o]=s}),Te=((n,o)=>n[o]),Ae=((n,o)=>globalThis[n](o)),We=((n,o,s)=>n[o](s)),Ne=((n,o)=>globalThis.__utuWutu.mount(n,o)),Me=(n=>o=>n(o)?1:0)(n=>globalThis.__utuWutu.memoHit(n)),Ce=(n=>globalThis.__utuWutu.put(n)),Ie=(()=>globalThis.__utuWutu.memoLast()),je=((n,o)=>globalThis.__utuWutu.memoKeep(n,o)),Le=(()=>globalThis.__utuWutu.slot()),Oe=(n=>globalThis.__utuWutu.item(n)),$e=(()=>globalThis.__utuWutu.end()),Re=(n=>globalThis.__utuWutu.begin(n)),Ue=(()=>globalThis.__utuWutu.done()),Be=(()=>{if(!document.getElementById("wutu-insj5b")){let n=document.createElement("style");n.id="wutu-insj5b",n.textContent=`@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap") layer(wutu.document);@layer wutu.document{
        
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
                }}.wu7hoyu{min-inline-size:0;}.w1nf506q{padding:1.5rem clamp(1rem, 4vw, 3rem) 3rem;border-block-start:1px solid var(--line);color:var(--muted);font-size:0.9rem;display:flex;flex-wrap:wrap;gap:0.5rem 2rem;justify-content:space-between;}`,document.head.append(n)}}),Pe=(()=>{globalThis.__utuWutu??=(function(){let o=new WeakMap,s=new WeakMap,f=new Set,h=new Map,b=new Set,y=[],v=new WeakSet,x=null,m=()=>p.map(e=>e.value.length+":"+e.value).join("|"),u=new WeakMap,c=[],d=null,p=[],I=!1,j=0;function M(){Q.autoSave?.()}function ne(e){let t=h.get(e)?.deref();t&&(t.dirty=!0,z(t))}let oe=new Set,B=new WeakMap;function re(e,t){B.set(e,t),e.value!==t&&(e.value=t)}function L(e){let t=u.get(e);return t===void 0&&u.set(e,t=e.getAttribute("data-wutu")),t}function ie(e,t){let r=e.childNodes;if(r.length===t.length){let w=!0;for(let g=0;w&&g<t.length;g++)w=r[g]===t[g];if(w)return}let i=document.activeElement,l=i&&"selectionStart"in i?[i.selectionStart,i.selectionEnd,i.selectionDirection]:null,a=e.firstChild;for(let w of t){if(w===a){a=a.nextSibling;continue}e.moveBefore&&w.parentNode===e?e.moveBefore(w,a):e.insertBefore(w,a)}let k=new Set(t);for(let w of[...e.childNodes])k.has(w)||(d?d.removals.add(w):(R(w),w.remove()));i?.isConnected&&document.activeElement!==i&&(i.focus({preventScroll:!0}),l?.[0]!=null&&i.setSelectionRange(...l))}function se(e,t,r,i){if(r&&d){if(d.globalClaims.has(t))throw new Error("Duplicate global Wutu key: "+t);d.globalClaims.add(t)}if(i&&e){if(e.keyed??=new Set,e.keyed.has(t))throw new Error("Duplicate Wutu key: "+p.findLast(l=>l.explicit).value);e.keyed.add(t)}}function ae(e,t,r,i){let l=e?.old[e.wanted.length];if(l?.nodeType===1&&l.localName===r&&L(l)===t&&!e.used.has(l))return l;let a=e&&le(e).get(t);for(;a&&a.index<a.nodes.length;){let k=a.nodes[a.index++];if(!e.used.has(k)&&k.localName===r)return k}return i?ce(t):void 0}function le(e){if(e.byKey)return e.byKey;e.byKey=new Map;for(let t of e.old){if(t.nodeType!==1)continue;let r=L(t),i=e.byKey.get(r);i||e.byKey.set(r,i={nodes:[],index:0}),i.nodes.push(t)}return e.byKey}function ce(e){if(d){if(!d.globalNodes){d.globalNodes=new Map;for(let t of d.root?.querySelectorAll("[data-wutu]")??[])d.globalNodes.set(L(t),t)}return d.globalNodes.get(e)}}function O(e,t,r,i){let l=c.at(-1),a=e+(t?":"+t:""),k=!1,w=!1;if(p.length){let S=0;for(let E=0;E<p.length;E++)p[E].global&&(S=E,k=p[E].depth===c.length),p[E].explicit&&(w=p[E].depth===c.length);for(let E=S;E<p.length;E++){let N=p[E];a+=`:${N.explicit?"k":"c"}${N.value.length}:${N.value}`}}se(l,a,k,w);let g=ae(l,a,r,k);if(g&&d?.retained.add(g),l||(g=d?.root??document.querySelector(`[data-wutu-root="${e}"][data-wutu-prerender]`)),g?.hasAttribute("data-wutu-prerender")){g.removeAttribute("data-wutu-prerender");for(let S of[g,...g.querySelectorAll("[data-wutu-pending]")])!S.hasAttribute("data-wutu-pending")||S.parentNode?.closest("[data-wutu-lazy]")||(S.disabled=!1,S.removeAttribute("data-wutu-pending"))}return(!g||g.localName!==r)&&(g=i()),l&&(l.used.add(g),l.wanted.push(g)),u.get(g)!==a&&(g.setAttribute("data-wutu",a),u.set(g,a)),l||(g.getAttribute("data-wutu-root")!==e&&g.setAttribute("data-wutu-root",e),d&&(d.root=g)),g}function P(e,t,r){let i=o.get(e),l=i?null:new Set([...e.attributes].map(a=>a.name).filter(a=>r?r.has(a):!a.startsWith("data-wutu")&&!t.includes(a)));return c.push({node:e,meta:i,before:l,old:e.childNodes,used:new Set,wanted:[],attrs:null,byKey:null,keyed:null}),e}function ue(e,t,r,i){return P(O(r,i,e,()=>t?document.createElementNS("http://www.w3.org/2000/svg",e):document.createElement(e)),[])}let q=new WeakMap;function K(e,t){let r=q.get(e);return r||q.set(e,r=de(e,t)),r}function de(e,t){let r=([i,l,...a],k)=>{k=k||i==="svg";let w=k?document.createElementNS("http://www.w3.org/2000/svg",i):document.createElement(i);for(let S in l)w.setAttribute(S,l[S]);let g=k&&i!=="foreignObject";for(let S of a)w.append(typeof S=="string"?S:r(S,g));return w};return[r(e,t),Object.keys(e[1])]}function A(e){let t=c.at(-1);if(e?.nodeType){t.wanted.includes(e)||(t.used.add(e),t.wanted.push(e));return}let r=String(e??""),i=t.old[t.wanted.length];!i||i.nodeType!==3||t.used.has(i)?i=document.createTextNode(r):i.data!==r&&(i.data=r),t.used.add(i),t.wanted.push(i)}function C(e,t,r){if((c.at(-1).attrs??=new Set).add(t),r===null||r===!1){e.removeAttribute(t);return}let i=r===!0?"":String(r);e.getAttribute(t)!==i&&e.setAttribute(t,i)}function D(e,t,r){if(t==="mount"){if(v.has(e))return;v.add(e);let k=d;queueMicrotask(()=>{r(new Event("mount")),M(),k&&z(k)});return}let i=t[0]==="~";i&&(t=t.slice(1));let l=s.get(e);l||s.set(e,l=new Map);let a=l.get(t);a||(a={handlers:[],generation:-1,view:d},l.set(t,a),e.addEventListener(t,k=>{let w=!1;try{for(let[g,S]of[...a.handlers]){S||(w=!0);let E=g(k);E?.then&&E.then(W,N=>{W(),setTimeout(()=>{throw N})})}}finally{w&&(M(),a.view&&z(a.view))}})),a.generation!==j&&(a.handlers=[],a.generation=j),a.handlers.push([r,i]),a.view=d}function J(){let e=c.pop(),t=e.node,r=e.attrs??oe;if(t.hasAttribute("data-wutu-unmanaged"))return e.meta||t.replaceChildren(),o.set(t,{...o.get(t),attrs:r}),t;let i=e.meta;for(let a of i?i.attrs:e.before)r.has(a)||t.removeAttribute(a);i?i.attrs=r:o.set(t,{attrs:r}),ie(t,e.wanted);let l=B.get(t);return l!==void 0&&t.value!==l&&(t.value=l),t}let F=new Map,G=["end"],_=null;function fe(e){let t=F.get(e);if(!t){let r=2166136261;for(let i=0;i<e.length;i++)r=Math.imul(r^e.charCodeAt(i),16777619);F.set(e,t=[JSON.parse(e),(r>>>0).toString(36)])}_={h:t[1],nodes:[],stack:[{ops:t[0],pc:0,kind:"top"}],outer:_,pending:null}}let V=new WeakMap;function me(e,t){let r=V.get(e);r||V.set(e,r=[]);let i=r[t];if(!i){i=r[t]=new Set;for(let l=t;l<e.length;l++){let[a,k]=e[l];if(a==="a"||a==="b")i.add(k);else if(a==="m")i.add("class");else if(a!=="n"&&a!=="y")break}}return i}function T(){for(;;){let e=_.stack.at(-1);if(e.pc>=e.ops.length){if(e.kind==="arm"){_.stack.pop();continue}return e.kind==="body"?G:null}let t=e.ops[e.pc++];switch(t[0]){case"s":{let[r]=K(t[2],!!t[3]);_.nodes[t[1]]=O(`v${_.h}:${t[1]}`,"",r.localName,()=>r.cloneNode(!0));break}case"o":{let[r,i]=K(t[2],!!t[3]);_.nodes[t[1]]=P(O(`v${_.h}:${t[1]}`,"",r.localName,()=>r.cloneNode(!1)),i,me(e.ops,e.pc));break}case"c":J();break;case"t":A(t[1]);break;default:return t}}}function pe(e){if(_?.pending){_.pending=null,A(e),p.pop();return}if(!_){A(e),p.pop();return}let t=T(),r=c.at(-1)?.node;switch(t[0]){case"a":C(r,t[1],e);break;case"m":C(r,"class",t[1]+e);break;case"b":C(r,t[1],!!e);break;case"y":(c.at(-1).attrs??=new Set).add("style"),r.style.setProperty(t[1],e);break;case"w":A(e);break;case"v":D(_.nodes[t[1]],t[2],e);break;default:throw new Error("Wutu: a value where the template has "+JSON.stringify(t?.[0]))}}function ge(){let e=T();p.push({value:`call:${_.h}:${e[1]}`,explicit:!1}),_.pending=e}function he(e){let t=T();_.stack.push({ops:e?t[1]:t[2],pc:0,kind:"arm"})}function H(){let e=T();if(e!==G)return[e,null];let t=_.stack.at(-1);return p.pop(),t.loop[1]===0&&p.pop(),[t.loop,t]}function be(e){let[t,r]=H();r?r.pc=0:_.stack.push({ops:t[3],pc:0,kind:"body",loop:t});let i=String(e),l=t[1];l===0?(p.push({value:`loop:${_.h}:${t[2]}`,explicit:!1}),p.push({value:i,explicit:!1})):p.push({value:i,explicit:!0,global:l===2,depth:c.length})}function _e(){let[,e]=H();e&&_.stack.pop()}function we(){return _.nodes[T()[1]]}function ye(){for(;T()!==null;);let e=_.nodes[0];return _=_.outer,e}function $(e){let t=[c,d,p],r=document.activeElement;e.cleanupIndex=0,e.cleanupCallbacks??=[],e.intervalsSeen=new Set,e.removals=new Set,e.retained=new Set,e.globalNodes=null,e.globalClaims=new Set,c=[],d=e,p=[],j++;try{e.root=e.render();for(let i of e.cleanupCallbacks.splice(e.cleanupIndex))i();for(let[i,l]of e.effects)e.intervalsSeen.has(i)||(clearInterval(l.id),e.effects.delete(i));for(let i of e.removals)e.retained.has(i)||(R(i),i.remove());r?.isConnected&&document.activeElement!==r&&r.focus({preventScroll:!0})}finally{[c,d,p]=t,e.globalNodes=null,e.removals.clear(),e.retained.clear()}return e.root}function ke(e,t=""){if(d&&!t)return e();if(t){let l=h.get(t)?.deref();if(l?.root.isConnected)return l.dirty&&(l.dirty=!1,$(l)),l.root}let r={render:e,root:null,scope:t,dirty:!1,cleanupCallbacks:[],effects:new Map},i=$(r);return f.add(new WeakRef(r)),t&&h.set(t,new WeakRef(r)),o.set(i,{...o.get(i),view:r}),i}function Y(){I=!1;let e=[...b];b.clear();for(let t of e)t.root.isConnected&&(t.dirty=!1,$(t));for(let t of y.splice(0))t()}function W(){for(let e of f){let t=e.deref();if(!t){f.delete(e);continue}t.root.isConnected&&b.add(t)}M(),Y()}function z(e){e&&b.add(e),!I&&(I=!0,queueMicrotask(Y))}function R(e){let t=o.get(e)?.view;if(t){for(let r of t.cleanupCallbacks.splice(0))r();for(let r of t.effects.values())clearInterval(r.id);t.effects.clear(),t.scope&&h.delete(t.scope)}for(let r of e.children??[])R(r)}globalThis.addEventListener?.("hashchange",W),globalThis.addEventListener?.("popstate",W);let Q={enter:ue,append:A,attr:C,listen:D,leave:J,mount:ke,refresh:W,invalidate:ne,selectValue:re,here:m,put:pe,begin:fe,slot:ge,arm:he,item:be,end:_e,node:we,done:ye,storageError:"",notify(){for(let e of f){let t=e.deref();t?.root.isConnected&&z(t)}},interval(e,t,r){let i=d;if(!i)return;i.intervalsSeen.add(e);let l=i.effects.get(e);if(l){l.callback=r;return}let a={callback:r,id:0};a.id=setInterval(()=>{a.callback(),M(),z(i)},Math.max(16,t)),i.effects.set(e,a)},memoHit(e){if(!e||!d)return!1;let t=d.memo?.get(m());return t?.key!==e||!t.node?.isConnected?!1:(x=t.node,!0)},memoLast(){return x},memoKeep(e,t){e&&d&&(d.memo??=new Map).set(m(),{key:e,node:t})},after(e){y.push(e),z()},focus(e){y.push(()=>document.getElementById(e)?.focus()),z()},cleanup(e){d&&(d.cleanupCallbacks[d.cleanupIndex++]=e)},pushGlobal:e=>p.push({value:String(e),explicit:!0,global:!0,depth:c.length}),pushKey:e=>p.push({value:String(e),explicit:!0,depth:c.length}),pushCall:e=>p.push({value:e,explicit:!1}),popKey:()=>p.pop()};return Q})()}),qe=(n=>()=>(o=>typeof o=="string"?o:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${o===null?"null":o instanceof Promise?"a Promise (await it: Promise[Str])":typeof o}`)})())(n()))(()=>location.hash.slice(1)||"/"),Ke=((n,o,s)=>({top:n,left:o,behavior:s})),De=((n,o,s)=>n[o](s)??null),Je=((n,o)=>({block:n,inline:o})),Fe=((...n)=>globalThis.__wutuLazy("./start.utu","page",n)),Ge=((...n)=>globalThis.__wutuLazy("./tour.utu","page",n)),Ve=((...n)=>globalThis.__wutuLazy("./iterators.utu","page",n)),He=((...n)=>globalThis.__wutuLazy("./stdlib.utu","page",n)),Ye=((...n)=>globalThis.__wutuLazy("./javascript.utu","page",n)),Qe=((...n)=>globalThis.__wutuLazy("./data.utu","page",n)),Xe=((...n)=>globalThis.__wutuLazy("./web.utu","page",n)),Ze=((...n)=>globalThis.__wutuLazy("./tooling.utu","page",n)),et=((...n)=>globalThis.__wutuLazy("./compiler.utu","page",n)),tt=((...n)=>globalThis.__wutuLazy("./benchmarks.utu","page",n)),nt=(n=>o=>(s=>typeof s=="string"?s:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${s===null?"null":s instanceof Promise?"a Promise (await it: Promise[Str])":typeof s}`)})())(n(o)))(n=>{try{if(!n)return"";let o=JSON.parse(n);if(o.version!==1||!(o.data!==null&&typeof o.data=="object"&&!Array.isArray(o.data)&&typeof o.data.source=="string"))throw Error("Stored schema mismatch");return JSON.stringify(o.data)}catch(o){return globalThis.__utuWutu.storageError=String(o.message??o),""}}),ot=((n,o)=>(s=>typeof s=="string"?s:(()=>{throw new TypeError("expected string")})())(n[o])),rt=(n=>o=>(s=>typeof s=="string"?s:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${s===null?"null":s instanceof Promise?"a Promise (await it: Promise[Str])":typeof s}`)})())(n(o)))(n=>{try{return localStorage.getItem(n)??""}catch(o){return globalThis.__utuWutu.storageError=String(o.message??o),""}}),it=(n=>(o,s,f,h)=>n(o,s,!!f,h))((n,o,s,f)=>globalThis.__utuWutu.store(n,o,!!s,f)),st=(n=>({source:n})),at=((n,o)=>({version:n,data:o})),lt=((n,o,s)=>import(new URL("./playground/playground.js?v=57dfb9850087",document.baseURI).href).then(f=>f.schedule(n,o,s)).catch(f=>s("Could not load the compiler",String(f),!0))),ct=(()=>globalThis.__utuWutu.node()),ut=(n=>globalThis.__utuWutu.arm(n)),dt=(()=>{if(!document.getElementById("wutu-124igqj")){let n=document.createElement("style");n.id="wutu-124igqj",n.textContent=`.wa925av{display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:1rem;margin-block:1.5rem;inline-size:min(100%, 76rem);@media (width < 72rem){
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
                        }}.w18jcedk{inline-size:100%;block-size:100%;border:0;background:white;}.w1tku8aq{margin-block-start:0;inline-size:min(100%, 76rem);white-space:pre-wrap;}.wnoe2ce{padding:0.4rem 0.8rem;font:inherit;font-size:0.9rem;color:var(--ink);background:var(--tint);border:1px solid var(--line);cursor:pointer;}`,document.head.append(n)}}),ft=((n,o)=>n[o]),mt=((n,o,s)=>{n[o]=s}),pt=(n=>n instanceof globalThis.KeyboardEvent?n:null),gt=((n,o)=>n[o]()),ht=((n,o,s,f,h,b)=>n[o](s,f,h,b)),bt=((n,o)=>n[o]?1:0),_t=(n=>o=>n(BigInt.asUintN(64,o)))(n=>globalThis.__utuWutu.item(n)),wt=(n=>globalThis.__utuWutu?.after(n)),yt=(()=>{(function(o){if(o.store)return;let s=new Map,f=180,h;function b(m){let u=String(m.message??m);o.storageError!==u&&(o.storageError=u,o.notify())}function y(){clearTimeout(h);for(let[m,u]of s)if(!(!u.dirty||u.conflict))try{let c=u.encode();c!==u.last&&(localStorage.setItem(m,c),u.last=c),u.dirty=!1}catch(c){b(c)}}function v(m){let u=s.get(m);u&&(u.conflict=!1,u.dirty=!0,clearTimeout(h),h=setTimeout(y,f))}o.flush=y,o.save=v,o.autoSave=()=>{for(let[m,u]of s)!u.manual&&!u.conflict&&v(m)},o.store=(m,u,c=!1,d=null)=>{let p=null;try{p=localStorage.getItem(m)}catch{}s.set(m,{encode:u,manual:c,apply:d,last:p,dirty:!1})},o.reload=m=>{let u=s.get(m);if(u)try{let c=localStorage.getItem(m);u.apply?.(c??""),u.last=c,u.dirty=!1,u.conflict=!1,o.storageError="",o.refresh()}catch(c){b(c)}};let x=(...m)=>globalThis.addEventListener?.(...m);x("pagehide",y),x("visibilitychange",()=>{document.visibilityState==="hidden"&&y()}),x("storage",m=>{let u=s.get(m.key);if(u){if(u.dirty){u.conflict=!0,clearTimeout(h),b("Unsaved local changes conflict with another tab. Reload or explicitly save to keep this tab.");return}try{u.apply?.(m.newValue??""),u.last=m.newValue,o.refresh()}catch(c){b(c)}}})})(globalThis.__utuWutu)}),kt=(()=>globalThis.__utuWutu?.refresh());function te(){let n=new Map,o=0;return(s,f,h)=>{let b=globalThis.__utuWutu.here()+"|"+s+"|"+f,y=b+"|"+h.map(c=>c!==null&&typeof c=="object"?"#":String(c)).join(""),v=n.get(b);if(v?.key===y&&!v.node.hasAttribute("data-wutu-lazy-error"))return v.node;let x=v?.key===y?v.node:[...document.querySelectorAll("[data-wutu-lazy]")].find(c=>c.getAttribute("data-wutu-lazy")===y)??document.createElement("div");x.setAttribute("data-wutu-lazy",y),x.removeAttribute("data-wutu-lazy-error"),n.set(b,{key:y,node:x});let m=globalThis.__wutuChunks?.[s];if(!m)return console.error("Wutu: no chunk was built for "+s),x;let u=v?.key===y?(v.tries??0)+1:0;return n.get(b).tries=u,o++,document.documentElement.setAttribute("data-wutu-loading",""),(u?import(m+"?retry="+u):import(m)).then(c=>{let d=c.exports?.[f];if(typeof d!="function")throw c.error??new Error("Wutu: chunk for "+s+" has no "+f);x.replaceChildren(d(...h))}).catch(c=>{x.setAttribute("data-wutu-lazy-error",""),console.error(c)}).finally(()=>{--o===0&&document.documentElement.removeAttribute("data-wutu-loading")}),x}}globalThis.__wutuChunks={...globalThis.__wutuChunks,"./start.utu":new URL("./chunks/start-80b8378422/app.js",import.meta.url).href,"./tour.utu":new URL("./chunks/tour-5948be5e1b/app.js",import.meta.url).href,"./iterators.utu":new URL("./chunks/iterators-05f39f0fc7/app.js",import.meta.url).href,"./stdlib.utu":new URL("./chunks/stdlib-17ba96e609/app.js",import.meta.url).href,"./javascript.utu":new URL("./chunks/javascript-29d30594bf/app.js",import.meta.url).href,"./data.utu":new URL("./chunks/data-67e241b793/app.js",import.meta.url).href,"./web.utu":new URL("./chunks/web-0239bc28c9/app.js",import.meta.url).href,"./tooling.utu":new URL("./chunks/tooling-84eab3bf11/app.js",import.meta.url).href,"./compiler.utu":new URL("./chunks/compiler-cbcccfd10c/app.js",import.meta.url).href,"./benchmarks.utu":new URL("./chunks/benchmarks-0b334354d8/app.js",import.meta.url).href};globalThis.__wutuLazy??=te();try{let n=ee({es:{__foreign_0:"",__foreign_1:"",__foreign_2:"",__foreign_3:"",__foreign_4:"",__foreign_5:"",__es_6:"",__es_7:"",__es_8:"",__es_9:"",__es_10:"",__es_11:"",__es_12:"",__es_13:"",__es_14:"",__es_15:"",__es_16:"",__es_17:"",__es_18:"",__foreign_6:"",__foreign_7:"",__foreign_8:"",__es_22:"",__es_23:"",__es_24:"",__es_25:"",__es_26:"",__es_27:"",__es_28:"",__es_29:"",__es_30:"",__es_31:"",__es_32:"",__foreign_9:"",__es_34:"",__es_35:"",__foreign_10:"",__foreign_11:"",__es_38:"",__es_39:"",__es_40:"",__es_41:"",__foreign_12:"",__foreign_13:"",__foreign_14:"",__foreign_15:"",__foreign_16:"",__foreign_17:"",__es_49:"",__es_54:"",__es_55:"",__es_56:""}},U);n.utu=Z({new:!0,calls:["closure_call_0"]},n.utu);let o=await WebAssembly.compileStreaming(fetch(new URL("./app.wasm?v=56fdd882562f",import.meta.url)),{builtins:["js-string"],importedStringConstants:"'"}),f=(await WebAssembly.instantiate(o,n)).exports;document.querySelectorAll("[data-utu-static]").forEach(h=>h.remove()),await f.main?.(),document.documentElement.setAttribute("data-utu-ready","")}catch(n){document.documentElement.setAttribute("data-utu-error",String(n.message??n));let o=document.createElement("p");o.setAttribute("role","status"),o.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.",document.body.append(o),console.error(n)}
