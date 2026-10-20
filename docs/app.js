var Se=Object.defineProperty;var Te=(t,i)=>{for(var s in i)Se(t,s,{get:i[s],enumerable:!0})};function te(t,i={}){if(!t)return i;t.new&&(i.closure_new=(p,w,y)=>{let v=w==null&&!(y&2)?(...S)=>p(...S):(...S)=>p(w,...S);return y&1?(...S)=>!!v(...S):v});let s=(p,...w)=>p(...w);for(let p of t.calls??[])i[p]=s;return i}function oe(t,i){let s={};for(let[p,w]of Object.entries(t??{})){s[p]={};for(let y of Object.keys(w??{})){if(!(y in i))continue;let v=i[y];s[p][y]=typeof v=="function"?v:()=>v}}return s}var K={};Te(K,{__es_10:()=>Le,__es_11:()=>Re,__es_12:()=>Be,__es_13:()=>$e,__es_14:()=>qe,__es_15:()=>Pe,__es_16:()=>Ke,__es_17:()=>Fe,__es_18:()=>Ge,__es_22:()=>He,__es_23:()=>Ye,__es_24:()=>Qe,__es_25:()=>Xe,__es_26:()=>Ze,__es_27:()=>en,__es_28:()=>nn,__es_29:()=>tn,__es_30:()=>on,__es_31:()=>rn,__es_32:()=>an,__es_34:()=>ln,__es_35:()=>cn,__es_38:()=>mn,__es_39:()=>fn,__es_40:()=>pn,__es_41:()=>gn,__es_49:()=>kn,__es_54:()=>vn,__es_55:()=>zn,__es_56:()=>Sn,__es_6:()=>Ie,__es_7:()=>Ne,__es_8:()=>Oe,__es_9:()=>Ue,__foreign_0:()=>Ae,__foreign_1:()=>Ee,__foreign_10:()=>un,__foreign_11:()=>dn,__foreign_12:()=>_n,__foreign_13:()=>hn,__foreign_14:()=>bn,__foreign_15:()=>wn,__foreign_16:()=>yn,__foreign_17:()=>xn,__foreign_2:()=>We,__foreign_3:()=>je,__foreign_4:()=>Ce,__foreign_5:()=>Me,__foreign_6:()=>Je,__foreign_7:()=>De,__foreign_8:()=>Ve,__foreign_9:()=>sn});var Ae=(t=>globalThis[t]),Ee=((t,i,s)=>t[i](s)),We=((t,i,s)=>{t[i]=s}),je=((t,i)=>t[i]),Ce=((t,i)=>globalThis[t](i)),Me=((t,i,s)=>t[i](s)),Ie=((t,i)=>globalThis.__utuWutu.mount(t,i)),Ne=(t=>globalThis.__utuWutu.memoHit(t)),Oe=(t=>globalThis.__utuWutu.put(t)),Ue=(()=>globalThis.__utuWutu.memoLast()),Le=((t,i)=>globalThis.__utuWutu.memoKeep(t,i)),Re=(()=>globalThis.__utuWutu.slot()),Be=(t=>globalThis.__utuWutu.item(t)),$e=(()=>globalThis.__utuWutu.end()),qe=(t=>globalThis.__utuWutu.begin(t)),Pe=(()=>globalThis.__utuWutu.done()),Ke=(()=>{if(!document.getElementById("wutu-insj5b")){let t=document.createElement("style");t.id="wutu-insj5b",t.textContent=`@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap") layer(wutu.document);@layer wutu.document{
        
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
                }}.wu7hoyu{min-inline-size:0;}.w1nf506q{padding:1.5rem clamp(1rem, 4vw, 3rem) 3rem;border-block-start:1px solid var(--line);color:var(--muted);font-size:0.9rem;display:flex;flex-wrap:wrap;gap:0.5rem 2rem;justify-content:space-between;}`,document.head.append(t)}}),Fe=(()=>{globalThis.__utuWutu??=(function(){let i=new WeakMap,s=new WeakMap,p=new Set,w=new Map,y=new Set,v=[],S=new Set,b=new WeakSet,d=new Map,x=null,N=()=>g.map(e=>e.value).join("|"),E=0,W=new WeakMap,F=new Map,z=[],m=null,g=[],L=!1,R=0;function re(e){let n="",o="",r=0;for(let a=e.indexOf("@import",r);a>=0;a=e.indexOf("@import",r)){let l=-1,c="",f=0;for(let k=a;k<e.length&&l<0;k++){let h=e[k];c?h==="\\"?k++:h===c&&(c=""):h==='"'||h==="'"?c=h:h==="("?f++:h===")"?f--:h===";"&&f<=0&&(l=k)}if(l<0)break;let u=e.slice(a,l);o+=e.slice(r,a),n+=u.includes("layer(")?u+";":u+" layer(wutu.document);",r=l+1}return o+=e.slice(r),n+(o.trim()?"@layer wutu.document{"+o+"}":"")}function ie(e){let n=re(e);if(S.has(n)||(S.add(n),[...document.querySelectorAll("style")].some(r=>r.textContent===n)))return;let o=document.createElement("style");o.textContent=n,document.head.append(o)}function O(){ne.autoSave?.()}function ae(e){let n=w.get(e)?.deref();n&&(n.dirty=!0,T(n))}let se=new Set;function B(e){let n=W.get(e);return n===void 0&&W.set(e,n=e.getAttribute("data-wutu")),n}function le(e,n){let o=e.childNodes;if(o.length===n.length){let f=!0;for(let u=0;f&&u<n.length;u++)f=o[u]===n[u];if(f)return}let r=document.activeElement,a=r&&"selectionStart"in r?[r.selectionStart,r.selectionEnd,r.selectionDirection]:null,l=e.firstChild;for(let f of n){if(f===l){l=l.nextSibling;continue}e.moveBefore&&f.parentNode===e?e.moveBefore(f,l):e.insertBefore(f,l)}let c=new Set(n);for(let f of[...e.childNodes])c.has(f)||(m?m.removals.add(f):(P(f),f.remove()));r?.isConnected&&document.activeElement!==r&&(r.focus({preventScroll:!0}),a?.[0]!=null&&r.setSelectionRange(...a))}function ce(e,n,o,r){if(o&&m){if(m.globalClaims.has(n))throw new Error("Duplicate global Wutu key: "+n);m.globalClaims.add(n)}if(r&&e){if(e.keyed??=new Set,e.keyed.has(n))throw new Error("Duplicate Wutu key: "+g.findLast(a=>a.explicit).value);e.keyed.add(n)}}function ue(e,n,o,r){let a=e?.old[e.wanted.length];if(a?.nodeType===1&&a.localName===o&&B(a)===n&&!e.used.has(a))return a;let l=e&&de(e).get(n);for(;l&&l.index<l.nodes.length;){let c=l.nodes[l.index++];if(!e.used.has(c)&&c.localName===o)return c}return r?me(n):void 0}function de(e){if(e.byKey)return e.byKey;e.byKey=new Map;for(let n of e.old){if(n.nodeType!==1)continue;let o=B(n),r=e.byKey.get(o);r||e.byKey.set(o,r={nodes:[],index:0}),r.nodes.push(n)}return e.byKey}function me(e){if(m){if(!m.globalNodes){m.globalNodes=new Map;for(let n of m.root?.querySelectorAll("[data-wutu]")??[])m.globalNodes.set(B(n),n)}return m.globalNodes.get(e)}}function j(e,n,o,r){let a=z.at(-1),l=e+(n?":"+n:""),c=!1,f=!1;if(g.length){let k=0;for(let h=0;h<g.length;h++)g[h].global&&(k=h,c=g[h].depth===z.length),g[h].explicit&&(f=g[h].depth===z.length);for(let h=k;h<g.length;h++){let I=g[h];l+=`:${I.explicit?"k":"c"}${I.value.length}:${I.value}`}}ce(a,l,c,f);let u=ue(a,l,o,c);return u&&m?.retained.add(u),a||(u=m?.root??document.querySelector(`[data-wutu-root="${e}"][data-wutu-prerender]`)),u&&!W.has(u)&&(u.removeAttribute("data-wutu-prerender"),u.hasAttribute("data-wutu-pending")&&(u.disabled=!1,u.removeAttribute("data-wutu-pending"))),(!u||u.localName!==o)&&(u=r()),a&&(a.used.add(u),a.wanted.push(u)),W.get(u)!==l&&(u.setAttribute("data-wutu",l),W.set(u,l)),a||(u.getAttribute("data-wutu-root")!==e&&u.setAttribute("data-wutu-root",e),m&&(m.root=u)),u}function $(e,n){let o=i.get(e),r=o?null:new Set([...e.attributes].map(a=>a.name).filter(a=>!a.startsWith("data-wutu")&&!n.includes(a)));return z.push({node:e,meta:o,before:r,old:e.childNodes,used:new Set,wanted:[],attrs:null,byKey:null,keyed:null}),e}function fe(e,n,o,r){return $(j(o,r,e,()=>n?document.createElementNS("http://www.w3.org/2000/svg",e):document.createElement(e)),[])}function G(e,n){let o=F.get(e);return o||F.set(e,o=V(JSON.parse(e),n)),o}let J=new WeakMap;function D(e,n){let o=J.get(e);return o||J.set(e,o=V(e,n)),o}function V(e,n){let o=([r,a,...l],c)=>{c=c||r==="svg";let f=c?document.createElementNS("http://www.w3.org/2000/svg",r):document.createElement(r);for(let k in a)f.setAttribute(k,a[k]);let u=c&&r!=="foreignObject";for(let k of l)f.append(typeof k=="string"?k:o(k,u));return f};return[o(e,n),Object.keys(e[1])]}function pe(e,n,o){let[r,a]=G(e,n);return $(j(o,"",r.localName,()=>r.cloneNode(!1)),a)}function ge(e,n,o){let[r]=G(e,n);return j(o,"",r.localName,()=>r.cloneNode(!0))}function C(e){let n=z.at(-1);if(e?.nodeType){n.wanted.includes(e)||(n.used.add(e),n.wanted.push(e));return}let o=String(e??""),r=n.old[n.wanted.length];!r||r.nodeType!==3||n.used.has(r)?r=document.createTextNode(o):r.data!==o&&(r.data=o),n.used.add(r),n.wanted.push(r)}function U(e,n,o){if((z.at(-1).attrs??=new Set).add(n),o===null||o===!1){e.removeAttribute(n);return}let r=o===!0?"":String(o);e.getAttribute(n)!==r&&e.setAttribute(n,r)}function H(e,n,o){if(n==="mount"){if(b.has(e))return;b.add(e);let c=m;queueMicrotask(()=>{o(new Event("mount")),O(),c&&T(c)});return}let r=n[0]==="~";r&&(n=n.slice(1));let a=s.get(e);a||s.set(e,a=new Map);let l=a.get(n);l||(l={handlers:[],generation:-1,view:m},a.set(n,l),e.addEventListener(n,c=>{let f=!1;try{for(let[u,k]of[...l.handlers]){k||(f=!0);let h=u(c);h?.then&&h.then(M,I=>{M(),setTimeout(()=>{throw I})})}}finally{f&&(O(),l.view&&T(l.view))}})),l.generation!==R&&(l.handlers=[],l.generation=R),l.handlers.push([o,r]),l.view=m}function Y(){let e=z.pop(),n=e.node,o=e.attrs??se;if(n.hasAttribute("data-wutu-unmanaged"))return i.set(n,{...i.get(n),attrs:o}),n;let r=e.meta;for(let a of r?r.attrs:e.before)o.has(a)||n.removeAttribute(a);return r?r.attrs=o:i.set(n,{attrs:o}),le(n,e.wanted),n}let Q=new Map,X=["end"],_=null;function _e(e){let n=Q.get(e);if(!n){let o=2166136261;for(let r=0;r<e.length;r++)o=Math.imul(o^e.charCodeAt(r),16777619);Q.set(e,n=[JSON.parse(e),(o>>>0).toString(36)])}_={h:n[1],nodes:[],stack:[{ops:n[0],pc:0,kind:"top"}],outer:_,pending:null}}function A(){for(;;){let e=_.stack.at(-1);if(e.pc>=e.ops.length){if(e.kind==="arm"){_.stack.pop();continue}return e.kind==="body"?X:null}let n=e.ops[e.pc++];switch(n[0]){case"s":{let[o]=D(n[2],!!n[3]);_.nodes[n[1]]=j(`v${_.h}:${n[1]}`,"",o.localName,()=>o.cloneNode(!0));break}case"o":{let[o,r]=D(n[2],!!n[3]);_.nodes[n[1]]=$(j(`v${_.h}:${n[1]}`,"",o.localName,()=>o.cloneNode(!1)),r);break}case"c":Y();break;case"t":C(n[1]);break;default:return n}}}function he(e){if(_?.pending){_.pending=null,C(e),g.pop();return}if(!_){C(e),g.pop();return}let n=A(),o=z.at(-1)?.node;switch(n[0]){case"a":U(o,n[1],e);break;case"m":U(o,"class",n[1]+e);break;case"b":U(o,n[1],!!e);break;case"y":o.style.setProperty(n[1],e);break;case"w":C(e);break;case"v":H(_.nodes[n[1]],n[2],e);break;default:throw new Error("Wutu: a value where the template has "+JSON.stringify(n?.[0]))}}function be(){let e=A();g.push({value:`call:${_.h}:${e[1]}`,explicit:!1}),_.pending=e}function we(e){let n=A();_.stack.push({ops:e?n[1]:n[2],pc:0,kind:"arm"})}function Z(){let e=A();if(e!==X)return[e,null];let n=_.stack.at(-1);return g.pop(),n.loop[1]===0&&g.pop(),[n.loop,n]}function ye(e){let[n,o]=Z();o?o.pc=0:_.stack.push({ops:n[3],pc:0,kind:"body",loop:n});let r=String(e),a=n[1];a===0?(g.push({value:`loop:${_.h}:${n[2]}`,explicit:!1}),g.push({value:r,explicit:!1})):g.push({value:r,explicit:!0,global:a===2,depth:z.length})}function xe(){let[,e]=Z();e&&_.stack.pop()}function ke(){return _.nodes[A()[1]]}function ve(){for(;A()!==null;);let e=_.nodes[0];return _=_.outer,e}function q(e){let n=[z,m,g],o=document.activeElement;e.cleanupIndex=0,e.cleanupCallbacks??=[],e.removals=new Set,e.retained=new Set,e.globalNodes=null,e.globalClaims=new Set,z=[],m=e,g=[],R++;try{e.root=e.render();for(let r of e.cleanupCallbacks.splice(e.cleanupIndex))r();for(let r of e.removals)e.retained.has(r)||(P(r),r.remove());o?.isConnected&&document.activeElement!==o&&o.focus({preventScroll:!0})}finally{[z,m,g]=n,e.globalNodes=null,e.removals.clear(),e.retained.clear()}return e.root}function ze(e,n=""){if(m&&!n)return e();if(n){let a=w.get(n)?.deref();if(a?.root.isConnected)return a.dirty&&(a.dirty=!1,q(a)),a.root}let o={render:e,root:null,scope:n,dirty:!1,cleanups:[],cleanupCallbacks:[],effects:new Map},r=q(o);return p.add(new WeakRef(o)),n&&w.set(n,new WeakRef(o)),i.set(r,{...i.get(r),view:o}),r}function ee(){L=!1;let e=[...y];y.clear();for(let n of e)n.root.isConnected&&(n.dirty=!1,q(n));for(let n of v.splice(0))n()}function M(){for(let e of p){let n=e.deref();if(!n){p.delete(e);continue}n.root.isConnected&&y.add(n)}O(),ee()}function T(e){e&&y.add(e),!L&&(L=!0,queueMicrotask(ee))}function P(e){let n=i.get(e)?.view;if(n){for(let o of[...n.cleanups.splice(0),...n.cleanupCallbacks.splice(0)])o();n.scope&&w.delete(n.scope)}for(let o of e.children??[])P(o)}globalThis.addEventListener?.("hashchange",M),globalThis.addEventListener?.("popstate",M);let ne={enter:fe,shell:pe,still:ge,append:C,attr:U,listen:H,leave:Y,mount:ze,refresh:M,invalidate:ae,style:ie,put:he,begin:_e,slot:be,arm:we,item:ye,end:xe,node:ke,done:ve,storageError:"",notify(){for(let e of p){let n=e.deref();n?.root.isConnected&&T(n)}},interval(e,n,o){let r=m;if(!r||r.effects.has(e))return;let a=setInterval(()=>{o(),O(),T(r)},Math.max(16,n));r.effects.set(e,a),r.cleanups.push(()=>clearInterval(a))},lazyCall(e,n,o){let r=e+"|"+n+"|"+o.map(c=>c!==null&&typeof c=="object"?"#":String(c)).join(""),a=d.get(r);if(a)return a;a=[...document.querySelectorAll("[data-wutu-lazy]")].find(c=>c.getAttribute("data-wutu-lazy")===r)??document.createElement("div"),a.setAttribute("data-wutu-lazy",r),d.set(r,a);let l=globalThis.__wutuChunks?.[e];return l?(E++,document.documentElement.setAttribute("data-wutu-loading",""),import(l).then(c=>a.replaceChildren(c.exports[n](...o))).catch(c=>console.error(c)).finally(()=>{--E===0&&document.documentElement.removeAttribute("data-wutu-loading")}),a):(console.error("Wutu: no chunk was built for "+e),a)},memoHit(e){if(!e||!m)return!1;let n=m.memo?.get(N());return n?.key!==e||!n.node?.isConnected?!1:(x=n.node,!0)},memoLast(){return x},memoKeep(e,n){e&&m&&(m.memo??=new Map).set(N(),{key:e,node:n})},after(e){v.push(e),T()},focus(e){v.push(()=>document.getElementById(e)?.focus()),T()},cleanup(e){m&&(m.cleanupCallbacks[m.cleanupIndex++]=e)},pushGlobal:e=>g.push({value:String(e),explicit:!0,global:!0,depth:z.length}),pushKey:e=>g.push({value:String(e),explicit:!0,depth:z.length}),pushCall:e=>g.push({value:e,explicit:!1}),popKey:()=>g.pop()};return ne})()}),Ge=(()=>location.hash.slice(1)||"/"),Je=((t,i,s)=>({top:t,left:i,behavior:s})),De=((t,i,s)=>t[i](s)??null),Ve=((t,i)=>({block:t,inline:i})),He=((...t)=>globalThis.__utuWutu.lazyCall("./start.utu","page",t)),Ye=((...t)=>globalThis.__utuWutu.lazyCall("./tour.utu","page",t)),Qe=((...t)=>globalThis.__utuWutu.lazyCall("./iterators.utu","page",t)),Xe=((...t)=>globalThis.__utuWutu.lazyCall("./stdlib.utu","page",t)),Ze=((...t)=>globalThis.__utuWutu.lazyCall("./javascript.utu","page",t)),en=((...t)=>globalThis.__utuWutu.lazyCall("./data.utu","page",t)),nn=((...t)=>globalThis.__utuWutu.lazyCall("./web.utu","page",t)),tn=((...t)=>globalThis.__utuWutu.lazyCall("./tooling.utu","page",t)),on=((...t)=>globalThis.__utuWutu.lazyCall("./compiler.utu","page",t)),rn=((...t)=>globalThis.__utuWutu.lazyCall("./benchmarks.utu","page",t)),an=(t=>{try{if(!t)return"";let i=JSON.parse(t);if(i.version!==1||!(i.data!==null&&typeof i.data=="object"&&!Array.isArray(i.data)&&typeof i.data.source=="string"))throw Error("Stored schema mismatch");return JSON.stringify(i.data)}catch(i){return globalThis.__utuWutu.storageError=String(i.message??i),""}}),sn=((t,i)=>(s=>typeof s=="string"?s:(()=>{throw new TypeError("expected string")})())(t[i])),ln=(t=>{try{return localStorage.getItem(t)??""}catch(i){return globalThis.__utuWutu.storageError=String(i.message??i),""}}),cn=((t,i,s,p)=>globalThis.__utuWutu.store(t,i,!!s,p)),un=(t=>({source:t})),dn=((t,i)=>({version:t,data:i})),mn=((t,i,s)=>import(new URL("./playground/playground.js?v=2056e6ef0d82",document.baseURI).href).then(p=>p.schedule(t,i,s)).catch(p=>s("Could not load the compiler",String(p),!0))),fn=(()=>globalThis.__utuWutu.node()),pn=(t=>globalThis.__utuWutu.arm(t)),gn=(()=>{if(!document.getElementById("wutu-124igqj")){let t=document.createElement("style");t.id="wutu-124igqj",t.textContent=`.wa925av{display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:1rem;margin-block:1.5rem;inline-size:min(100%, 76rem);@media (width < 72rem){
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
                        }}.w18jcedk{inline-size:100%;block-size:100%;border:0;background:white;}.w1tku8aq{margin-block-start:0;inline-size:min(100%, 76rem);white-space:pre-wrap;}.wnoe2ce{padding:0.4rem 0.8rem;font:inherit;font-size:0.9rem;color:var(--ink);background:var(--tint);border:1px solid var(--line);cursor:pointer;}`,document.head.append(t)}}),_n=((t,i)=>t[i]),hn=((t,i,s)=>{t[i]=s}),bn=(t=>t instanceof globalThis.KeyboardEvent?t:null),wn=((t,i)=>t[i]()),yn=((t,i,s,p,w,y)=>t[i](s,p,w,y)),xn=((t,i)=>t[i]?1:0),kn=(t=>globalThis.__utuWutu.item(t)),vn=(t=>globalThis.__utuWutu?.after(t)),zn=(()=>{(function(i){if(i.store)return;let s=new Map,p=180,w;function y(b){let d=String(b.message??b);i.storageError!==d&&(i.storageError=d,i.notify())}function v(){clearTimeout(w);for(let[b,d]of s)if(!(!d.dirty||d.conflict))try{let x=d.encode();x!==d.last&&(localStorage.setItem(b,x),d.last=x),d.dirty=!1}catch(x){y(x)}}function S(b){let d=s.get(b);d&&(d.conflict=!1,d.dirty=!0,clearTimeout(w),w=setTimeout(v,p))}i.flush=v,i.save=S,i.autoSave=()=>{for(let[b,d]of s)!d.manual&&!d.conflict&&S(b)},i.store=(b,d,x=!1,N=null)=>{let E=null;try{E=localStorage.getItem(b)}catch{}s.set(b,{encode:d,manual:x,apply:N,last:E,dirty:!1})},i.reload=b=>{let d=s.get(b);if(d)try{let x=localStorage.getItem(b);d.apply?.(x??""),d.last=x,d.dirty=!1,d.conflict=!1,i.storageError="",i.refresh()}catch(x){y(x)}},addEventListener("pagehide",v),addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&v()}),addEventListener("storage",b=>{let d=s.get(b.key);if(d){if(d.dirty){d.conflict=!0,clearTimeout(w),y("Unsaved local changes conflict with another tab. Reload or explicitly save to keep this tab.");return}try{d.apply?.(b.newValue??""),d.last=b.newValue,i.refresh()}catch(x){y(x)}}})})(globalThis.__utuWutu)}),Sn=(()=>globalThis.__utuWutu?.refresh());globalThis.__wutuChunks={...globalThis.__wutuChunks,"./start.utu":new URL("./chunks/start-011e1135e2/app.js",import.meta.url).href,"./tour.utu":new URL("./chunks/tour-5202fa2b40/app.js",import.meta.url).href,"./iterators.utu":new URL("./chunks/iterators-28f28feab2/app.js",import.meta.url).href,"./stdlib.utu":new URL("./chunks/stdlib-2d8a5673f9/app.js",import.meta.url).href,"./javascript.utu":new URL("./chunks/javascript-86356e4e4f/app.js",import.meta.url).href,"./data.utu":new URL("./chunks/data-6b0be8c96e/app.js",import.meta.url).href,"./web.utu":new URL("./chunks/web-3e850f4fc1/app.js",import.meta.url).href,"./tooling.utu":new URL("./chunks/tooling-da9968d2ab/app.js",import.meta.url).href,"./compiler.utu":new URL("./chunks/compiler-2c612f43f6/app.js",import.meta.url).href,"./benchmarks.utu":new URL("./chunks/benchmarks-a14ffe4cf1/app.js",import.meta.url).href};try{let t=oe({es:{__foreign_0:"",__foreign_1:"",__foreign_2:"",__foreign_3:"",__foreign_4:"",__foreign_5:"",__es_6:"",__es_7:"",__es_8:"",__es_9:"",__es_10:"",__es_11:"",__es_12:"",__es_13:"",__es_14:"",__es_15:"",__es_16:"",__es_17:"",__es_18:"",__foreign_6:"",__foreign_7:"",__foreign_8:"",__es_22:"",__es_23:"",__es_24:"",__es_25:"",__es_26:"",__es_27:"",__es_28:"",__es_29:"",__es_30:"",__es_31:"",__es_32:"",__foreign_9:"",__es_34:"",__es_35:"",__foreign_10:"",__foreign_11:"",__es_38:"",__es_39:"",__es_40:"",__es_41:"",__foreign_12:"",__foreign_13:"",__foreign_14:"",__foreign_15:"",__foreign_16:"",__foreign_17:"",__es_49:"",__es_54:"",__es_55:"",__es_56:""}},K);t.utu=te({new:!0,calls:["closure_call_0"]},t.utu);let i=await WebAssembly.compileStreaming(fetch(new URL("./app.wasm?v=6a000577adc3",import.meta.url)),{builtins:["js-string"],importedStringConstants:"'"}),p=(await WebAssembly.instantiate(i,t)).exports;document.querySelectorAll("[data-utu-static]").forEach(w=>w.remove()),await p.main?.(),document.documentElement.setAttribute("data-utu-ready","")}catch(t){document.documentElement.setAttribute("data-utu-error",String(t.message??t));let i=document.createElement("p");i.setAttribute("role","status"),i.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.",document.body.append(i),console.error(t)}
