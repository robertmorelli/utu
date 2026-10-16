var we=Object.defineProperty;var ye=(t,o)=>{for(var a in o)we(t,a,{get:o[a],enumerable:!0})};function Q(t,o={}){if(!t)return o;t.new&&(o.closure_new=(f,b,w)=>{let x=b==null&&!(w&2)?(...k)=>f(...k):(...k)=>f(b,...k);return w&1?(...k)=>!!x(...k):x});let a=(f,...b)=>f(...b);for(let f of t.calls??[])o[f]=a;return o}function X(t,o){let a={};for(let[f,b]of Object.entries(t??{})){a[f]={};for(let w of Object.keys(b??{})){if(!(w in o))continue;let x=o[w];a[f][w]=typeof x=="function"?x:()=>x}}return a}var R={};ye(R,{__es_10:()=>We,__es_11:()=>Ne,__es_12:()=>Ce,__es_13:()=>je,__es_14:()=>Oe,__es_15:()=>Be,__es_19:()=>Le,__es_21:()=>Pe,__es_22:()=>Fe,__es_25:()=>Je,__es_26:()=>De,__es_27:()=>Ve,__es_28:()=>Ye,__es_35:()=>tn,__es_36:()=>on,__es_37:()=>rn,__es_38:()=>sn,__es_39:()=>an,__es_40:()=>ln,__es_41:()=>cn,__es_42:()=>dn,__es_43:()=>un,__es_44:()=>mn,__es_6:()=>Ae,__es_7:()=>Ie,__es_8:()=>Te,__es_9:()=>Me,__foreign_0:()=>xe,__foreign_1:()=>ke,__foreign_10:()=>Ge,__foreign_11:()=>Ke,__foreign_12:()=>He,__foreign_13:()=>Qe,__foreign_14:()=>Xe,__foreign_15:()=>Ze,__foreign_16:()=>en,__foreign_17:()=>nn,__foreign_2:()=>ve,__foreign_3:()=>ze,__foreign_4:()=>Ee,__foreign_5:()=>Se,__foreign_6:()=>$e,__foreign_7:()=>Ue,__foreign_8:()=>Re,__foreign_9:()=>qe});var xe=(t=>globalThis[t]),ke=((t,o,a)=>t[o](a)),ve=((t,o,a)=>{t[o]=a}),ze=((t,o)=>t[o]),Ee=((t,o)=>globalThis[t](o)),Se=((t,o,a)=>t[o](a)),Ae=((t,o)=>globalThis.__utuWutu.mount(t,o)),Ie=(()=>globalThis.__utuWutu.slot()),Te=(t=>globalThis.__utuWutu.put(t)),Me=(t=>globalThis.__utuWutu.item(t)),We=(()=>globalThis.__utuWutu.end()),Ne=(t=>globalThis.__utuWutu.begin(t)),Ce=(()=>globalThis.__utuWutu.done()),je=(()=>{if(!document.getElementById("wutu-1cxsr0f")){let t=document.createElement("style");t.id="wutu-1cxsr0f",t.textContent=`
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
            max-inline-size: 44rem;
            padding: clamp(2rem, 6vw, 5rem) clamp(1.25rem, 5vw, 4rem) 6rem;
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
        div.editor > pre.code {
            margin: 0;
            overflow: hidden;
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
                }}.wu7hoyu{min-inline-size:0;}.w1nf506q{padding:1.5rem clamp(1rem, 4vw, 3rem) 3rem;border-block-start:1px solid var(--line);color:var(--muted);font-size:0.9rem;display:flex;flex-wrap:wrap;gap:0.5rem 2rem;justify-content:space-between;}`,document.head.append(t)}}),Oe=(()=>{globalThis.__utuWutu??=(function(){let o=new WeakMap,a=new WeakMap,f=new Set,b=new Map,w=new Set,x=[],k=new Set,p=new WeakMap,l=new Map,d=[],u=null,m=[],W=!1,N=0;function Z(e){if(k.has(e)||(k.add(e),[...document.querySelectorAll("style")].some(r=>r.textContent===e)))return;let n=document.createElement("style");n.textContent=e,document.head.append(n)}function C(){H.autoSave?.()}function ee(e){let n=b.get(e)?.deref();n&&(n.dirty=!0,S(n))}let ne=new Set;function j(e){let n=p.get(e);return n===void 0&&p.set(e,n=e.getAttribute("data-wutu")),n}function te(e,n){let r=e.childNodes;if(r.length===n.length){let _=!0;for(let c=0;_&&c<n.length;c++)_=r[c]===n[c];if(_)return}let i=document.activeElement,s=i&&"selectionStart"in i?[i.selectionStart,i.selectionEnd,i.selectionDirection]:null,h=e.firstChild;for(let _ of n){if(_===h){h=h.nextSibling;continue}e.moveBefore&&_.parentNode===e?e.moveBefore(_,h):e.insertBefore(_,h)}let y=new Set(n);for(let _ of[...e.childNodes])y.has(_)||(u?u.removals.add(_):($(_),_.remove()));i?.isConnected&&document.activeElement!==i&&(i.focus({preventScroll:!0}),s?.[0]!=null&&i.setSelectionRange(...s))}function oe(e,n,r,i){if(r&&u){if(u.globalClaims.has(n))throw new Error("Duplicate global Wutu key: "+n);u.globalClaims.add(n)}if(i&&e){if(e.keyed??=new Set,e.keyed.has(n))throw new Error("Duplicate Wutu key: "+m.findLast(s=>s.explicit).value);e.keyed.add(n)}}function re(e,n,r,i){let s=e?.old[e.wanted.length];if(s?.nodeType===1&&s.localName===r&&j(s)===n&&!e.used.has(s))return s;let h=e&&ie(e).get(n);for(;h&&h.index<h.nodes.length;){let y=h.nodes[h.index++];if(!e.used.has(y)&&y.localName===r)return y}return i?se(n):void 0}function ie(e){if(e.byKey)return e.byKey;e.byKey=new Map;for(let n of e.old){if(n.nodeType!==1)continue;let r=j(n),i=e.byKey.get(r);i||e.byKey.set(r,i={nodes:[],index:0}),i.nodes.push(n)}return e.byKey}function se(e){if(u){if(!u.globalNodes){u.globalNodes=new Map;for(let n of u.root?.querySelectorAll("[data-wutu]")??[])u.globalNodes.set(j(n),n)}return u.globalNodes.get(e)}}function A(e,n,r,i){let s=d.at(-1),h=e+(n?":"+n:""),y=!1,_=!1;if(m.length){let z=0;for(let v=0;v<m.length;v++)m[v].global&&(z=v,y=m[v].depth===d.length),m[v].explicit&&(_=m[v].depth===d.length);for(let v=z;v<m.length;v++){let U=m[v];h+=`:${U.explicit?"k":"c"}${U.value.length}:${U.value}`}}oe(s,h,y,_);let c=re(s,h,r,y);return c&&u?.retained.add(c),s||(c=u?.root??document.querySelector(`[data-wutu-root="${e}"][data-wutu-prerender]`)),c&&!p.has(c)&&(c.removeAttribute("data-wutu-prerender"),c.hasAttribute("data-wutu-pending")&&(c.disabled=!1,c.removeAttribute("data-wutu-pending"))),(!c||c.localName!==r)&&(c=i()),s&&(s.used.add(c),s.wanted.push(c)),p.get(c)!==h&&(c.setAttribute("data-wutu",h),p.set(c,h)),s||(c.getAttribute("data-wutu-root")!==e&&c.setAttribute("data-wutu-root",e),u&&(u.root=c)),c}function O(e,n){let r=o.get(e),i=r?null:new Set([...e.attributes].map(s=>s.name).filter(s=>!s.startsWith("data-wutu")&&!n.includes(s)));return d.push({node:e,meta:r,before:i,old:e.childNodes,used:new Set,wanted:[],attrs:null,byKey:null,keyed:null}),e}function ae(e,n,r,i){return O(A(r,i,e,()=>n?document.createElementNS("http://www.w3.org/2000/svg",e):document.createElement(e)),[])}function L(e,n){let r=l.get(e);return r||l.set(e,r=F(JSON.parse(e),n)),r}let q=new WeakMap;function P(e,n){let r=q.get(e);return r||q.set(e,r=F(e,n)),r}function F(e,n){let r=([i,s,...h],y)=>{y=y||i==="svg";let _=y?document.createElementNS("http://www.w3.org/2000/svg",i):document.createElement(i);for(let z in s)_.setAttribute(z,s[z]);let c=y&&i!=="foreignObject";for(let z of h)_.append(typeof z=="string"?z:r(z,c));return _};return[r(e,n),Object.keys(e[1])]}function le(e,n,r){let[i,s]=L(e,n);return O(A(r,"",i.localName,()=>i.cloneNode(!1)),s)}function ce(e,n,r){let[i]=L(e,n);return A(r,"",i.localName,()=>i.cloneNode(!0))}function I(e){let n=d.at(-1);if(e?.nodeType){n.wanted.includes(e)||(n.used.add(e),n.wanted.push(e));return}let r=String(e??""),i=n.old[n.wanted.length];!i||i.nodeType!==3||n.used.has(i)?i=document.createTextNode(r):i.data!==r&&(i.data=r),n.used.add(i),n.wanted.push(i)}function M(e,n,r){if((d.at(-1).attrs??=new Set).add(n),r===null||r===!1){e.removeAttribute(n);return}let i=r===!0?"":String(r);e.getAttribute(n)!==i&&e.setAttribute(n,i)}function G(e,n,r){let i=a.get(e);i||a.set(e,i=new Map);let s=i.get(n);s||(s={handlers:[],generation:-1,view:u},i.set(n,s),e.addEventListener(n,h=>{try{for(let y of[...s.handlers]){let _=y(h);_?.then&&_.then(T,c=>{T(),setTimeout(()=>{throw c})})}}finally{C(),s.view&&S(s.view)}})),s.generation!==N&&(s.handlers=[],s.generation=N),s.handlers.push(r),s.view=u}function K(){let e=d.pop(),n=e.node,r=e.attrs??ne,i=e.meta;for(let s of i?i.attrs:e.before)r.has(s)||n.removeAttribute(s);return i?i.attrs=r:o.set(n,{attrs:r}),te(n,e.wanted),n}let J=new Map,D=["end"],g=null;function de(e){let n=J.get(e);if(!n){let r=2166136261;for(let i=0;i<e.length;i++)r=Math.imul(r^e.charCodeAt(i),16777619);J.set(e,n=[JSON.parse(e),(r>>>0).toString(36)])}g={h:n[1],nodes:[],stack:[{ops:n[0],pc:0,kind:"top"}],outer:g,pending:null}}function E(){for(;;){let e=g.stack.at(-1);if(e.pc>=e.ops.length){if(e.kind==="arm"){g.stack.pop();continue}return e.kind==="body"?D:null}let n=e.ops[e.pc++];switch(n[0]){case"s":{let[r]=P(n[2],!!n[3]);g.nodes[n[1]]=A(`v${g.h}:${n[1]}`,"",r.localName,()=>r.cloneNode(!0));break}case"o":{let[r,i]=P(n[2],!!n[3]);g.nodes[n[1]]=O(A(`v${g.h}:${n[1]}`,"",r.localName,()=>r.cloneNode(!1)),i);break}case"c":K();break;case"t":I(n[1]);break;default:return n}}}function ue(e){if(g?.pending){g.pending=null,I(e),m.pop();return}if(!g){I(e),m.pop();return}let n=E(),r=d.at(-1)?.node;switch(n[0]){case"a":M(r,n[1],e);break;case"m":M(r,"class",n[1]+e);break;case"b":M(r,n[1],!!e);break;case"y":r.style.setProperty(n[1],e);break;case"w":I(e);break;case"v":G(g.nodes[n[1]],n[2],e);break;default:throw new Error("Wutu: a value where the template has "+JSON.stringify(n?.[0]))}}function me(){let e=E();m.push({value:`call:${g.h}:${e[1]}`,explicit:!1}),g.pending=e}function fe(e){let n=E();g.stack.push({ops:e?n[1]:n[2],pc:0,kind:"arm"})}function V(){let e=E();if(e!==D)return[e,null];let n=g.stack.at(-1);return m.pop(),n.loop[1]===0&&m.pop(),[n.loop,n]}function pe(e){let[n,r]=V();r?r.pc=0:g.stack.push({ops:n[3],pc:0,kind:"body",loop:n});let i=String(e),s=n[1];s===0?(m.push({value:`loop:${g.h}:${n[2]}`,explicit:!1}),m.push({value:i,explicit:!1})):m.push({value:i,explicit:!0,global:s===2,depth:d.length})}function ge(){let[,e]=V();e&&g.stack.pop()}function _e(){return g.nodes[E()[1]]}function he(){for(;E()!==null;);let e=g.nodes[0];return g=g.outer,e}function B(e){let n=[d,u,m],r=document.activeElement;e.cleanupIndex=0,e.cleanupCallbacks??=[],e.removals=new Set,e.retained=new Set,e.globalNodes=null,e.globalClaims=new Set,d=[],u=e,m=[],N++;try{e.root=e.render();for(let i of e.cleanupCallbacks.splice(e.cleanupIndex))i();for(let i of e.removals)e.retained.has(i)||($(i),i.remove());r?.isConnected&&document.activeElement!==r&&r.focus({preventScroll:!0})}finally{[d,u,m]=n,e.globalNodes=null,e.removals.clear(),e.retained.clear()}return e.root}function be(e,n=""){if(u&&!n)return e();if(n){let s=b.get(n)?.deref();if(s?.root.isConnected)return s.dirty&&(s.dirty=!1,B(s)),s.root}let r={render:e,root:null,scope:n,dirty:!1,cleanups:[],cleanupCallbacks:[],effects:new Map},i=B(r);return f.add(new WeakRef(r)),n&&b.set(n,new WeakRef(r)),o.set(i,{...o.get(i),view:r}),i}function Y(){W=!1;let e=[...w];w.clear();for(let n of e)n.root.isConnected&&(n.dirty=!1,B(n));for(let n of x.splice(0))n()}function T(){for(let e of f){let n=e.deref();if(!n){f.delete(e);continue}n.root.isConnected&&w.add(n)}C(),Y()}function S(e){e&&w.add(e),!W&&(W=!0,queueMicrotask(Y))}function $(e){let n=o.get(e)?.view;if(n){for(let r of[...n.cleanups.splice(0),...n.cleanupCallbacks.splice(0)])r();n.scope&&b.delete(n.scope)}for(let r of e.children??[])$(r)}addEventListener("hashchange",T),addEventListener("popstate",T);let H={enter:ae,shell:le,still:ce,append:I,attr:M,listen:G,leave:K,mount:be,refresh:T,invalidate:ee,style:Z,put:ue,begin:de,slot:me,arm:fe,item:pe,end:ge,node:_e,done:he,storageError:"",notify(){for(let e of f){let n=e.deref();n?.root.isConnected&&S(n)}},interval(e,n,r){let i=u;if(!i||i.effects.has(e))return;let s=setInterval(()=>{r(),C(),S(i)},Math.max(16,n));i.effects.set(e,s),i.cleanups.push(()=>clearInterval(s))},after(e){x.push(e),S()},focus(e){x.push(()=>document.getElementById(e)?.focus()),S()},cleanup(e){u&&(u.cleanupCallbacks[u.cleanupIndex++]=e)},pushGlobal:e=>m.push({value:String(e),explicit:!0,global:!0,depth:d.length}),pushKey:e=>m.push({value:String(e),explicit:!0,depth:d.length}),pushCall:e=>m.push({value:e,explicit:!1}),popKey:()=>m.pop()};return H})()}),Be=(()=>location.hash.slice(1)||"/"),$e=((t,o,a)=>({top:t,left:o,behavior:a})),Ue=((t,o,a)=>t[o](a)??null),Re=((t,o)=>({block:t,inline:o})),Le=(t=>{try{if(!t)return"";let o=JSON.parse(t);if(o.version!==1||!(o.data!==null&&typeof o.data=="object"&&!Array.isArray(o.data)&&typeof o.data.source=="string"))throw Error("Stored schema mismatch");return JSON.stringify(o.data)}catch(o){return globalThis.__utuWutu.storageError=String(o.message??o),""}}),qe=((t,o)=>(a=>typeof a=="string"?a:(()=>{throw new TypeError("expected string")})())(t[o])),Pe=(t=>{try{return localStorage.getItem(t)??""}catch(o){return globalThis.__utuWutu.storageError=String(o.message??o),""}}),Fe=((t,o,a,f)=>globalThis.__utuWutu.store(t,o,!!a,f)),Ge=(t=>({source:t})),Ke=((t,o)=>({version:t,data:o})),Je=((t,o,a)=>import(new URL("./playground/playground.js?v=6473f0e01d07",document.baseURI).href).then(f=>f.schedule(t,o,a)).catch(f=>a("Could not load the compiler",String(f),!0))),De=(()=>globalThis.__utuWutu.node()),Ve=(t=>globalThis.__utuWutu.arm(t)),Ye=(()=>{if(!document.getElementById("wutu-124igqj")){let t=document.createElement("style");t.id="wutu-124igqj",t.textContent=`.wa925av{display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:1rem;margin-block:1.5rem;inline-size:min(100%, 76rem);@media (width < 72rem){
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
                        }}.w18jcedk{inline-size:100%;block-size:100%;border:0;background:white;}.w1tku8aq{margin-block-start:0;inline-size:min(100%, 76rem);white-space:pre-wrap;}.wnoe2ce{padding:0.4rem 0.8rem;font:inherit;font-size:0.9rem;color:var(--ink);background:var(--tint);border:1px solid var(--line);cursor:pointer;}`,document.head.append(t)}}),He=((t,o)=>t[o]),Qe=((t,o,a)=>{t[o]=a}),Xe=(t=>t instanceof globalThis.KeyboardEvent?t:null),Ze=((t,o)=>t[o]()),en=((t,o,a,f,b,w)=>t[o](a,f,b,w)),nn=((t,o)=>t[o]?1:0),tn=(t=>globalThis.__utuWutu.item(t)),on=(()=>{if(!document.getElementById("wutu-1gkm6lf")){let t=document.createElement("style");t.id="wutu-1gkm6lf",t.textContent=".wntysms{white-space:normal;inline-size:46%;}",document.head.append(t)}}),rn=(()=>{if(!document.getElementById("wutu-l7isdb")){let t=document.createElement("style");t.id="wutu-l7isdb",t.textContent=".w17il4cy{margin-block:2.75rem 0;}.wdhonau{font-size:1.15rem;font-weight:600;margin-block-end:0.4rem;}",document.head.append(t)}}),sn=(()=>{if(!document.getElementById("wutu-iuh067")){let t=document.createElement("style");t.id="wutu-iuh067",t.textContent=".w1jnix1l{scroll-margin-block-start:1.5rem;}",document.head.append(t)}}),an=(()=>{if(!document.getElementById("wutu-qp5uzb")){let t=document.createElement("style");t.id="wutu-qp5uzb",t.textContent=`.w1crv4yn{display:flex;flex-wrap:wrap;gap:0.5rem;margin-block-start:1.75rem;}.w1nn1scx{font:inherit;font-size:0.95rem;padding:0.35rem 0.85rem;color:var(--ink);background:var(--tint);border:1px solid var(--line);cursor:pointer;&:hover{
                            border-color: var(--orange);
                        }}.w1kejgbz{margin-block-start:1.5rem;}`,document.head.append(t)}}),ln=(t=>document.getElementById(t)?.scrollIntoView({block:"start"})),cn=(t=>globalThis.__utuWutu?.after(t)),dn=(()=>{(function(o){if(o.store)return;let a=new Map,f=180,b;function w(p){let l=String(p.message??p);o.storageError!==l&&(o.storageError=l,o.notify())}function x(){clearTimeout(b);for(let[p,l]of a)if(!(!l.dirty||l.conflict))try{let d=l.encode();d!==l.last&&(localStorage.setItem(p,d),l.last=d),l.dirty=!1}catch(d){w(d)}}function k(p){let l=a.get(p);l&&(l.conflict=!1,l.dirty=!0,clearTimeout(b),b=setTimeout(x,f))}o.flush=x,o.save=k,o.autoSave=()=>{for(let[p,l]of a)!l.manual&&!l.conflict&&k(p)},o.store=(p,l,d=!1,u=null)=>{let m=null;try{m=localStorage.getItem(p)}catch{}a.set(p,{encode:l,manual:d,apply:u,last:m,dirty:!1})},o.reload=p=>{let l=a.get(p);if(l)try{let d=localStorage.getItem(p);l.apply?.(d??""),l.last=d,l.dirty=!1,l.conflict=!1,o.storageError="",o.refresh()}catch(d){w(d)}},addEventListener("pagehide",x),addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&x()}),addEventListener("storage",p=>{let l=a.get(p.key);if(l){if(l.dirty){l.conflict=!0,clearTimeout(b),w("Unsaved local changes conflict with another tab. Reload or explicitly save to keep this tab.");return}try{l.apply?.(p.newValue??""),l.last=p.newValue,o.refresh()}catch(d){w(d)}}})})(globalThis.__utuWutu)}),un=(()=>globalThis.__utuWutu?.refresh()),mn=((t,o,a)=>t.indexOf(o,a));try{let t=X({es:{__foreign_0:"",__foreign_1:"",__foreign_2:"",__foreign_3:"",__foreign_4:"",__foreign_5:"",__es_6:"",__es_7:"",__es_8:"",__es_9:"",__es_10:"",__es_11:"",__es_12:"",__es_13:"",__es_14:"",__es_15:"",__foreign_6:"",__foreign_7:"",__foreign_8:"",__es_19:"",__foreign_9:"",__es_21:"",__es_22:"",__foreign_10:"",__foreign_11:"",__es_25:"",__es_26:"",__es_27:"",__es_28:"",__foreign_12:"",__foreign_13:"",__foreign_14:"",__foreign_15:"",__foreign_16:"",__foreign_17:"",__es_35:"",__es_36:"",__es_37:"",__es_38:"",__es_39:"",__es_40:"",__es_41:"",__es_42:"",__es_43:"",__es_44:""}},R);t.utu=Q({new:!0,calls:["closure_call_0"]},t.utu);let o=await WebAssembly.compileStreaming(fetch(new URL("./app.wasm?v=2bd4cea8318a",import.meta.url)),{builtins:["js-string"],importedStringConstants:"'"}),f=(await WebAssembly.instantiate(o,t)).exports;document.querySelectorAll("[data-utu-static]").forEach(b=>b.remove()),await f.main?.(),document.documentElement.setAttribute("data-utu-ready","")}catch(t){document.documentElement.setAttribute("data-utu-error",String(t.message??t));let o=document.createElement("p");o.setAttribute("role","status"),o.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.",document.body.append(o),console.error(t)}
