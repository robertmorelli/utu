var ve=Object.defineProperty;var ze=(r,i)=>{for(var a in i)ve(r,a,{get:i[a],enumerable:!0})};function ee(r,i={}){if(!r)return i;r.new&&(i.closure_new=(f,w,y)=>{let v=w==null&&!(y&2)?(...S)=>f(...S):(...S)=>f(w,...S);return y&1?(...S)=>!!v(...S):v});let a=(f,...w)=>f(...w);for(let f of r.calls??[])i[f]=a;return i}function ne(r,i){let a={};for(let[f,w]of Object.entries(r??{})){a[f]={};for(let y of Object.keys(w??{})){if(!(y in i))continue;let v=i[y];a[f][y]=typeof v=="function"?v:()=>v}}return a}var P={};ze(P,{__es_10:()=>Oe,__es_11:()=>Ue,__es_12:()=>Re,__es_13:()=>Le,__es_14:()=>Be,__es_15:()=>$e,__es_19:()=>Ge,__es_21:()=>Je,__es_22:()=>De,__es_25:()=>He,__es_26:()=>Qe,__es_27:()=>Xe,__es_28:()=>Ze,__es_35:()=>an,__es_36:()=>ln,__es_37:()=>cn,__es_38:()=>un,__es_39:()=>dn,__es_6:()=>Ie,__es_7:()=>We,__es_8:()=>Ne,__es_9:()=>Ce,__foreign_0:()=>Se,__foreign_1:()=>Ee,__foreign_10:()=>Ve,__foreign_11:()=>Ye,__foreign_12:()=>en,__foreign_13:()=>nn,__foreign_14:()=>tn,__foreign_15:()=>on,__foreign_16:()=>rn,__foreign_17:()=>sn,__foreign_2:()=>Ae,__foreign_3:()=>Te,__foreign_4:()=>Me,__foreign_5:()=>je,__foreign_6:()=>qe,__foreign_7:()=>Pe,__foreign_8:()=>Fe,__foreign_9:()=>Ke});var Se=(r=>globalThis[r]),Ee=((r,i,a)=>r[i](a)),Ae=((r,i,a)=>{r[i]=a}),Te=((r,i)=>r[i]),Me=((r,i)=>globalThis[r](i)),je=((r,i,a)=>r[i](a)),Ie=((r,i)=>globalThis.__utuWutu.mount(r,i)),We=(()=>globalThis.__utuWutu.slot()),Ne=(r=>globalThis.__utuWutu.put(r)),Ce=(r=>globalThis.__utuWutu.item(r)),Oe=(()=>globalThis.__utuWutu.end()),Ue=(r=>globalThis.__utuWutu.begin(r)),Re=(()=>globalThis.__utuWutu.done()),Le=(()=>{if(!document.getElementById("wutu-1tpj2d5")){let r=document.createElement("style");r.id="wutu-1tpj2d5",r.textContent=`@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap") layer(wutu.document);@layer wutu.document{
        
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
                }}.wu7hoyu{min-inline-size:0;}.w1nf506q{padding:1.5rem clamp(1rem, 4vw, 3rem) 3rem;border-block-start:1px solid var(--line);color:var(--muted);font-size:0.9rem;display:flex;flex-wrap:wrap;gap:0.5rem 2rem;justify-content:space-between;}`,document.head.append(r)}}),Be=(()=>{globalThis.__utuWutu??=(function(){let i=new WeakMap,a=new WeakMap,f=new Set,w=new Map,y=new Set,v=[],S=new Set,_=new WeakSet,c=new Map,x=0,E=new WeakMap,M=new Map,z=[],m=null,p=[],U=!1,R=0;function te(e){let n="",t="",o=0;for(let s=e.indexOf("@import",o);s>=0;s=e.indexOf("@import",o)){let l=-1,g="",d=0;for(let k=s;k<e.length&&l<0;k++){let b=e[k];g?b==="\\"?k++:b===g&&(g=""):b==='"'||b==="'"?g=b:b==="("?d++:b===")"?d--:b===";"&&d<=0&&(l=k)}if(l<0)break;let u=e.slice(s,l);t+=e.slice(o,s),n+=u.includes("layer(")?u+";":u+" layer(wutu.document);",o=l+1}return t+=e.slice(o),n+(t.trim()?"@layer wutu.document{"+t+"}":"")}function oe(e){let n=te(e);if(S.has(n)||(S.add(n),[...document.querySelectorAll("style")].some(o=>o.textContent===n)))return;let t=document.createElement("style");t.textContent=n,document.head.append(t)}function C(){Z.autoSave?.()}function re(e){let n=w.get(e)?.deref();n&&(n.dirty=!0,A(n))}let ie=new Set;function L(e){let n=E.get(e);return n===void 0&&E.set(e,n=e.getAttribute("data-wutu")),n}function se(e,n){let t=e.childNodes;if(t.length===n.length){let d=!0;for(let u=0;d&&u<n.length;u++)d=t[u]===n[u];if(d)return}let o=document.activeElement,s=o&&"selectionStart"in o?[o.selectionStart,o.selectionEnd,o.selectionDirection]:null,l=e.firstChild;for(let d of n){if(d===l){l=l.nextSibling;continue}e.moveBefore&&d.parentNode===e?e.moveBefore(d,l):e.insertBefore(d,l)}let g=new Set(n);for(let d of[...e.childNodes])g.has(d)||(m?m.removals.add(d):(q(d),d.remove()));o?.isConnected&&document.activeElement!==o&&(o.focus({preventScroll:!0}),s?.[0]!=null&&o.setSelectionRange(...s))}function ae(e,n,t,o){if(t&&m){if(m.globalClaims.has(n))throw new Error("Duplicate global Wutu key: "+n);m.globalClaims.add(n)}if(o&&e){if(e.keyed??=new Set,e.keyed.has(n))throw new Error("Duplicate Wutu key: "+p.findLast(s=>s.explicit).value);e.keyed.add(n)}}function le(e,n,t,o){let s=e?.old[e.wanted.length];if(s?.nodeType===1&&s.localName===t&&L(s)===n&&!e.used.has(s))return s;let l=e&&ce(e).get(n);for(;l&&l.index<l.nodes.length;){let g=l.nodes[l.index++];if(!e.used.has(g)&&g.localName===t)return g}return o?ue(n):void 0}function ce(e){if(e.byKey)return e.byKey;e.byKey=new Map;for(let n of e.old){if(n.nodeType!==1)continue;let t=L(n),o=e.byKey.get(t);o||e.byKey.set(t,o={nodes:[],index:0}),o.nodes.push(n)}return e.byKey}function ue(e){if(m){if(!m.globalNodes){m.globalNodes=new Map;for(let n of m.root?.querySelectorAll("[data-wutu]")??[])m.globalNodes.set(L(n),n)}return m.globalNodes.get(e)}}function j(e,n,t,o){let s=z.at(-1),l=e+(n?":"+n:""),g=!1,d=!1;if(p.length){let k=0;for(let b=0;b<p.length;b++)p[b].global&&(k=b,g=p[b].depth===z.length),p[b].explicit&&(d=p[b].depth===z.length);for(let b=k;b<p.length;b++){let N=p[b];l+=`:${N.explicit?"k":"c"}${N.value.length}:${N.value}`}}ae(s,l,g,d);let u=le(s,l,t,g);return u&&m?.retained.add(u),s||(u=m?.root??document.querySelector(`[data-wutu-root="${e}"][data-wutu-prerender]`)),u&&!E.has(u)&&(u.removeAttribute("data-wutu-prerender"),u.hasAttribute("data-wutu-pending")&&(u.disabled=!1,u.removeAttribute("data-wutu-pending"))),(!u||u.localName!==t)&&(u=o()),s&&(s.used.add(u),s.wanted.push(u)),E.get(u)!==l&&(u.setAttribute("data-wutu",l),E.set(u,l)),s||(u.getAttribute("data-wutu-root")!==e&&u.setAttribute("data-wutu-root",e),m&&(m.root=u)),u}function B(e,n){let t=i.get(e),o=t?null:new Set([...e.attributes].map(s=>s.name).filter(s=>!s.startsWith("data-wutu")&&!n.includes(s)));return z.push({node:e,meta:t,before:o,old:e.childNodes,used:new Set,wanted:[],attrs:null,byKey:null,keyed:null}),e}function de(e,n,t,o){return B(j(t,o,e,()=>n?document.createElementNS("http://www.w3.org/2000/svg",e):document.createElement(e)),[])}function F(e,n){let t=M.get(e);return t||M.set(e,t=J(JSON.parse(e),n)),t}let G=new WeakMap;function K(e,n){let t=G.get(e);return t||G.set(e,t=J(e,n)),t}function J(e,n){let t=([o,s,...l],g)=>{g=g||o==="svg";let d=g?document.createElementNS("http://www.w3.org/2000/svg",o):document.createElement(o);for(let k in s)d.setAttribute(k,s[k]);let u=g&&o!=="foreignObject";for(let k of l)d.append(typeof k=="string"?k:t(k,u));return d};return[t(e,n),Object.keys(e[1])]}function fe(e,n,t){let[o,s]=F(e,n);return B(j(t,"",o.localName,()=>o.cloneNode(!1)),s)}function me(e,n,t){let[o]=F(e,n);return j(t,"",o.localName,()=>o.cloneNode(!0))}function I(e){let n=z.at(-1);if(e?.nodeType){n.wanted.includes(e)||(n.used.add(e),n.wanted.push(e));return}let t=String(e??""),o=n.old[n.wanted.length];!o||o.nodeType!==3||n.used.has(o)?o=document.createTextNode(t):o.data!==t&&(o.data=t),n.used.add(o),n.wanted.push(o)}function O(e,n,t){if((z.at(-1).attrs??=new Set).add(n),t===null||t===!1){e.removeAttribute(n);return}let o=t===!0?"":String(t);e.getAttribute(n)!==o&&e.setAttribute(n,o)}function D(e,n,t){if(n==="mount"){if(_.has(e))return;_.add(e);let g=m;queueMicrotask(()=>{t(new Event("mount")),C(),g&&A(g)});return}let o=n[0]==="~";o&&(n=n.slice(1));let s=a.get(e);s||a.set(e,s=new Map);let l=s.get(n);l||(l={handlers:[],generation:-1,view:m},s.set(n,l),e.addEventListener(n,g=>{let d=!1;try{for(let[u,k]of[...l.handlers]){k||(d=!0);let b=u(g);b?.then&&b.then(W,N=>{W(),setTimeout(()=>{throw N})})}}finally{d&&(C(),l.view&&A(l.view))}})),l.generation!==R&&(l.handlers=[],l.generation=R),l.handlers.push([t,o]),l.view=m}function V(){let e=z.pop(),n=e.node,t=e.attrs??ie;if(n.hasAttribute("data-wutu-unmanaged"))return i.set(n,{...i.get(n),attrs:t}),n;let o=e.meta;for(let s of o?o.attrs:e.before)t.has(s)||n.removeAttribute(s);return o?o.attrs=t:i.set(n,{attrs:t}),se(n,e.wanted),n}let Y=new Map,H=["end"],h=null;function pe(e){let n=Y.get(e);if(!n){let t=2166136261;for(let o=0;o<e.length;o++)t=Math.imul(t^e.charCodeAt(o),16777619);Y.set(e,n=[JSON.parse(e),(t>>>0).toString(36)])}h={h:n[1],nodes:[],stack:[{ops:n[0],pc:0,kind:"top"}],outer:h,pending:null}}function T(){for(;;){let e=h.stack.at(-1);if(e.pc>=e.ops.length){if(e.kind==="arm"){h.stack.pop();continue}return e.kind==="body"?H:null}let n=e.ops[e.pc++];switch(n[0]){case"s":{let[t]=K(n[2],!!n[3]);h.nodes[n[1]]=j(`v${h.h}:${n[1]}`,"",t.localName,()=>t.cloneNode(!0));break}case"o":{let[t,o]=K(n[2],!!n[3]);h.nodes[n[1]]=B(j(`v${h.h}:${n[1]}`,"",t.localName,()=>t.cloneNode(!1)),o);break}case"c":V();break;case"t":I(n[1]);break;default:return n}}}function ge(e){if(h?.pending){h.pending=null,I(e),p.pop();return}if(!h){I(e),p.pop();return}let n=T(),t=z.at(-1)?.node;switch(n[0]){case"a":O(t,n[1],e);break;case"m":O(t,"class",n[1]+e);break;case"b":O(t,n[1],!!e);break;case"y":t.style.setProperty(n[1],e);break;case"w":I(e);break;case"v":D(h.nodes[n[1]],n[2],e);break;default:throw new Error("Wutu: a value where the template has "+JSON.stringify(n?.[0]))}}function he(){let e=T();p.push({value:`call:${h.h}:${e[1]}`,explicit:!1}),h.pending=e}function be(e){let n=T();h.stack.push({ops:e?n[1]:n[2],pc:0,kind:"arm"})}function Q(){let e=T();if(e!==H)return[e,null];let n=h.stack.at(-1);return p.pop(),n.loop[1]===0&&p.pop(),[n.loop,n]}function _e(e){let[n,t]=Q();t?t.pc=0:h.stack.push({ops:n[3],pc:0,kind:"body",loop:n});let o=String(e),s=n[1];s===0?(p.push({value:`loop:${h.h}:${n[2]}`,explicit:!1}),p.push({value:o,explicit:!1})):p.push({value:o,explicit:!0,global:s===2,depth:z.length})}function we(){let[,e]=Q();e&&h.stack.pop()}function ye(){return h.nodes[T()[1]]}function xe(){for(;T()!==null;);let e=h.nodes[0];return h=h.outer,e}function $(e){let n=[z,m,p],t=document.activeElement;e.cleanupIndex=0,e.cleanupCallbacks??=[],e.removals=new Set,e.retained=new Set,e.globalNodes=null,e.globalClaims=new Set,z=[],m=e,p=[],R++;try{e.root=e.render();for(let o of e.cleanupCallbacks.splice(e.cleanupIndex))o();for(let o of e.removals)e.retained.has(o)||(q(o),o.remove());t?.isConnected&&document.activeElement!==t&&t.focus({preventScroll:!0})}finally{[z,m,p]=n,e.globalNodes=null,e.removals.clear(),e.retained.clear()}return e.root}function ke(e,n=""){if(m&&!n)return e();if(n){let s=w.get(n)?.deref();if(s?.root.isConnected)return s.dirty&&(s.dirty=!1,$(s)),s.root}let t={render:e,root:null,scope:n,dirty:!1,cleanups:[],cleanupCallbacks:[],effects:new Map},o=$(t);return f.add(new WeakRef(t)),n&&w.set(n,new WeakRef(t)),i.set(o,{...i.get(o),view:t}),o}function X(){U=!1;let e=[...y];y.clear();for(let n of e)n.root.isConnected&&(n.dirty=!1,$(n));for(let n of v.splice(0))n()}function W(){for(let e of f){let n=e.deref();if(!n){f.delete(e);continue}n.root.isConnected&&y.add(n)}C(),X()}function A(e){e&&y.add(e),!U&&(U=!0,queueMicrotask(X))}function q(e){let n=i.get(e)?.view;if(n){for(let t of[...n.cleanups.splice(0),...n.cleanupCallbacks.splice(0)])t();n.scope&&w.delete(n.scope)}for(let t of e.children??[])q(t)}addEventListener("hashchange",W),addEventListener("popstate",W);let Z={enter:de,shell:fe,still:me,append:I,attr:O,listen:D,leave:V,mount:ke,refresh:W,invalidate:re,style:oe,put:ge,begin:pe,slot:he,arm:be,item:_e,end:we,node:ye,done:xe,storageError:"",notify(){for(let e of f){let n=e.deref();n?.root.isConnected&&A(n)}},interval(e,n,t){let o=m;if(!o||o.effects.has(e))return;let s=setInterval(()=>{t(),C(),A(o)},Math.max(16,n));o.effects.set(e,s),o.cleanups.push(()=>clearInterval(s))},lazy(e){let n=c.get(e);if(n)return n;n=document.querySelector('[data-wutu-lazy="'+e+'"]'),n||(n=document.createElement("div"),n.setAttribute("data-wutu-lazy",e)),c.set(e,n);let t=globalThis.__wutuChunks?.[e];return t?(x++,document.documentElement.setAttribute("data-wutu-loading",""),import(t).catch(o=>console.error(o)).finally(()=>{--x===0&&document.documentElement.removeAttribute("data-wutu-loading")}),n):(console.error("Wutu: no chunk was built for "+e),n)},deliver(e,n){c.get(e)?.replaceChildren(n)},after(e){v.push(e),A()},focus(e){v.push(()=>document.getElementById(e)?.focus()),A()},cleanup(e){m&&(m.cleanupCallbacks[m.cleanupIndex++]=e)},pushGlobal:e=>p.push({value:String(e),explicit:!0,global:!0,depth:z.length}),pushKey:e=>p.push({value:String(e),explicit:!0,depth:z.length}),pushCall:e=>p.push({value:e,explicit:!1}),popKey:()=>p.pop()};return Z})()}),$e=(()=>location.hash.slice(1)||"/"),qe=((r,i,a)=>({top:r,left:i,behavior:a})),Pe=((r,i,a)=>r[i](a)??null),Fe=((r,i)=>({block:r,inline:i})),Ge=(r=>{try{if(!r)return"";let i=JSON.parse(r);if(i.version!==1||!(i.data!==null&&typeof i.data=="object"&&!Array.isArray(i.data)&&typeof i.data.source=="string"))throw Error("Stored schema mismatch");return JSON.stringify(i.data)}catch(i){return globalThis.__utuWutu.storageError=String(i.message??i),""}}),Ke=((r,i)=>(a=>typeof a=="string"?a:(()=>{throw new TypeError("expected string")})())(r[i])),Je=(r=>{try{return localStorage.getItem(r)??""}catch(i){return globalThis.__utuWutu.storageError=String(i.message??i),""}}),De=((r,i,a,f)=>globalThis.__utuWutu.store(r,i,!!a,f)),Ve=(r=>({source:r})),Ye=((r,i)=>({version:r,data:i})),He=((r,i,a)=>import(new URL("./playground/playground.js?v=054db4aa5f83",document.baseURI).href).then(f=>f.schedule(r,i,a)).catch(f=>a("Could not load the compiler",String(f),!0))),Qe=(()=>globalThis.__utuWutu.node()),Xe=(r=>globalThis.__utuWutu.arm(r)),Ze=(()=>{if(!document.getElementById("wutu-124igqj")){let r=document.createElement("style");r.id="wutu-124igqj",r.textContent=`.wa925av{display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:1rem;margin-block:1.5rem;inline-size:min(100%, 76rem);@media (width < 72rem){
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
                        }}.w18jcedk{inline-size:100%;block-size:100%;border:0;background:white;}.w1tku8aq{margin-block-start:0;inline-size:min(100%, 76rem);white-space:pre-wrap;}.wnoe2ce{padding:0.4rem 0.8rem;font:inherit;font-size:0.9rem;color:var(--ink);background:var(--tint);border:1px solid var(--line);cursor:pointer;}`,document.head.append(r)}}),en=((r,i)=>r[i]),nn=((r,i,a)=>{r[i]=a}),tn=(r=>r instanceof globalThis.KeyboardEvent?r:null),on=((r,i)=>r[i]()),rn=((r,i,a,f,w,y)=>r[i](a,f,w,y)),sn=((r,i)=>r[i]?1:0),an=(r=>globalThis.__utuWutu.item(r)),ln=(r=>globalThis.__utuWutu?.after(r)),cn=(r=>globalThis.__utuWutu.lazy(r)),un=(()=>{(function(i){if(i.store)return;let a=new Map,f=180,w;function y(_){let c=String(_.message??_);i.storageError!==c&&(i.storageError=c,i.notify())}function v(){clearTimeout(w);for(let[_,c]of a)if(!(!c.dirty||c.conflict))try{let x=c.encode();x!==c.last&&(localStorage.setItem(_,x),c.last=x),c.dirty=!1}catch(x){y(x)}}function S(_){let c=a.get(_);c&&(c.conflict=!1,c.dirty=!0,clearTimeout(w),w=setTimeout(v,f))}i.flush=v,i.save=S,i.autoSave=()=>{for(let[_,c]of a)!c.manual&&!c.conflict&&S(_)},i.store=(_,c,x=!1,E=null)=>{let M=null;try{M=localStorage.getItem(_)}catch{}a.set(_,{encode:c,manual:x,apply:E,last:M,dirty:!1})},i.reload=_=>{let c=a.get(_);if(c)try{let x=localStorage.getItem(_);c.apply?.(x??""),c.last=x,c.dirty=!1,c.conflict=!1,i.storageError="",i.refresh()}catch(x){y(x)}},addEventListener("pagehide",v),addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&v()}),addEventListener("storage",_=>{let c=a.get(_.key);if(c){if(c.dirty){c.conflict=!0,clearTimeout(w),y("Unsaved local changes conflict with another tab. Reload or explicitly save to keep this tab.");return}try{c.apply?.(_.newValue??""),c.last=_.newValue,i.refresh()}catch(x){y(x)}}})})(globalThis.__utuWutu)}),dn=(()=>globalThis.__utuWutu?.refresh());globalThis.__wutuChunks={...globalThis.__wutuChunks,"./start.utu":new URL("./chunks/start-edb6f20f6a/app.js",import.meta.url).href,"./tour.utu":new URL("./chunks/tour-75b9a198b4/app.js",import.meta.url).href,"./iterators.utu":new URL("./chunks/iterators-b35a066e6b/app.js",import.meta.url).href,"./stdlib.utu":new URL("./chunks/stdlib-70ae809ad7/app.js",import.meta.url).href,"./javascript.utu":new URL("./chunks/javascript-361d24bbaf/app.js",import.meta.url).href,"./data.utu":new URL("./chunks/data-8191d4278e/app.js",import.meta.url).href,"./web.utu":new URL("./chunks/web-e38e943f9f/app.js",import.meta.url).href,"./tooling.utu":new URL("./chunks/tooling-8ec0de1ac3/app.js",import.meta.url).href,"./compiler.utu":new URL("./chunks/compiler-2fe230cdf1/app.js",import.meta.url).href};try{let r=ne({es:{__foreign_0:"",__foreign_1:"",__foreign_2:"",__foreign_3:"",__foreign_4:"",__foreign_5:"",__es_6:"",__es_7:"",__es_8:"",__es_9:"",__es_10:"",__es_11:"",__es_12:"",__es_13:"",__es_14:"",__es_15:"",__foreign_6:"",__foreign_7:"",__foreign_8:"",__es_19:"",__foreign_9:"",__es_21:"",__es_22:"",__foreign_10:"",__foreign_11:"",__es_25:"",__es_26:"",__es_27:"",__es_28:"",__foreign_12:"",__foreign_13:"",__foreign_14:"",__foreign_15:"",__foreign_16:"",__foreign_17:"",__es_35:"",__es_36:"",__es_37:"",__es_38:"",__es_39:""}},P);r.utu=ee({new:!0,calls:["closure_call_0"]},r.utu);let i=await WebAssembly.compileStreaming(fetch(new URL("./app.wasm?v=a3c2943cfce3",import.meta.url)),{builtins:["js-string"],importedStringConstants:"'"}),f=(await WebAssembly.instantiate(i,r)).exports;document.querySelectorAll("[data-utu-static]").forEach(w=>w.remove()),await f.main?.(),document.documentElement.setAttribute("data-utu-ready","")}catch(r){document.documentElement.setAttribute("data-utu-error",String(r.message??r));let i=document.createElement("p");i.setAttribute("role","status"),i.textContent="Interactive tools could not start. The page is still available to read. Try reloading in a browser with WebAssembly GC support.",document.body.append(i),console.error(r)}
