var Rt=Symbol("utu.closure");var be=new WeakMap,we=(o,i,l,x,k)=>{let E=i==null&&!(l&2),N=E&&be.get(o);if(N)return N;let v=E?(...f)=>o(...f):(...f)=>o(i,...f),z=k?.[(l>>4)-1],u=z?(...f)=>{for(let y=0;y<z.length;y++){let W=z[y];if(W==="b")f[y]=f[y]?1:0;else if(W==="n")f[y]===void 0&&(f[y]=null);else if(W==="h"&&f[y]==null)throw new TypeError(`Wrong type from JavaScript: a closure's argument ${y+1} is ${f[y]}`)}return v(...f)}:v,d=l&1?(...f)=>!!u(...f):l&4?(...f)=>u(...f)>>>0:l&8?(...f)=>BigInt.asUintN(64,u(...f)):u;return d[Rt]=x,E&&be.set(o,d),d};var ye=(o,...i)=>o(...i);var xe=(o=>globalThis[o]),Q=((o,i,l)=>o[i](l)),X=((o,i,l)=>{o[i]=l}),Z=((o,i)=>o[i]),ke=((o,i)=>globalThis[o](i)),Se=((o,i)=>globalThis.__utuWutu.mount(o,i)),$e=(o=>i=>o(i)?1:0)(o=>globalThis.__utuWutu.memoHit(o)),ve=(o=>globalThis.__utuWutu.put(o)),Ae=(()=>globalThis.__utuWutu.memoLast()),Te=((o,i)=>globalThis.__utuWutu.memoKeep(o,i)),Ee=(()=>globalThis.__utuWutu.slot()),_e=(o=>globalThis.__utuWutu.item(o)),Ne=(()=>globalThis.__utuWutu.end()),ze=(o=>globalThis.__utuWutu.begin(o)),We=(()=>globalThis.__utuWutu.done()),Me=(()=>{if(!document.getElementById("wutu-insj5b")){let o=document.createElement("style");o.id="wutu-insj5b",o.setAttribute("data-wutu-style",""),o.textContent=`@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap") layer(wutu.document);@layer wutu.document{
        
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
                }}.wu7hoyu{min-inline-size:0;}.w1nf506q{padding:1.5rem clamp(1rem, 4vw, 3rem) 3rem;border-block-start:1px solid var(--line);color:var(--muted);font-size:0.9rem;display:flex;flex-wrap:wrap;gap:0.5rem 2rem;justify-content:space-between;}`,document.head.append(o)}}),Ce=(()=>{globalThis.__utuWutu??=(function(){let i=new WeakMap,l=new WeakMap;function x(e,t=!0){if(e.pending)return t?[e.start,...e.pending,e.end]:e.pending;let n=[];for(let r=t?e.start:e.start.nextSibling;r;r=r.nextSibling){if(r===e.end){t&&n.push(r);break}n.push(r)}return n}function k(e){if(Array.isArray(e))return e.every(k);let t=i.get(e);return t?t.start.isConnected&&t.end.isConnected:!!e?.isConnected}function E(e){let t=i.get(e);return t?x(t,!1).flatMap(n=>n.nodeType===1?[n,...n.querySelectorAll("[data-wutu]")]:[]):e?.querySelectorAll?.("[data-wutu]")??[]}function N(){let e=$.at(-1),t=0,n=!1,r=!1;for(let p=0;p<w.length;p++)w[p].global&&(t=p,n=w[p].depth===$.length),w[p].explicit&&(r=w[p].depth===$.length);let a=e?w.slice(t).map(p=>`${p.explicit?"k":"c"}${p.value.length}:${p.value}`).join(":"):g?.scope??"",s=`wutu:${h.h}:${encodeURIComponent(a)}`;ne(e,s,n,r);let m=p=>{let S=new Map;for(let _ of p)if(_.nodeType===8&&_.data.startsWith("wutu:")){let R=S.get(_.data);R||S.set(_.data,R={nodes:[],index:0}),R.nodes.push(_)}return S},A=p=>{let S=p.get(s);for(;S&&S.index<S.nodes.length;){let _=S.nodes[S.index++];if(!e?.used.has(_)&&!T?.used.has(_))return _}},b=e&&A(e.ranges??=m(e.old));if(!b&&!e&&(b=i.get(g?.root)?.start),!b){let p=$[0]?.node;if((!T||T.root!==p)&&(T={root:p,index:null,used:new Set}),!T.comments){let S=[],_=U=>{U.nodeType===8&&(e||!l.has(U))&&S.push(U);for(let Lt of U.childNodes??[])_(Lt)},R=i.get(p);if(R)for(let U of x(R,!1))_(U);else _(p??document);T.comments=m(S)}b=A(T.comments)}let c=b&&l.get(b);if(!c&&b){let p=b.nextSibling;for(;p&&!(p.nodeType===8&&p.data==="/"+s);)p=p.nextSibling;p&&(c={start:b,end:p,value:document.createDocumentFragment()})}if(!c){let p=document.createDocumentFragment();c={value:p,start:document.createComment(s),end:document.createComment("/"+s)},p.append(c.start,c.end)}i.set(c.value,c),l.set(c.start,c),e&&e.used.add(c.start),T?.used.add(c.start),h.fragment=c,$.push({node:c.value,range:c,old:x(c,!1),used:new Set,wanted:[],byKey:null,keyed:null})}let v=new WeakMap,z=new WeakMap,u=new Set,d=new Map,f=new Set,y=[],W=new WeakSet,O=null,M=()=>w.map(e=>e.value.length+":"+e.value).join("|"),q=new WeakMap,$=[],g=null,w=[],F=!1,J=0,C=null,pt=new Map,T=null;function P(){Y.autoSave?.()}function mt(e){let t=d.get(e)?.deref();t&&(t.dirty=!0,I(t))}let gt=new Set,ee=new WeakMap;function ht(e,t){ee.set(e,t),e.value!==t&&(e.value=t)}function K(e){let t=q.get(e);return t===void 0&&q.set(e,t=e.getAttribute("data-wutu")),t}function te(e,t,n=null){let r=n?x(n,!1):e.childNodes;if(r.length===t.length){let b=!0;for(let c=0;b&&c<t.length;c++)b=r[c]===t[c];if(b)return}let a=document.activeElement,s=a&&"selectionStart"in a?[a.selectionStart,a.selectionEnd,a.selectionDirection]:null,m=n?n.start.nextSibling:e.firstChild;for(let b of t){if(b===m){m=m.nextSibling;continue}e.moveBefore&&b.parentNode===e?e.moveBefore(b,m):e.insertBefore(b,m)}let A=new Set(t);for(let b of[...r])A.has(b)||b.nodeType===1&&(b.nodeName==="HEAD"||b.hasAttribute("data-wutu-style"))||(g?g.removals.add(b):(H(b),b.remove()));a?.isConnected&&document.activeElement!==a&&(a.focus({preventScroll:!0}),s?.[0]!=null&&a.setSelectionRange(...s))}function ne(e,t,n,r){if(n&&g){if(g.globalClaims.has(t))throw Error("Duplicate global Wutu key: "+t);g.globalClaims.add(t)}if(r&&e){if(e.keyed??=new Set,e.keyed.has(t))throw Error("Duplicate Wutu key: "+w.findLast(a=>a.explicit).value);e.keyed.add(t)}}function bt(e,t,n,r){let a=e?.old[e.wanted.length];if(a?.nodeType===1&&a.localName===n&&K(a)===t&&!e.used.has(a))return a;let s=e&&wt(e).get(t);for(;s&&s.index<s.nodes.length;){let m=s.nodes[s.index++];if(!e.used.has(m)&&m.localName===n)return m}return r?yt(t):void 0}function wt(e){if(e.byKey)return e.byKey;e.byKey=new Map;for(let t of e.old){if(t.nodeType!==1)continue;let n=K(t),r=e.byKey.get(n);r||e.byKey.set(n,r={nodes:[],index:0}),r.nodes.push(t)}return e.byKey}function yt(e){if(g){if(!g.globalNodes){g.globalNodes=new Map;for(let t of E(g.root))g.globalNodes.set(K(t),t)}return g.globalNodes.get(e)}}function xt(e,t){let n=$[0]?.node;if(T?.root!==n&&(T={root:n,index:null,used:new Set}),!T.index){T.index=new Map;for(let a of E(n)){let s=K(a);T.index.has(s)||T.index.set(s,a)}}let r=T.index.get(e);if(!(!r||r.localName!==t||T.used.has(r)))return T.used.add(r),r}function G(e,t,n,r,a){let s=$.at(-1),m=e+(t?":"+t:""),A=!1,b=!1;if(w.length){let p=0;for(let S=0;S<w.length;S++)w[S].global&&(p=S,A=w[S].depth===$.length),w[S].explicit&&(b=w[S].depth===$.length);for(let S=p;S<w.length;S++){let _=w[S];m+=`:${_.explicit?"k":"c"}${_.value.length}:${_.value}`}}ne(s,m,A,b);let c=bt(s,m,n,A);if(a&&s?c??=xt(m,n):c&&g?.retained.add(c),s||(c=g?.root??document.querySelector(`[data-wutu-root="${e}"][data-wutu-prerender]`)),c?.hasAttribute("data-wutu-prerender")){c.removeAttribute("data-wutu-prerender");for(let p of[c,...c.querySelectorAll("[data-wutu-pending]")])!p.hasAttribute("data-wutu-pending")||p.parentNode?.closest("[data-wutu-lazy]")||(p.disabled=!1,p.removeAttribute("data-wutu-pending"))}return(!c||c.localName!==n)&&(c=r()),s&&s.used.add(c),s&&!a&&(s.wanted.push(c),s.appended?.add(c)),q.get(c)!==m&&(c.setAttribute("data-wutu",m),q.set(c,m)),s||(c.getAttribute("data-wutu-root")!==e&&c.setAttribute("data-wutu-root",e),g&&(g.root=c)),c}function oe(e,t,n){let r=v.get(e),a=r?null:new Set([...e.attributes].map(s=>s.name).filter(s=>n?n.has(s):!s.startsWith("data-wutu")&&!t.includes(s)));return $.push({node:e,meta:r,before:a,old:e.childNodes,used:new Set,wanted:[],attrs:null,byKey:null,keyed:null}),e}function kt(e,t,n,r){return oe(G(n,r,e,()=>t?document.createElementNS("http://www.w3.org/2000/svg",e):document.createElement(e)),[])}let re=new WeakMap;function ie(e,t){let n=re.get(e);return n||re.set(e,n=St(e,t)),n}function St(e,t){let n=([r,a,...s],m)=>{m=m||r==="svg";let A=m?document.createElementNS("http://www.w3.org/2000/svg",r):document.createElement(r);for(let c in a)ae(A,c,a[c]);let b=m&&r!=="foreignObject";for(let c of s)A.append(typeof c=="string"?c:n(c,b));return A};return[n(e,t),Object.keys(e[1])]}function j(e){let t=$.at(-1),n=i.get(e);if(n||Array.isArray(e)||e?.nodeType===11){for(let s of n?x(n):Array.isArray(e)?e:[...e.childNodes])j(s);return}if(e?.nodeType){t.appended??=new Set(t.wanted),t.appended.has(e)||(t.appended.add(e),t.used.add(e),t.wanted.push(e)),g?.retained.add(e);return}let r=String(e??""),a=t.old[t.wanted.length];!a||a.nodeType!==3||t.used.has(a)?a=document.createTextNode(r):a.data!==r&&(a.data=r),t.used.add(a),t.wanted.push(a)}function D(e,t,n){if(($.at(-1).attrs??=new Set).add(t),n===null||n===!1||!se(e,t,n)){e.removeAttribute(t);return}let r=n===!0?"":String(n);e.getAttribute(t)!==r&&ae(e,t,r)}function ae(e,t,n){let r={xlink:"http://www.w3.org/1999/xlink",xml:"http://www.w3.org/XML/1998/namespace",xmlns:"http://www.w3.org/2000/xmlns/"}[t.split(":",1)[0]];r&&t.includes(":")?e.setAttributeNS(r,t,n):e.setAttribute(t,n)}let $t=new Set(["href","xlink:href","src","action","formaction","poster","cite","data","background","codebase","longdesc","manifest"]),vt=new Set(["ping","srcset","imagesrcset"]);function se(e,t,n){return t=t.toLowerCase(),t==="srcdoc"?!1:n===!0?!0:(n=String(n),$t.has(t)?ce(e,t,n):vt.has(t)?n.split(/[ ,]+/).every(r=>ce(e,t,r)):t!=="content"||e.localName!=="meta"||!/javascript:|vbscript:|data:/.test(le(n)))}function le(e,t=1/0){let n="";for(let r of e)if(r>" "&&(n+=r).length>=t)break;return n.toLowerCase()}function ce(e,t,n){let r=le(n,16),a=e.localName;return/^(java|vb)script:/.test(r)?!1:!r.startsWith("data:")||t==="href"&&(a==="a"||a==="area")&&e.hasAttribute("download")?!0:r.startsWith("data:image/svg")?a==="img"||a==="image":/^data:(image|audio|video)[/]/.test(r)}function At(e,t,n){se(e,t,n)?e[t]=n:e.removeAttribute(t.toLowerCase())}function ue(e,t,n){if(t==="mount"){if(W.has(e))return;W.add(e);let m=g;queueMicrotask(()=>{let A=C;C=[e,m];try{n(new Event("mount"))}finally{C=A}P(),m&&I(m)});return}let r=t[0]==="~";r&&(t=t.slice(1));let a=z.get(e);a||z.set(e,a=new Map);let s=a.get(t);s||(s={handlers:[],generation:-1,view:g},a.set(t,s),e.addEventListener(t,m=>{let A=!1,b=C;C=[e,s.view];try{for(let[c,p]of[...s.handlers]){p||(A=!0);let S=c(m);S?.then&&S.then(B,_=>{B(),setTimeout(()=>{throw _})})}}finally{C=b,A&&(P(),s.view&&I(s.view))}})),s.generation!==J&&(s.handlers=[],s.generation=J),s.handlers.push([n,r]),s.view=g}function de(){let e=$.pop(),t=e.node,n=e.attrs??gt;if(t.hasAttribute("data-wutu-unmanaged"))return e.meta||t.replaceChildren(),v.set(t,{...v.get(t),attrs:n}),t;let r=e.meta;for(let s of r?r.attrs:e.before)n.has(s)||t.removeAttribute(s);r?r.attrs=n:v.set(t,{attrs:n}),te(t,e.wanted);let a=ee.get(t);return a!==void 0&&t.value!==a&&(t.value=a),t}let fe=new Map,pe=["end"],h=null;function Tt(e){let t=fe.get(e);if(!t){let n=2166136261;for(let r=0;r<e.length;r++)n=Math.imul(n^e.charCodeAt(r),16777619);fe.set(e,t=[JSON.parse(e),(n>>>0).toString(36)])}h={h:t[1],nodes:[],stack:[{ops:t[0],pc:0,kind:"top"}],outer:h,pending:null,depth:$.length,fragment:null}}let me=new WeakMap;function Et(e,t){let n=me.get(e);n||me.set(e,n=[]);let r=n[t];if(!r){r=n[t]=new Set;for(let a=t;a<e.length;a++){let[s,m]=e[a];if(s==="a"||s==="b")r.add(m);else if(s==="m")r.add("class");else if(s!=="n"&&s!=="y")break}}return r}function L(){for(;;){let e=h.stack.at(-1);if(e.pc>=e.ops.length){if(e.kind==="arm"){h.stack.pop();continue}return e.kind==="body"?pe:null}let t=e.ops[e.pc++];switch(t[0]){case"r":N();break;case"s":{let[n]=ie(t[2],!!t[3]);h.nodes[t[1]]=G(`v${h.h}:${t[1]}`,"",n.localName,()=>n.cloneNode(!0),$.length===h.depth);break}case"o":{let[n,r]=ie(t[2],!!t[3]);h.nodes[t[1]]=oe(G(`v${h.h}:${t[1]}`,"",n.localName,()=>n.cloneNode(!1),$.length===h.depth),r,Et(e.ops,e.pc));break}case"c":de();break;case"t":j(t[1]);break;default:return t}}}function _t(e){if(h?.pending){h.pending=null,j(e),w.pop();return}if(!h){j(e),w.pop();return}let t=L(),n=$.at(-1)?.node;switch(t[0]){case"a":D(n,t[1],e);break;case"m":D(n,"class",t[1]+e);break;case"b":D(n,t[1],!!e);break;case"y":($.at(-1).attrs??=new Set).add("style"),n.style.setProperty(t[1],e);break;case"w":j(e);break;case"v":ue(h.nodes[t[1]],t[2],e);break;default:throw Error("Wutu: a value where the template has "+JSON.stringify(t?.[0]))}}function Nt(){let e=L();w.push({value:`call:${h.h}:${e[1]}`,explicit:!1}),h.pending=e}function zt(e){let t=L();h.stack.push({ops:e?t[1]:t[2],pc:0,kind:"arm"})}function ge(){let e=L();if(e!==pe)return[e,null];let t=h.stack.at(-1);return w.pop(),t.loop[1]===0&&w.pop(),[t.loop,t]}function Wt(e){let[t,n]=ge();n?n.pc=0:h.stack.push({ops:t[3],pc:0,kind:"body",loop:t});let r=String(e),a=t[1];a===0?(w.push({value:`loop:${h.h}:${t[2]}`,explicit:!1}),w.push({value:r,explicit:!1})):w.push({value:r,explicit:!0,global:a===2,depth:$.length})}function Mt(){let[,e]=ge();e&&h.stack.pop()}function Ct(){return h.nodes[L()[1]]}function It(){for(;L()!==null;);let e=h.nodes[0];if(h.fragment){let t=$.pop(),n=h.fragment;if(te(n.start.parentNode,t.wanted,n),g&&(n.pending=t.wanted,(g.pendingRanges??=new Set).add(n)),e=n.value,h.depth===0)for(let r of t.wanted)r.nodeType===1&&r.setAttribute("data-wutu-root",`fragment:${h.h}`)}return h=h.outer,h||(T=null),e}function V(e){let t=[$,g,w,T,h],n=document.activeElement;e.cleanupIndex=0,e.cleanupCallbacks??=[],e.intervalsSeen=new Set,e.removals=new Set,e.pendingRanges=null,e.retained=new Set,e.globalNodes=null,e.globalClaims=new Set,$=[],g=e,w=[],T=null,J++;try{e.root=e.render();for(let r of e.cleanupCallbacks.splice(e.cleanupIndex))r();for(let[r,a]of e.effects)!a.node&&!e.intervalsSeen.has(r)&&(clearInterval(a.id),e.effects.delete(r));for(let r of e.removals)e.retained.has(r)||(H(r),r.remove());n?.isConnected&&document.activeElement!==n&&n.focus({preventScroll:!0})}finally{if([$,g,w,T,h]=t,e.globalNodes=null,e.pendingRanges)for(let r of e.pendingRanges)r.pending=null;e.pendingRanges=null,e.removals.clear(),e.retained.clear()}return e.root}function jt(e,t=""){if(g&&!t)return e();if(t){let s=d.get(t)?.deref();if(s&&k(s.root))return s.dirty&&(s.dirty=!1,V(s)),s.root}let n={render:e,root:null,scope:t,dirty:!1,cleanupCallbacks:[],effects:new Map},r=V(n);u.add(new WeakRef(n)),t&&d.set(t,new WeakRef(n));let a=i.get(r)?.start??r;return v.set(a,{...v.get(a),view:n}),r}function he(){F=!1;let e=[...f];f.clear();for(let t of e)k(t.root)&&(t.dirty=!1,V(t));for(let t of y.splice(0))t()}function B(){for(let e of u){let t=e.deref();if(!t){u.delete(e);continue}k(t.root)&&f.add(t)}P(),he()}function I(e){e&&f.add(e),!F&&(F=!0,queueMicrotask(he))}function H(e){let t=v.get(e)?.view;if(t){for(let n of t.cleanupCallbacks.splice(0))n();for(let n of t.effects.values())clearInterval(n.id);t.effects.clear(),t.scope&&d.delete(t.scope)}for(let n of e.childNodes??[])H(n)}globalThis.addEventListener?.("hashchange",B),globalThis.addEventListener?.("popstate",B);let Y={enter:kt,append:j,attr:D,url:At,listen:ue,leave:de,mount:jt,refresh:B,invalidate:mt,selectValue:ht,here:M,put:_t,begin:Tt,slot:Nt,arm:zt,item:Wt,end:Mt,node:Ct,done:It,nodes(e){let t=i.get(e);return t?x(t):Array.isArray(e)?e.flatMap(Y.nodes):e?.nodeType===11?[...e.childNodes]:[e]},storageError:"",notify(){for(let e of u){let t=e.deref();t&&k(t.root)&&I(t)}},interval(e,t,n){let[r,a]=g?[null,g]:C??[];if(!r){if(!a)return;a.intervalsSeen.add(e)}let s=a?.effects??pt,m=s.get(e);if(m?.node===r){m.callback=n;return}m&&clearInterval(m.id);let A={callback:n,id:0,node:r};A.id=setInterval(()=>{if(r&&!r.isConnected){clearInterval(A.id),s.delete(e);return}A.callback(),P(),I(a)},Math.max(16,t)),s.set(e,A)},memoHit(e){if(!e||!g)return!1;let t=g.memo?.get(M());return t?.key!==e||!k(t.node)?!1:(O=t.node,!0)},memoLast(){return O},memoKeep(e,t){e&&g&&(g.memo??=new Map).set(M(),{key:e,node:t})},after(e){y.push(e),I()},focus(e){y.push(()=>document.getElementById(e)?.focus()),I()},cleanup(e){g&&(g.cleanupCallbacks[g.cleanupIndex++]=e)},pushGlobal:e=>w.push({value:String(e),explicit:!0,global:!0,depth:$.length}),pushKey:e=>w.push({value:String(e),explicit:!0,depth:$.length}),pushCall:e=>w.push({value:e,explicit:!1}),popKey:()=>w.pop()};return Y})()}),Ie=(o=>()=>(i=>typeof i=="string"?i:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${i===null?"null":i instanceof Promise?"a Promise (await it: Promise[Str])":typeof i}`)})())(o()))(()=>location.hash.slice(1)||"/"),je=((o,i,l)=>({top:o,left:i,behavior:l})),Le=((o,i,l)=>o[i](l)??null),Re=((o,i)=>({block:o,inline:i})),Ue=((...o)=>globalThis.__wutuLazy("./start.utu","page",o)),Oe=((...o)=>globalThis.__wutuLazy("./tour.utu","page",o)),Be=((...o)=>globalThis.__wutuLazy("./iterators.utu","page",o)),qe=((...o)=>globalThis.__wutuLazy("./stdlib.utu","page",o)),Pe=((...o)=>globalThis.__wutuLazy("./javascript.utu","page",o)),Ke=((...o)=>globalThis.__wutuLazy("./data.utu","page",o)),De=((...o)=>globalThis.__wutuLazy("./web.utu","page",o)),Fe=((...o)=>globalThis.__wutuLazy("./tooling.utu","page",o)),Je=((...o)=>globalThis.__wutuLazy("./compiler.utu","page",o)),Ge=((...o)=>globalThis.__wutuLazy("./benchmarks.utu","page",o)),Ve=(o=>i=>(l=>typeof l=="string"?l:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${l===null?"null":l instanceof Promise?"a Promise (await it: Promise[Str])":typeof l}`)})())(o(i)))(o=>{try{if(!o)return"";let i=JSON.parse(o);if(i.version!==1||(i.data=(l=>l!==null&&typeof l=="object"&&!Array.isArray(l)?{...l,source:l.source}:l)(i.data),!(i.data!==null&&typeof i.data=="object"&&!Array.isArray(i.data)&&typeof i.data.source=="string")))throw Error("Stored schema mismatch");return JSON.stringify(i.data)}catch(i){return globalThis.__utuWutu.storageError=String(i.message??i),""}}),He=((o,i)=>(l=>typeof l=="string"?l:(()=>{throw new TypeError("expected string")})())(o[i])),Ye=(o=>({source:o})),Qe=((o,i)=>({version:o,data:i})),Xe=((o,i,l)=>import(new URL("./playground/playground.js?v=6cdfc426ad1f",document.baseURI).href).then(x=>x.schedule(o,i,l)).catch(x=>l("Could not load the compiler",String(x),!0))),Ze=(()=>globalThis.__utuWutu.node()),et=(o=>globalThis.__utuWutu.arm(o)),tt=(()=>{if(!document.getElementById("wutu-124igqj")){let o=document.createElement("style");o.id="wutu-124igqj",o.setAttribute("data-wutu-style",""),o.textContent=`.wa925av{display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:1rem;margin-block:1.5rem;inline-size:min(100%, 76rem);@media (width < 72rem){
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
                        }}.w18jcedk{inline-size:100%;block-size:100%;border:0;background:white;}.w1tku8aq{margin-block-start:0;inline-size:min(100%, 76rem);white-space:pre-wrap;}.wnoe2ce{padding:0.4rem 0.8rem;font:inherit;font-size:0.9rem;color:var(--ink);background:var(--tint);border:1px solid var(--line);cursor:pointer;}`,document.head.append(o)}}),nt=(o=>o instanceof globalThis.KeyboardEvent?o:null),ot=((o,i)=>o[i]()),rt=((o,i,l,x,k,E)=>o[i](l,x,k,E)),it=((o,i)=>o[i]?1:0),at=(o=>i=>o(BigInt.asUintN(64,i)))(o=>globalThis.__utuWutu.item(o)),st=(o=>globalThis.__utuWutu?.after(o)),lt=(()=>{(function(i){if(i.store)return;i.storageReviveF64=u=>u===null?0:u;let l=new Map,x=180,k;function E(u){let d=String(u.message??u);i.storageError!==d&&(i.storageError=d,i.notify())}function N(){clearTimeout(k),k=0;for(let[u,d]of l)if(!(!d.dirty||d.conflict))try{let f=d.encode();f!==d.last&&(localStorage.setItem(u,f),d.last=f),d.dirty=!1}catch(f){E(f)}}function v(u){let d=l.get(u);d&&(d.conflict=!1,d.dirty=!0,k||(k=setTimeout(N,x)))}i.flush=N,i.save=v,i.autoSave=()=>{for(let[u,d]of l)!d.manual&&!d.conflict&&v(u)},i.store=(u,d,f=!1,y=null)=>{let W=null;try{W=localStorage.getItem(u)}catch{}l.set(u,{encode:d,manual:f,apply:y,last:W,dirty:!1})},i.reload=u=>{let d=l.get(u);if(d)try{let f=localStorage.getItem(u);d.apply?.(f??""),d.last=f,d.dirty=!1,d.conflict=!1,i.storageError="",i.refresh()}catch(f){E(f)}};let z=(...u)=>globalThis.addEventListener?.(...u);z("pagehide",N),z("visibilitychange",()=>{document.visibilityState==="hidden"&&N()}),z("storage",u=>{for(let d of u.key===null?[...l.values()]:[l.get(u.key)])if(d){if(d.dirty){d.conflict=!0,clearTimeout(k),k=0,E("Unsaved local changes conflict with another tab. Reload or explicitly save to keep this tab.");continue}try{d.apply?.(u.newValue??""),d.last=u.newValue,i.storageError="",i.refresh()}catch(f){E(f)}}})})(globalThis.__utuWutu)}),ct=(o=>i=>(l=>typeof l=="string"?l:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${l===null?"null":l instanceof Promise?"a Promise (await it: Promise[Str])":typeof l}`)})())(o(i)))(o=>{try{return localStorage.getItem(o)??""}catch(i){return globalThis.__utuWutu.storageError=String(i.message??i),""}}),ut=(o=>(i,l,x,k)=>o(i,l,!!x,k))((o,i,l,x)=>globalThis.__utuWutu.store(o,i,!!l,x)),dt=(()=>globalThis.__utuWutu?.refresh());function ft(){let o=new Map,i=0;return Ut(),(l,x,k)=>{let E=(globalThis.__utuWutu?.here()??"")+"|"+l+"|"+x,N=E+"|"+k.map(y=>y!==null&&typeof y=="object"?"#":String(y)).join(""),v=o.get(E),z=v?.key===N&&v.args.length===k.length&&v.args.every((y,W)=>Object.is(y,k[W]));if(z&&!v.node.hasAttribute("data-wutu-lazy-error"))return v.node;let u=z?v.node:v?document.createElement("div"):[...document.querySelectorAll("[data-wutu-lazy]")].find(y=>y.getAttribute("data-wutu-lazy")===N)??document.createElement("div");u.setAttribute("data-wutu-lazy",N),u.removeAttribute("data-wutu-lazy-error"),o.set(E,{key:N,node:u,args:[...k]});let d=globalThis.__wutuChunks?.[l];if(!d)return console.error("Wutu: no chunk was built for "+l),u;let f=z?(v.tries??0)+1:0;return o.get(E).tries=f,i++,document.documentElement.setAttribute("data-wutu-loading",""),(f?import(d+"?retry="+f):import(d)).then(y=>{let W=y.exports?.[x];if(typeof W!="function")throw y.error??new Error("Wutu: chunk for "+l+" has no "+x);let O=W(...k);u.replaceChildren(...globalThis.__utuWutu?.nodes(O)??[O]);for(let M of u.querySelectorAll("[data-wutu-pending]"))M.closest("[data-wutu-lazy]")===u&&(M.disabled=!1,M.removeAttribute("data-wutu-pending"))}).catch(y=>{u.setAttribute("data-wutu-lazy-error",""),console.error(y)}).finally(()=>{--i===0&&document.documentElement.removeAttribute("data-wutu-loading")}),u}}function Ut(){if(typeof window>"u"||navigator.connection?.saveData)return;let o=l=>(window.requestIdleCallback??(x=>setTimeout(x,200)))(l,{timeout:3e3}),i=()=>o(async()=>{for(let l of new Set(Object.values(globalThis.__wutuChunks??{})))await import(l).catch(()=>{})});document.readyState==="complete"?i():window.addEventListener("load",i,{once:!0})}globalThis.__wutuChunks={...globalThis.__wutuChunks,"./start.utu":new URL("./chunks/start-7f5a4adeed/app.js",import.meta.url).href,"./tour.utu":new URL("./chunks/tour-e83684e7cd/app.js",import.meta.url).href,"./iterators.utu":new URL("./chunks/iterators-88f9b72dc3/app.js",import.meta.url).href,"./stdlib.utu":new URL("./chunks/stdlib-5b5beede5b/app.js",import.meta.url).href,"./javascript.utu":new URL("./chunks/javascript-9de6df9033/app.js",import.meta.url).href,"./data.utu":new URL("./chunks/data-bed871d60e/app.js",import.meta.url).href,"./web.utu":new URL("./chunks/web-97e7a2d18c/app.js",import.meta.url).href,"./tooling.utu":new URL("./chunks/tooling-c5e9b1a06d/app.js",import.meta.url).href,"./compiler.utu":new URL("./chunks/compiler-cfa5e412e0/app.js",import.meta.url).href,"./benchmarks.utu":new URL("./chunks/benchmarks-eaeb563a4f/app.js",import.meta.url).href};globalThis.__wutuLazy??=ft();try{let{instance:o}=await WebAssembly.instantiateStreaming(fetch(new URL("./app.wasm?v=7c477abd3592",import.meta.url)),{es:[xe,Q,X,Z,ke,Q,Se,$e,ve,Ae,Te,Ee,_e,Ne,ze,We,Me,Ce,Ie,je,Le,Re,Ue,Oe,Be,qe,Pe,Ke,De,Fe,Je,Ge,Ve,He,Ye,Qe,Xe,Ze,et,tt,Z,X,nt,ot,rt,it,at,st,lt,ct,ut,dt],utu:{closure_new:(l,x,k,E)=>we(l,x,k,E,["..b"]),closure_call_0:ye}},{builtins:["js-string"],importedStringConstants:"'"}),i=o.exports;document.querySelectorAll("[data-utu-static]").forEach(l=>l.remove()),await i.main?.(),document.documentElement.setAttribute("data-utu-ready","")}catch(o){document.documentElement.setAttribute("data-utu-error",String(o.message??o));let i=document.createElement("p");i.setAttribute("role","status"),i.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.",document.body.append(i),console.error(o)}
