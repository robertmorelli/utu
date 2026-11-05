function ve(e,n={}){for(let t of e?.ops??[])t==="promise_then"&&(n.promise_then=vn),t==="promise_catch"&&(n.promise_catch=xn);return n}var xe=new WeakSet,vn=(e,n)=>{e.then(n,t=>{if(!xe.has(e))throw t})},xn=(e,n)=>{xe.add(e),e.catch(n)};function ke(e,n={}){for(let t of e?.awaits??[])n[`await_${t}`]=kn(t.startsWith("null_"));return n}function kn(e=!1){if(typeof WebAssembly.Suspending!="function")throw new Error("utu: `await` needs JS Promise Integration (WebAssembly.Suspending), which this host does not provide \u2014 use `.then` instead, or run on a JSPI-capable host (Chrome 126+, Node 23+, Bun)");return new WebAssembly.Suspending(e?async n=>await n??null:async n=>await n)}var Ie=Symbol("utu.closure");function Se(e,n={}){if(!e)return n;e.new&&(n.closure_new=In),n.closure_rec=Sn;for(let t of e.calls??[])n[t]=An;return n}var ge=new WeakMap,In=(e,n,t,r)=>{let i=n==null&&!(t&2),l=i&&ge.get(e);if(l)return l;let d=i?(...a)=>e(...a):(...a)=>e(n,...a),f=t>>4&8191,s=t>>17&8191,m=f|s?(...a)=>{for(let u=0,h=f,w=s;h|w;u++,h>>=1,w>>=1)if(w&1&&a[u]===void 0)a[u]=null;else if(h&1&&a[u]==null)throw new TypeError(`Wrong type from JavaScript: a closure's argument ${u+1} is ${a[u]}`);return d(...a)}:d,o=t&1?(...a)=>!!m(...a):t&4?(...a)=>m(...a)>>>0:t&8?(...a)=>BigInt.asUintN(64,m(...a)):m;return o[Ie]=r,i&&ge.set(e,o),o},Sn=e=>e?.[Ie]??null,An=(e,...n)=>e(...n),Tn={U8:"Uint8Array",I8:"Int8Array",U16:"Uint16Array",I16:"Int16Array",I32:"Int32Array",U32:"Uint32Array",I64:"BigInt64Array",U64:"BigUint64Array",F32:"Float32Array",F64:"Float64Array"};function Ae(e,n={}){for(let{name:r,kind:i,host:l,data:d}of e??[]){if(!l)continue;let f=Math.max(1,Math.ceil((d?d.length*3/4:0)/65536)),s=new WebAssembly.Memory({initial:f,maximum:65535}),m=globalThis[Tn[i]],o=m.BYTES_PER_ELEMENT,a=u=>{let h=Math.ceil(u/65536)-s.buffer.byteLength/65536;h>0&&s.grow(h)};n[`mem_${r}`]=s,n[`mem_copy_in_${r}`]=u=>{if(typeof u=="string")return a(u.length*3),Math.floor(new TextEncoder().encodeInto(u,new Uint8Array(s.buffer)).written/o);let h=u instanceof ArrayBuffer?new Uint8Array(u):new Uint8Array(u.buffer,u.byteOffset,u.byteLength);return a(h.byteLength),new Uint8Array(s.buffer).set(h),Math.floor(h.byteLength/o)},n[`mem_view_${r}`]=(u,h)=>new m(s.buffer,u*o,h-u)}return n}function Te(e={}){return e.js_tag=WebAssembly.JSTag,e}function je(e,n){let t=n?.asyncExports??[];if(t.length===0)return e.exports;let r={...e.exports};for(let i of t)typeof r[i]=="function"&&(r[i]=jn(r[i]));return r}function jn(e){return Object.defineProperty(WebAssembly.promising(e),"length",{value:e.length})}function Me(e,n){if(!n)return e;let t={Bool:f=>f!==0,U32:f=>f>>>0,U64:f=>BigInt.asUintN(64,f)},r=f=>f,i=(f,s,m,o)=>{throw new TypeError(`${f}: argument ${s+1} must be ${m}, not ${o===null?"null":m==="an integer"&&typeof o=="number"?o:typeof o}`)},l=(f,s,m)=>s==="Bool"?o=>!!o:s==="int"?o=>Number.isInteger(o)?o:i(f,m,"an integer",o):s==="big"?o=>typeof o=="bigint"?o:i(f,m,"a BigInt",o):s==="num"?o=>typeof o=="number"?o:i(f,m,"a number",o):s==="Str"?o=>typeof o=="string"?o:i(f,m,"a string",o):s==="?Str"?o=>o==null?null:typeof o=="string"?o:i(f,m,"a string or null",o):s==="ref"?o=>o??i(f,m,"a value",o):s==="cl"?o=>typeof o=="function"?o:i(f,m,"a function",o):s==="?"?o=>o===void 0?null:o:r,d={...e};for(let[f,s]of Object.entries(n)){let m=e[f];if(typeof m!="function")continue;let o=typeof s=="string"?s:s.r,a=Array.isArray(o)?o.map(w=>t[w]??r):null,u=a?w=>w.map((y,c)=>a[c](y)):t[o]??r,h=(typeof s=="string"?[]:s.p??[]).map((w,y)=>l(f,w,y));d[f]=(...w)=>{for(let c=0;c<h.length;c++)w[c]=h[c](w[c]);let y=m(...w);return y instanceof Promise?y.then(u):u(y)},Object.defineProperty(d[f],"length",{value:m.length})}return d}var we=/^\s*import\s[^;]*;/,$e="const $utuFn = (n, f) => { if (typeof f != 'function') throw new TypeError(`${n}: @es gave ${f === null ? 'null' : typeof f}, not a function`); return f; };",Fe=e=>e.includes("$utuFn(");function V(e){let n=[],t=e;for(let r=t.match(we);r;r=t.match(we))n.push(r[0].trim()),t=t.slice(r[0].length);return{imports:n,expr:t.trim()}}function G(e,n=null){let t=new Set,r=[],i=!1;for(let d of Object.values(e??{}))for(let[f,s]of Object.entries(d??{})){if(n&&!n.has(f))continue;let{imports:m,expr:o}=V(s);for(let a of m)t.add(a);i||=Fe(o),r.push(`export const ${L(f)} = (
${o}
);`)}return r.length===0?"":`${(t.size?`${[...t].join(`
`)}

`:"")+(i?`${$e}

`:"")}${r.join(`

`)}
`}function L(e){return/^\d/.test(e)?`$${e}`:e}function Ee(e,n){let t={};for(let[r,i]of Object.entries(e??{})){t[r]={};for(let l of Object.keys(i??{})){if(!(L(l)in n))continue;let d=n[L(l)];t[r][l]=typeof d=="function"?d:()=>d}}return t}function Re(e){let n={};for(let[t,r]of Object.entries(e??{})){n[t]={};for(let[i,l]of Object.entries(r??{})){let d=new Function(`${Fe(l)?$e:""}return (${l});`)();n[t][i]=typeof d=="function"?d:()=>d}}return n}var Mn=/(?<=\b(?:if\b[^{};]*|else\s*))\{[^{};]*;?\s*\}/g;function Oe(e,n){let t=[];if(!$n(e))return t;let r=0,i=!1,l=[];for(let[d,f]of e.split(`
`).entries()){let s=f.length>160;if(!s&&!i&&!l.length&&(!f.includes("`")&&!f.includes("/*")||/^\s*\/\//.test(f))){r+=f.length+1;continue}let m="",o=!1;if(!f.trimStart().startsWith("\\\\"))for(let u=0;u<f.length;u++){let h=f[u],w=f[u+1],y=l.length-1;if(i)h==="*"&&w==="/"&&(i=!1,u++);else if(o)h==="\\"?u++:h==='"'&&(o=!1);else if(l[y]==="text")h==="\\"?u++:h==="`"?l.pop():h==="$"&&w==="{"&&(l.push(0),u++);else{if(h==="/"&&w==="/")break;h==="/"&&w==="*"?(i=!0,u++):h==='"'?o=!0:h==="`"?l.push("text"):y>=0?h==="{"?l[y]++:h==="}"&&l[y]--===0&&l.pop():s&&(m+=h)}}let a=()=>(m.replace(Mn," ").match(/[{};]/g)??[]).length;if(s&&m.trim().length>100&&a()>=5){let u=f.search(/\S/)+1;t.push({kind:"compressed-source",severity:"warning",message:"This line packs multiple statements or blocks together. Put statements and block contents on separate, indented lines; keep source readable and minify build output instead.",primary:{file:n,row:d+1,col:u,endRow:d+1,endCol:f.length+1,start:r+u-1,end:r+f.length},related:[],notes:[],fixes:[]})}r+=f.length+1}return t}function $n(e){for(let n=0,t;n<e.length;n=t+1)if(t=e.indexOf(`
`,n),t<0&&(t=e.length),t-n>160)return!0;return!1}function Fn(e){return e.replace(/"[^"\n]*"|\/\/[^\n]*|\\\\[^\n]*/g,n=>n[0]==='"'?`"${" ".repeat(n.length-2)}"`:" ".repeat(n.length))}function We(e,n){let t=e.slice(0,n).split(`
`);return{row:t.length,col:t.at(-1).length+1}}function Ne(e){let n=new Set,t=[];for(let[r,i]of e){if(!i.includes("@island")&&!i.includes("invalidate"))continue;let l=Fn(i);for(let d of l.matchAll(/@island\s+"/g)){let f=d.index+d[0].length;n.add(i.slice(f,i.indexOf('"',f)))}if(!/^(std|node|npm):/.test(r))for(let d of l.matchAll(/\bwutu\s*\.\s*invalidate\s*\(\s*"/g)){let f=d.index+d[0].length-1,s=i.indexOf('"',f+1)+1;t.push({file:r,source:i,start:f,end:s,name:i.slice(f+1,s-1)})}}return t.filter(r=>!n.has(r.name)).map(({file:r,source:i,start:l,end:d,name:f})=>{let s=We(i,l),m=We(i,d),o=[...n].sort();return{kind:"unknown-island",severity:"warning",message:`No @island named "${f}" exists, so this invalidate refreshes nothing.${o.length?` Known islands: ${o.map(a=>`"${a}"`).join(", ")}.`:""}`,primary:{file:r,row:s.row,col:s.col,endRow:m.row,endCol:m.col,start:l,end:d},related:[],notes:[],fixes:[]}})}function Be(e){let n=null;try{n=JSON.parse(e)}catch{return null}return n?.version===1&&Array.isArray(n.types)&&n.exports&&n.names&&/^[A-Z][A-Za-z0-9_]*$/.test(n.prefix)?n:null}var J={entry:0,import:1,prelude:2},re={normal:0,test:1,comptime:2,bench:3,analysis:4},le={none:0,size:1,speed:2},te={small:{optimize:"size",safe:!0},fast:{optimize:"speed",safe:!0},smallUnsafe:{optimize:"size",safe:!1},fastUnsafe:{optimize:"speed",safe:!1},debug:{optimize:"none",safe:!0}};var Pe=Object.freeze({builtins:["js-string"],importedStringConstants:"'"}),Y=new TextDecoder,P=new TextEncoder,U=(e,n,t)=>Y.decode(new Uint8Array(e.buffer,n,t-n));async function En(e,n={}){return(await ce(e,n)).exports}async function Rn(e,n,t){let r=t.mode&&Object.hasOwn(te,t.mode)?te[t.mode]:null;if(t.mode&&!r)throw new Error(`no build mode ${t.mode}: ${Object.keys(te).join(", ")}`);let{target:i="normal",optimize:l="size",debugNames:d=!1,safe:f=!1,sourceMap:s=!1,blame:m=!1,profile:o=!1,run:a=!1}={...t,...r};e.set_optimize(le[l]??le.size),e.set_safe(f?1:0),e.set_debug_names(d?1:0),e.set_move_limit?.(t.moveLimit??0),e.set_source_map?.(s||m?1:0),e.set_profile?.(o?1:0),e.set_run?.(a?1:0);let u,h;try{u=await fe(e,n,t),h=await Ye(e,re[i]??re.normal,t)}catch(c){if(!Dn(c))throw c;return u=Ve.get(e)??[],{wasm:null,spec:null,diagnostics:[Ln(e,u,c)],files:u}}let w=rt(e,u),y=Ze(e,u).concat(w,it(u));return h<0||w.length?{wasm:null,spec:null,diagnostics:y,files:u}:{...de(e,h),diagnostics:y,files:u,tests:i==="test"?Un(e):[],benches:i==="bench"?On(e):[],map:s&&e.map_count?Nn(e,u):null,blame:m&&e.blame_prepare?Cn(e,u):null,...o?{frames:Wn(e,u)}:{},...a&&e.run_leaf?.()?{array:{levels:e.run_levels(),leaf:e.run_leaf()}}:{}}}function Wn(e,n){let t=Z(n),r=[];for(let i=0;i<e.profile_count();i++){let l=e.profile_at(i),d=l>=0?t(l):null;r.push({name:e.profile_name(i),file:d?.file.key??null,line:d?.line??null})}return r}function On(e){let n=[];for(let t=0;t<e.bench_count();t++)n.push({export:`__bench_${t}`,name:De(e,e.bench_mod_start(t),e.bench_mod_end(t))+Le(U(e.src,e.bench_name_start(t),e.bench_name_end(t)))});return n}function Z(e){let n=e.toSorted((r,i)=>r.offset-i.offset),t=new Map;return r=>{let i=0,l=n.length-1,d=null;for(;i<=l;){let a=i+l>>1;n[a].offset<=r?(d=n[a],i=a+1):l=a-1}if(!d||r>d.offset+d.bytes.length)return null;let f=t.get(d);if(!f){f={bytes:[0],units:[0]};let{bytes:a}=d;for(let u=0;u<a.length;u++){if(a[u]!==10&&(a[u]!==13||a[u+1]===10))continue;let h=f.bytes.at(-1);f.units.push(f.units.at(-1)+Y.decode(a.subarray(h,u+1)).length),f.bytes.push(u+1)}t.set(d,f)}let s=r-d.offset;for(i=0,l=f.bytes.length-1;i<l;){let a=i+l+1>>1;f.bytes[a]<=s?i=a:l=a-1}let m=Y.decode(d.bytes.subarray(f.bytes[i],s)),o=1;for(let a=0;a<m.length;a++){let u=m.charCodeAt(a);(u<56320||u>57343)&&o++}return{file:d,line:i+1,column:o,unit:m.length+1,offset:f.units[i]+m.length}}}function Nn(e,n){let t=Z(n),r=new Map,i=new Map,l=new Map,d=[];for(let s=0;s<e.map_count();s++){let m=e.map_start(s),o=e.map_end(s),a=`${m}:${o}`,u=r.get(a);if(!u){let y=m>=0?t(m):null,c=e.map_kind(s);i.has(c)||i.set(c,c>=0?e.node_kind_name(c):null);let g=e.map_owner_start(s);g>=0&&!l.has(g)&&l.set(g,e.map_owner_name(s)),u={file:y?.file.key??null,line:y?.line??null,column:y?.column??null,unit:y?.unit??null,start:y?.offset??null,end:y?t(o)?.offset??y.offset:null,kind:i.get(c),owner:g>=0?l.get(g):null,ownerAt:g>=0?g:null},r.set(a,u)}let h=e.map_site_start?.(s)??-1,w=h>=0?t(h):null;d.push({at:e.map_offset(s),...u,site:w&&{file:w.file.key,line:w.line,column:w.column,start:w.offset,end:t(e.map_site_end(s))?.offset??w.offset}})}let f=[];for(let s=0;s<e.map_function_count();s++){let m=e.map_function_start(s);f.push(m>=0?m:null)}return{entries:d,functions:f}}var Bn=["defined","import","helper","wat"];function Cn(e,n){e.blame_prepare();let t=Z(n),r=[],i=[],l=new Map,d=new Map,f=new Map,s=y=>{let c=e.blame_node_kind(y);return f.has(c)||f.set(c,c>=0?e.node_kind_name(c):null),f.get(c)},m=y=>{let c=t(e.blame_node_start(y));return c&&{file:c.file.key,line:c.line,column:c.column,start:c.offset,end:t(e.blame_node_end(y))?.offset??c.offset}},o=y=>{if(y<0)return-1;if(!d.has(y)){let c=m(y);d.set(y,c?i.push({name:e.blame_decl_name(y),kind:s(y),...c})-1:-1)}return d.get(y)},a=y=>{if(y<0)return-1;if(!l.has(y)){let c=m(y);l.set(y,c?r.push({...c,kind:s(y),decl:o(e.blame_decl(y))})-1:-1)}return l.get(y)},u=[];for(let y=0;y<e.map_count();y++)u.push({at:e.map_offset(y),place:a(e.blame_map_node(y)),site:a(e.blame_map_site(y))});let h=[];for(let y=0;y<e.map_function_count();y++){let c=Y.decode(Uint8Array.from(e.blame_func_name(y),g=>g.charCodeAt(0)));h.push({place:a(e.blame_func_node(y)),role:Bn[e.blame_func_role(y)],name:c||null})}let w=(y,c)=>Array.from({length:y},(g,x)=>a(c(x)));return{places:r,decls:i,entries:u,funcs:h,types:w(e.blame_type_count(),y=>e.blame_type_node(y)),globals:w(e.blame_glob_count(),y=>e.blame_glob_node(y)),data:w(e.blame_data_count(),y=>e.blame_data_node(y)),memories:w(e.blame_memory_count(),y=>e.blame_memory_node(y))}}function Un(e){let n=[];for(let t=0;t<e.test_count();t++)n.push({export:`__test_${t}`,name:De(e,e.test_mod_start(t),e.test_mod_end(t))+Le(U(e.src,e.test_name_start(t),e.test_name_end(t)))});return n}var De=(e,n,t)=>n<0?"":`${U(e.src,n,t)}: `,qn={n:`
`,t:"	",r:"\r",b:"\b",f:"\f"};function Le(e){return e.slice(1,-1).replace(/\\(u[0-9a-fA-F]{4}|.)/g,(n,t)=>t.length>1?String.fromCharCode(parseInt(t.slice(1),16)):qn[t]??t)}async function fe(e,n,t,r=new Map){let{resolvePath:i=Xe,stdlib:l}=t,d=async c=>(r.has(c)||r.set(c,await(t.readFile.bytes??t.readFile)(c)),r.get(c)),f=Vn(e,l),s=[...f.files];Ve.set(e,s);let m=new Map(f.byKey),o=[],a=!1,u=(c,g,x)=>{if(a)return;let k=P.encode(g);new Uint8Array(e.src.buffer).set(k,e.import_missing(c,k.length,x)),a=!0},h=[],w=K(e,s,m,n,await d(n),J.entry);for(let c=0;c<e.import_count();c++){let g=s[e.import_from(c)],x=U(e.src,e.import_path_start(c),e.import_path_end(c)),k=ze.test(x),E=!k&&/\.abi\.json"$/.test(x)?i(g.key,JSON.parse(x)):null;if(/^"?(npm|node):/.test(x)||E||k&&typeof l.get(x)=="function"){e.import_foreign(c),o.push({i:c,raw:x,from:g.key,abiFile:E,name:U(e.src,e.import_name_start(c),e.import_name_end(c))});continue}let S=k?x:i(g.key,JSON.parse(x)),T=m.get(S);if(T===void 0){let O=g.role===J.prelude?J.prelude:J.import;if(k){let R=l.get(S);if(typeof R!="string"){u(c,S,2);continue}T=K(e,s,m,S,R,O)}else{let R;try{R=await d(S)}catch{u(c,S,0);continue}T=K(e,s,m,S,R,O)}}e.import_bind(c,T),(h[e.import_from(c)]??=[]).push([c,T])}let y=Jn(h,w);return y&&u(y[0],s[y[1]].key,1),await Zn(e,o,t,d)?(s.diagnostics=e.resolve(),await Qn(e,n,s,t),await Pn(e),s):fe(e,n,t,r)}function Jn(e,n){let t=[],r=[[n,0]];for(t[n]=1;r.length;){let i=r.at(-1),l=e[i[0]]?.[i[1]++];if(!l){t[i[0]]=2,r.pop();continue}if(t[l[1]]===1)return l;t[l[1]]||(t[l[1]]=1,r.push([l[1],0]))}return null}async function Pn(e){let n=e.wat_count();if(n===0)return;let{assembleWat:t}=await import("./assemble-QBZS4KRV.js"),r=d=>e.node_kind_name(new Uint8Array(e.node_kind.buffer)[d]),i=d=>{let f=new Int32Array(e.node_child.buffer),s=new Int32Array(e.node_next.buffer),m=[];for(let o=f[d];o>=0;o=s[o])m.push(o);return m},l=d=>{let f=new Int32Array(e.node_first.buffer)[d],s=new Int32Array(e.node_last.buffer)[d];return U(e.src,new Int32Array(e.tok_start.buffer)[f],new Int32Array(e.tok_end.buffer)[s-1])};for(let d=0;d<n;d++){let f=i(e.wat_function(d)),s=f.filter(h=>r(h)==="param_list").flatMap(i).map(h=>{let[w,y]=[i(h)[0],i(h).at(-1)];return{name:l(w),type:l(y)}}),m=f.find(h=>r(h)==="return_type"),o=r(i(m)[0])==="void_type"?"void":l(m),a=f.some(h=>r(h)==="self_param")||r(i(m)[0])==="yield_type",u=t({params:s,result:o,method:a,text:U(e.src,e.wat_text_start(d),e.wat_text_end(d))});if(u.code){let h=e.wat_set(d,u.code.length);new Uint8Array(e.wat_bytes.buffer).set(u.code,h)}else{let{message:h,start:w,end:y}=u.error,c=P.encode(h),g=e.wat_fail(d,w??-1,y??-1,c.length);new Uint8Array(e.src.buffer).set(c,g)}}}var ze=/^[a-z][a-zA-Z0-9_]*:[A-Za-z][a-zA-Z0-9_]*$/;function K(e,n,t,r,i,l){let d=typeof i=="string"?P.encode(i):new Uint8Array(i),f=typeof i=="string"?i:new TextDecoder("utf-8",{ignoreBOM:!0}).decode(d),s=e.file_add(d.length,l);return r.startsWith("std:")&&e.file_mark_std?.(s),new Uint8Array(e.src.buffer).set(d,e.file_offset(s)),n.push({key:r,role:l,text:f,offset:e.file_offset(s),bytes:d}),t.set(r,s),n.parsing=!0,e.file_parse(s),n.parsing=!1,s}var Ve=new WeakMap;function Dn(e){return e instanceof RangeError&&/call stack/i.test(e.message)}function Ln(e,n,t){let r={kind:"nested-too-deeply",code:"nested-too-deeply",severity:"error",file:null,message:"Program nested too deeply",notes:["The compiler recurses on nesting; split the expression, or the chain, into smaller ones."]},i=n.parsing?e.parse_deepest_at?.()??-1:-1;i<0&&(i=zn(e,n));let l=i<0?null:n.findLast(f=>f.offset<=i&&i<=f.offset+f.bytes.length);if(!l)return{...r,message:`${r.message} (${t.message})`};let d=H(l,i,i);return{...r,file:l.key,...d,end:d.start+1,label:"nested too deeply",message:`${r.message} (at about line ${d.line})`}}function zn(e,n){let t,r,i,l,d;try{d=e.node_count(),[t,r,i]=["node_child","node_next","node_first"].map(y=>new Int32Array(e[y].buffer,0,d)),l=new Int32Array(e.tok_start.buffer)}catch{return-1}let f=n.filter(y=>y.role===J.entry||y.role===J.import),s=y=>f.some(c=>c.offset<=y&&y<c.offset+c.bytes.length),m=new Uint8Array(d);for(let y=0;y<d;y++)for(let c=t[y];c>=0&&c<d&&!m[c];c=r[c])m[c]=1;let o=new Int32Array(d),a=-1,u=-1,h=0;for(let y=0;y<d;y++){if(m[y]||!s(l[i[y]]))continue;let c=[y];for(;c.length;){let g=c.pop(),x=0;for(let k=t[g];k>=0&&k<d;k=r[k])o[k]=o[g]+1,c.push(k),x++;(a<0||o[g]>o[a])&&(a=g),x>h&&(h=x,u=g)}}let w=a>=0&&o[a]>=200?a:u;return w<0?-1:l[i[w]]}var Ce=new WeakMap;function Ge(e){let n=Ce.get(e);if(!n){let t=e.map(d=>P.encode(JSON.stringify(d))),r=new Int32Array(t.length),i=new Uint8Array(t.reduce((d,f)=>d+f.length+1,1)),l=0;i[l++]=91,t.forEach((d,f)=>{f>0&&(i[l++]=44),r[f]=l,i.set(d,l),l+=d.length}),i[l++]=93,n={bytes:i.subarray(0,l),offsets:r},Ce.set(e,n)}return n}var Ue=new WeakMap;function Ke(e){let n=Ue.get(e);return n||Ue.set(e,n={docs:new Map,views:new Map,wanted:new Set,prelude:null,rebuild:!1}),n}function Vn(e,n){let t=Ke(e);if(!t.rebuild&&t.prelude?.files.every(r=>n.get(r.key)===r.text))return e.reset_keep(),t.prelude;e.reset(),t.docs.clear(),t.views.clear();for(let r of t.wanted){let i=Yn(e,r,Hn(e,r,t.docs));t.views.set(r,e.abi_resident_view(i.doc,i.at))}return t.prelude=Gn(e,n),e.seal(),t.rebuild=!1,t.prelude}function Gn(e,n){let t=[],r=new Map,i=n.get("std:Prelude");if(typeof i!="string")return{files:t,byKey:r};K(e,t,r,"std:Prelude",i,J.prelude);for(let d=0;d<e.import_count();d++){let f=U(e.src,e.import_path_start(d),e.import_path_end(d)),s=n.get(f);!ze.test(f)||typeof s!="string"||e.import_bind(d,r.get(f)??K(e,t,r,f,s,J.prelude))}let l=n.get("std:JsonRuntime");if(typeof l=="string"&&e.json_runtime_room){let d=P.encode(l),f=e.json_runtime_room(d.length);new Uint8Array(e.src.buffer).set(d,f)}return{files:t,byKey:r}}function He(e,n){let t=e.abi_room(n.length);return new Uint8Array(e.src.buffer).set(n,t),t}var qe=new WeakMap;function Kn(e){let n=qe.get(e);if(!n){let{prefix:t,moduleSpecifier:r,exports:i,names:l,mutableGlobals:d,exportAssignment:f}=e;n={document:Ge(e.types),view:P.encode(JSON.stringify({prefix:t,moduleSpecifier:r,exports:i,names:l,mutableGlobals:d,exportAssignment:f}))},qe.set(e,n)}return n}function Hn(e,n,t){if(!t.has(n.document)){let{bytes:r,offsets:i}=n.document,l=He(e,r);e.abi_offsets_room(i.length),new Int32Array(e.abi_offsets.buffer,0,i.length).set(i),t.set(n.document,e.abi_doc_at(l,i.length))}return t.get(n.document)}function Yn(e,n,t){return{doc:t,at:He(e,n.view)}}async function Zn(e,n,{stdlib:t,resolvePackage:r},i){let l=Ke(e),d=[],f=!1;for(let{i:s,raw:m,from:o,abiFile:a,name:u}of n){let h;try{let w=a?Xn(await i(a)):/^"?(npm|node):/.test(m)?await r(JSON.parse(m),{prefix:u,from:o}):await t.get(m)();h=w.document?w:Kn(w.abi??w)}catch{continue}l.views.has(h)||(l.wanted.add(h),l.rebuild=!0,f=!0),d.push([s,h])}if(f)return!1;for(let[s,m]of d)e.abi_bind(s,l.views.get(m));return!0}var oe=new Map;function Xn(e){let n=typeof e=="string"?e:Y.decode(e);oe.has(n)||oe.set(n,Be(n));let t=oe.get(n);if(!t)throw new Error("Invalid declaration ABI");return t}async function Qn(e,n,t,{resolvePath:r=Xe,readBinaryFile:i}){for(let l=0;l<e.embed_files();l++){let d=U(e.src,e.embed_path_start(l),e.embed_path_end(l)),f=e.embed_file?t[e.embed_file(l)]?.key??n:n,s;try{s=await i(r(f,d))}catch{e.embed_fail(l);continue}let m=e.embed_set(l,s.length);new Uint8Array(e.embed_bytes.buffer).set(s,m)}}async function Ye(e,n,t={}){let r=e.comptime_mems();for(let i=0;i<=r;i++){let l=[];for(let a=0;a<r;a++)(e.comptime_waiting?e.comptime_waiting(a):i===0)&&l.push(a);if(l.length===0)break;let d=e.compile_program(re.comptime);if(d<0)return-1;let f=l.filter(a=>!e.comptime_can_run||e.comptime_can_run(a));if(f.length===0){for(let a of l)e.comptime_cycle(a);break}let{wasm:s,spec:m}=de(e,d),{exports:o}=await ce(s,m,t);for(let a of f){let u=e.comptime_name(a),h;try{h=await o[`__comptime_run_${u}`]()}catch(c){e.comptime_fail(a,o.__comptime_fuel?.value===0?8:nt(c));continue}let w=new Uint8Array(o[`__comptime_${u}`].buffer,0,h*e.comptime_value_size(a)).slice(),y=e.comptime_set(a,h);new Uint8Array(e.comptime_bytes.buffer).set(w,y)}}return et(e,e.compile_program(n))}async function et(e,n){if(n<0||!e.user_ir_count?.())return n;try{return await WebAssembly.compile(new Uint8Array(e.out.buffer,0,n).slice(),Pe),n}catch(t){if(!(t instanceof WebAssembly.CompileError))throw t;let r=P.encode(String(t.message).replace(/^WebAssembly\.\w+(\(\): | doesn't validate: )/,"")),i=e.ir_invalid_room(r.length);return new Uint8Array(e.src.buffer).set(r,i),e.ir_invalid_report(i,r.length),-1}}function nt(e){let n=String(e?.message??e);return!(e instanceof WebAssembly.RuntimeError)&&!/call stack|recursion/i.test(n)?7:/out of bounds/i.test(n)?1:/unreachable/i.test(n)?2:/divi.*zero|by zero/i.test(n)?3:/overflow/i.test(n)&&!/stack/i.test(n)?4:/null/i.test(n)?5:/call stack|recursion|stack/i.test(n)?6:0}function de(e,n){let t=new Uint8Array(e.out.buffer,0,n).slice(),r=e.host_json_size(),i=r?JSON.parse(U(e.host_json,0,r)):{};return{wasm:t,spec:i}}function Ze(e,n){let t=[],r=new Set;for(let i=0;i<e.diagnostic_count();i++){let l=e.diagnostic_file(i),d=`${l}\0${e.diagnostic_start(i)}\0${e.diagnostic_end(i)}\0${e.diagnostic_message(i)}`;if(r.has(d))continue;r.add(d);let f=l>=0?n[l]:null,s={kind:e.diagnostic_kind(i),message:e.diagnostic_message(i),severity:"error",file:f?.key??null};if(f&&Object.assign(s,H(f,e.diagnostic_start(i),e.diagnostic_end(i))),e.diagnostic_code){s.code=e.diagnostic_code(i).replace(/(?<=[a-z0-9])(?=[A-Z])/g,"-").toLowerCase();for(let m=0;m<e.diagnostic_extras(i);m++){let o=st[e.diagnostic_extra_kind(i,m)],a=e.diagnostic_extra_text(i,m);if(o==="note")(s.notes??=[]).push(a);else if(o==="label"){s.label=a;let u=e.diagnostic_extra_start(i,m),h=e.diagnostic_extra_end(i,m);f&&(u!==e.diagnostic_start(i)||h!==e.diagnostic_end(i))&&(s.focus=H(f,u,h))}else{let u=n[e.diagnostic_extra_file(i,m)];if(!u)continue;let h={file:u.key,...H(u,e.diagnostic_extra_start(i,m),e.diagnostic_extra_end(i,m))};o==="fix"?s.fix={...h,text:a,label:e.diagnostic_extra_label(i,m)}:(s.related??=[]).push({...h,role:o,label:a})}}}e.diagnostic_default_label&&s.label==null&&s.file&&(s.label=e.diagnostic_default_label(i)),t.push(s)}return t}var tt=(async()=>{}).constructor;function rt(e,n){if(!e.dsl_count)return[];let t=n.toSorted((l,d)=>l.offset-d.offset),r=l=>t.findLast(d=>d.offset<=l&&l<=d.offset+d.bytes.length)??null,i=[];for(let l=0;l<e.dsl_count();l++){let d=e.es_body_start(l);if(d<0)continue;let{expr:f}=V(U(e.src,d,e.es_body_end(l))),s=`return (
${f}
);`,m=null;try{new Function(s)}catch(a){if(!(a instanceof SyntaxError))continue;try{new tt(s)}catch(u){u instanceof SyntaxError&&!/import\.meta/.test(u.message)&&(m=u)}}let o=m&&r(e.dsl_site_start(l));o&&i.push({kind:"es-syntax",code:"es-syntax",message:`@es body is not JavaScript: ${m.message}`,severity:"error",file:o.key,...H(o,e.dsl_site_start(l),e.dsl_site_end(l)),label:"here"})}return i}function it(e){let n=e.filter(r=>!/^(std|node|npm):/.test(r.key));return[...n.flatMap(r=>Oe(r.text,r.key)),...Ne(n.map(r=>[r.key,r.text]))].map(({kind:r,message:i,primary:l})=>({kind:r,message:i,severity:"warning",file:l.file,start:l.start,end:l.end,line:l.row,column:l.col}))}var st=["label","expected","found","related","note","fix"];function H(e,n,t){let{units:r,lines:i}=at(e),l=a=>r[Math.min(Math.max(0,a-e.offset),r.length-1)],d=l(n),f=l(t),s=0,m=i.length-1;for(;s<m;){let a=s+m+1>>1;i[a]<=d?s=a:m=a-1}let o=1;for(let a=i[s];a<d;a++){let u=e.text.charCodeAt(a);(u<56320||u>57343)&&o++}return{start:d,end:f,line:s+1,column:o}}var Je=new WeakMap;function at(e){let n=Je.get(e);if(!n){let{bytes:t,text:r}=e,i=new Uint32Array(t.length+1),l=0;for(let f=0;f<t.length;f++){i[f]=l;let s=t[f];(s&192)!==128&&(l+=s>=240?2:1)}i[t.length]=l;let d=[0];for(let f=0;f<r.length;f++){let s=r.charCodeAt(f);(s===10||s===13&&r.charCodeAt(f+1)!==10)&&d.push(f+1)}n={units:i,lines:d},Je.set(e,n)}return n}async function ce(e,n={},{loadGlue:t=null,profiler:r=null,wrap:i=null}={}){let l=e instanceof WebAssembly.Module?e:await WebAssembly.compile(e,Pe),d=n.es??{},f=G(d),s=f?t?Ee(d,await t(f)):Re(d):{};r&&(s.profile=r.imports),n.closures&&(s.utu=Se(n.closures,s.utu??{})),n.mems&&(s.utu=Ae(n.mems,s.utu??{})),n.promises&&(s.utu=ve(n.promises,s.utu??{}),s.utu=ke(n.promises,s.utu)),WebAssembly.Module.imports(l).some(a=>a.module==="utu"&&a.name==="js_tag")&&(s.utu=Te(s.utu??{})),i?.(s);let m=await WebAssembly.instantiate(l,s),o=Me(je(m,n.promises),n.exports);return{module:l,instance:m,exports:r?r.attach(m,o):o}}function Xe(e,n){if(/^[a-z]+:\/\//i.test(e))return new URL(n,e).href;let t=e.split("/").slice(0,-1);for(let r of n.split("/"))r===".."?t.pop():r!=="."&&t.push(r);return t.join("/")}var ot=/[0-9A-Za-z!#$%&'*+\-./:<=>?@\\^_`|~]/,lt=new Set(["export","mod","struct","tag","enum","proto","fn","type","distinct","let","const","mem","vec","using"]);function ue(e,n){let t=(b,_)=>new _(b.buffer),r=t(e.node_first,Int32Array),i=t(e.node_last,Int32Array),l=t(e.tok_start,Int32Array),d=t(e.tok_end,Int32Array),f=t(e.tok_kind,Uint8Array),s=t(e.node_decl,Int32Array),m=t(e.decl_node,Int32Array),o=t(e.decl_owner,Int32Array),a=e.node_count(),u=new Map,h=b=>{for(let _=n.length-1;_>=0;_--)if(n[_].offset<=b)return b<n[_].offset+n[_].bytes.length?n[_]:null;return null},w=(b,_)=>{let p=u.get(b);if(!p){p=new Int32Array(b.bytes.length+1);let v=0;for(let I=0;I<b.bytes.length;){let A=b.bytes[I],$=A<128?1:A<224?2:A<240?3:4;for(let W=0;W<$;W++)p[I+W]=v;I+=$,v+=$===4?2:1}p[b.bytes.length]=v,u.set(b,p)}return p[_-b.offset]},y=new Array(a),c=b=>{if(b>=0&&b<a&&y[b]!==void 0)return y[b];let _=l[r[b]],p=h(_),v=p?{file:p.key,start:w(p,_),end:w(p,d[i[b]-1])}:null;return b>=0&&b<a&&(y[b]=v),v},g=null,x=b=>{if(!g){g=new Map;for(let _=0;_<a;_++){if(r[_]>=i[_])continue;let p=c(_);p&&(g.has(p.file)||g.set(p.file,[]),g.get(p.file).push(_))}}return g.get(b)??[]},k=null,E=b=>{if(!k){k=new Map;for(let _=0;_<a;_++)O(_)&&(k.has(s[_])||k.set(s[_],[]),k.get(s[_]).push(_))}return k.get(b)??[]},S=null,T=()=>{if(S)return S;S=new Int32Array(e.decl_count()).fill(-1);for(let b=0;b<a;b++){let _=s[b];if(_<0||_>=S.length||!O(b)||m[_]<0)continue;let p=l[r[b]];if(p<l[r[m[_]]]||p>=d[i[m[_]]-1])continue;let v=S[_];(v<0||p<l[r[v]])&&(S[_]=b)}return S},O=b=>s[b]>=0&&r[b]<i[b]&&i[b]-r[b]===1,R=null,N=()=>{if(R)return R;R=new Map;let b=new Uint8Array(e.src.buffer);for(let _=0,p=e.wat_count?.()??0;_<p;_++){let v=e.wat_function(_),I=-1;for(let j=0,B=e.decl_count();j<B&&I<0;j++)m[j]===v&&(I=j);let A=new Map;for(let j=0,B=e.decl_count();j<B;j++){if(o[j]!==I||e.decl_kind_name(j)!=="Param")continue;let F=c(T()[j]>=0?T()[j]:m[j]);F&&A.set(n.find(C=>C.key===F.file)?.text.slice(F.start,F.end),j)}let $=e.wat_text_start(_),W=e.wat_text_end(_),q=h($);if(!(!q||!A.size))for(let j=$;j<W;j++){let B=b[j];if(B===59&&b[j+1]===59){for(;j<W&&b[j]!==10;)j++;continue}if(B===40&&b[j+1]===59){let ae=0;for(;j<W;j++)if(b[j]===40&&b[j+1]===59)ae++,j++;else if(b[j]===59&&b[j+1]===41&&(ae--,j++,!ae))break;continue}if(B!==36)continue;let F=j+1;for(;F<W&&ot.test(String.fromCharCode(b[F]));)F++;let C=A.get(new TextDecoder().decode(b.subarray(j+1,F)));C!==void 0&&(R.has(C)||R.set(C,[]),R.get(C).push({file:q.key,start:w(q,j+1),end:w(q,F)})),j=F-1}}return R},pn=new TextDecoder,hn=b=>{for(let _=r[b];_<i[b];_++){if(f[_]===8)continue;let p=h(l[_]);if(!p)return null;let v=pn.decode(p.bytes.subarray(l[_]-p.offset,d[_]-p.offset));if(!lt.has(v))return v!=="&"&&!/^[A-Za-z_]\w*$/.test(v)?null:{file:p.key,start:w(p,l[_]),end:w(p,d[_])}}return null},ye=t(e.node_kind,Uint8Array),yn=(b,_)=>{if(b<0||_<b)return null;let p=h(b);return p&&_<=p.offset+p.bytes.length?{file:p.key,start:w(p,b),end:w(p,_)}:null},ee=(b,_,p)=>b?.file===_&&b.start<=p&&p<=b.end,be=(b,_,p=!1)=>{let v=-1,I=1/0;for(let A of x(b)){let $=c(A);if(!ee($,b,_))continue;let W=$.end-$.start;W<I&&!(p&&!e.node_type(A))&&(v=A,I=W)}return v},bn,ne=()=>bn??=(()=>{let b=[];for(let _=0;_<(e.edge_count?.()??0);_++){let p=e.edge_from_decl(_),v=yn(e.edge_site_start(_),e.edge_site_end(_)),I=p>=0&&m[p]>=0?c(m[p]):null;v&&I&&!(v.file===I.file&&I.start<=v.start&&v.end<=I.end)&&(v=null),b.push({from:p,to:e.edge_to_decl(_),site:v})}return b})(),_n,_e=()=>_n??=(()=>{let b=[];for(let _=0;_<(e.coercion_count?.()??0);_++){let p=e.coercion_node(_);p<0||p>=a||r[p]>=i[p]||b.push({node:p,at:c(p),from:e.coercion_from_text(_),to:e.coercion_to_text(_),kind:e.coercion_kind(_)})}return b})(),gn,wn=()=>gn??=(()=>{let b=new Map;for(let _ of ne())b.has(_.from)||b.set(_.from,[]),b.get(_.from).push(_);return b})(),ie=new Map,z=b=>{if(ie.has(b))return ie.get(b);let _=new Set,p=A=>{if(A<0||_.has(A))return 0;_.add(A);let $=e.decl_effects?.(A)??0;for(let W of wn().get(A)??[])$|=p(W.to);return $},v=p(b),I={mask:v,labels:["await","host","throws","traps"].filter((A,$)=>v&1<<$)};return ie.set(b,I),I},se=(b,_)=>{if(_<0||_>=e.decl_count())return null;let p=b.span(_),v=b.definition(_);return!p||!v?null:{decl:_,name:b.text(v),kind:b.kind(_),span:p,selection:v,effects:z(_)}};return{at:c,declarationAt(b,_){for(let p of x(b)){if(!O(p))continue;let v=c(p);if(v&&v.file===b&&v.start<=_&&_<=v.end)return s[p]}for(let[p,v]of N())if(v.some(I=>I.file===b&&I.start-1<=_&&_<=I.end))return p;return-1},definition(b){let _=m[b];if(_<0)return null;let p=T()[b];return p>=0?c(p):hn(_)??c(_)},references(b,{includeDeclaration:_=!0}={}){let p=this.definition(b),v=[];for(let I of E(b)){let A=c(I);if(!A)continue;let $=p&&A.file===p.file&&A.start===p.start;$&&!_||($?v.unshift(A):v.push(A))}return[...v,...N().get(b)??[]]},span(b){return m[b]>=0?c(m[b]):null},kind(b){return e.decl_kind_name(b)},owner(b){return o[b]},type(b){return e.decl_checked_type(b)},typeDeclaration(b){return e.decl_checked_type_decl(b)},typeDeclarationOfExpressionBefore(b,_,p=!1){let v=[];for(let I of x(b)){let A=c(I);A&&A.file===b&&A.end===_&&v.push([A.start,I])}v.sort((I,A)=>I[0]-A[0]);for(let[,I]of v){let A=e.node_type_decl(I,p?1:0);if(A>=0)return A}return-1},declarations(b=null){let _=[];for(let p=0,v=e.decl_count();p<v;p++){if(m[p]<0)continue;let I=c(m[p]);I&&(b==null||I.file===b)&&_.push({decl:p,kind:e.decl_kind_name(p),owner:o[p],span:I})}return _},names(b){let _=[];for(let p of b==null?Array.from({length:a},(v,I)=>I):x(b)){if(!O(p))continue;let v=c(p);v&&(b==null||v.file===b)&&_.push({decl:s[p],at:v})}for(let[p,v]of N())for(let I of v)(b==null||I.file===b)&&_.push({decl:p,at:I});return _.sort((p,v)=>p.at.file<v.at.file?-1:p.at.file>v.at.file?1:p.at.start-v.at.start),_.filter((p,v)=>v===0||p.at.start!==_[v-1].at.start||p.at.file!==_[v-1].at.file)},explainAt(b,_){let p=be(b,_,!0);if(p<0)return null;let v=c(p),I=be(b,_),A=I>=0?s[I]:-1,W=ne().filter(F=>F.site&&ee(F.site,b,_)).sort((F,C)=>F.site.end-F.site.start-(C.site.end-C.site.start))[0]?.to??-1,q=e.node_field_owner?.(p)??-1,j=[];for(let F=0,C=e.closure_capture_count?.(p)??0;F<C;F++)j.push(e.closure_capture_decl(p,F));let B=[];if(A>=0){let F=this.definition(A);B.push({kind:"binding",decl:A,at:F,type:this.type(A)})}return W>=0&&B.push({kind:"call result",decl:W,at:this.definition(W)}),{node:p,at:v,kind:e.node_kind_name(ye[p]),type:e.node_type(p),expectedType:e.node_expected_type?.(p)||"",declaration:A,callTarget:W,field:q>=0?{owner:q,index:e.node_field_index(p)}:null,conversions:_e().filter(F=>F.node===p||ee(F.at,b,_)),captures:j,effects:A>=0?z(A):W>=0?z(W):{mask:0,labels:[]},wasmType:e.node_wasm_type?.(p)||"",trace:B}},typeTrace(b,_){return this.explainAt(b,_)?.trace??[]},inlayHints(b){let _=[];for(let p=0;p<e.decl_count();p++){if(e.decl_kind_name(p)!=="Local")continue;let v=this.definition(p),I=this.span(p),A=this.type(p);if(!v||!I||v.file!==b||!A)continue;let $=this.text({file:b,start:v.end,end:I.end});/^\s*:/.test($)||_.push({position:v.end,label:`: ${A}`,kind:"type",at:v})}for(let p of x(b)){if(e.node_kind_name(ye[p])!=="closure_expr")continue;let v=c(p);if(v?.file!==b)continue;let I=[];for(let A=0,$=e.closure_capture_count(p);A<$;A++){let W=e.closure_capture_decl(p,A),q=this.definition(W);q&&I.push(this.text(q))}I.length&&_.push({position:v.end,label:` captures ${I.join(", ")}`,kind:"capture",at:v})}for(let p of _e())p.at?.file===b&&_.push({position:p.at.end,label:` \u2192 ${p.to}`,kind:"conversion",at:p.at});for(let p=0;p<e.decl_count();p++){if(m[p]<0||!["Fn","Main"].includes(this.kind(p)))continue;let v=this.definition(p);if(v?.file!==b)continue;let I=z(p);I.mask&&_.push({position:v.end,label:` !${I.labels.join(", ")}`,kind:"effect",at:v})}return _.sort((p,v)=>p.position-v.position)},effects(b){return z(b)},prepareCallHierarchy(b,_){let p=this.declarationAt(b,_);p<0&&(p=this.declarations(b).find(I=>ee(this.definition(I.decl),b,_))?.decl??-1);let v=se(this,p);return v&&["Fn","Main","ProtoMember"].includes(v.kind)?[v]:[]},incomingCalls(b){let _=new Map;for(let p of ne())p.to===b&&p.from>=0&&(_.has(p.from)||_.set(p.from,[]),p.site&&_.get(p.from).push(p.site));return[..._].flatMap(([p,v])=>{let I=se(this,p);return I?[{from:I,sites:v}]:[]})},outgoingCalls(b){let _=new Map;for(let p of ne())p.from===b&&p.to>=0&&(_.has(p.to)||_.set(p.to,[]),p.site&&_.get(p.to).push(p.site));return[..._].flatMap(([p,v])=>{let I=se(this,p);return I?[{to:I,sites:v}]:[]})},tokenAt(b,_){let p=n.findIndex(v=>v.key===b);if(p<0)return null;for(let v=e.file_first_token(p),I=e.file_end_token(p);v<I;v++){let A=w(n[p],l[v]);if(A>=_)return null;let $=w(n[p],d[v]);if(_<$||_===$&&f[v]===8)return{kind:f[v],start:A,end:$}}return null},text(b){let _=n.find(p=>p.key===b.file);return _?_.text.slice(b.start,b.end):""}}}function ft(e,n){let t=new Map,r,i=f=>(t.has(f)||t.set(f,(async()=>{let[s,m]=await Promise.all([n(`${f}.types.json`),n(`${f}.offsets`)]);return{bytes:s,offsets:dt(m)}})()),t.get(f)),l=new Map(e),d=new Map;for(let f of["std:Browser","std:JS","std:Web","std:Worker"])typeof e.get(f)=="function"&&l.set(f,()=>(d.has(f)||d.set(f,(async()=>{r??=JSON.parse(new TextDecoder().decode(await n("catalog.json")));let{document:s,view:m}=r[f],[o,a]=await Promise.all([i(s),n(`${m}.view.json`)]);return{document:o,view:a}})()),d.get(f)));return l}function dt(e){let n=new DataView(e.buffer,e.byteOffset,e.byteLength),t=new Int32Array(e.byteLength/4);for(let r=0;r<t.length;r++)t[r]=n.getInt32(r*4,!0);return t}function ct(e){let n=0;for(let t of e){let r=t.codePointAt(0);if(t==="	")n+=4;else{if(r>=768&&r<=879||r>=8203&&r<=8207||r>=65024&&r<=65039)continue;r>=4352&&r<=4447||r>=11904&&r<=42191||r>=44032&&r<=55203||r>=63744&&r<=64255||r>=65072&&r<=65103||r>=65280&&r<=65376||r>=65504&&r<=65510||r>=127744&&r<=128591||r>=129280&&r<=129535||r>=131072&&r<=262141?n+=2:n+=1}}return n}var Qe={dark:{bg:[18,20,26],fg:[215,218,224],dim:[118,124,138],rail:[62,67,80],error:[255,107,107],warning:[245,185,66],trap:[199,146,234],expected:[108,182,255],found:[240,166,74],related:[154,163,178],add:[95,211,141],del:[255,123,123],keyword:[179,157,243],string:[158,206,106],number:[232,169,106],type:[125,207,255],function:[130,170,255],comment:[100,108,122],dsl:[158,206,106]},light:{bg:[253,252,249],fg:[43,46,54],dim:[128,133,144],rail:[200,196,186],error:[214,58,58],warning:[183,121,31],trap:[142,68,173],expected:[31,111,209],found:[184,98,11],related:[107,114,128],add:[31,138,76],del:[192,57,43],keyword:[124,77,204],string:[77,124,15],number:[180,83,9],type:[14,116,144],function:[37,99,235],comment:[156,163,175],dsl:[77,124,15]}};function ut(e=globalThis.process?.env??{}){if(e.UTU_THEME==="light"||e.UTU_THEME==="dark")return e.UTU_THEME;let n=Number(e.COLORFGBG?.split(";").pop());return n===7||n===15?"light":"dark"}function mt(e=globalThis.process?.env??{}){return/truecolor|24bit/i.test(e.COLORTERM??"")||["iTerm.app","WezTerm","vscode","ghostty","kitty"].includes(e.TERM_PROGRAM)}function pt([e,n,t]){let r=a=>a<48?0:a<115?1:Math.min(5,Math.floor((a-35)/40)),i=16+36*r(e)+6*r(n)+r(t),l=a=>a===0?0:55+a*40,d=(l(r(e))-e)**2+(l(r(n))-n)**2+(l(r(t))-t)**2,f=Math.round(((e+n+t)/3-8)/10),s=232+Math.max(0,Math.min(23,f)),m=8+10*(s-232);return(m-e)**2+(m-n)**2+(m-t)**2<d?s:i}function ht({color:e=!1,theme:n=ut(),truecolor:t=mt()}={}){let r=Qe[n]??Qe.dark,i=(f,s)=>t?`\x1B[${f};2;${s.join(";")}m`:`\x1B[${f};5;${pt(s)}m`,l=(f,s)=>f.map((m,o)=>Math.round(r.bg[o]+(m-r.bg[o])*s)),d=!!e;return{on:d,palette:r,fg:f=>d?i(38,f):"",bg:f=>d?i(48,f):"",tint:(f,s)=>d?i(48,l(f,s)):"",bold:d?"\x1B[1m":"",italic:d?"\x1B[3m":"",strike:d?"\x1B[9m":"",reset:d?"\x1B[0m":"",paint(f,s){return d?`${i(38,f)}${s}\x1B[0m`:s}}}function yt(e,n,t,r){let i=n.toUpperCase(),l=e.palette[n]??e.palette.error,f=[`${e.on?`${e.bg(l)}${e.fg(e.palette.bg)}${e.bold} ${i} ${e.reset}`:` ${i} `} ${e.bold}${t}${e.reset}`];return r&&f.push(`${" ".repeat(i.length+3)}${e.paint(e.palette.dim,r)}`),f}function bt(e,n){return(n??[]).map(t=>`  ${e.paint(e.palette.dim,"note")}  ${t}`)}var _t={primary:.32,expected:.24,found:.24,related:.2};function gt(e,n,{color:t=!1,relative:r=f=>f,highlight:i=null,theme:l,truecolor:d}={}){let f=ht({color:t,theme:l,truecolor:d}),s=new Map;return e.map(m=>wt(m,n,f,r,i,s)).join(`

`)}function en(e,n){let t=n.get(e);if(!t){t=[0];for(let r of e.matchAll(/\r\n?|\n/g))t.push(r.index+r[0].length);n.set(e,t)}return t}function me(e,n){let t=0,r=e.length-1;for(;t<r;){let i=t+r+1>>1;e[i]<=n?t=i:r=i-1}return t}function wt(e,n,t,r,i,l){let d=e.severity??"error",f=t.palette[d]??t.palette.error,s=e.code??e.kind??"",m=e.focus??e,o=e.file!=null?`${r(e.file)}${m.line!=null?`:${m.line}:${m.column}`:""}`:"",a=yt(t,d,e.message,[s,o].filter(Boolean).join(" \xB7 ")),u=[];e.file!=null&&e.start!=null&&n.get(e.file)!=null&&u.push({file:e.file,start:e.focus?.start??e.start,end:e.focus?.end??e.end,role:"primary",label:e.label});for(let g of e.related??[])n.get(g.file)!=null&&u.push({file:g.file,start:g.start,end:g.end,role:g.role,label:g.label});let w=[...new Set(u.map(g=>g.file))].map(g=>vt(n.get(g),en(n.get(g),l),g,u.filter(x=>x.file===g),e.file===g)),y=Math.max(2,...w.flatMap(g=>g.rows.filter(x=>x.line!=null).map(x=>String(x.line+1).length))),c=g=>`${t.paint(t.palette.dim,String(g??"").padStart(y))} ${t.paint(t.palette.rail,"\u2502")} `;for(let g of w){a.push(""),g.file!==e.file&&a.push(`${" ".repeat(y)} ${t.paint(t.palette.rail,"\u256D\u2500")} ${t.paint(t.palette.dim,r(g.file))}`);for(let x of g.rows){if(x.gap){a.push(`${" ".repeat(y)} ${t.paint(t.palette.rail,"\u2506")}`);continue}a.push(c(x.line+1)+xt(x,g,t,f,i));for(let k of kt(x,t,f))a.push(c()+k)}}return e.notes?.length&&a.push("",...bt(t,e.notes)),e.fix&&n.get(e.fix.file??e.file)!=null&&a.push("",...It(e.fix,n.get(e.fix.file??e.file),l,t,c,y)),a.join(`
`)}function vt(e,n,t,r,i){let l=o=>e.slice(n[o],n[o+1]??e.length).replace(/\r?\n?$/,""),d=new Set;for(let o of r){o.first=me(n,o.start),o.last=Math.max(o.first,me(n,Math.max(o.start,o.end-1)));for(let a=o.first;a<=o.last;a++)(o.last-o.first+1<=6||a<o.first+2||a>o.last-2)&&d.add(a)}let f=r.find(o=>o.role==="primary");if(f&&i){for(let o=Math.max(0,f.first-2);o<=Math.min(n.length-1,f.last+2);o++)d.add(o);for(;d.size>1&&!l(Math.max(...d)).trim()&&Math.max(...d)>f.last;)d.delete(Math.max(...d))}let s=[],m=null;for(let o of[...d].sort((a,u)=>a-u)){m!=null&&o>m+1&&s.push({gap:!0}),m=o;let a=l(o),u=r.filter(h=>h.first<=o&&o<=h.last).map(h=>{let w=o===h.first?h.start-n[o]:a.length-a.trimStart().length,y=o===h.last?Math.min(a.length,Math.max(w+1,h.end-n[o])):a.length;return{mark:h,from:w,to:Math.max(y,w+(a.length>w?1:0)),drawn:o===h.first}});if(a.length>240){let h=Math.min(a.length,...u.map(k=>k.from)),w=Math.min(Math.max(h+1,...u.map(k=>k.to)),h+240),y=Math.max(0,h-80),c=Math.min(a.length,w+80),g=y>0?"\u2026":"",x=k=>Math.min(Math.max(k,y),c)-y+g.length;s.push({line:o,raw:g+a.slice(y,c)+(c<a.length?"\u2026":""),offset:n[o]+y-g.length,marks:u.map(k=>({...k,from:x(k.from),to:Math.max(x(k.to),x(k.from)+1)}))});continue}s.push({line:o,raw:a,offset:n[o],marks:u})}return{file:t,rows:s}}function xt(e,n,t,r,i){let l=e.raw,d=u=>u.replace(/\t/g,"    ");if(!t.on)return d(l);let f=i?i(n.file,e.offset,e.offset+l.length):[],s=new Array(l.length).fill(null);for(let{mark:u,from:h,to:w}of e.marks)for(let y=h;y<w&&y<l.length;y++)s[y]=u.role;let m=new Array(l.length).fill(null);for(let u of f)for(let h=Math.max(0,u.start-e.offset);h<Math.min(l.length,u.end-e.offset);h++)m[h]=u.class;let o="",a=0;for(;a<l.length;){let u=a+1;for(;u<l.length&&s[u]===s[a]&&m[u]===m[a];)u++;let h=s[a],w=m[a],y=t.palette[w]??t.palette.fg,c=(h?t.tint(h==="primary"?r:t.palette[h],_t[h]):"")+(h==="primary"?t.bold:"")+(w==="comment"||w==="parameter"?t.italic:"")+t.fg(w==="comment"?t.palette.comment:y);o+=`${c}${d(l.slice(a,u))}${t.reset}`,a=u}return o}function kt(e,n,t){let r=e.marks.filter(s=>s.drawn).sort((s,m)=>s.from-m.from);if(!r.length)return[];let i=s=>ct(e.raw.slice(0,s)),l=s=>s.mark.role==="primary"?t:n.palette[s.mark.role],d=[];if(!n.on){let s="",m=0;for(let o of r){let a=i(o.from),u=Math.max(a+1,i(o.to));a<m||(s+=" ".repeat(a-m)+(o.mark.role==="primary"?"\u2501":"\u2500").repeat(u-a),m=u)}d.push(s)}let f=r.filter(s=>s.mark.label);for(let s=f.length-1;s>=0;s--){let m="",o=0;for(let u=0;u<s;u++){let h=i(f[u].from);m+=" ".repeat(Math.max(0,h-o))+n.paint(l(f[u]),"\u2502"),o=h+1}let a=i(f[s].from);m+=" ".repeat(Math.max(0,a-o))+n.paint(l(f[s]),"\u2570\u2500")+" "+f[s].mark.label,d.push(m)}return d}function It(e,n,t,r,i){let l=n.slice(0,e.start),d=Math.max(l.lastIndexOf(`
`),l.lastIndexOf("\r"))+1,f=n.slice(e.end).search(/[\r\n]/),s=f<0?n.length:e.end+f,m=n.slice(d,e.start),o=n.slice(e.end,s),a=m.length>240?"\u2026"+m.slice(-80):m,u=o.length>240?o.slice(0,80)+"\u2026":o,h=a+n.slice(e.start,e.end)+u,w=a+e.text+u,y=me(en(n,t),d)+(n[d-1]==="\r"&&n[d]===`
`?2:1),c=[`  ${r.paint(r.palette.add,`${r.bold}fix`)}   ${e.label??""}`];return r.on?(St(h,w).map(k=>k.k==="="?r.paint(r.palette.fg,k.t):k.k==="+"?`${r.tint(r.palette.add,.28)}${r.fg(r.palette.add)}${k.t}${r.reset}`:`${r.fg(r.palette.del)}${r.strike}${k.t}${r.reset}`).join("").split(/\r\n?|\n/).forEach((k,E)=>c.push(i(y+E)+k)),c):(w.split(/\r\n?|\n/).forEach((k,E)=>c.push(i(y+E)+k)),c)}function St(e,n){let t=u=>u.match(/[A-Za-z0-9_]+|\s+|./gs)??[],r=t(e),i=t(n),l=r.length,d=i.length,f=Array.from({length:l+1},()=>new Uint16Array(d+1));for(let u=l-1;u>=0;u--)for(let h=d-1;h>=0;h--)f[u][h]=r[u]===i[h]?f[u+1][h+1]+1:Math.max(f[u+1][h],f[u][h+1]);let s=[],m=(u,h)=>{let w=s[s.length-1];w?.k===u?w.t+=h:s.push({k:u,t:h})},o=0,a=0;for(;o<l&&a<d;)r[o]===i[a]?(m("=",r[o]),o++,a++):f[o+1][a]>=f[o][a+1]?m("-",r[o++]):m("+",i[a++]);for(;o<l;)m("-",r[o++]);for(;a<d;)m("+",i[a++]);return s}function At(e,n=null){if(!n)return G(e.es??{});let{firsts:t}=tn(e,nn(n));return G(e.es??{},new Set(t.values()))}var nn=e=>WebAssembly.Module.imports(new WebAssembly.Module(e,$t));function tn(e,n){let t=new Set(n.filter(l=>l.module==="es").map(l=>l.name)),r=Object.entries(Object.assign({},...Object.values(e.es??{}))).filter(([l])=>t.has(l)),i=new Map;for(let[l,d]of r)i.has(d)||i.set(d,l);return{fields:r,firsts:i}}function Tt(e,n,{runtime:t,glue:r,wasm:i,streaming:l=!1}){let d=nn(n),f=new Set,s=S=>(f.add(S),S),m=[],o=[],{fields:a,firsts:u}=tn(e,d);if(r&&a.length){let S=!1,T=a.map(([,R])=>{let N=L(u.get(R));return Mt(V(R).expr)?N:(S=!0,`$utuValue(${N})`)});m.push(`import { ${[...u.values()].map(L).join(", ")} } from ${JSON.stringify(r)};`),S&&m.push("const $utuValue = value => typeof value === 'function' ? value : () => value;");let O=a.every(([R],N)=>R===String(N));o.push(`es: ${O?`[${T.join(", ")}]`:`{ ${a.map(([R],N)=>`${R}: ${T[N]}`).join(", ")} }`}`)}let h=[];for(let{module:S,name:T}of d)S==="utu"&&(T==="closure_new"?h.push(`closure_new: ${s("closureNew")}`):T==="closure_rec"?h.push(`closure_rec: ${s("closureRec")}`):T.startsWith("closure_call_")?h.push(`${T}: ${s("closureApply")}`):T==="promise_then"?h.push(`promise_then: ${s("promiseThen")}`):T==="promise_catch"?h.push(`promise_catch: ${s("promiseCatch")}`):T.startsWith("await_")?h.push(`${T}: ${s("awaitImport")}(${T.startsWith("await_null_")?"true":""})`):T==="js_tag"&&h.push("js_tag:WebAssembly.JSTag"));if(h.length||e.mems){let S=`{${h.join(",")}}`;o.push(`utu: ${e.mems?`${s("memoryImports")}(${JSON.stringify(e.mems)}, ${S})`:S}`)}let w=e.promises?.asyncExports??[],y="instance.exports",c="";if(w.length&&(y=`{ ...instance.exports, ${w.map(T=>`${JSON.stringify(T)}: ${s("promising")}(instance.exports[${JSON.stringify(T)}])`).join(", ")} }`),e.exports){let S=jt(e.exports,y,w);S?(c=S.source,y=S.name):y=`${s("convertExports")}(${y}, ${JSON.stringify(e.exports)})`}f.size&&m.unshift(`import { ${[...f].join(", ")} } from ${JSON.stringify(t)};`);let g=l?"instantiateStreaming":"instantiate",x=WebAssembly.Module.imports(new WebAssembly.Module(n)).map(S=>S.module),k={};x.includes("wasm:js-string")&&(k.builtins=["js-string"]),x.includes("'")&&(k.importedStringConstants="'");let E=Object.keys(k).length?`,${JSON.stringify(k)}`:"";return m.push(`export const {instance}=await WebAssembly.${g}(${i},{${o.join(",")}}${E});`),c&&m.push(c),m.push(`export const exports=${y};`),m.join(`
`)+`
`}function jt(e,n,t=[]){let r={Bool:o=>`!!${o}`,int:o=>`Number.isInteger(${o})`,big:o=>`typeof ${o}==="bigint"`,num:o=>`typeof ${o}==="number"`,Str:o=>`typeof ${o}==="string"`,"?Str":o=>`${o}==null||typeof ${o}==="string"`,ref:o=>`${o}!=null`,cl:o=>`typeof ${o}==="function"`,"?":o=>`${o}===undefined?null:${o}`},i={int:"an integer",big:"a BigInt",num:"a number",Str:"a string","?Str":"a string or null",ref:"a value",cl:"a function"},l=(o,a)=>o==="Bool"?`${a}!==0`:o==="U32"?`${a}>>>0`:o==="U64"?`BigInt.asUintN(64,${a})`:a,d=o=>typeof o=="string",f=!1,s=[];for(let[o,a]of Object.entries(e)){let u=typeof a=="string"?a:a.r,h=typeof a=="string"?null:a.p??null;if(!(Array.isArray(u)?u.every(d):d(u))||h?.some(S=>!(S in r)))return null;let w=JSON.stringify(o),y=h?h.map((S,T)=>`a${T}`):null,c=[];h?.forEach((S,T)=>{let O=y[T];S==="Bool"||S==="?"?c.push(`${O}=${r[S](O)}`):(f=!0,c.push(`${r[S](O)}||$utuFail(${w},${T},${JSON.stringify(i[S])},${O})`),S==="?Str"&&c.push(`${O}??=null`))});let g=`$utuIn[${w}](${y?y.join(","):"...a"})`,x=S=>Array.isArray(u)?(S==="x"?"":"(v=>")+`${S==="x"?"x":"v"}.map((x,i)=>[${u.map(T=>`x=>${l(T,"x")}`).join(",")}][i](x))`+(S==="x"?"":`)(${S})`):l(u,S),k=t.includes(o)?x("x")==="x"?g:`${g}.then(x=>${x("x")})`:x(g),E=c.length?`(${[...c,k].join(",")})`:k;y?s.push(`${w}:(${y.join(",")})=>${E}`):s.push(`${w}:Object.defineProperty((...a)=>${E},"length",{value:$utuIn[${w}].length})`)}let m=[`const $utuIn=${n},$utuExports={...$utuIn,${s.join(",")}};`];return f&&m.unshift('const $utuFail=(name,i,what,v)=>{throw new TypeError(`${name}: argument ${i+1} must be ${what}, not ${v===null?"null":what==="an integer"&&typeof v==="number"?v:typeof v}`)};'),{source:m.join(`
`),name:"$utuExports"}}function Mt(e){return/^(async\s+)?(function\b|[\w$]+\s*=>|\([^()]*\)\s*=>)/.test(e)||/^\((f => \((p\d+(,p\d+)*)?\) => |v => \(\) => v\)\(|v => \(w => \(\) => w\)\()/.test(e)||e.startsWith("$utuFn(")}var $t={builtins:["js-string"],importedStringConstants:"'"};var rn=()=>import("./browser-catalog.generated-TVPIZNWR.js");async function sn(e,n,t){let r=e[`${n}_JSON`];if(r===void 0){let l=Uint8Array.from(atob(e[`${n}_GZIP`]),f=>f.charCodeAt(0)),d=new Blob([l]).stream().pipeThrough(new DecompressionStream("gzip"));r=await new Response(d).text()}let i=JSON.parse(r);if(i.version!==1)throw new Error(`Unsupported ${t} declaration ABI version`);return i}function X(e){let n;return()=>n??=e().catch(t=>{throw n=void 0,t})}var pe=X(async()=>sn(await rn(),"BROWSER_ABI","browser")),Ft=X(async()=>sn(await rn(),"WORKER_ABI","worker"));function an(e,n,t){let r=i=>Object.fromEntries(Object.entries(i).filter(([l])=>t(l)));return{source:`mod ${e} {}`,abi:{...n,prefix:e,exports:r(n.exports),names:r(n.names),mutableGlobals:n.mutableGlobals.filter(t)}}}async function on(){return{source:"mod Browser {}",abi:await pe()}}var ln=X(async()=>{let e=await pe(),n=new Set(e.ecmascript??[]);return an("JS",e,t=>n.has(t))}),Et=["AbortController","AbortSignal","Blob","ByteLengthQueuingStrategy","CompressionStream","CountQueuingStrategy","Crypto","CryptoKey","CustomEvent","DOMException","DecompressionStream","Event","EventTarget","File","FormData","Headers","MessageChannel","MessageEvent","MessagePort","ReadableByteStreamController","ReadableStream","ReadableStreamBYOBReader","ReadableStreamBYOBRequest","ReadableStreamDefaultController","ReadableStreamDefaultReader","Request","RequestInit","Response","ResponseInit","SubtleCrypto","TextDecoder","TextDecoderStream","TextEncoder","TextEncoderStream","TransformStream","TransformStreamDefaultController","URL","URLSearchParams","WebAssembly","WritableStream","WritableStreamDefaultController","WritableStreamDefaultWriter","atob","btoa","clearInterval","clearTimeout","console","crypto","fetch","navigator","performance","queueMicrotask","reportError","setInterval","setTimeout","structuredClone"],fn=X(async()=>{let e=new Set(Et);return an("Web",await pe(),n=>e.has(n))}),dn=X(async()=>({source:"mod Worker {}",abi:await Ft()}));var M="ir-wasm-",Q=new Map([["std:Array",`// std/Array.utu \u2014 Array[T1]
//
// & maps to a WasmGC mutable array type with element type T1.
//
// Index sugar (lowered by lower-operators.js):
//   a[i]        \u2192  Array[T].get_index(a, i)     returns T1
//   a[s, e]     \u2192  Array[T].get_slice(a, s, e)  returns &
//   a[i] = v    \u2192  Array[T].set_index(a, i, v)  void

mod Array[T1] {
    // Declare & as a WasmGC mutable array type with element T1.
    // After instantiation with e.g. T1=I32 this becomes:
    //   (type $Array__I32 (array (mut I32)))
    type & = @ir/\\ <@@IR_WASM@@array type-repr="wasm-array:elem=T1:mut=true"/> \\/

    // \u2500\u2500 Index operator targets \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // These are called by the compiler when it lowers a[i], a[s,e], a[i]=v.

    // a[i] \u2014 read element at index i.
    fn &.get_index |self| (i: I32) T1 {
        @ir/\\ <ir-array-get><ir-ident name="self"/><ir-ident name="i"/></ir-array-get> \\/;
    }

    // a[i] = v \u2014 write element at index i (returns void).
    fn &.set_index |self| (i: I32, v: T1) void {
        @ir/\\ <ir-array-set><ir-ident name="self"/><ir-ident name="i"/><ir-ident name="v"/></ir-array-set> \\/;
    }

    // a[s, e] \u2014 copy subrange [start, end) into a new array.
    fn &.get_slice |self| (start: I32, end_: I32) & {
        @ir/\\ <ir-array-slice><ir-ident name="self"/><ir-ident name="start"/><ir-ident name="end_"/></ir-array-slice> \\/;
    }

    // \u2500\u2500 Named methods (explicit call syntax) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

    // Create an Array of n elements, initialized with fill.
    fn &.new(n: I32, fill: T1) & {
        @ir/\\ <ir-array-new><ir-ident name="n"/><ir-ident name="fill"/></ir-array-new> \\/;
    }

    // Create an Array with Wasm's default value for T1 (zero or null).
    fn &.new_default(n: I32) & {
        @ir/\\ <ir-array-new><ir-ident name="n"/></ir-array-new> \\/;
    }

    // Number of elements. Call as \`array.len()\`.
    fn &.len |self| () I32 {
        @ir/\\ <ir-array-len><ir-ident name="self"/></ir-array-len> \\/;
    }

    // Aliases kept for explicit call sites.
    fn &.get |self| (i: I32) T1 {
        @ir/\\ <ir-array-get><ir-ident name="self"/><ir-ident name="i"/></ir-array-get> \\/;
    }
    fn &.set |self| (i: I32, v: T1) void {
        @ir/\\ <ir-array-set><ir-ident name="self"/><ir-ident name="i"/><ir-ident name="v"/></ir-array-set> \\/;
    }
    fn &.slice |self| (start: I32, end_: I32) & {
        @ir/\\ <ir-array-slice><ir-ident name="self"/><ir-ident name="start"/><ir-ident name="end_"/></ir-array-slice> \\/;
    }

    // self[at .. at+count) = source[start .. start+count), as one bulk copy.
    // Overlapping ranges of the same array copy correctly. Out of range traps.
    fn &.copy_from |self| (at: I32, source: &, start: I32, count: I32) void {
        @ir/\\ <ir-array-copy>
            <ir-ident name="self"/>
            <ir-ident name="at"/>
            <ir-ident name="source"/>
            <ir-ident name="start"/>
            <ir-ident name="count"/>
        </ir-array-copy> \\/;
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Bool",`// std/Bool.utu \u2014 Bool scalar type module
// & is a WasmGC I32 used as boolean (0 = false, 1 = true).
// Logical operators live here like every other operator; the compiler lowers
// \`and\`, \`or\`, \`xor\`, and \`not\` through this module instead of hardcoding them.

mod Bool {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:eq  |a, b| Bool { @ir/\\ <ir-i32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i32-eq> \\/; }
    fn &:ne  |a, b| Bool { @ir/\\ <ir-i32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ne> \\/; }
    fn &:and |a, b| Bool { @ir/\\ <ir-i32-and><ir-ident name="a"/><ir-ident name="b"/></ir-i32-and> \\/; }
    fn &:or  |a, b| Bool { @ir/\\ <ir-i32-or><ir-ident name="a"/><ir-ident name="b"/></ir-i32-or> \\/; }
    fn &:xor |a, b| Bool { @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i32-xor> \\/; }
    fn &:not |a| Bool { @ir/\\ <ir-i32-eqz><ir-ident name="a"/></ir-i32-eqz> \\/; }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.to_str |self| () Str {
        let format: fun(Bool) Str = @es/\\ (v) => (v ? "true" : "false") \\/;
        format(self);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Buffer",`// Geometrically growing native buffer, including non-defaultable element types.
// Its checks are kept only in a --safe build: otherwise an index past the
// length reaches the capacity beyond (and past that, the array's own bounds
// trap).
mod Buffer[T] {
    struct &:
        | values: Array[T]
        | length: I32

    fn &.new() & {
        &{ values: [], length: 0 };
    }

    fn &.push |self| (value: T) void {
        if self.length == self.values.len() {
            if checks() and self.length > 536870911 { fatal; };
            let capacity = if self.length == 0 { 8; } else { self.length * 2; };
            let grown = Array[T].new(capacity, value);
            grown.copy_from(0, self.values, 0, self.length);
            self.values = grown;
        };
        self.values[self.length] = value;
        self.length += 1;
    }

    fn &.len |self| () I32 { self.length; }

    fn &.is_empty |self| () Bool { self.length == 0; }

    // b[i] and b[i] = v.
    fn &.get_index |self| (i: I32) T {
        if checks() and (i < 0 or i >= self.length) { fatal; };
        self.values[i];
    }

    fn &.set_index |self| (i: I32, value: T) void {
        if checks() and (i < 0 or i >= self.length) { fatal; };
        self.values[i] = value;
    }

    // The last value, removed.
    fn &.pop |self| () T {
        if checks() and self.length == 0 { fatal; };
        self.length -= 1;
        self.values[self.length];
    }

    fn &.clear |self| () void { self.length = 0; }

    // Keeps the first \`length\` values.
    fn &.truncate |self| (length: I32) void {
        if checks() and (length < 0 or length > self.length) { fatal; };
        self.length = length;
    }

    // Whether the build is --safe.
    fn checks() Bool { @ir/\\ <ir-safe-checks/> \\/; }

    fn &.finish |self| () Array[T] {
        self.values.slice(0, self.length);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Console",`//! The host's console: \`using console from std:Console;\`, then
//! \`console.log("hello")\`. Text in, nothing out; each function ships only
//! when used.

mod console {
    /// A line on standard output (\`console.log\`).
    fn log(text: Str) void {
        let f: fun(Str) void = @es/\\ (s) => console.log(s) \\/;
        f(text);
    }

    /// A line on standard error, as a warning (\`console.warn\`).
    fn warn(text: Str) void {
        let f: fun(Str) void = @es/\\ (s) => console.warn(s) \\/;
        f(text);
    }

    /// A line on standard error (\`console.error\`).
    fn error(text: Str) void {
        let f: fun(Str) void = @es/\\ (s) => console.error(s) \\/;
        f(text);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Externref",`// std/Externref.utu \u2014 Externref opaque external reference type module
// & maps to the WebAssembly Externref type: an opaque, garbage-collected
// reference to a host (JavaScript) object.
// Externrefs ARE nullable: ?Externref is valid.
//
// No arithmetic or comparison operators \u2014 externrefs are fully opaque.
// Host operations are accessed via @ir DSL or imported JS functions.

mod Externref {
    type & = @ir/\\ <@@IR_WASM@@ref type-repr="wasm-externref"/> \\/
}
`.replaceAll("@@IR_WASM@@",M)],["std:F32",`// std/F32.utu \u2014 F32 scalar type module
// & is a WasmGC F32 value (stack-only, never heap-allocated, never nullable).

mod F32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-f32"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-f32-add><ir-ident name="a"/><ir-ident name="b"/></ir-f32-add> \\/; }
    fn &:sub  |a, b| & { @ir/\\ <ir-f32-sub><ir-ident name="a"/><ir-ident name="b"/></ir-f32-sub> \\/; }
    fn &:mul  |a, b| & { @ir/\\ <ir-f32-mul><ir-ident name="a"/><ir-ident name="b"/></ir-f32-mul> \\/; }
    fn &:div  |a, b| & { @ir/\\ <ir-f32-div><ir-ident name="a"/><ir-ident name="b"/></ir-f32-div> \\/; }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-f32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-f32-eq> \\/; }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-f32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-f32-ne> \\/; }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-f32-lt><ir-ident name="a"/><ir-ident name="b"/></ir-f32-lt> \\/; }
    fn &:le   |a, b| Bool { @ir/\\ <ir-f32-le><ir-ident name="a"/><ir-ident name="b"/></ir-f32-le> \\/; }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-f32-gt><ir-ident name="a"/><ir-ident name="b"/></ir-f32-gt> \\/; }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-f32-ge><ir-ident name="a"/><ir-ident name="b"/></ir-f32-ge> \\/; }
    fn &:neg  |a| & { @ir/\\ <ir-f32-neg><ir-ident name="a"/></ir-f32-neg> \\/; }
    fn abs(x: &)  & { @ir/\\ <ir-f32-abs><ir-ident name="x"/></ir-f32-abs> \\/; }
    fn sqrt(x: &) & { @ir/\\ <ir-f32-sqrt><ir-ident name="x"/></ir-f32-sqrt> \\/; }
    fn ceil(x: &) & { @ir/\\ <ir-f32-ceil><ir-ident name="x"/></ir-f32-ceil> \\/; }
    fn floor(x: &) & { @ir/\\ <ir-f32-floor><ir-ident name="x"/></ir-f32-floor> \\/; }
    fn trunc(x: &) & { @ir/\\ <ir-f32-trunc><ir-ident name="x"/></ir-f32-trunc> \\/; }
    fn nearest(x: &) & { @ir/\\ <ir-f32-nearest><ir-ident name="x"/></ir-f32-nearest> \\/; }
    fn min(a: &, b: &) & { @ir/\\ <ir-f32-min><ir-ident name="a"/><ir-ident name="b"/></ir-f32-min> \\/; }
    fn max(a: &, b: &) & { @ir/\\ <ir-f32-max><ir-ident name="a"/><ir-ident name="b"/></ir-f32-max> \\/; }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.to_f64 |self| () F64 { @ir/\\ <ir-f64-promote><ir-ident name="self"/></ir-f64-promote> \\/; }
    fn &.to_i32 |self| () I32 { @ir/\\ <ir-i32-trunc-s-sat-f32><ir-ident name="self"/></ir-i32-trunc-s-sat-f32> \\/; }
    fn &.to_u32 |self| () U32 { @ir/\\ <ir-u32-trunc-u-sat-f32><ir-ident name="self"/></ir-u32-trunc-u-sat-f32> \\/; }
    fn &.to_i64 |self| () I64 { @ir/\\ <ir-i64-trunc-s-sat-f32><ir-ident name="self"/></ir-i64-trunc-s-sat-f32> \\/; }
    fn &.to_u64 |self| () U64 { @ir/\\ <ir-u64-trunc-u-sat-f32><ir-ident name="self"/></ir-u64-trunc-u-sat-f32> \\/; }

    // The IEEE 754 bits, and back.
    fn &.bits |self| () I32 { @ir/\\ <ir-i32-reinterpret><ir-ident name="self"/></ir-i32-reinterpret> \\/; }
    fn from_bits(bits: I32) & { @ir/\\ <ir-f32-reinterpret><ir-ident name="bits"/></ir-f32-reinterpret> \\/; }

    // The shortest decimal that reads back as the same F32 (0.1, not
    // 0.10000000149011612). Ships only when used.
    fn &.to_str |self| () Str {
        let format: fun(F32) Str = @es/\\ (v) => { for (let p = 1; p < 10; p++) { const s = Number(v.toPrecision(p)); if (Math.fround(s) === v) return String(s); } return String(v); } \\/;
        format(self);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:F64",`// std/F64.utu \u2014 F64 scalar type module
// & is a WasmGC F64 value (stack-only, never heap-allocated, never nullable).

mod F64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-f64"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-f64-add><ir-ident name="a"/><ir-ident name="b"/></ir-f64-add> \\/; }
    fn &:sub  |a, b| & { @ir/\\ <ir-f64-sub><ir-ident name="a"/><ir-ident name="b"/></ir-f64-sub> \\/; }
    fn &:mul  |a, b| & { @ir/\\ <ir-f64-mul><ir-ident name="a"/><ir-ident name="b"/></ir-f64-mul> \\/; }
    fn &:div  |a, b| & { @ir/\\ <ir-f64-div><ir-ident name="a"/><ir-ident name="b"/></ir-f64-div> \\/; }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-f64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-f64-eq> \\/; }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-f64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-f64-ne> \\/; }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-f64-lt><ir-ident name="a"/><ir-ident name="b"/></ir-f64-lt> \\/; }
    fn &:le   |a, b| Bool { @ir/\\ <ir-f64-le><ir-ident name="a"/><ir-ident name="b"/></ir-f64-le> \\/; }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-f64-gt><ir-ident name="a"/><ir-ident name="b"/></ir-f64-gt> \\/; }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-f64-ge><ir-ident name="a"/><ir-ident name="b"/></ir-f64-ge> \\/; }
    fn &:neg  |a| & { @ir/\\ <ir-f64-neg><ir-ident name="a"/></ir-f64-neg> \\/; }
    fn abs(x: &)  & { @ir/\\ <ir-f64-abs><ir-ident name="x"/></ir-f64-abs> \\/; }
    fn sqrt(x: &) & { @ir/\\ <ir-f64-sqrt><ir-ident name="x"/></ir-f64-sqrt> \\/; }
    fn ceil(x: &) & { @ir/\\ <ir-f64-ceil><ir-ident name="x"/></ir-f64-ceil> \\/; }
    fn floor(x: &) & { @ir/\\ <ir-f64-floor><ir-ident name="x"/></ir-f64-floor> \\/; }
    fn trunc(x: &) & { @ir/\\ <ir-f64-trunc><ir-ident name="x"/></ir-f64-trunc> \\/; }
    fn nearest(x: &) & { @ir/\\ <ir-f64-nearest><ir-ident name="x"/></ir-f64-nearest> \\/; }
    fn min(a: &, b: &) & { @ir/\\ <ir-f64-min><ir-ident name="a"/><ir-ident name="b"/></ir-f64-min> \\/; }
    fn max(a: &, b: &) & { @ir/\\ <ir-f64-max><ir-ident name="a"/><ir-ident name="b"/></ir-f64-max> \\/; }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.to_f32 |self| () F32 { @ir/\\ <ir-f32-demote><ir-ident name="self"/></ir-f32-demote> \\/; }
    fn &.to_i32 |self| () I32 { @ir/\\ <ir-i32-trunc-s-sat-f64><ir-ident name="self"/></ir-i32-trunc-s-sat-f64> \\/; }
    fn &.to_u32 |self| () U32 { @ir/\\ <ir-u32-trunc-u-sat-f64><ir-ident name="self"/></ir-u32-trunc-u-sat-f64> \\/; }
    fn &.to_i64 |self| () I64 { @ir/\\ <ir-i64-trunc-s-sat-f64><ir-ident name="self"/></ir-i64-trunc-s-sat-f64> \\/; }
    fn &.to_u64 |self| () U64 { @ir/\\ <ir-u64-trunc-u-sat-f64><ir-ident name="self"/></ir-u64-trunc-u-sat-f64> \\/; }

    // The IEEE 754 bits, and back.
    fn &.bits |self| () I64 { @ir/\\ <ir-i64-reinterpret><ir-ident name="self"/></ir-i64-reinterpret> \\/; }
    fn from_bits(bits: I64) & { @ir/\\ <ir-f64-reinterpret><ir-ident name="bits"/></ir-f64-reinterpret> \\/; }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.to_str |self| () Str {
        let format: fun(F64) Str = @es/\\ (v) => String(v) \\/;
        format(self);
    }

    // \u2500\u2500 Math \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Each ships only when used: the host's Math, one call each.

    /// The sine (of radians).
    fn &.sin |self| () & {
        let f: fun(&) & = @es/\\ Math.sin \\/;
        f(self);
    }

    /// The cosine.
    fn &.cos |self| () & {
        let f: fun(&) & = @es/\\ Math.cos \\/;
        f(self);
    }

    /// The tangent.
    fn &.tan |self| () & {
        let f: fun(&) & = @es/\\ Math.tan \\/;
        f(self);
    }

    /// The arcsine, in radians.
    fn &.asin |self| () & {
        let f: fun(&) & = @es/\\ Math.asin \\/;
        f(self);
    }

    /// The arccosine, in radians.
    fn &.acos |self| () & {
        let f: fun(&) & = @es/\\ Math.acos \\/;
        f(self);
    }

    /// The arctangent, in radians.
    fn &.atan |self| () & {
        let f: fun(&) & = @es/\\ Math.atan \\/;
        f(self);
    }

    /// $e^x$.
    fn &.exp |self| () & {
        let f: fun(&) & = @es/\\ Math.exp \\/;
        f(self);
    }

    /// The natural logarithm (NaN below 0).
    fn &.ln |self| () & {
        let f: fun(&) & = @es/\\ Math.log \\/;
        f(self);
    }

    /// The base-2 logarithm.
    fn &.log2 |self| () & {
        let f: fun(&) & = @es/\\ Math.log2 \\/;
        f(self);
    }

    /// The base-10 logarithm.
    fn &.log10 |self| () & {
        let f: fun(&) & = @es/\\ Math.log10 \\/;
        f(self);
    }

    /// The cube root.
    fn &.cbrt |self| () & {
        let f: fun(&) & = @es/\\ Math.cbrt \\/;
        f(self);
    }

    /// \`self\` to the power \`exponent\`.
    fn &.pow |self| (exponent: &) & {
        let f: fun(&, &) & = @es/\\ Math.pow \\/;
        f(self, exponent);
    }

    /// The angle of the point (\`other\`, \`self\`) from the x axis: \`y.atan2(x)\`, in radians.
    fn &.atan2 |self| (other: &) & {
        let f: fun(&, &) & = @es/\\ Math.atan2 \\/;
        f(self, other);
    }

    /// $sqrt(x^2 + y^2)$, without overflow on the way.
    fn &.hypot |self| (other: &) & {
        let f: fun(&, &) & = @es/\\ Math.hypot \\/;
        f(self, other);
    }

    /// Whether this is NaN, which is not equal even to itself.
    fn &.is_nan |self| () Bool { self != self; }

    /// Whether this is neither infinite nor NaN.
    fn &.is_finite |self| () Bool { self - self == 0.0; }

    /// $pi$.
    fn pi() & { 3.141592653589793; }

    /// Euler's number $e$.
    fn e() & { 2.718281828459045; }

    /// Positive infinity.
    fn inf() & { 1.0 / 0.0; }

    /// Not a number.
    fn nan() & { 0.0 / 0.0; }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Found",`// Optional iterator result: null means empty; a present wrapper holds any T,
// including non-nullable scalar types. Use \`promote\` or \`orelse\` to unwrap.
mod Found[T] {
    struct &:
        | value: T
    fn &.new(value: T) & {
        &{ value: value };
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Group",`mod Group[K, T] {
    struct &:
        | key: K
        | values: Array[T]
    fn &.new(key: K) & {
        &{ key: key, values: [] };
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:I31",`// std/I31.utu \u2014 I31 WasmGC reference type module
// & maps to WasmGC i31ref: a 31-bit signed integer packed into a GC reference.
// I31 IS nullable: ?I31 is valid (it is a heap reference).
//
// I31 is useful when you need a type that fits in both a GC reference slot
// and carries an integer payload without heap allocation.
// The sign bit of the 32-bit I32 is used to tag the reference, so only
// 31 bits of payload are available.

mod I31 {
    type & = @ir/\\ <@@IR_WASM@@ref type-repr="wasm-i31"/> \\/

    // Pack an I32 value into an I31 reference (truncates to 31 bits).
    fn from_i32(x: I32) & {
        @ir/\\ <ir-i31-new><ir-ident name="x"/></ir-i31-new> \\/;
    }

    // Unpack as signed I32 (sign-extends from 31 bits).
    fn get_s(r: &) I32 {
        @ir/\\ <ir-i31-get-s><ir-ident name="r"/></ir-i31-get-s> \\/;
    }

    // Unpack as unsigned I32 (zero-extends from 31 bits).
    fn get_u(r: &) I32 {
        @ir/\\ <ir-i31-get-u><ir-ident name="r"/></ir-i31-get-u> \\/;
    }

    // Reference equality (same I31 value \u2192 same reference \u2192 eq).
    fn &:eq |a, b| Bool { @ir/\\ <ir-ref-eq><ir-ident name="a"/><ir-ident name="b"/></ir-ref-eq> \\/; }
    fn &:ne |a, b| Bool { @ir/\\ <ir-ref-ne><ir-ident name="a"/><ir-ident name="b"/></ir-ref-ne> \\/; }
}
`.replaceAll("@@IR_WASM@@",M)],["std:I32",`// std/I32.utu \u2014 I32 scalar type module
// & is a WasmGC I32 value (stack-only, never heap-allocated, never nullable).

mod I32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-i32-add><ir-ident name="a"/><ir-ident name="b"/></ir-i32-add> \\/; }
    fn &:sub  |a, b| & { @ir/\\ <ir-i32-sub><ir-ident name="a"/><ir-ident name="b"/></ir-i32-sub> \\/; }
    fn &:mul  |a, b| & { @ir/\\ <ir-i32-mul><ir-ident name="a"/><ir-ident name="b"/></ir-i32-mul> \\/; }
    fn &:div  |a, b| & { @ir/\\ <ir-i32-div-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-div-s> \\/; }
    fn &:rem  |a, b| & { @ir/\\ <ir-i32-rem-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-rem-s> \\/; }
    fn &:band |a, b| & { @ir/\\ <ir-i32-and><ir-ident name="a"/><ir-ident name="b"/></ir-i32-and> \\/; }
    fn &:bor  |a, b| & { @ir/\\ <ir-i32-or><ir-ident name="a"/><ir-ident name="b"/></ir-i32-or> \\/; }
    fn &:bxor |a, b| & { @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i32-xor> \\/; }
    fn &:shl  |a, b| & { @ir/\\ <ir-i32-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shl> \\/; }
    fn &:shr  |a, b| & { @ir/\\ <ir-i32-shr-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-s> \\/; }
    fn &:ushr |a, b| & { @ir/\\ <ir-i32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-u> \\/; }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-i32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i32-eq> \\/; }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-i32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ne> \\/; }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-i32-lt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-lt-s> \\/; }
    fn &:le   |a, b| Bool { @ir/\\ <ir-i32-le-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-le-s> \\/; }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-i32-gt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-gt-s> \\/; }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-i32-ge-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ge-s> \\/; }
    // wasm has no I32.neg / I32.not; express them with real ops.
    //   neg a  = 0 - a
    //   bnot a = a xor 0xFFFFFFFF (-1)
    // The lesser and the greater of two; the size of one (the least I32's is itself: 0 - x wraps).
    fn min(p: &, q: &) & { if p < q { p; } else { q; }; }
    fn max(p: &, q: &) & { if q < p { p; } else { q; }; }
    fn abs(v: &) & { if v < 0 { -v; } else { v; }; }
    fn &:neg  |a| & { @ir/\\ <ir-i32-sub><ir-lit kind="int" type-name="I32" value="0"/><ir-ident name="a"/></ir-i32-sub> \\/; }
    fn &:bnot |a| & { @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I32" value="-1"/></ir-i32-xor> \\/; }
    fn clz(x: &) & { @ir/\\ <ir-i32-clz><ir-ident name="x"/></ir-i32-clz> \\/; }
    fn ctz(x: &) & { @ir/\\ <ir-i32-ctz><ir-ident name="x"/></ir-i32-ctz> \\/; }
    fn popcnt(x: &) & { @ir/\\ <ir-i32-popcnt><ir-ident name="x"/></ir-i32-popcnt> \\/; }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.to_i64 |self| () I64 { @ir/\\ <ir-i64-extend-s><ir-ident name="self"/></ir-i64-extend-s> \\/; }
    fn &.to_u64 |self| () U64 { @ir/\\ <ir-u64-extend-s><ir-ident name="self"/></ir-u64-extend-s> \\/; }
    fn &.to_u32 |self| () U32 { @ir/\\ <ir-u32-or><ir-ident name="self"/><ir-lit kind="int" type-name="U32" value="0"/></ir-u32-or> \\/; }
    fn &.to_f32 |self| () F32 { @ir/\\ <ir-f32-convert-s-i32><ir-ident name="self"/></ir-f32-convert-s-i32> \\/; }
    fn &.to_f64 |self| () F64 { @ir/\\ <ir-f64-convert-s-i32><ir-ident name="self"/></ir-f64-convert-s-i32> \\/; }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.to_str |self| () Str {
        let format: fun(I32) Str = @es/\\ (v) => String(v) \\/;
        format(self);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:I64",`// std/I64.utu \u2014 I64 scalar type module
mod I64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i64"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-i64-add><ir-ident name="a"/><ir-ident name="b"/></ir-i64-add> \\/; }
    fn &:sub  |a, b| & { @ir/\\ <ir-i64-sub><ir-ident name="a"/><ir-ident name="b"/></ir-i64-sub> \\/; }
    fn &:mul  |a, b| & { @ir/\\ <ir-i64-mul><ir-ident name="a"/><ir-ident name="b"/></ir-i64-mul> \\/; }
    fn &:div  |a, b| & { @ir/\\ <ir-i64-div-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-div-s> \\/; }
    fn &:rem  |a, b| & { @ir/\\ <ir-i64-rem-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-rem-s> \\/; }
    fn &:band |a, b| & { @ir/\\ <ir-i64-and><ir-ident name="a"/><ir-ident name="b"/></ir-i64-and> \\/; }
    fn &:bor  |a, b| & { @ir/\\ <ir-i64-or><ir-ident name="a"/><ir-ident name="b"/></ir-i64-or> \\/; }
    fn &:bxor |a, b| & { @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i64-xor> \\/; }
    fn &:shl  |a, b| & { @ir/\\ <ir-i64-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shl> \\/; }
    fn &:shr  |a, b| & { @ir/\\ <ir-i64-shr-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-s> \\/; }
    fn &:ushr |a, b| & { @ir/\\ <ir-i64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-u> \\/; }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-i64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i64-eq> \\/; }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-i64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i64-ne> \\/; }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-i64-lt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-lt-s> \\/; }
    fn &:le   |a, b| Bool { @ir/\\ <ir-i64-le-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-le-s> \\/; }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-i64-gt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-gt-s> \\/; }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-i64-ge-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-ge-s> \\/; }
    // wasm has no I64.neg / I64.not; express them with real ops.
    //   neg a  = 0 - a
    //   bnot a = a xor 0xFFFFFFFFFFFFFFFF (-1)
    // The lesser and the greater of two; the size of one (the least I64's is itself: 0 - x wraps).
    fn min(p: &, q: &) & { if p < q { p; } else { q; }; }
    fn max(p: &, q: &) & { if q < p { p; } else { q; }; }
    fn abs(v: &) & { if v < 0 { -v; } else { v; }; }
    fn &:neg  |a| & { @ir/\\ <ir-i64-sub><ir-lit kind="int" type-name="I64" value="0"/><ir-ident name="a"/></ir-i64-sub> \\/; }
    fn &:bnot |a| & { @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I64" value="-1"/></ir-i64-xor> \\/; }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.to_i32 |self| () I32 { @ir/\\ <ir-i32-wrap><ir-ident name="self"/></ir-i32-wrap> \\/; }
    fn &.to_u32 |self| () U32 { @ir/\\ <ir-u32-wrap><ir-ident name="self"/></ir-u32-wrap> \\/; }
    fn &.to_u64 |self| () U64 { @ir/\\ <ir-u64-or><ir-ident name="self"/><ir-lit kind="int" type-name="U64" value="0"/></ir-u64-or> \\/; }
    fn &.to_f32 |self| () F32 { @ir/\\ <ir-f32-convert-s-i64><ir-ident name="self"/></ir-f32-convert-s-i64> \\/; }
    fn &.to_f64 |self| () F64 { @ir/\\ <ir-f64-convert-s-i64><ir-ident name="self"/></ir-f64-convert-s-i64> \\/; }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.to_str |self| () Str {
        let format: fun(I64) Str = @es/\\ (v) => String(v) \\/;
        format(self);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:IntMap",`// std/IntMap.utu \u2014 I32 keys to I32 values, open addressing.
//
//   let m = IntMap.new();
//   m.set(7, 70);
//   m.get(7, -1);      // 70; -1 when absent
//   m.has(8);          // false
//   m.len();           // 1
//
// Linear probing over a power-of-two table, at most half full. Keys are mixed
// with a Fibonacci multiply, so sequential and strided keys spread out.
mod IntMap {
    struct &:
        | keys: Array[I32]
        | values: Array[I32]
        | full: Array[I32]
        | count: I32
        | shift: I32

    fn &.new() & {
        &{ keys: Array[I32].new(16, 0), values: Array[I32].new(16, 0), full: Array[I32].new(16, 0), count: 0, shift: 28 };
    }

    fn &.len |self| () I32 {
        self.count;
    }

    // The slot holding key, or the empty slot where it belongs.
    fn &.slot |self| (key: I32) I32 {
        let mask = self.keys.len() - 1;
        let i = (key * -1640531535) >>> self.shift;
        while (self.full[i] != 0 and self.keys[i] != key) { i = (i + 1) & mask; };
        i;
    }

    fn &.has |self| (key: I32) Bool {
        self.full[self.slot(key)] != 0;
    }

    fn &.get |self| (key: I32, missing: I32) I32 {
        let i = self.slot(key);
        if self.full[i] != 0 { self.values[i]; } else { missing; };
    }

    fn &.set |self| (key: I32, value: I32) void {
        let i = self.slot(key);
        if self.full[i] == 0 {
            if (self.count + 1) * 2 > self.keys.len() {
                self.grow();
                i = self.slot(key);
            };
            self.full[i] = 1;
            self.keys[i] = key;
            self.count += 1;
        };
        self.values[i] = value;
    }

    fn &.grow |self| () void {
        let keys = self.keys;
        let values = self.values;
        let full = self.full;
        let size = keys.len() * 2;
        self.keys = Array[I32].new(size, 0);
        self.values = Array[I32].new(size, 0);
        self.full = Array[I32].new(size, 0);
        self.shift -= 1;
        for (0 ..< keys.len()) |j| {
            if full[j] != 0 {
                let i = self.slot(keys[j]);
                self.full[i] = 1;
                self.keys[i] = keys[j];
                self.values[i] = values[j];
            };
        };
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Interner",`// std/Interner.utu \u2014 byte strings to dense I32 ids: 0, 1, 2, \u2026 in first-seen order.
//
//   let names = Interner.new();
//   let id = names.str("caf\xE9");   // a string: its UTF-8 bytes
//   names.begin();
//   for (start ..< end) |i| { names.byte(src[i]); };   // bytes: from a mem, an array
//   let id = names.finish();      // the same bytes always get the same id
//   names.size(id); names.byte_at(id, 0); names.ascii(id);
//
// A key is bytes, 0 to 255. \`byte\` traps on anything else in safe builds
// (unsafe builds keep the low 8 bits), so feed it bytes, not a string's
// UTF-16 code units: \`str\` encodes a string as UTF-8, the same bytes a hosted
// mem's \`copy_in\` writes, so a string and its bytes from a mem get one id.
// The bytes of a new key are kept; a repeated key's are dropped.
// FNV-1a hashing, linear probing over a power-of-two table at most half full.
mod Interner {
    struct &:
        | bytes: Array[I32]
        | used: I32
        | starts: Array[I32]
        | hashes: Array[I32]
        | count: I32
        | table: Array[I32]
        | start: I32
        | hash: I32

    fn &.new() & {
        &{ bytes: Array[I32].new(256, 0), used: 0, starts: Array[I32].new(64, 0), hashes: Array[I32].new(64, 0),
           count: 0, table: Array[I32].new(64, 0), start: 0, hash: 0 };
    }

    // Distinct keys so far.
    fn &.len |self| () I32 {
        self.count;
    }

    fn &.begin |self| () void {
        self.start = self.used;
        self.hash = -2128831035;
    }

    // One byte of the key, 0 to 255.
    fn &.byte |self| (b: I32) void {
        if checks() and (b < 0 or b > 255) { fatal; };
        if self.used == self.bytes.len() {
            let grown = Array[I32].new(self.used * 2, 0);
            grown.copy_from(0, self.bytes, 0, self.used);
            self.bytes = grown;
        };
        self.bytes[self.used] = b & 255;
        self.used += 1;
        self.hash = (self.hash ^ (b & 255)) * 16777619;
    }

    // The id of \`s\` as UTF-8, adding it if it is new: begin, its bytes, finish.
    // A lone surrogate is 3 bytes of its own (WTF-8), so distinct strings
    // always get distinct ids.
    fn &.str |self| (s: Str) I32 {
        self.begin();
        let n = s.len();
        let i = 0;
        while (i < n) {
            let c = s[i];
            i += 1;
            if c >= 55296 and c <= 56319 and i < n and s[i] >= 56320 and s[i] <= 57343 {
                c = 65536 + ((c - 55296) << 10) + (s[i] - 56320);
                i += 1;
            };
            if c < 128 {
                self.byte(c);
            } else if c < 2048 {
                self.byte(192 | (c >> 6));
                self.byte(128 | (c & 63));
            } else if c < 65536 {
                self.byte(224 | (c >> 12));
                self.byte(128 | ((c >> 6) & 63));
                self.byte(128 | (c & 63));
            } else {
                self.byte(240 | (c >> 18));
                self.byte(128 | ((c >> 12) & 63));
                self.byte(128 | ((c >> 6) & 63));
                self.byte(128 | (c & 63));
            };
        };
        self.finish();
    }

    // The id of the bytes since begin(), adding them if they are new.
    fn &.finish |self| () I32 {
        let mask = self.table.len() - 1;
        let i = self.hash & mask;
        let length = self.used - self.start;
        while (self.table[i] != 0) {
            let id = self.table[i] - 1;
            if self.hashes[id] == self.hash and self.same(id, length) {
                self.used = self.start;
                return id;
            };
            i = (i + 1) & mask;
        };
        let id = self.count;
        if id + 1 == self.starts.len() {
            let starts = Array[I32].new(self.starts.len() * 2, 0);
            starts.copy_from(0, self.starts, 0, self.starts.len());
            self.starts = starts;
            let hashes = Array[I32].new(self.hashes.len() * 2, 0);
            hashes.copy_from(0, self.hashes, 0, self.hashes.len());
            self.hashes = hashes;
        };
        self.starts[id] = self.start;
        self.starts[id + 1] = self.used;
        self.hashes[id] = self.hash;
        self.count += 1;
        self.table[i] = id + 1;
        if self.count * 2 > self.table.len() { self.rehash(); };
        id;
    }

    fn &.same |self| (id: I32, length: I32) Bool {
        let at = self.starts[id];
        if self.starts[id + 1] - at != length { return false; };
        for (0 ..< length) |k| {
            if self.bytes[at + k] != self.bytes[self.start + k] { return false; };
        };
        true;
    }

    fn &.rehash |self| () void {
        let table = Array[I32].new(self.table.len() * 2, 0);
        let mask = table.len() - 1;
        for (0 ..< self.count) |id| {
            let i = self.hashes[id] & mask;
            while (table[i] != 0) { i = (i + 1) & mask; };
            table[i] = id + 1;
        };
        self.table = table;
    }

    // Byte length of a key.
    fn &.size |self| (id: I32) I32 {
        self.starts[id + 1] - self.starts[id];
    }

    fn &.byte_at |self| (id: I32, k: I32) I32 {
        self.bytes[self.starts[id] + k];
    }

    fn checks() Bool { @ir/\\ <ir-safe-checks/> \\/; }

    // The key as a string, one character per byte: exact for ASCII; a
    // multi-byte UTF-8 character shows as its bytes.
    fn &.ascii |self| (id: I32) Str {
        Str.from_codes(self.bytes.slice(self.starts[id], self.starts[id + 1]), self.size(id));
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:JsonRuntime",`struct JsonReader__:
    | text: Str
    | at: I32
    | n: I32
    | failed: I32
    | reason: Str
    | ks: I32
    | kl: I32
    | key: Str
    | depth: I32
    | names: Array[I32]
    | where: Str
    | matched: I32

struct JsonWriter__:
    | buf: Array[I32]
    | n: I32
    | names: Array[I32]

let __json_number: fun(Str) F64 = @es/\\ s => +s \\/;
let __json_float_text: fun(F64) Str = @es/\\ x => Number.isFinite(x) ? String(x) : 'null' \\/;

fn __json_codes(s: Str) Array[I32] {
    let codes = Array[I32].new_default(s.len());
    for (0..<s.len()) |i| {
        codes[i] = s[i];
    };
    codes;
}

fn __json_reader(text: Str) JsonReader__ {
    JsonReader__ { text: text, at: 0, n: text.len(), failed: 0, reason: "", ks: 0, kl: 0, key: "", depth: 0, names: __json_codes(__json_names()), where: "", matched: 0 };
}

// Start over from the beginning, for the next match arm.
fn __json_restart(r: JsonReader__) void {
    r.at = 0;
    r.failed = 0;
    r.reason = "";
    r.depth = 0;
    r.where = "";
    r.matched = 0;
}

// After one part of a match pattern: count it, or name where it failed.
fn __json_at(r: JsonReader__, was_ok: Bool, where: Str) void {
    if was_ok {
        if r.failed != 0 {
            r.where = where;
        } else {
            r.matched += 1;
        };
    };
}

// Record the first problem; then every later read stops at the end of input.
fn __json_fail(r: JsonReader__, why: Str) void {
    if r.failed == 0 {
        r.failed = r.at + 1;
        r.reason = why;
    };
    r.at = r.n;
}

fn __json_ws(r: JsonReader__) void {
    let t = r.text;
    let n = r.n;
    let i = r.at;
    while (i < n) {
        let c = t[i];
        if c == 32 or c == 10 or c == 13 or c == 9 {
            i += 1;
        } else {
            break;
        };
    };
    r.at = i;
}

fn __json_peek(r: JsonReader__) I32 {
    __json_ws(r);
    if r.at < r.n { r.text[r.at]; } else { -1; };
}

fn __json_open(r: JsonReader__, c: I32, why: Str) void {
    if __json_peek(r) == c {
        r.at += 1;
        if c != 58 {
            __json_enter(r);
        };
    } else {
        __json_fail(r, why);
    };
}

// Into an object or array: one level deeper (out again at its close).
fn __json_enter(r: JsonReader__) void {
    r.depth += 1;
    if r.depth > 512 {
        __json_fail(r, "nested too deeply");
    };
}

fn __json_colon(r: JsonReader__) void {
    __json_open(r, 58, "expected ':'");
}

// After an opening bracket: whether the container has a first element.
fn __json_first(r: JsonReader__, close: I32) Bool {
    if __json_peek(r) == close {
        r.at += 1;
        r.depth -= 1;
        false;
    } else {
        r.failed == 0;
    };
}

// After an element: whether another one follows.
fn __json_next(r: JsonReader__, close: I32) Bool {
    let c = __json_peek(r);
    if c == 44 {
        r.at += 1;
        true;
    } else {
        if c == close {
            r.at += 1;
            r.depth -= 1;
        } else {
            __json_fail(r, if close == 125 { "expected ',' or '}'"; } else { "expected ',' or ']'"; });
        };
        false;
    };
}

fn __json_end(r: JsonReader__) void {
    if __json_peek(r) != -1 {
        __json_fail(r, "unexpected text after the value");
    };
}

fn __json_missing(r: JsonReader__, name: Str) void {
    __json_fail(r, "missing field \\"" + name + "\\"");
}

fn __json_word(r: JsonReader__, word: Str) Bool {
    let n = word.len();
    let ok = r.at + n <= r.n;
    let i = 0;
    while (ok and i < n) {
        ok = r.text[r.at + i] == word[i];
        i += 1;
    };
    if ok {
        r.at += n;
    };
    ok;
}

fn __json_hex(r: JsonReader__, at: I32) I32 {
    let v = 0;
    for (0..<4) |k| {
        let c = if at + k < r.n { r.text[at + k]; } else { 0; };
        let d = if c >= 48 and c <= 57 { c - 48; } else { if c >= 97 and c <= 102 { c - 87; } else { if c >= 65 and c <= 70 { c - 55; } else { -1; }; }; };
        v = if d < 0 or v < 0 { -1; } else { v * 16 + d; };
    };
    v;
}

// Read a string token. Without escapes it stays a span of the input
// (ks, kl); with escapes it is decoded into key and ks is -1.
fn __json_span(r: JsonReader__) void {
    r.ks = 0;
    r.kl = 0;
    if __json_peek(r) != 34 {
        __json_fail(r, "expected a string");
        return;
    };
    let t = r.text;
    let n = r.n;
    let start = r.at + 1;
    let i = start;
    while (i < n) {
        let c = t[i];
        if c == 34 or c == 92 or c < 32 {
            break;
        };
        i += 1;
    };
    if i < n and t[i] == 34 {
        r.ks = start;
        r.kl = i - start;
        r.at = i + 1;
        return;
    };
    let w = __json_writer(i - start + 16);
    for (start..<i) |k| {
        __json_put(w, t[k]);
    };
    let done = false;
    while (not done) {
        if i >= n {
            r.at = n;
            __json_fail(r, "unterminated string");
            done = true;
        } else {
            let c = t[i];
            if c == 34 {
                i += 1;
                done = true;
            } else {
                if c < 32 {
                    r.at = i;
                    __json_fail(r, "control character in string");
                    done = true;
                } else {
                    if c == 92 {
                        let e = if i + 1 < n { t[i + 1]; } else { 0; };
                        i += 2;
                        match e {
                            34 => { __json_put(w, 34); },
                            92 => { __json_put(w, 92); },
                            47 => { __json_put(w, 47); },
                            98 => { __json_put(w, 8); },
                            102 => { __json_put(w, 12); },
                            110 => { __json_put(w, 10); },
                            114 => { __json_put(w, 13); },
                            116 => { __json_put(w, 9); },
                            117 => {
                                let h = __json_hex(r, i);
                                if h < 0 {
                                    r.at = i - 2;
                                    __json_fail(r, "invalid \\\\u escape");
                                    done = true;
                                } else {
                                    __json_put(w, h);
                                    i += 4;
                                };
                            },
                            ~> {
                                r.at = i - 2;
                                __json_fail(r, "invalid escape");
                                done = true;
                            },
                        };
                    } else {
                        __json_put(w, c);
                        i += 1;
                    };
                };
            };
        };
    };
    if r.failed == 0 {
        r.at = i;
        r.ks = -1;
        r.key = Str.from_codes(w.buf, w.n);
    };
}

// Whether the string just read equals names[at ..< at + n].
fn __json_is(r: JsonReader__, at: I32, n: I32) Bool {
    if r.ks < 0 {
        let ok = r.key.len() == n;
        let i = 0;
        while (ok and i < n) {
            ok = r.key[i] == r.names[at + i];
            i += 1;
        };
        ok;
    } else {
        let ok = r.kl == n;
        let i = 0;
        while (ok and i < n) {
            ok = r.text[r.ks + i] == r.names[at + i];
            i += 1;
        };
        ok;
    };
}

fn __json_str(r: JsonReader__) Str {
    __json_span(r);
    if r.ks < 0 { r.key; } else { r.text.slice(r.ks, r.ks + r.kl); };
}

fn __json_bool(r: JsonReader__) Bool {
    let c = __json_peek(r);
    if c == 116 and __json_word(r, "true") {
        true;
    } else {
        if not (c == 102 and __json_word(r, "false")) {
            __json_fail(r, "expected true or false");
        };
        false;
    };
}

fn __json_null(r: JsonReader__) Bool {
    __json_peek(r) == 110 and __json_word(r, "null");
}

fn __json_digits(r: JsonReader__, at: I32) I32 {
    let i = at;
    while (i < r.n and r.text[i] >= 48 and r.text[i] <= 57) {
        i += 1;
    };
    i;
}

// Scan a number token from r.at. Returns its end, or -1 if it is malformed.
// kl is 1 when it has a fraction or an exponent.
fn __json_number_end(r: JsonReader__) I32 {
    let t = r.text;
    let i = r.at;
    if i < r.n and t[i] == 45 {
        i += 1;
    };
    let whole = i;
    i = __json_digits(r, i);
    if i == whole or (t[whole] == 48 and i - whole > 1) {
        return -1;
    };
    r.kl = 0;
    if i < r.n and t[i] == 46 {
        r.kl = 1;
        let fraction = i + 1;
        i = __json_digits(r, fraction);
        if i == fraction {
            return -1;
        };
    };
    if i < r.n and (t[i] == 101 or t[i] == 69) {
        r.kl = 1;
        i += 1;
        if i < r.n and (t[i] == 43 or t[i] == 45) {
            i += 1;
        };
        let exponent = i;
        i = __json_digits(r, exponent);
        if i == exponent {
            return -1;
        };
    };
    i;
}

fn __json_f64(r: JsonReader__) F64 {
    __json_ws(r);
    let start = r.at;
    let end = __json_number_end(r);
    if end < 0 {
        __json_fail(r, "expected a number");
        return 0.0;
    };
    r.at = end;
    let negative = r.text[start] == 45;
    let whole = if negative { start + 1; } else { start; };
    if r.kl == 0 and end - whole <= 15 {
        // Integers below 10^15 are exact in F64: no host call.
        let v = 0.0;
        for (whole..<end) |k| {
            v = v * 10.0 + (r.text[k] - 48).to_f64();
        };
        if negative { v * -1.0; } else { v; };
    } else {
        __json_number(r.text.slice(start, end));
    };
}

fn __json_f32(r: JsonReader__) F32 {
    __json_f64(r).to_f32();
}

// Integers are read exactly, digit by digit, on the negative side so that
// the minimum I64 fits.
fn __json_i64(r: JsonReader__) I64 {
    __json_ws(r);
    let start = r.at;
    let end = __json_number_end(r);
    if end < 0 or r.kl != 0 {
        __json_fail(r, "expected an integer");
        return 0;
    };
    let negative = r.text[start] == 45;
    let whole = if negative { start + 1; } else { start; };
    let v: I64 = 0;
    let limit: I64 = -922337203685477580;
    let overflow = false;
    for (whole..<end) |k| {
        let d = (r.text[k] - 48).to_i64();
        if v < limit or (v == limit and d > 8) {
            overflow = true;
        };
        v = v * 10 - d;
    };
    if overflow or (not negative and v == limit * 10 - 8) {
        __json_fail(r, "integer out of range");
        return 0;
    };
    r.at = end;
    if negative { v; } else { 0 - v; };
}

fn __json_i32(r: JsonReader__) I32 {
    __json_ws(r);
    let start = r.at;
    let v = __json_i64(r);
    let low: I64 = -2147483648;
    let high: I64 = 2147483647;
    if v < low or v > high {
        r.at = start;
        __json_fail(r, "integer out of range");
        0;
    } else {
        v.to_i32();
    };
}

fn __json_u32(r: JsonReader__) U32 {
    __json_ws(r);
    let start = r.at;
    let v = __json_i64(r);
    let high: I64 = 4294967295;
    if v < 0 or v > high {
        r.at = start;
        __json_fail(r, "integer out of range");
    };
    v.to_u32();
}

// Skip one value of any shape (unknown fields).
fn __json_skip(r: JsonReader__) void {
    let c = __json_peek(r);
    if c == 123 {
        r.at += 1;
        __json_enter(r);
        let more = __json_first(r, 125);
        while (more) {
            __json_span(r);
            __json_colon(r);
            __json_skip(r);
            more = __json_next(r, 125);
        };
    } else {
        if c == 91 {
            r.at += 1;
            __json_enter(r);
            let more = __json_first(r, 93);
            while (more) {
                __json_skip(r);
                more = __json_next(r, 93);
            };
        } else {
            if c == 34 {
                __json_span(r);
            } else {
                if c == 116 or c == 102 {
                    let flag = __json_bool(r);
                } else {
                    if not __json_null(r) {
                        let end = __json_number_end(r);
                        if end < 0 {
                            __json_fail(r, "expected a value");
                        } else {
                            r.at = end;
                        };
                    };
                };
            };
        };
    };
}

// Skip the remaining fields of an object whose first field was already read.
fn __json_rest(r: JsonReader__) void {
    let more = __json_next(r, 125);
    while (more) {
        __json_span(r);
        __json_colon(r);
        __json_skip(r);
        more = __json_next(r, 125);
    };
}

fn __json_describe(r: JsonReader__) Str {
    if r.failed == 0 {
        return "";
    };
    let line = 1;
    let column = 1;
    // A line ends at \\n, \\r\\n, or a lone \\r; a column counts characters
    // (not a surrogate pair's second half).
    for (0..<(r.failed - 1)) |i| {
        let c = r.text[i];
        if c == 10 or (c == 13 and (i + 1 >= r.text.len() or r.text[i + 1] != 10)) {
            line += 1;
            column = 1;
        } else if c < 56320 or c > 57343 {
            column += 1;
        };
    };
    let place = if r.where.len() > 0 { r.where + ": "; } else { ""; };
    place + r.reason + " at line " + line.to_str() + ", column " + column.to_str();
}

fn __json_writer(capacity: I32) JsonWriter__ {
    JsonWriter__ { buf: Array[I32].new_default(capacity), n: 0, names: __json_codes(__json_names()) };
}

// Make room for count more code units, so writes can skip the check.
fn __json_reserve(w: JsonWriter__, count: I32) void {
    if w.n + count > w.buf.len() {
        let grown = Array[I32].new_default(w.n * 2 + count + 16);
        grown.copy_from(0, w.buf, 0, w.n);
        w.buf = grown;
    };
}

fn __json_put(w: JsonWriter__, c: I32) void {
    __json_reserve(w, 1);
    w.buf[w.n] = c;
    w.n += 1;
}

fn __json_raw(w: JsonWriter__, s: Str) void {
    let n = s.len();
    __json_reserve(w, n);
    for (0..<n) |i| {
        w.buf[w.n + i] = s[i];
    };
    w.n += n;
}

// prefix, then "name": with the name copied from the table in one array.copy.
fn __json_name(w: JsonWriter__, prefix: I32, at: I32, n: I32) void {
    __json_reserve(w, n + 4);
    let o = w.n;
    if prefix != 0 {
        w.buf[o] = prefix;
        o += 1;
    };
    w.buf[o] = 34;
    w.buf.copy_from(o + 1, w.names, at, n);
    w.buf[o + n + 1] = 34;
    w.buf[o + n + 2] = 58;
    w.n = o + n + 3;
}

// "name", as an enum value.
fn __json_tag(w: JsonWriter__, at: I32, n: I32) void {
    __json_reserve(w, n + 2);
    w.buf[w.n] = 34;
    w.buf.copy_from(w.n + 1, w.names, at, n);
    w.buf[w.n + n + 1] = 34;
    w.n += n + 2;
}

fn __json_hex_digit(v: I32) I32 {
    if v < 10 { v + 48; } else { v + 87; };
}

fn __json_put_str(w: JsonWriter__, s: Str) void {
    let n = s.len();
    __json_reserve(w, n + 2);
    w.buf[w.n] = 34;
    w.n += 1;
    let i = 0;
    // Plain characters copy straight into reserved space.
    while (i < n) {
        let c = s[i];
        if c == 34 or c == 92 or c < 32 or (c >= 55296 and c <= 57343) {
            break;
        };
        w.buf[w.n] = c;
        w.n += 1;
        i += 1;
    };
    while (i < n) {
        let c = s[i];
        i += 1;
        if c == 34 or c == 92 {
            __json_put(w, 92);
            __json_put(w, c);
        } else {
            if c >= 55296 and c <= 57343 {
                // A surrogate pair as it is; a lone surrogate escaped, as JSON.stringify does.
                if c <= 56319 and i < n and s[i] >= 56320 and s[i] <= 57343 {
                    __json_put(w, c);
                    __json_put(w, s[i]);
                    i += 1;
                } else {
                    __json_raw(w, "\\\\u");
                    __json_put(w, __json_hex_digit(c >> 12));
                    __json_put(w, __json_hex_digit((c >> 8) & 15));
                    __json_put(w, __json_hex_digit((c >> 4) & 15));
                    __json_put(w, __json_hex_digit(c & 15));
                };
            } else if c >= 32 {
                __json_put(w, c);
            } else {
                match c {
                    10 => { __json_raw(w, "\\\\n"); },
                    13 => { __json_raw(w, "\\\\r"); },
                    9 => { __json_raw(w, "\\\\t"); },
                    ~> {
                        __json_raw(w, "\\\\u00");
                        __json_put(w, __json_hex_digit(c >> 4));
                        __json_put(w, __json_hex_digit(c & 15));
                    },
                };
            };
        };
    };
    __json_put(w, 34);
}

fn __json_put_i64(w: JsonWriter__, v: I64) void {
    __json_reserve(w, 20);
    if v < 0 {
        w.buf[w.n] = 45;
        w.n += 1;
    };
    // Digits of |v|, worked out on the negative side so the minimum I64 fits.
    let m = if v < 0 { v; } else { 0 - v; };
    let start = w.n;
    let more = true;
    while (more) {
        w.buf[w.n] = 48 - (m % 10).to_i32();
        w.n += 1;
        m = m / 10;
        more = m != 0;
    };
    let a = start;
    let b = w.n - 1;
    while (a < b) {
        let c = w.buf[a];
        w.buf[a] = w.buf[b];
        w.buf[b] = c;
        a += 1;
        b -= 1;
    };
}

fn __json_put_f64(w: JsonWriter__, x: F64) void {
    if x > -9007199254740992.0 and x < 9007199254740992.0 {
        let whole = x.to_i64();
        if whole.to_f64() == x {
            __json_put_i64(w, whole);
            return;
        };
    };
    __json_raw(w, __json_float_text(x));
}

fn __json_put_f32(w: JsonWriter__, x: F32) void {
    let wide = x.to_f64();
    if wide > -16777216.0 and wide < 16777216.0 and wide.to_i64().to_f64() == wide {
        __json_put_i64(w, wide.to_i64());
    } else {
        if wide - wide == 0.0 {
            __json_raw(w, x.to_str());
        } else {
            __json_raw(w, "null");
        };
    };
}
`.replaceAll("@@IR_WASM@@",M)],["std:List",`mod List[T] {
    // Persistent edits; the input remains unchanged.
    fn append(self: Array[T], value: T) Array[T] {
        let result = Array[T].new(self.len() + 1, value);
        let i = 0;
        while (i < self.len()) { result[i] = self[i]; i += 1; };
        result;
    }
    fn remove_at(self: Array[T], index: I32) Array[T] {
        if index < 0 or index >= self.len() { self; } else {
            let result = Array[T].new(self.len() - 1, self[0]);
            let i = 0;
            while (i < result.len()) { result[i] = self[if i < index { i; } else { i + 1; }]; i += 1; };
            result;
        };
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:LiteralDefaults",`// std/LiteralDefaults.utu \u2014 default static type for each literal syntax kind
//
// The compiler reads <ir-literal-defaults> during type inference to decide
// what \`data-type-name\` to stamp on every literal.  Each <ir-default kind="X"
// type-name="Y"/> says: a literal whose parse-kind is X is typed as Y.
//
// Changing a default is a stdlib edit, not a compiler edit.  To make int
// literals default to I64, swap the line below; nothing else needs to move.
//
// \`adopts\` lists the types a literal of that kind may take on when its context
// declares one \u2014 \`let x: I64 = 0\` types the literal as I64 rather than
// defaulting to I32 and then failing.  The default only applies when nothing
// better is known.
//
// An int literal may also adopt F32/F64 where context asks for a float
// (\`fillRect(0, 0, 10, 10)\`); it still defaults to I32 on its own.
//
// This list is nominal, not representational: \`Bool\` is a wasm i32 like \`I32\`
// is, but it is not in \`adopts\` for int, so \`takes_bool(1)\` is still an error.
// Sharing a representation must never make two types interchangeable \u2014 see
// TYPES.md.

mod LiteralDefaults {
    type LiteralDefaults = @ir/\\
      <ir-literal-defaults>
        <ir-default kind="int" type-name="I32" adopts="I32 U32 I64 U64 M32 M64 F32 F64"/>
        <ir-default kind="float" type-name="F64" adopts="F32 F64"/>
        <ir-default kind="bool" type-name="Bool"/>
        <ir-default kind="string" type-name="Str"/>
        <ir-default kind="string-multi" type-name="Str"/>
        <ir-default kind="null" type-name="null"/>
      </ir-literal-defaults>
    \\/
}
`.replaceAll("@@IR_WASM@@",M)],["std:M128",`// std/M128.utu \u2014 M128 bitmask type module
// & is a 128-bit SIMD mask value (same wasm representation as V128).
// Used for lane-selection in SIMD operations.
// Supports bitwise ops; interpreted as four 32-bit lanes of all-zeros/all-ones.

mod M128 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-v128"/> \\/

    fn zero() & { @ir/\\ <ir-v128-const data-type-name="M128" bytes="0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"/> \\/; }
    fn ones() & { @ir/\\ <ir-v128-const data-type-name="M128" bytes="255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255"/> \\/; }

    fn &:band |a, b| & { @ir/\\ <ir-v128-and><ir-ident name="a"/><ir-ident name="b"/></ir-v128-and> \\/; }
    fn &:bor  |a, b| & { @ir/\\ <ir-v128-or><ir-ident name="a"/><ir-ident name="b"/></ir-v128-or> \\/; }
    fn &:bxor |a, b| & { @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/; }
    fn &:bnot |a| & { @ir/\\ <ir-v128-not><ir-ident name="a"/></ir-v128-not> \\/; }
    fn &:eq   |a, b| & {
        @ir/\\ <ir-v128-not><ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor></ir-v128-not> \\/;
    }
    fn &:ne   |a, b| & {
        @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/;
    }

    // Select lanes from two vectors using this mask (all-ones = take from a, all-zeros = take from b).
    fn bitselect(a: M128, b: M128, mask: M128) M128 {
        @ir/\\ <ir-v128-bitselect>
            <ir-ident name="a"/>
            <ir-ident name="b"/>
            <ir-ident name="mask"/>
        </ir-v128-bitselect> \\/;
    }
    fn andnot(a: M128, b: M128) M128 {
        @ir/\\ <ir-v128-andnot><ir-ident name="a"/><ir-ident name="b"/></ir-v128-andnot> \\/;
    }
    fn any_true(a: M128) Bool {
        @ir/\\ <ir-v128-any-true><ir-ident name="a"/></ir-v128-any-true> \\/;
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:M32",`// std/M32.utu \u2014 M32 bitmask type module
// & is a 32-bit bitmask value (same wasm representation as I32).
// Intended for use as a lane-selection mask, not a general integer.
// Supports bitwise and comparison ops; arithmetic (add/sub/mul) is excluded.
// A mask has no sign: \`>>\` is a logical shift, the same as \`>>>\` (zeros in).

mod M32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:band |a, b| & { @ir/\\ <ir-i32-and><ir-ident name="a"/><ir-ident name="b"/></ir-i32-and> \\/; }
    fn &:bor  |a, b| & { @ir/\\ <ir-i32-or><ir-ident name="a"/><ir-ident name="b"/></ir-i32-or> \\/; }
    fn &:bxor |a, b| & { @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i32-xor> \\/; }
    // wasm has no bitwise not; synthesise it as xor with the all-ones mask.
    fn &:bnot |a| & { @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I32" value="-1"/></ir-i32-xor> \\/; }
    fn &:shl  |a, b| & { @ir/\\ <ir-i32-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shl> \\/; }
    fn &:shr  |a, b| & { @ir/\\ <ir-i32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-u> \\/; }
    fn &:ushr |a, b| & { @ir/\\ <ir-i32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-u> \\/; }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-i32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i32-eq> \\/; }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-i32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ne> \\/; }
}
`.replaceAll("@@IR_WASM@@",M)],["std:M64",`// std/M64.utu \u2014 M64 bitmask type module
// & is a 64-bit bitmask value (same wasm representation as I64).
// Intended for use as a lane-selection mask, not a general integer.
// Supports bitwise and comparison ops; arithmetic (add/sub/mul) is excluded.
// A mask has no sign: \`>>\` is a logical shift, the same as \`>>>\` (zeros in).

mod M64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i64"/> \\/

    fn &:band |a, b| & { @ir/\\ <ir-i64-and><ir-ident name="a"/><ir-ident name="b"/></ir-i64-and> \\/; }
    fn &:bor  |a, b| & { @ir/\\ <ir-i64-or><ir-ident name="a"/><ir-ident name="b"/></ir-i64-or> \\/; }
    fn &:bxor |a, b| & { @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i64-xor> \\/; }
    // wasm has no bitwise not; synthesise it as xor with the all-ones mask.
    fn &:bnot |a| & { @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I64" value="-1"/></ir-i64-xor> \\/; }
    fn &:shl  |a, b| & { @ir/\\ <ir-i64-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shl> \\/; }
    fn &:shr  |a, b| & { @ir/\\ <ir-i64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-u> \\/; }
    fn &:ushr |a, b| & { @ir/\\ <ir-i64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-u> \\/; }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-i64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i64-eq> \\/; }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-i64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i64-ne> \\/; }
}
`.replaceAll("@@IR_WASM@@",M)],["std:NumberField",`// Keep the user's draft, including empty/invalid text, separate from a number.
mod NumberField {
    struct &:
        | text: Str
    fn &.new(text: Str) & { &{ text: text }; }
    fn &.valid |self| (min: F64, max: F64) Bool {
        let check: fun(Str, F64, F64) Bool = @es/\\ (text,min,max)=>text.trim()!==''&&Number.isFinite(Number(text))&&Number(text)>=min&&Number(text)<=max \\/;
        check(self.text,min,max);
    }
    fn &.value |self| () F64 {
        let parse: fun(Str) F64 = @es/\\ text=>Number(text) \\/;
        parse(self.text);
    }
    fn &.error |self| (min: F64, max: F64) Str {
        if self.valid(min,max) { ""; } else { "Enter a number within the allowed range."; };
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Ord",`//! An order, for bounded modules: \`using Ord from std:Ord;\` and
//! \`using Order from std:Ord;\`.
//!
//! \`Ord\` is a protocol: \`a.cmp(b)\` is negative when a comes first, zero
//! when they tie, positive when b does. The numbers and Str implement it
//! here; a type of your own implements it with \`fn Ord[T].cmp\`. \`Order\`
//! is what a bounded module does with it, for any T that implements Ord:
//! each call is T's own \`cmp\`, chosen when the module is instantiated.
//!
//! \`\`\`
//! Order[I32].max(3, 9);                 // 9
//! let words = ["pear", "fig", "apple"];
//! Order[Str].sort(words);               // apple fig pear
//! Order[Str].search(words, "fig");      // 1
//! \`\`\`

mod Ord {
    /// \`&\` is the type implementing it: an I32 compares with an I32.
    proto &:
        | cmp(&) I32

    fn Ord[I32].cmp |a| (b: I32) I32 { if a < b { -1; } else if a > b { 1; } else { 0; }; }
    fn Ord[U32].cmp |a| (b: U32) I32 { if a < b { -1; } else if a > b { 1; } else { 0; }; }
    fn Ord[I64].cmp |a| (b: I64) I32 { if a < b { -1; } else if a > b { 1; } else { 0; }; }
    fn Ord[U64].cmp |a| (b: U64) I32 { if a < b { -1; } else if a > b { 1; } else { 0; }; }
    /// NaN ties with everything.
    fn Ord[F32].cmp |a| (b: F32) I32 { if a < b { -1; } else if a > b { 1; } else { 0; }; }
    /// NaN ties with everything.
    fn Ord[F64].cmp |a| (b: F64) I32 { if a < b { -1; } else if a > b { 1; } else { 0; }; }

    /// By UTF-16 code units, as JavaScript's \`<\` orders strings.
    fn Ord[Str].cmp |a| (b: Str) I32 {
        let n = if a.len() < b.len() { a.len(); } else { b.len(); };
        for (0 ..< n) |i| {
            if a[i] != b[i] { return a[i] - b[i]; };
        };
        a.len() - b.len();
    }
}

mod Order[T[Ord]] {
    /// The greater of two (a, when they tie).
    fn max(a: T, b: T) T { if b.cmp(a) > 0 { b; } else { a; }; }

    /// The lesser of two (a, when they tie).
    fn min(a: T, b: T) T { if b.cmp(a) < 0 { b; } else { a; }; }

    /// \`x\`, or the nearer of \`low\` and \`high\` when it is outside them.
    /// With \`low\` after \`high\`: \`low\` when \`x\` is before \`low\`, else \`high\`.
    fn clamp(x: T, low: T, high: T) T {
        if x.cmp(low) < 0 { low; } else if x.cmp(high) > 0 { high; } else { x; };
    }

    /// Whether each element comes before or ties with the next.
    fn is_sorted(xs: Array[T]) Bool {
        for (1 ..< xs.len()) |i| {
            if xs[i - 1].cmp(xs[i]) > 0 { return false; };
        };
        true;
    }

    /// Sorts \`xs\` in place, first to last, keeping ties in their order: a
    /// merge sort, O(n log n).
    fn sort(xs: Array[T]) void {
        let n = xs.len();
        if n < 2 { return; };
        let from = xs;
        let to = Array[T].new(n, xs[0]);
        let width = 1;
        let back = false;   // whether the sorted run is in the copy, not xs
        while (width < n) {
            let lo = 0;
            while (lo < n) {
                let mid = if lo + width < n { lo + width; } else { n; };
                let hi = if mid + width < n { mid + width; } else { n; };
                let i = lo;
                let j = mid;
                for (lo ..< hi) |k| {
                    if i < mid and (j >= hi or from[i].cmp(from[j]) <= 0) {
                        to[k] = from[i];
                        i += 1;
                    } else {
                        to[k] = from[j];
                        j += 1;
                    };
                };
                lo = hi;
            };
            let t = from;
            from = to;
            to = t;
            back = not back;
            width *= 2;
        };
        if back { for (0 ..< n) |k| { xs[k] = from[k]; }; };
    }

    /// Where \`x\` is in sorted \`xs\`, or -1.
    fn search(xs: Array[T], x: T) I32 {
        let lo = 0;
        let hi = xs.len();
        while (lo < hi) {
            let mid = lo + (hi - lo) / 2;
            let c = xs[mid].cmp(x);
            if c == 0 { return mid; };
            if c < 0 { lo = mid + 1; } else { hi = mid; };
        };
        -1;
    }

    /// The greatest element of \`xs\`, the first of those that tie; \`xs\` is not empty.
    fn max_of(xs: Array[T]) T {
        let best = xs[0];
        for (1 ..< xs.len()) |i| { if xs[i].cmp(best) > 0 { best = xs[i]; }; };
        best;
    }

    /// The least element of \`xs\`, the first of those that tie; \`xs\` is not empty.
    fn min_of(xs: Array[T]) T {
        let best = xs[0];
        for (1 ..< xs.len()) |i| { if xs[i].cmp(best) < 0 { best = xs[i]; }; };
        best;
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:PersistentSegmentTree",`// Immutable versions of an ordered monoid index. Point updates share untouched
// branches, allocating O(log n) new nodes. combine must be pure and associative.
mod PersistentSegmentTree[T] {
    struct Node:
        | value: T
        | left: ?Node
        | right: ?Node

    struct &:
        | root: ?Node
        | length: I32
        | identity: T

    fn build(values: Array[T], start: I32, end_: I32, combine: fun(T, T) T) ?Node {
        if start == end_ { return null; };
        if end_ - start == 1 {
            return Node { value: values[start], left: null, right: null };
        };
        let mid = start + (end_ - start) / 2;
        let left = build(values, start, mid, combine) orelse fatal;
        let right = build(values, mid, end_, combine) orelse fatal;
        Node { value: combine(left.value, right.value), left: left, right: right };
    }

    fn &.new(values: Array[T], identity: T, combine: fun(T, T) T) & {
        &{ root: build(values, 0, values.len(), combine), length: values.len(), identity: identity };
    }

    fn replace(node: Node, start: I32, end_: I32, index: I32, value: T, combine: fun(T, T) T) Node {
        if end_ - start == 1 {
            return Node { value: value, left: null, right: null };
        };
        let mid = start + (end_ - start) / 2;
        let left = node.left orelse fatal;
        let right = node.right orelse fatal;
        if index < mid {
            left = replace(left, start, mid, index, value, combine);
        } else {
            right = replace(right, mid, end_, index, value, combine);
        };
        Node { value: combine(left.value, right.value), left: left, right: right };
    }

    fn &.set |self| (index: I32, value: T, combine: fun(T, T) T) & {
        if index < 0 or index >= self.length { fatal; };
        &{
            root: replace(self.root orelse fatal, 0, self.length, index, value, combine),
            length: self.length,
            identity: self.identity,
        };
    }

    fn range(node: ?Node, start: I32, end_: I32, low: I32, high: I32, identity: T, combine: fun(T, T) T) T {
        if low >= end_ or high <= start { return identity; };
        let current = node orelse fatal;
        if low <= start and end_ <= high { return current.value; };
        let mid = start + (end_ - start) / 2;
        combine(
            range(current.left, start, mid, low, high, identity, combine),
            range(current.right, mid, end_, low, high, identity, combine)
        );
    }

    fn &.query |self| (start: I32, end_: I32, combine: fun(T, T) T) T {
        if start < 0 or end_ < start or end_ > self.length { fatal; };
        range(self.root, 0, self.length, start, end_, self.identity, combine);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Prelude",`// std/prelude.utu \u2014 automatically injected into every compilation
//
// Every name listed here is visible in user code without an explicit \`using\`.
// The compiler prepends these modules before processing any file.
//
// Scalar value types (stack-allocated, never nullable):
//   I32, U32, I64, U64 \u2014 signed/unsigned integers
//   F32, F64           \u2014 floating-point
//   Bool               \u2014 boolean (I32 underneath, 0=false 1=true)
//   M32, M64, M128     \u2014 bitmask integers (32/64/128-bit)
//   V128               \u2014 128-bit SIMD vector
//
// Reference types (heap-allocated, nullable via ?T):
//   Str                \u2014 Binaryen stringref-backed host string
//   Externref          \u2014 opaque host (JavaScript) reference
//   I31                \u2014 31-bit integer packed into a GC reference
//
// Generic collections:
//   Array              \u2014 mutable GC Array, parameterised by element type
//   Result[T, E]       \u2014 a value or an error; \`try\` passes the error on
//
// Compiler directives:
//   Promise[T]        \u2014 a real JavaScript promise, held as an externref
//   Stream[T]         \u2014 a real JavaScript async iterable, read with \`await for\`
//   LiteralDefaults   \u2014 \`<ir-literal-defaults>\` map for type inference

using I32              from std:I32;
using U32              from std:U32;
using I64              from std:I64;
using U64              from std:U64;
using F32              from std:F32;
using F64              from std:F64;
using Bool             from std:Bool;
using M32              from std:M32;
using M64              from std:M64;
using M128             from std:M128;
using V128             from std:V128;
using Str              from std:Str;
using Externref        from std:Externref;
using I31              from std:I31;
using Array            from std:Array;
using Promise          from std:Promise;
using Stream           from std:Stream;
using LiteralDefaults from std:LiteralDefaults;
using Found from std:Found;
using Group from std:Group;
using Result from std:Result;
using wutu from std:Wutu;
`.replaceAll("@@IR_WASM@@",M)],["std:Promise",`// std/Promise.utu \u2014 Promise[T]
//
// & maps to WebAssembly externref, so a \`Promise[T]\` IS a real JavaScript
// promise. Nothing is wrapped, boxed, or marshalled: a promise obtained from
// \`fetch\` is the same object utu passes back to JS, and a promise utu produces
// is directly \`await\`-able from JS.
//
// This is the same decision as \`cl\` \u2014 see new_spec2.md. Many distinct nominal
// types share the Externref representation (TYPES.md), so \`Promise[Str]\` and
// \`Promise[I32]\` are different utu types that the typechecker keeps apart while
// codegen treats both as externref.
//
// Two ways to consume one:
//
//   p.then(cl(v) { \u2026 })   works on every JS host, no suspension involved
//   await p               straight-line code; needs a JSPI-capable host
//
// \`then\` is the portable floor and \`await\` is the ergonomic layer over it.

mod Promise[T1] {
    type & = @ir/\\ <@@IR_WASM@@ref type-repr="wasm-externref"/> \\/

    // Subscribe to fulfilment. \`on_value\` is a \`cl\`, so it is already a JS
    // function \u2014 the host hands it straight to \`p.then\` with nothing between.
    // Both operands are externref whatever T1 is, so this needs one host
    // import rather than one per instantiation.
    // On rejection: with a \`catch\` on the same promise, attached before it
    // settles, only that \`catch\` runs. Without one, the rejection is reported
    // as unhandled, as JS's \`p.then(f)\` would. A trap in \`on_value\` is reported.
    fn &.then |self| (on_value: cl(T1) void) void {
        @ir/\\ <ir-promise-then><ir-ident name="self"/><ir-ident name="on_value"/></ir-promise-then> \\/;
    }

    // Subscribe to rejection. The reason is an opaque host value. Marks the
    // promise handled, so a \`then\` on it no longer reports the rejection.
    fn &.catch |self| (on_error: cl(Externref) void) void {
        @ir/\\ <ir-promise-catch><ir-ident name="self"/><ir-ident name="on_error"/></ir-promise-catch> \\/;
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Random",`//! Seeded random numbers: \`using Random from std:Random;\`.
//!
//! xoshiro128\\*\\* (Blackman and Vigna), in utu: the same seed gives the
//! same numbers on every host, and nothing crosses to JavaScript (unless
//! the seed comes from the host, with \`from_host\`).
//!
//! \`\`\`
//! let r = Random.new(42);
//! r.int(1, 7);   // a die
//! r.float();     // in [0, 1)
//! \`\`\`

mod Random {
    struct &:
        | a : I32
        | b : I32
        | c : I32
        | d : I32

    /// A generator seeded with \`seed\`: the state is filled by splitmix32, so
    /// nearby seeds give unrelated numbers.
    fn &.new(seed: I32) & { seeded(seed); }

    /// A generator seeded from the host's randomness (\`crypto.getRandomValues\`).
    fn &.from_host() & {
        let seed: fun() I32 = @es/\\ () => crypto.getRandomValues(new Int32Array(1))[0] \\/;
        seeded(seed());
    }

    /// The next 32 random bits.
    fn &.bits |self| () I32 {
        let result = rotl(self.b * 5, 7) * 9;
        let t = self.b << 9;
        self.c = self.c ^ self.a;
        self.d = self.d ^ self.b;
        self.b = self.b ^ self.c;
        self.a = self.a ^ self.d;
        self.c = self.c ^ t;
        self.d = rotl(self.d, 11);
        result;
    }

    /// A number in [0, 1), with 32 random bits.
    fn &.float |self| () F64 {
        self.bits().to_u32().to_f64() / 4294967296.0;
    }

    /// An integer in [\`low\`, \`high\`), every one equally likely (empty: \`low\`).
    fn &.int |self| (low: I32, high: I32) I32 {
        if high <= low { return low; };
        let span = (high - low).to_u32().to_u64();
        // Lemire's method: a multiply, and a retry only when a value would be biased.
        let product = self.bits().to_u32().to_u64() * span;
        let fraction = product.to_u32();
        if fraction < span.to_u32() {
            let threshold = (0.to_u32() - span.to_u32()) % span.to_u32();
            while (fraction < threshold) {
                product = self.bits().to_u32().to_u64() * span;
                fraction = product.to_u32();
            };
        };
        low + (product >> 32.to_u64()).to_i32();
    }

    /// True with probability \`p\`.
    fn &.chance |self| (p: F64) Bool { self.float() < p; }

    fn seeded(seed: I32) & {
        let s = seed + -1640531527;
        &{ a: mix(s), b: mix(s + -1640531527), c: mix(s - 1013904242), d: mix(s + 626627285) };
    }

    // splitmix32's output function.
    fn mix(x: I32) I32 {
        let z = x;
        z = (z ^ (z >>> 16)) * -2048144789;
        z = (z ^ (z >>> 13)) * -1028477387;
        z ^ (z >>> 16);
    }

    fn rotl(x: I32, k: I32) I32 { (x << k) | (x >>> (32 - k)); }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Result",`//! \`Result[T, E]\`: a value of type T, or the error E that kept it from being
//! made. It is for failures a caller should expect (input that does not
//! parse, a key that is missing); a bug stays \`fatal\` or \`assert\`.
//!
//! \`\`\`
//! fn half(n: I32) Result[I32, Str] {
//!     if n % 2 != 0 { return Result[I32, Str].err("odd"); };
//!     Result[I32, Str].ok(n / 2);
//! }
//!
//! fn quarter(n: I32) Result[I32, Str] {
//!     let h = try half(n);           // half's error is quarter's
//!     half(h);
//! }
//! \`\`\`
//!
//! \`try r\` is r's value when it is ok; otherwise the function returns r's
//! error, running its pending \`errdefer\`s and \`defer\`s, newest first. The
//! function must return a Result with the same error type.
//!
//! It is an ordinary struct. The field not given holds Wasm's default (zero,
//! or null for a reference) and is never read: fields whose names start with
//! \`_\` belong to the standard library, so a program cannot see them.
mod Result[T, E] {
    struct &:
        | _ok: Bool
        | _value: T
        | _error: E

    /// A success holding \`value\`.
    fn &.ok(value: T) & { &{ _ok: true, _value: value }; }

    /// A failure holding \`error\`.
    fn &.err(error: E) & { &{ _ok: false, _error: error }; }

    fn &.is_ok |self| () Bool { self._ok; }

    fn &.is_err |self| () Bool { not self._ok; }

    /// The value; fatal when it is an error.
    fn &.value |self| () T {
        if not self._ok { fatal; };
        self._value;
    }

    /// The error; fatal when it is a value.
    fn &.error |self| () E {
        if self._ok { fatal; };
        self._error;
    }

    /// The value, or \`fallback\` when it is an error.
    fn &.value_or |self| (fallback: T) T { if self._ok { self._value; } else { fallback; }; }
}
`.replaceAll("@@IR_WASM@@",M)],["std:SegmentTree",`// An ordered monoid index. combine must be associative and identity neutral.
// Build O(n), point replacement / half-open range query O(log n), space O(n).
mod SegmentTree[T] {
    struct &:
        | nodes: Array[T]
        | size: I32
        | length: I32
        | identity: T

    fn &.new(values: Array[T], identity: T, combine: fun(T, T) T) & {
        let size = 1;
        while (size < values.len()) {
            if size > 536870911 { fatal; };
            size *= 2;
        };
        let nodes = Array[T].new(size * 2, identity);
        values each |value, index| {
            nodes[size + index.to_i64().to_i32()] = value;
        };
        let i = size - 1;
        while (i > 0) {
            nodes[i] = combine(nodes[i * 2], nodes[i * 2 + 1]);
            i -= 1;
        };
        &{ nodes: nodes, size: size, length: values.len(), identity: identity };
    }

    fn &.set |self| (index: I32, value: T, combine: fun(T, T) T) void {
        if index < 0 or index >= self.length { fatal; };
        let i = self.size + index;
        self.nodes[i] = value;
        while (i > 1) {
            i /= 2;
            self.nodes[i] = combine(self.nodes[i * 2], self.nodes[i * 2 + 1]);
        };
    }

    fn &.query |self| (start: I32, end_: I32, combine: fun(T, T) T) T {
        if start < 0 or end_ < start or end_ > self.length { fatal; };
        let left = start + self.size;
        let right = end_ + self.size;
        let before = self.identity;
        let after = self.identity;
        while (left < right) {
            if left % 2 == 1 {
                before = combine(before, self.nodes[left]);
                left += 1;
            };
            if right % 2 == 1 {
                right -= 1;
                after = combine(self.nodes[right], after);
            };
            left /= 2;
            right /= 2;
        };
        combine(before, after);
    }

    // First index whose inclusive prefix satisfies a monotone false->true predicate.
    // Returns length if no prefix satisfies it; requires nonempty-prefix semantics.
    fn &.first_prefix |self| (matches: fun(T) Bool, combine: fun(T, T) T) I32 {
        if self.length == 0 or not matches(self.nodes[1]) { return self.length; };
        let i = 1;
        let before = self.identity;
        while (i < self.size) {
            let candidate = combine(before, self.nodes[i * 2]);
            if matches(candidate) {
                i *= 2;
            } else {
                before = candidate;
                i = i * 2 + 1;
            };
        };
        i - self.size;
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Spatial",`using Buffer from std:Buffer;

// Static priority search tree: minimum y at each node, balanced x partitions.
// Coordinates are copied at construction. Query results are caller-supplied IDs.
mod Spatial {
    struct Point:
        | x: F64
        | y: F64
        | id: I32

    // Keep squared distances finite, including the difference of two coordinates.
    fn check_coordinate(value: F64) void {
        if value != value or F64.abs(value) > 1.0e150 { fatal; };
    }

    fn point(x: F64, y: F64, id: I32) Point {
        Point { x: x, y: y, id: id };
    }

    struct Node:
        | point: Point
        | left: ?Node
        | right: ?Node
        | min_x: F64
        | max_x: F64
        | min_y: F64
        | max_y: F64

    struct &:
        | root: ?Node

    fn build(points: Array[Point]) ?Node {
        if points.len() == 0 { return null; };
        let best = 0;
        let max_y = points[0].y;
        let i = 1;
        while (i < points.len()) {
            if points[i].y < points[best].y { best = i; };
            if points[i].y > max_y { max_y = points[i].y; };
            i += 1;
        };
        let rest = points filter |point, index| {
            index.to_i64().to_i32() != best;
        } collect(Point);
        let mid = rest.len() / 2;
        Node {
            point: points[best],
            left: build(rest.slice(0, mid)),
            right: build(rest.slice(mid, rest.len())),
            min_x: points[0].x,
            max_x: points[points.len() - 1].x,
            min_y: points[best].y,
            max_y: max_y
        };
    }

    fn &.new(points: Array[Point]) & {
        let copied = points map |point| {
            check_coordinate(point.x);
            check_coordinate(point.y);
            Point { x: point.x, y: point.y, id: point.id };
        } sort(Point) |a, b| {
            a.x < b.x or (a.x == b.x and a.id < b.id);
        };
        &{ root: build(copied) };
    }

    fn rectangle(node: ?Node, min_x: F64, max_x: F64, min_y: F64, max_y: F64, out: Buffer[I32]) void {
        promote node {
            |current| => {
                if current.max_x < min_x or current.min_x > max_x
                    or current.max_y < min_y or current.min_y > max_y { return; };
                let point = current.point;
                if point.x >= min_x and point.x <= max_x and point.y >= min_y and point.y <= max_y {
                    out.push(point.id);
                };
                rectangle(current.left, min_x, max_x, min_y, max_y, out);
                rectangle(current.right, min_x, max_x, min_y, max_y, out);
            },
            ~> {},
        };
    }

    fn &.within |self| (min_x: F64, max_x: F64, min_y: F64, max_y: F64) Array[I32] {
        check_coordinate(min_x);
        check_coordinate(max_x);
        check_coordinate(min_y);
        check_coordinate(max_y);
        if min_x > max_x or min_y > max_y { fatal; };
        let out = Buffer[I32].new();
        rectangle(self.root, min_x, max_x, min_y, max_y, out);
        out.finish();
    }

    // Three-sided reporting: inclusive x interval, y <= ceiling.
    fn below_node(node: ?Node, min_x: F64, max_x: F64, ceiling: F64, out: Buffer[I32]) void {
        promote node {
            |current| => {
                if current.max_x < min_x or current.min_x > max_x or current.min_y > ceiling { return; };
                if current.point.x >= min_x and current.point.x <= max_x {
                    out.push(current.point.id);
                };
                below_node(current.left, min_x, max_x, ceiling, out);
                below_node(current.right, min_x, max_x, ceiling, out);
            },
            ~> {},
        };
    }

    fn &.below |self| (min_x: F64, max_x: F64, ceiling: F64) Array[I32] {
        check_coordinate(min_x);
        check_coordinate(max_x);
        check_coordinate(ceiling);
        if min_x > max_x { fatal; };
        let out = Buffer[I32].new();
        below_node(self.root, min_x, max_x, ceiling, out);
        out.finish();
    }

    fn box_distance(node: Node, x: F64, y: F64) F64 {
        let dx = if x < node.min_x { node.min_x - x; } else {
            if x > node.max_x { x - node.max_x; } else { 0.0; };
        };
        let dy = if y < node.min_y { node.min_y - y; } else {
            if y > node.max_y { y - node.max_y; } else { 0.0; };
        };
        dx * dx + dy * dy;
    }

    fn radius_node(node: ?Node, x: F64, y: F64, squared: F64, out: Buffer[I32]) void {
        promote node {
            |current| => {
                if box_distance(current, x, y) > squared { return; };
                let dx = current.point.x - x;
                let dy = current.point.y - y;
                if dx * dx + dy * dy <= squared { out.push(current.point.id); };
                radius_node(current.left, x, y, squared, out);
                radius_node(current.right, x, y, squared, out);
            },
            ~> {},
        };
    }

    fn &.radius |self| (x: F64, y: F64, radius: F64) Array[I32] {
        check_coordinate(x);
        check_coordinate(y);
        check_coordinate(radius);
        if radius < 0.0 { fatal; };
        let out = Buffer[I32].new();
        radius_node(self.root, x, y, radius * radius, out);
        out.finish();
    }

    struct Nearest:
        | id: I32
        | squared: F64

    fn nearest_node(node: ?Node, x: F64, y: F64, best: Nearest) void {
        promote node {
            |current| => {
                if box_distance(current, x, y) > best.squared { return; };
                let dx = current.point.x - x;
                let dy = current.point.y - y;
                let squared = dx * dx + dy * dy;
                if squared < best.squared or (squared == best.squared and current.point.id < best.id) {
                    best.id = current.point.id;
                    best.squared = squared;
                };
                nearest_node(current.left, x, y, best);
                nearest_node(current.right, x, y, best);
            },
            ~> {},
        };
    }

    fn &.nearest |self| (x: F64, y: F64) ?Found[I32] {
        check_coordinate(x);
        check_coordinate(y);
        promote self.root {
            |root| => {
                let dx = root.point.x - x;
                let dy = root.point.y - y;
                let best = Nearest { id: root.point.id, squared: dx * dx + dy * dy };
                nearest_node(root, x, y, best);
                Found[I32].new(best.id);
            },
            ~> null,
        };
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Str",`// std/Str.utu \u2014 Str string reference type module
// & maps to Binaryen's stringref-backed host string model.
// This is a deliberate Binaryen feature, not a core Wasm GC heap type like
// arrays or structs. Utu treats it as a first-class type because Binaryen is
// the backend and can optimize JS-style string operations directly.
// They ARE nullable: ?Str is valid.
//
// Operator overloads:
//   s1 + s2    \u2192 Str:add(s1, s2)   \u2014 concatenation
//   s1 == s2   \u2192 Str:eq(s1, s2)    \u2014 equality
//   s1 != s2   \u2192 Str:ne(s1, s2)    \u2014 inequality
//   s1 < s2 (<=, >, >=) \u2192 Str:lt(s1, s2) \u2026 \u2014 order by UTF-16 code units

mod Str {
    type & = @ir/\\ <@@IR_WASM@@ref type-repr="wasm-stringref"/> \\/

    // Concatenation via the + operator.
    fn &:add |a, b| & { @ir/\\ <ir-string-concat><ir-ident name="a"/><ir-ident name="b"/></ir-string-concat> \\/; }

    // Equality \u2014 structural (content) comparison.
    fn &:eq |a, b| Bool { @ir/\\ <ir-string-eq><ir-ident name="a"/><ir-ident name="b"/></ir-string-eq> \\/; }
    fn &:ne |a, b| Bool { @ir/\\ <ir-string-ne><ir-ident name="a"/><ir-ident name="b"/></ir-string-ne> \\/; }

    // Order: by UTF-16 code units, as JavaScript compares strings ("B" < "a").
    fn &:lt |a, b| Bool { compare(a, b) < 0; }
    fn &:le |a, b| Bool { compare(a, b) <= 0; }
    fn &:gt |a, b| Bool { compare(a, b) > 0; }
    fn &:ge |a, b| Bool { compare(a, b) >= 0; }

    // -1, 0, or 1: a before, equal to, or after b, by UTF-16 code units.
    fn compare(a: &, b: &) I32 {
        let n = len(a);
        let m = len(b);
        let i = 0;
        while (i < n and i < m) {
            let x = get(a, i);
            let y = get(b, i);
            if x != y {
                if x < y { return -1; };
                return 1;
            };
            i += 1;
        };
        if n < m { -1; } else if n > m { 1; } else { 0; };
    }

    // Number of UTF-16 code units in the host string.
    fn len(s: &) I32 {
        @ir/\\ <ir-string-measure-utf16><ir-ident name="s"/></ir-string-measure-utf16> \\/;
    }

    // Substring [start, end) \u2014 returns a new string. An end past the string
    // stops at its end, as in JavaScript; a negative start or an end before
    // start traps in --safe builds, as Array's slice does.
    fn slice(s: &, start: I32, end_: I32) & {
        if checks() and (start < 0 or end_ < start) { fatal; };
        slice_unchecked(s, start, end_);
    }

    // \`slice\` without the --safe check: a negative index reads as unsigned.
    fn slice_unchecked(s: &, start: I32, end_: I32) & {
        @ir/\\ <ir-string-slice-wtf16>
            <ir-ident name="s"/>
            <ir-ident name="start"/>
            <ir-ident name="end_"/>
        </ir-string-slice-wtf16> \\/;
    }

    // Read one UTF-16 code unit at index i.
    fn get(s: &, i: I32) I32 {
        @ir/\\ <ir-string-get-wtf16><ir-ident name="s"/><ir-ident name="i"/></ir-string-get-wtf16> \\/;
    }

    // A one-code-point string.
    fn from_code_point(code: I32) & {
        @ir/\\ <ir-string-from-code-point><ir-ident name="code"/></ir-string-from-code-point> \\/;
    }

    // The first \`count\` UTF-16 code units of \`codes\`, as one string. Build
    // text in an Array[I32] and convert once, rather than concatenating.
    fn from_codes(codes: Array[I32], count: I32) & {
        @ir/\\ <ir-string-from-codes><ir-ident name="codes"/><ir-ident name="count"/></ir-string-from-codes> \\/;
    }

    // Receiver/index forms mirror Array's surface while preserving the
    // existing static Str.len/slice/get entry points.
    fn &.len |self| () I32 {
        @ir/\\ <ir-string-measure-utf16><ir-ident name="self"/></ir-string-measure-utf16> \\/;
    }
    fn &.slice |self| (start: I32, end_: I32) & { slice(self, start, end_); }
    fn &.get |self| (i: I32) I32 {
        @ir/\\ <ir-string-get-wtf16><ir-ident name="self"/><ir-ident name="i"/></ir-string-get-wtf16> \\/;
    }
    fn &.get_index |self| (i: I32) I32 {
        @ir/\\ <ir-string-get-wtf16><ir-ident name="self"/><ir-ident name="i"/></ir-string-get-wtf16> \\/;
    }
    fn &.get_slice |self| (start: I32, end_: I32) & { slice(self, start, end_); }

    // Whether the build is --safe.
    fn checks() Bool { @ir/\\ <ir-safe-checks/> \\/; }

    // The string itself: what \`\${s}\` in a template string calls.
    fn &.to_str |self| () & { @ir/\\ <ir-ident name="self"/> \\/; }

    // \u2500\u2500 Text \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Each ships only when used. Offsets and lengths are in UTF-16 code
    // units, as \`len\` and \`slice\` count them.

    /// Where \`part\` first occurs at or after \`from\`, or -1.
    fn &.index_of |self| (part: &, from: I32) I32 {
        let find: fun(&, &, I32) I32 = @es/\\ (s, p, i) => s.indexOf(p, i) \\/;
        find(self, part, from);
    }

    /// Where \`part\` last occurs, or -1.
    fn &.last_index_of |self| (part: &) I32 {
        let find: fun(&, &) I32 = @es/\\ (s, p) => s.lastIndexOf(p) \\/;
        find(self, part);
    }

    /// Whether \`part\` occurs in the string.
    fn &.contains |self| (part: &) Bool { self.index_of(part, 0) >= 0; }

    /// Whether the string begins with \`part\`.
    fn &.starts_with |self| (part: &) Bool {
        part.len() <= self.len() and self.slice(0, part.len()) == part;
    }

    /// Whether the string ends with \`part\`.
    fn &.ends_with |self| (part: &) Bool {
        part.len() <= self.len() and self.slice(self.len() - part.len(), self.len()) == part;
    }

    /// Without the white space at either end.
    fn &.trim |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.trim() \\/;
        f(self);
    }

    /// Without the white space at its start.
    fn &.trim_start |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.trimStart() \\/;
        f(self);
    }

    /// Without the white space at its end.
    fn &.trim_end |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.trimEnd() \\/;
        f(self);
    }

    /// In upper case (\`"Stra\xDFe"\` is \`"STRASSE"\`).
    fn &.to_upper |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.toUpperCase() \\/;
        f(self);
    }

    /// In lower case.
    fn &.to_lower |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.toLowerCase() \\/;
        f(self);
    }

    /// The string \`count\` times over.
    fn &.repeat |self| (count: I32) & {
        let f: fun(&, I32) & = @es/\\ (s, n) => s.repeat(Math.max(0, n)) \\/;
        f(self, count);
    }

    /// Every occurrence of \`part\` replaced by \`with\`, as it is (a \`$\` in it is a \`$\`).
    fn &.replace |self| (part: &, with: &) & {
        let f: fun(&, &, &) & = @es/\\ (s, p, w) => s.replaceAll(p, () => w) \\/;
        f(self, part, with);
    }

    /// At least \`width\` long: \`fill\` repeated before it as needed (\`"7".pad_start(3, "0")\` is \`"007"\`).
    fn &.pad_start |self| (width: I32, fill: &) & {
        let f: fun(&, I32, &) & = @es/\\ (s, n, f) => s.padStart(n, f) \\/;
        f(self, width, fill);
    }

    /// At least \`width\` long: \`fill\` repeated after it as needed.
    fn &.pad_end |self| (width: I32, fill: &) & {
        let f: fun(&, I32, &) & = @es/\\ (s, n, f) => s.padEnd(n, f) \\/;
        f(self, width, fill);
    }

    /// The pieces between the occurrences of \`separator\` (\`"a,b,,c"\` is \`["a", "b", "", "c"]\`).
    /// An empty separator splits into code units.
    fn &.split |self| (separator: &) Array[Str] {
        if separator.len() == 0 {
            let units = Array[Str].new(self.len(), "");
            for (0 ..< self.len()) |i| { units[i] = self.slice(i, i + 1); };
            return units;
        };
        let count = 1;
        let at = self.index_of(separator, 0);
        while (at >= 0) {
            count += 1;
            at = self.index_of(separator, at + separator.len());
        };
        let pieces = Array[Str].new(count, "");
        let start = 0;
        for (0 ..< count) |k| {
            let end_ = self.index_of(separator, start);
            if end_ < 0 { end_ = self.len(); };
            pieces[k] = self.slice(start, end_);
            start = end_ + separator.len();
        };
        pieces;
    }

    /// The \`parts\`, with the string between each two (\`", ".join(["a", "b"])\` is \`"a, b"\`).
    fn &.join |self| (parts: Array[Str]) & {
        if parts.len() == 0 { return ""; };
        let out = parts[0];
        for (1 ..< parts.len()) |i| { out = out + self + parts[i]; };
        out;
    }

    /// The integer the string is, or \`fallback\` when it is not one or does not
    /// fit in an I32: white space around it, then a sign (\`+\` or \`-\`) if any,
    /// then decimal digits or hexadecimal ones after \`0x\`.
    fn &.parse_i32 |self| (fallback: I32) I32 {
        let f: fun(&, I32) I32 = @es/\\ (s, d) => { const m = /^([+-]?)(0x[0-9a-f]+|\\d+)$/i.exec(s.trim()); if (!m) return d; const v = (m[1] === '-' ? -1 : 1) * Number(m[2]); return v >= -2147483648 && v <= 2147483647 ? v : d; } \\/;
        f(self, fallback);
    }

    /// The number the string is, or NaN when it is not one (\`F64.is_nan\`), as
    /// JavaScript's \`Number\` reads it after the white space around it: so
    /// also \`0x\u2026\`, \`0b\u2026\`, \`0o\u2026\`, and \`Infinity\`, but not \`inf\`.
    fn &.parse_f64 |self| () F64 {
        let f: fun(&) F64 = @es/\\ (s) => { const t = s.trim(); return t === '' ? NaN : Number(t); } \\/;
        f(self);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:StrMap",`//! Str keys to values of any type: \`using StrMap from std:StrMap;\`.
//!
//! \`\`\`
//! let ages = StrMap[I32].new();
//! ages.set("ada", 36);
//! ages.get("ada", 0);     // 36
//! ages.get("bob", 0);     // 0: absent
//! \`\`\`
//!
//! Open addressing over a power-of-two table, at most half full; a key's
//! hash (FNV-1a over its code units) is one call to the host, and kept.

mod StrMap[V] {
    struct &:
        | keys : Array[Str]
        | full : Array[I32]
        | hashes : Array[I32]
        | values : Array[V]
        | count : I32

    /// An empty map.
    fn &.new() & {
        &{ keys: Array[Str].new(0, ""), full: Array[I32].new(0, 0), hashes: Array[I32].new(0, 0), values: [], count: 0 };
    }

    /// How many keys it has.
    fn &.len |self| () I32 { self.count; }

    /// Whether it has \`key\`.
    fn &.has |self| (key: Str) Bool {
        if self.count == 0 { return false; };
        self.full[self.slot(key, hash(key))] != 0;
    }

    /// The value of \`key\`, or \`missing\` when it has none.
    fn &.get |self| (key: Str, missing: V) V {
        if self.count == 0 { return missing; };
        let i = self.slot(key, hash(key));
        if self.full[i] == 0 { missing; } else { self.values[i]; };
    }

    /// \`key\`'s value is now \`value\`.
    fn &.set |self| (key: Str, value: V) void {
        let h = hash(key);
        let i = if self.keys.len() > 0 { self.slot(key, h); } else { -1; };
        if i < 0 or self.full[i] == 0 {
            // A new key: room for it first.
            if (self.count + 1) * 2 > self.keys.len() {
                self.grow(value);
                i = self.slot(key, h);
            };
            self.full[i] = 1;
            self.keys[i] = key;
            self.hashes[i] = h;
            self.count += 1;
        };
        self.values[i] = value;
    }

    /// Removes \`key\`; whether it had one. (Its value stays referenced until
    /// another key takes its slot: a map has no empty value of V to put there.)
    fn &.remove |self| (key: Str) Bool {
        if self.count == 0 { return false; };
        let mask = self.keys.len() - 1;
        let i = self.slot(key, hash(key));
        if self.full[i] == 0 { return false; };
        // Backward-shift deletion: later keys of the run move up, so no tombstones.
        let j = i;
        while (true) {
            j = (j + 1) & mask;
            if self.full[j] == 0 { break; };
            let home = self.hashes[j] & mask;
            // Move j's key to the hole at i unless its home lies in (i, j].
            let stays = if i <= j { home > i and home <= j; } else { home > i or home <= j; };
            if not stays {
                self.keys[i] = self.keys[j];
                self.hashes[i] = self.hashes[j];
                self.values[i] = self.values[j];
                i = j;
            };
        };
        self.full[i] = 0;
        self.keys[i] = "";
        self.count -= 1;
        true;
    }

    /// Its keys, in no particular order.
    fn &.keys |self| () Array[Str] {
        let out = Array[Str].new(self.count, "");
        let k = 0;
        for (0 ..< self.keys.len()) |i| {
            if self.full[i] != 0 {
                out[k] = self.keys[i];
                k += 1;
            };
        };
        out;
    }

    // The slot of \`key\` (hash \`h\`), or the empty one where it would go.
    fn &.slot |self| (key: Str, h: I32) I32 {
        let mask = self.keys.len() - 1;
        let i = h & mask;
        while (true) {
            if self.full[i] == 0 { return i; };
            if self.hashes[i] == h and self.keys[i] == key { return i; };
            i = (i + 1) & mask;
        };
        i;
    }

    // Twice the room (16 at first); \`fill\` fills the new values.
    fn &.grow |self| (fill: V) void {
        let old_keys = self.keys;
        let old_full = self.full;
        let old_hashes = self.hashes;
        let old_values = self.values;
        let n = if old_keys.len() == 0 { 16; } else { old_keys.len() * 2; };
        self.keys = Array[Str].new(n, "");
        self.full = Array[I32].new(n, 0);
        self.hashes = Array[I32].new(n, 0);
        self.values = Array[V].new(n, fill);
        let mask = n - 1;
        for (0 ..< old_keys.len()) |i| {
            if old_full[i] != 0 {
                let j = old_hashes[i] & mask;
                while (self.full[j] != 0) { j = (j + 1) & mask; };
                self.full[j] = 1;
                self.keys[j] = old_keys[i];
                self.hashes[j] = old_hashes[i];
                self.values[j] = old_values[i];
            };
        };
    }

    fn hash(key: Str) I32 {
        let f: fun(Str) I32 = @es/\\ (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; } \\/;
        f(key);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Stream",`//! \`Stream[T]\`: a JavaScript async iterable, held as an externref. An async
//! generator, a \`ReadableStream\`, a Node stream: anything with
//! \`[Symbol.asyncIterator]\`. As with \`Promise[T]\`, nothing is wrapped: a
//! stream utu returns is one JS reads with \`for await\`, and one from the host
//! is the object itself.
//!
//! \`\`\`
//! await for (stream) |value| { \u2026 }   // each value, as the stream gives it
//! \`\`\`
//!
//! That suspends at each value (JSPI), as \`await\` does. Leaving the loop
//! early, by \`break\` or \`return\`, closes the stream (its iterator's
//! \`return\`), as JS's \`for await\` does. A stream is read once: reading it
//! again gives nothing.
//!
//! A host value that is async iterable becomes a stream with \`from_js\`, which
//! names the type of its values: \`Stream[Str].from_js(lines)\`. Its values are
//! not checked against that type.

mod Stream[T1] {
    type & = @ir/\\ <@@IR_WASM@@ref type-repr="wasm-externref"/> \\/

    // \u2500\u2500 Making streams \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

    /// An async iterable host value (not an array: see @of), as a stream of T1.
    fn from_js(iterable: Externref) & {
        let adopt: fun(Externref) & = @es/\\ (s) => s \\/;
        adopt(iterable);
    }

    /// The values of an array, in order.
    fn of(values: Array[T1]) & {
        let make: fun(I32, cl(I32) T1) & = @es/\\ (n, at) => (async function* () { for (let i = 0; i < n; i++) yield at(i); })() \\/;
        make(values.len(), cl(i) { values[i]; });
    }

    /// \`count\` values, each \`make(i)\` for i from 0, made as they are read.
    fn generate(count: I32, make: cl(I32) T1) & {
        let gen: fun(I32, cl(I32) T1) & = @es/\\ (n, at) => (async function* () { for (let i = 0; i < n; i++) yield at(i); })() \\/;
        gen(count, make);
    }

    // \u2500\u2500 Transforming \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Each is a new stream that reads this one as it is read.

    /// The first \`n\` values.
    fn &.take |self| (n: I32) & {
        let f: fun(&, I32) & = @es/\\ (s, n) => (async function* () { if (n <= 0) return; let i = 0; for await (const v of s) { yield v; if (++i >= n) return; } })() \\/;
        f(self, n);
    }

    /// All but the first \`n\` values.
    fn &.skip |self| (n: I32) & {
        let f: fun(&, I32) & = @es/\\ (s, n) => (async function* () { let i = 0; for await (const v of s) if (i++ >= n) yield v; })() \\/;
        f(self, n);
    }

    /// The values \`keep\` is true of.
    fn &.filter |self| (keep: cl(T1) Bool) & {
        let f: fun(&, cl(T1) Bool) & = @es/\\ (s, keep) => (async function* () { for await (const v of s) if (keep(v)) yield v; })() \\/;
        f(self, keep);
    }

    /// Each value, changed by \`f\` (to a value of the same type).
    fn &.map |self| (f: cl(T1) T1) & {
        let m: fun(&, cl(T1) T1) & = @es/\\ (s, f) => (async function* () { for await (const v of s) yield f(v); })() \\/;
        m(self, f);
    }

    /// This stream's values, then \`other\`'s.
    fn &.chain |self| (other: &) & {
        let f: fun(&, &) & = @es/\\ (a, b) => (async function* () { yield* a; yield* b; })() \\/;
        f(self, other);
    }

    // \u2500\u2500 What \`await for\` calls \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // \`await for (s) |v| { body }\` is
    //
    //   let it = s.iterator(); defer s.close(it);
    //   while (true) { let r = await s.next(it); if s.done(r) { break; }; let v = s.value(r); body };
    //
    // Any type with these methods is read the same way.

    fn &.iterator |self| () Externref {
        let f: fun(&) Externref = @es/\\ (s) => s[Symbol.asyncIterator]() \\/;
        f(self);
    }

    fn &.next |self| (iterator: Externref) Promise[Externref] {
        let f: fun(Externref) Promise[Externref] = @es/\\ (it) => it.next() \\/;
        f(iterator);
    }

    fn &.done |self| (result: Externref) Bool {
        let f: fun(Externref) Bool = @es/\\ (r) => r.done === true \\/;
        f(result);
    }

    fn &.value |self| (result: Externref) T1 {
        let f: fun(Externref) T1 = @es/\\ (r) => r.value \\/;
        f(result);
    }

    /// Settles once the stream has finished closing (its \`finally\` blocks run).
    fn &.close |self| (iterator: Externref) void {
        let f: fun(Externref) Promise[Externref] = @es/\\ (it) => Promise.resolve(it.return?.()) \\/;
        await f(iterator);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Time",`//! Clocks: \`using time from std:Time;\`, then \`time.now()\`. Each function ships only when used.

mod time {
    /// Milliseconds since an arbitrary start, with sub-millisecond precision
    /// where the host has it (\`performance.now\`): for measuring.
    fn now() F64 {
        let f: fun() F64 = @es/\\ () => performance.now() \\/;
        f();
    }

    /// Milliseconds since 1970-01-01 UTC (\`Date.now\`): for dates.
    fn epoch_ms() F64 {
        let f: fun() F64 = @es/\\ () => Date.now() \\/;
        f();
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:U32",`// std/U32.utu \u2014 U32 scalar type module
mod U32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-u32-add><ir-ident name="a"/><ir-ident name="b"/></ir-u32-add> \\/; }
    fn &:sub  |a, b| & { @ir/\\ <ir-u32-sub><ir-ident name="a"/><ir-ident name="b"/></ir-u32-sub> \\/; }
    fn &:mul  |a, b| & { @ir/\\ <ir-u32-mul><ir-ident name="a"/><ir-ident name="b"/></ir-u32-mul> \\/; }
    fn &:div  |a, b| & { @ir/\\ <ir-u32-div-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-div-u> \\/; }
    fn &:rem  |a, b| & { @ir/\\ <ir-u32-rem-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-rem-u> \\/; }
    fn &:band |a, b| & { @ir/\\ <ir-u32-and><ir-ident name="a"/><ir-ident name="b"/></ir-u32-and> \\/; }
    fn &:bor  |a, b| & { @ir/\\ <ir-u32-or><ir-ident name="a"/><ir-ident name="b"/></ir-u32-or> \\/; }
    fn &:bxor |a, b| & { @ir/\\ <ir-u32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-u32-xor> \\/; }
    fn &:shl  |a, b| & { @ir/\\ <ir-u32-shl><ir-ident name="a"/><ir-ident name="b"/></ir-u32-shl> \\/; }
    fn &:shr  |a, b| & { @ir/\\ <ir-u32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-shr-u> \\/; }
    fn &:ushr |a, b| & { @ir/\\ <ir-u32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-shr-u> \\/; }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-u32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-u32-eq> \\/; }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-u32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-u32-ne> \\/; }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-u32-lt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-lt-u> \\/; }
    fn &:le   |a, b| Bool { @ir/\\ <ir-u32-le-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-le-u> \\/; }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-u32-gt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-gt-u> \\/; }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-u32-ge-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-ge-u> \\/; }
    // wasm has no U32.neg / U32.not; express them with real ops.
    //   neg a  = 0 - a   (well-defined mod 2^32)
    //   bnot a = a xor 0xFFFFFFFF
    fn &:neg  |a| & { @ir/\\ <ir-u32-sub><ir-lit kind="int" type-name="U32" value="0"/><ir-ident name="a"/></ir-u32-sub> \\/; }
    fn &:bnot |a| & { @ir/\\ <ir-u32-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I32" value="-1"/></ir-u32-xor> \\/; }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.to_i32 |self| () I32 { @ir/\\ <ir-i32-or><ir-ident name="self"/><ir-lit kind="int" type-name="I32" value="0"/></ir-i32-or> \\/; }
    fn &.to_i64 |self| () I64 { @ir/\\ <ir-i64-extend-u><ir-ident name="self"/></ir-i64-extend-u> \\/; }
    fn &.to_u64 |self| () U64 { @ir/\\ <ir-u64-extend-u><ir-ident name="self"/></ir-u64-extend-u> \\/; }
    fn &.to_f32 |self| () F32 { @ir/\\ <ir-f32-convert-u-i32><ir-ident name="self"/></ir-f32-convert-u-i32> \\/; }
    fn &.to_f64 |self| () F64 { @ir/\\ <ir-f64-convert-u-i32><ir-ident name="self"/></ir-f64-convert-u-i32> \\/; }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.to_str |self| () Str {
        let format: fun(U32) Str = @es/\\ (v) => String(v >>> 0) \\/;
        format(self);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:U64",`// std/U64.utu \u2014 U64 scalar type module
mod U64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i64"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-u64-add><ir-ident name="a"/><ir-ident name="b"/></ir-u64-add> \\/; }
    fn &:sub  |a, b| & { @ir/\\ <ir-u64-sub><ir-ident name="a"/><ir-ident name="b"/></ir-u64-sub> \\/; }
    fn &:mul  |a, b| & { @ir/\\ <ir-u64-mul><ir-ident name="a"/><ir-ident name="b"/></ir-u64-mul> \\/; }
    fn &:div  |a, b| & { @ir/\\ <ir-u64-div-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-div-u> \\/; }
    fn &:rem  |a, b| & { @ir/\\ <ir-u64-rem-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-rem-u> \\/; }
    fn &:band |a, b| & { @ir/\\ <ir-u64-and><ir-ident name="a"/><ir-ident name="b"/></ir-u64-and> \\/; }
    fn &:bor  |a, b| & { @ir/\\ <ir-u64-or><ir-ident name="a"/><ir-ident name="b"/></ir-u64-or> \\/; }
    fn &:bxor |a, b| & { @ir/\\ <ir-u64-xor><ir-ident name="a"/><ir-ident name="b"/></ir-u64-xor> \\/; }
    fn &:shl  |a, b| & { @ir/\\ <ir-u64-shl><ir-ident name="a"/><ir-ident name="b"/></ir-u64-shl> \\/; }
    fn &:shr  |a, b| & { @ir/\\ <ir-u64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-shr-u> \\/; }
    fn &:ushr |a, b| & { @ir/\\ <ir-u64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-shr-u> \\/; }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-u64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-u64-eq> \\/; }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-u64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-u64-ne> \\/; }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-u64-lt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-lt-u> \\/; }
    fn &:le   |a, b| Bool { @ir/\\ <ir-u64-le-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-le-u> \\/; }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-u64-gt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-gt-u> \\/; }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-u64-ge-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-ge-u> \\/; }
    // wasm has no U64.neg / U64.not; express them with real ops.
    //   neg a  = 0 - a   (well-defined mod 2^64)
    //   bnot a = a xor 0xFFFFFFFFFFFFFFFF
    fn &:neg  |a| & { @ir/\\ <ir-u64-sub><ir-lit kind="int" type-name="U64" value="0"/><ir-ident name="a"/></ir-u64-sub> \\/; }
    fn &:bnot |a| & { @ir/\\ <ir-u64-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I64" value="-1"/></ir-u64-xor> \\/; }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.to_u32 |self| () U32 { @ir/\\ <ir-u32-wrap><ir-ident name="self"/></ir-u32-wrap> \\/; }
    fn &.to_i32 |self| () I32 { @ir/\\ <ir-i32-wrap><ir-ident name="self"/></ir-i32-wrap> \\/; }
    fn &.to_i64 |self| () I64 { @ir/\\ <ir-i64-or><ir-ident name="self"/><ir-lit kind="int" type-name="I64" value="0"/></ir-i64-or> \\/; }
    fn &.to_f32 |self| () F32 { @ir/\\ <ir-f32-convert-u-i64><ir-ident name="self"/></ir-f32-convert-u-i64> \\/; }
    fn &.to_f64 |self| () F64 { @ir/\\ <ir-f64-convert-u-i64><ir-ident name="self"/></ir-f64-convert-u-i64> \\/; }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.to_str |self| () Str {
        let format: fun(U64) Str = @es/\\ (v) => String(BigInt.asUintN(64, v)) \\/;
        format(self);
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:V128",`// std/V128.utu \u2014 V128 SIMD vector type module
// & is the WebAssembly 128-bit SIMD vector type.
// Interpreted as different lane types depending on the operation:
//   i8x16, i16x8, i32x4, i64x2, f32x4, f64x2
//
// Operator overloads are intentionally not defined here \u2014 SIMD arithmetic
// requires knowing the lane interpretation (e.g. i32x4:add vs f32x4:add).
// Use the specific sub-modules (e.g. i32x4, f32x4) for typed SIMD ops.
// The bitwise ops below are lane-interpretation-independent.

mod V128 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-v128"/> \\/

    fn zero() & { @ir/\\ <ir-v128-const data-type-name="V128" bytes="0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"/> \\/; }
    fn ones() & { @ir/\\ <ir-v128-const data-type-name="V128" bytes="255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255"/> \\/; }

    fn &:band |a, b| & { @ir/\\ <ir-v128-and><ir-ident name="a"/><ir-ident name="b"/></ir-v128-and> \\/; }
    fn &:bor  |a, b| & { @ir/\\ <ir-v128-or><ir-ident name="a"/><ir-ident name="b"/></ir-v128-or> \\/; }
    fn &:bxor |a, b| & { @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/; }
    fn &:bnot |a| & { @ir/\\ <ir-v128-not><ir-ident name="a"/></ir-v128-not> \\/; }
    fn &:eq   |a, b| & {
        @ir/\\ <ir-v128-not><ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor></ir-v128-not> \\/;
    }
    fn &:ne   |a, b| & {
        @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/;
    }

    fn andnot(a: V128, b: V128) V128 {
        @ir/\\ <ir-v128-andnot><ir-ident name="a"/><ir-ident name="b"/></ir-v128-andnot> \\/;
    }
    fn bitselect(a: V128, b: V128, mask: V128) V128 {
        @ir/\\ <ir-v128-bitselect>
            <ir-ident name="a"/>
            <ir-ident name="b"/>
            <ir-ident name="mask"/>
        </ir-v128-bitselect> \\/;
    }
    fn any_true(a: V128) Bool {
        @ir/\\ <ir-v128-any-true><ir-ident name="a"/></ir-v128-any-true> \\/;
    }
}
`.replaceAll("@@IR_WASM@@",M)],["std:Wutu",`// Generated from src/runtime/wutu.js by the build. No runtime ships unless used.
mod wutu {
    fn init() void {
        let install: fun() void = @es/\\ () => { globalThis.__utuWutu ??= (function createWutuRuntime() {
  const metadata = new WeakMap();   // element -> { attrs, view }
  const listeners = new WeakMap();  // element -> Map(event -> record)
  const views = new Set();          // WeakRef<view> for every mounted root
  const scopes = new Map();         // island name -> WeakRef<view>
  const dirty = new Set();
  const afterRender = [];
  const mounted = new WeakSet();    // elements whose \`on mount\` has run
  let memoNode = null;              // the element memoHit() found
  /** Where a hole is: its call key and the keys around it (each length-prefixed, so none collide). */
  const here = () => keys.map(k => k.value.length + ':' + k.value).join('|');
  const identities = new WeakMap(); // element -> its identity (its data-wutu attribute)
  let frames = [], active = null, keys = [], scheduled = false, generation = 0;
  // The element (and its view) whose \`on mount\` or event handler is running: interval()'s owner outside a render.
  let owner = null;
  const timers = new Map();         // intervals no view owns
  // A component's root, claimed loose: { root, index, used } for the render under \`root\`.
  let loose = null;

  function autoSave() {
    api.autoSave?.();
  }

  function invalidate(name) {
    const view = scopes.get(name)?.deref();
    if (!view) return;
    view.dirty = true;
    schedule(view);
  }

  const NO_ATTRS = new Set();
  const selectValues = new WeakMap(); // select -> the value a render gave it

  /** A select's value (\`bind:value\`): set now, and again once its options are in place. */
  function selectValue(node, value) {
    selectValues.set(node, value);
    if (node.value !== value) node.value = value;
  }

  /** An element's identity, from its attribute the first time (a prerendered one). */
  function identityOfNode(node) {
    let identity = identities.get(node);
    if (identity === undefined) identities.set(node, identity = node.getAttribute('data-wutu'));
    return identity;
  }

  /** Make \`parent\`'s children exactly \`wanted\`, moving nodes and keeping focus. */
  function place(parent, wanted) {
    // Usually they already are.
    const children = parent.childNodes;
    if (children.length === wanted.length) {
      let same = true;
      for (let i = 0; same && i < wanted.length; i++) same = children[i] === wanted[i];
      if (same) return;
    }
    const focused = document.activeElement;
    const selection = focused && 'selectionStart' in focused
      ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection]
      : null;
    let cursor = parent.firstChild;
    for (const node of wanted) {
      if (node === cursor) { cursor = cursor.nextSibling; continue; }
      if (parent.moveBefore && node.parentNode === parent) parent.moveBefore(node, cursor);
      else parent.insertBefore(node, cursor);
    }
    const keep = new Set(wanted);
    for (const node of [...parent.childNodes]) {
      if (keep.has(node)) continue;
      // During a render, removal waits: a globally keyed node may reappear elsewhere.
      if (active) active.removals.add(node);
      else { dispose(node); node.remove(); }
    }
    if (focused?.isConnected && document.activeElement !== focused) {
      focused.focus({ preventScroll: true });
      if (selection?.[0] != null) focused.setSelectionRange(...selection);
    }
  }

  function claimIdentity(parent, identity, global, explicit) {
    if (global && active) {
      if (active.globalClaims.has(identity)) throw new Error('Duplicate global Wutu key: ' + identity);
      active.globalClaims.add(identity);
    }
    if (explicit && parent) {
      parent.keyed ??= new Set();
      if (parent.keyed.has(identity)) throw new Error('Duplicate Wutu key: ' + keys.findLast(k => k.explicit).value);
      parent.keyed.add(identity);
    }
  }

  /** The previous render's element for this identity, if one can be reused. */
  function reusable(parent, identity, tag, global) {
    // Usually it is where it was last time.
    const at = parent?.old[parent.wanted.length];
    if (at?.nodeType === 1 && at.localName === tag && identityOfNode(at) === identity && !parent.used.has(at)) return at;
    const queue = parent && byKey(parent).get(identity);
    while (queue && queue.index < queue.nodes.length) {
      const candidate = queue.nodes[queue.index++];
      if (!parent.used.has(candidate) && candidate.localName === tag) return candidate;
    }
    return global ? globalNode(identity) : undefined;
  }

  /** A frame's previous child elements by identity (indexed when first asked). */
  function byKey(frame) {
    if (frame.byKey) return frame.byKey;
    frame.byKey = new Map();
    for (const child of frame.old) {
      if (child.nodeType !== 1) continue;
      const identity = identityOfNode(child);
      let queue = frame.byKey.get(identity);
      if (!queue) frame.byKey.set(identity, queue = { nodes: [], index: 0 });
      queue.nodes.push(child);
    }
    return frame.byKey;
  }

  /** The view's element of a global identity, from before this render (indexed when first asked). */
  function globalNode(identity) {
    if (!active) return undefined;
    if (!active.globalNodes) {
      active.globalNodes = new Map();
      for (const node of active.root?.querySelectorAll('[data-wutu]') ?? []) active.globalNodes.set(identityOfNode(node), node);
    }
    return active.globalNodes.get(identity);
  }

  /**
   * A component's root from the last render, wherever it was placed: an
   * argument to another component lands inside it, not in the frame open
   * while it is made. (By identity, from the outermost element's subtree.)
   */
  function looseNode(identity, tag) {
    const root = frames[0]?.node;
    if (loose?.root !== root) loose = { root, index: null, used: new Set() };
    if (!loose.index) {
      loose.index = new Map();
      for (const node of root?.querySelectorAll('[data-wutu]') ?? []) {
        const id = identityOfNode(node);
        if (!loose.index.has(id)) loose.index.set(id, node);
      }
    }
    const node = loose.index.get(identity);
    if (!node || node.localName !== tag || loose.used.has(node)) return undefined;
    loose.used.add(node);
    return node;
  }

  /**
   * The element for \`site\` here: last render's, a prerendered one, or what
   * \`make()\` makes. It joins its parent's children where it is entered,
   * except a component's root (\`isLoose\`): it joins those of the frame its
   * value is put in (append()).
   */
  function claim(site, key, tag, make, isLoose) {
    const parent = frames.at(-1);
    // Identity: the site, then the keys pushed since the last global key.
    let identity = site + (key ? ':' + key : ''), global = false, explicit = false;
    if (keys.length) {
      // Keys are checked for duplicates where they are pushed: below that,
      // an identity is unique when its key is.
      let from = 0;
      for (let i = 0; i < keys.length; i++) {
        if (keys[i].global) { from = i; global = keys[i].depth === frames.length; }
        if (keys[i].explicit) explicit = keys[i].depth === frames.length;
      }
      for (let i = from; i < keys.length; i++) {
        const k = keys[i];
        identity += \`:\${k.explicit ? 'k' : 'c'}\${k.value.length}:\${k.value}\`;
      }
    }
    claimIdentity(parent, identity, global, explicit);
    let node = reusable(parent, identity, tag, global);
    if (isLoose && parent) node ??= looseNode(identity, tag);
    else if (node) active?.retained.add(node);
    // A root reuses its own previous element, or adopts prerendered markup:
    // its controls, disabled until now, take input again (but a lazy
    // placeholder's, until its chunk replaces them).
    if (!parent) node = active?.root ?? document.querySelector(\`[data-wutu-root="\${site}"][data-wutu-prerender]\`);
    if (node?.hasAttribute('data-wutu-prerender')) {
      node.removeAttribute('data-wutu-prerender');
      for (const control of [node, ...node.querySelectorAll('[data-wutu-pending]')]) {
        if (!control.hasAttribute('data-wutu-pending') || control.parentNode?.closest('[data-wutu-lazy]')) continue;
        control.disabled = false;
        control.removeAttribute('data-wutu-pending');
      }
    }
    if (!node || node.localName !== tag) node = make();
    if (parent) parent.used.add(node);
    if (parent && !isLoose) parent.wanted.push(node);
    if (identities.get(node) !== identity) {
      node.setAttribute('data-wutu', identity);
      identities.set(node, identity);
    }
    if (!parent) {
      if (node.getAttribute('data-wutu-root') !== site) node.setAttribute('data-wutu-root', site);
      if (active) active.root = node;
    }
    return node;
  }

  /**
   * Begin an element's children; \`kept\` names the attributes it has from its
   * shell, which no render sets, and \`set\` (when known) those a render may set.
   * (\`old\` is the live child list: they move only when this frame leaves.)
   */
  function open(node, kept, set) {
    // An element first seen (made, or prerendered) has had no render set its
    // attributes: those it has now that a render may set (else all but its
    // shell's) are what this render may drop. (A prerendered style or
    // property-set attribute stays: no render sets it as an attribute.)
    const meta = metadata.get(node);
    const before = meta ? null : new Set([...node.attributes].map(a => a.name)
      .filter(name => set ? set.has(name) : !name.startsWith('data-wutu') && !kept.includes(name)));
    frames.push({ node, meta, before, old: node.childNodes, used: new Set(), wanted: [], attrs: null, byKey: null, keyed: null });
    return node;
  }

  function enter(tag, svg, site, key) {
    return open(claim(site, key, tag, () =>
      svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag)), []);
  }

  // A description already parsed (a template program's): by the array itself.
  const trees = new WeakMap();
  function prototypeOfTree(tree, svg) {
    let entry = trees.get(tree);
    if (!entry) trees.set(tree, entry = prototypeOf(tree, svg));
    return entry;
  }

  function prototypeOf(tree, svg) {
    const build = ([tag, attributes, ...children], svg) => {
      svg = svg || tag === 'svg';
      const element = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
      for (const name in attributes) setAttr(element, name, attributes[name]);
      const childSvg = svg && tag !== 'foreignObject';
      for (const child of children) element.append(typeof child === 'string' ? child : build(child, childSvg));
      return element;
    };
    return [build(tree, svg), Object.keys(tree[1])];
  }

  /** Append a node (a component or slot) or text, reusing the text node in this position. */
  function append(value) {
    const frame = frames.at(-1);
    if (value?.nodeType) {
      if (!frame.wanted.includes(value)) { frame.used.add(value); frame.wanted.push(value); }
      // (Moved here from its old parent: that parent's place() must not remove it.)
      active?.retained.add(value);
      return;
    }
    const text = String(value ?? '');
    let node = frame.old[frame.wanted.length];
    if (!node || node.nodeType !== 3 || frame.used.has(node)) node = document.createTextNode(text);
    else if (node.data !== text) node.data = text;
    frame.used.add(node);
    frame.wanted.push(node);
  }

  /** Set an attribute for this render; null/false remove it, true sets it empty. */
  function attr(node, name, value) {
    (frames.at(-1).attrs ??= new Set()).add(name);
    if (value === null || value === false || !safe(node, name, value)) {
      node.removeAttribute(name);
      return;
    }
    const text = value === true ? '' : String(value);
    if (node.getAttribute(name) !== text) setAttr(node, name, text);
  }

  /** setAttribute, in its namespace for \`xlink:href\`, \`xml:lang\`, \`xmlns:xlink\`. */
  function setAttr(node, name, text) {
    const ns = { xlink: 'http://www.w3.org/1999/xlink', xml: 'http://www.w3.org/XML/1998/namespace',
      xmlns: 'http://www.w3.org/2000/xmlns/' }[name.split(':', 1)[0]];
    if (ns && name.includes(':')) node.setAttributeNS(ns, name, text);
    else node.setAttribute(name, text);
  }

  // Attributes (and their properties) a browser follows or loads as a URL.
  const URLS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction', 'poster', 'cite', 'data',
    'background', 'codebase', 'longdesc', 'manifest']);
  // Attributes that hold several URLs, apart at whitespace (or commas).
  const LISTS = new Set(['ping', 'srcset', 'imagesrcset']);
  /**
   * Whether a value from a render may go in attribute \`name\` (a name the
   * compiler checked: no event handler's): srcdoc (HTML) takes none; a URL
   * one takes no javascript: or vbscript: URL, and a data: URL only of an
   * image, audio or video (an SVG one only in an img or SVG image, where it
   * runs no script), or any in the href of an a or area with a download (it
   * is saved, not opened);
   * ping and srcset check each of theirs; a meta's content (a refresh's URL)
   * has none of these schemes anywhere. A URL is read as a browser reads it:
   * in any case, whitespace and control characters dropped.
   */
  function safe(node, name, value) {
    name = name.toLowerCase();
    if (name === 'srcdoc') return false;
    if (value === true) return true;
    value = String(value);
    if (URLS.has(name)) return scheme(node, name, value);
    if (LISTS.has(name)) return value.split(/[ ,]+/).every(u => scheme(node, name, u));
    return name !== 'content' || node.localName !== 'meta' || !/javascript:|vbscript:|data:/.test(bare(value));
  }

  /** value's first n characters past whitespace and controls, which it drops, in lower case. */
  function bare(value, n = 1 / 0) {
    let s = '';
    for (const c of value) if (c > ' ' && (s += c).length >= n) break;
    return s.toLowerCase();
  }

  /** Whether one URL's scheme may go in node's attribute \`name\` (see safe). */
  function scheme(node, name, value) {
    const s = bare(value, 16), tag = node.localName;
    if (/^(java|vb)script:/.test(s)) return false;
    if (!s.startsWith('data:') || name === 'href' && (tag === 'a' || tag === 'area') && node.hasAttribute('download')) return true;
    if (s.startsWith('data:image/svg')) return tag === 'img' || tag === 'image';
    return /^data:(image|audio|video)[/]/.test(s);
  }

  /** A URL property set by a render (\`.href = \u2026\`): as its attribute is, else the attribute goes. */
  function url(node, name, value) {
    if (safe(node, name, value)) node[name] = value;
    else node.removeAttribute(name.toLowerCase());
  }

  /**
   * One DOM listener per element and event; each render replaces the handlers
   * it calls, so closures always see the latest captures. Handling an event
   * saves stores and schedules the owning view, unless every handler that ran
   * was quiet (\`~event\`: it changed only DOM the template does not read).
   * \`mount\` is no DOM event: its handler runs once per element, after the
   * render that made it.
   */
  function listen(node, event, handler) {
    if (event === 'mount') {
      if (mounted.has(node)) return;
      mounted.add(node);
      const view = active;
      queueMicrotask(() => {
        const outer = owner;
        owner = [node, view];
        try { handler(new Event('mount')); } finally { owner = outer; }
        autoSave();
        if (view) schedule(view);
      });
      return;
    }
    const quiet = event[0] === '~';
    if (quiet) event = event.slice(1);
    let map = listeners.get(node);
    if (!map) listeners.set(node, map = new Map());
    let record = map.get(event);
    if (!record) {
      record = { handlers: [], generation: -1, view: active };
      map.set(event, record);
      node.addEventListener(event, e => {
        let loud = false;
        const outer = owner;
        owner = [node, record.view];
        try {
          for (const [current, isQuiet] of [...record.handlers]) {
            if (!isQuiet) loud = true;
            const result = current(e);
            if (result?.then) result.then(refresh, error => { refresh(); setTimeout(() => { throw error; }); });
          }
        } finally {
          owner = outer;
          if (loud) {
            autoSave();
            if (record.view) schedule(record.view);
          }
        }
      });
    }
    if (record.generation !== generation) {
      record.handlers = [];
      record.generation = generation;
    }
    record.handlers.push([handler, quiet]);
    record.view = active;
  }

  function leave() {
    const frame = frames.pop(), node = frame.node, attrs = frame.attrs ?? NO_ATTRS;
    // \`@unmanaged\`: its children, and attributes the template does not set, are JavaScript's.
    if (node.hasAttribute('data-wutu-unmanaged')) {
      // (Prerendered, what JavaScript drew is drawn again by its \`on mount\`.)
      if (!frame.meta) node.replaceChildren();
      metadata.set(node, { ...metadata.get(node), attrs });
      return node;
    }
    // The attributes a render set last time and not this time go.
    const meta = frame.meta;
    for (const name of meta ? meta.attrs : frame.before) if (!attrs.has(name)) node.removeAttribute(name);
    if (meta) meta.attrs = attrs;
    else metadata.set(node, { attrs });
    place(node, frame.wanted);
    const value = selectValues.get(node);
    if (value !== undefined && node.value !== value) node.value = value;
    return node;
  }

  // \u2500\u2500 Template programs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  //
  // A template compiled to data: its structure as a program of ops (JSON),
  // run here as the module supplies its values, in order. Static ops run
  // as soon as they are reached; a hole waits for its call:
  //
  //   ["s", i, tree, svg?]   a still subtree, element i
  //   ["o", i, tree, svg?]   open element i from its shell; ["c"] closes it
  //   ["t", text]            written text
  //   ["a", name] ["m", classes] ["b", name] ["y", property]
  //                          an attribute, a class merged after the static
  //                          ones, a boolean attribute, a style value: put()
  //   ["x", p] ["w"]         a value (with a call key, from slot()), a text: put()
  //   ["v", i, event]        a listener on element i (\`~event\` quiet, \`mount\`
  //                          once): put()
  //   ["n", i]               element i, to the module: node()
  //   ["i", then, else]      an if: arm()
  //   ["f", mode, p, body]   a loop (mode 0 by index, 1 keyed, 2 globally
  //                          keyed): item() per iteration, end() after
  const programs = new Map();      // program text -> [its ops, its hash]
  const BODY_END = ['end'];
  let run = null;                  // the template running: { h, nodes, stack, loop }

  /**
   * A template begins. It is known by its program's hash (FNV-1a, base 36):
   * the same on every render and in prerendered markup. (Two templates alike
   * to the byte would share it, and could only share elements alike too.)
   */
  function begin(text) {
    let program = programs.get(text);
    if (!program) {
      let n = 2166136261;
      for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
      programs.set(text, program = [JSON.parse(text), (n >>> 0).toString(36)]);
    }
    run = { h: program[1], nodes: [], stack: [{ ops: program[0], pc: 0, kind: 'top' }], outer: run, pending: null };
  }

  /** The attributes the ops after an 'o' (at \`pc\`) set: its a, m and b ops (by op list, then index). */
  const settables = new WeakMap();
  function settable(ops, pc) {
    let byPc = settables.get(ops);
    if (!byPc) settables.set(ops, byPc = []);
    let names = byPc[pc];
    if (!names) {
      names = byPc[pc] = new Set();
      for (let i = pc; i < ops.length; i++) {
        const [kind, name] = ops[i];
        if (kind === 'a' || kind === 'b') names.add(name);
        else if (kind === 'm') names.add('class');
        else if (kind !== 'n' && kind !== 'y') break;
      }
    }
    return names;
  }

  /** Run static ops up to the next hole, and return it (BODY_END at a loop body's end, null at the end). */
  function advance() {
    for (;;) {
      const top = run.stack.at(-1);
      if (top.pc >= top.ops.length) {
        if (top.kind === 'arm') { run.stack.pop(); continue; }
        return top.kind === 'body' ? BODY_END : null;
      }
      const op = top.ops[top.pc++];
      switch (op[0]) {
        case 's': {
          const [element] = prototypeOfTree(op[2], !!op[3]);
          run.nodes[op[1]] = claim(\`v\${run.h}:\${op[1]}\`, '', element.localName, () => element.cloneNode(true), op[1] === 0);
          break;
        }
        case 'o': {
          const [element, names] = prototypeOfTree(op[2], !!op[3]);
          run.nodes[op[1]] = open(claim(\`v\${run.h}:\${op[1]}\`, '', element.localName, () => element.cloneNode(false), op[1] === 0), names, settable(top.ops, top.pc));
          break;
        }
        case 'c': leave(); break;
        case 't': append(op[1]); break;
        default: return op;
      }
    }
  }

  /** A value for the next hole. */
  function put(value) {
    if (run?.pending) {
      run.pending = null;
      append(value);
      keys.pop();
      return;
    }
    if (!run) { append(value); keys.pop(); return; }  // (from code made before programs)
    const op = advance(), node = frames.at(-1)?.node;
    switch (op[0]) {
      case 'a': attr(node, op[1], value); break;
      case 'm': attr(node, 'class', op[1] + value); break;
      case 'b': attr(node, op[1], !!value); break;
      case 'y': (frames.at(-1).attrs ??= new Set()).add('style'); node.style.setProperty(op[1], value); break;
      case 'w': append(value); break;
      case 'v': listen(run.nodes[op[1]], op[2], value); break;
      default: throw new Error('Wutu: a value where the template has ' + JSON.stringify(op?.[0]));
    }
  }

  /** Before a value that may render (a component): its call key. */
  function slot() {
    const op = advance();
    keys.push({ value: \`call:\${run.h}:\${op[1]}\`, explicit: false });
    run.pending = op;
  }

  /** An if takes its then (1) or else (0) arm. */
  function arm(which) {
    const op = advance();
    run.stack.push({ ops: which ? op[1] : op[2], pc: 0, kind: 'arm' });
  }

  /** Ends the current iteration, if any; returns the loop. */
  function iteration() {
    const op = advance();
    if (op !== BODY_END) return [op, null];
    const body = run.stack.at(-1);
    keys.pop();
    if (body.loop[1] === 0) keys.pop();
    return [body.loop, body];
  }

  /** The next iteration of a loop, known by \`key\` (its index, unkeyed). */
  function item(key) {
    const [loop, body] = iteration();
    if (body) body.pc = 0;
    else run.stack.push({ ops: loop[3], pc: 0, kind: 'body', loop });
    const value = String(key), mode = loop[1];
    if (mode === 0) {
      keys.push({ value: \`loop:\${run.h}:\${loop[2]}\`, explicit: false });
      keys.push({ value, explicit: false });
    } else {
      keys.push({ value, explicit: true, global: mode === 2, depth: frames.length });
    }
  }

  /** After a loop's last iteration. */
  function end() {
    const [, body] = iteration();
    if (body) run.stack.pop();
  }

  /** The element a node op names. */
  function node() { return run.nodes[advance()[1]]; }

  /** The template's end: its root element. */
  function done() {
    while (advance() !== null) { /* (only static ops remain) */ }
    const root = run.nodes[0];
    run = run.outer;
    if (!run) loose = null;
    return root;
  }

  function render(view) {
    const previous = [frames, active, keys, loose], focused = document.activeElement;
    view.cleanupIndex = 0;
    view.cleanupCallbacks ??= [];
    view.intervalsSeen = new Set();
    view.removals = new Set();
    view.retained = new Set();
    view.globalNodes = null;
    view.globalClaims = new Set();
    frames = [];
    active = view;
    keys = [];
    loose = null;
    generation++;
    try {
      view.root = view.render();
      // cleanup() registrations are positional: ones not repeated this render run now.
      for (const callback of view.cleanupCallbacks.splice(view.cleanupIndex)) callback();
      // So are intervals: one not started again this render stops.
      for (const [key, timer] of view.effects) if (!timer.node && !view.intervalsSeen.has(key)) { clearInterval(timer.id); view.effects.delete(key); }
      for (const node of view.removals) {
        if (view.retained.has(node)) continue;
        dispose(node);
        node.remove();
      }
      if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
    } finally {
      [frames, active, keys, loose] = previous;
      view.globalNodes = null;
      view.removals.clear();
      view.retained.clear();
    }
    return view.root;
  }

  /**
   * Render a view. Inside another render, an unnamed view simply joins its
   * parent. A named island renders once and is then reused until invalidated.
   */
  function mount(factory, scope = '') {
    if (active && !scope) return factory();
    if (scope) {
      const existing = scopes.get(scope)?.deref();
      if (existing?.root.isConnected) {
        if (existing.dirty) { existing.dirty = false; render(existing); }
        return existing.root;
      }
    }
    const view = { render: factory, root: null, scope, dirty: false, cleanupCallbacks: [], effects: new Map() };
    const root = render(view);
    views.add(new WeakRef(view));
    if (scope) scopes.set(scope, new WeakRef(view));
    metadata.set(root, { ...metadata.get(root), view });
    return root;
  }

  function drain() {
    scheduled = false;
    const batch = [...dirty];
    dirty.clear();
    for (const view of batch) {
      if (!view.root.isConnected) continue;
      view.dirty = false;
      render(view);
    }
    for (const callback of afterRender.splice(0)) callback();
  }

  /** Synchronously re-render every connected view. */
  function refresh() {
    for (const ref of views) {
      const view = ref.deref();
      if (!view) { views.delete(ref); continue; }
      if (view.root.isConnected) dirty.add(view);
    }
    autoSave();
    drain();
  }

  /** Batch a re-render into the next microtask. */
  function schedule(view) {
    if (view) dirty.add(view);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(drain);
  }

  /** Run cleanups for views rooted at or below \`node\`. */
  function dispose(node) {
    const view = metadata.get(node)?.view;
    if (view) {
      for (const callback of view.cleanupCallbacks.splice(0)) callback();
      for (const timer of view.effects.values()) clearInterval(timer.id);
      view.effects.clear();
      if (view.scope) scopes.delete(view.scope);
    }
    for (const child of node.children ?? []) dispose(child);
  }

  // (Where there is a window: a DOM without one, in tests, has no routes.)
  globalThis.addEventListener?.('hashchange', refresh);
  globalThis.addEventListener?.('popstate', refresh);

  const api = {
    enter, append, attr, url, listen, leave, mount, refresh, invalidate, selectValue, here,
    put, begin, slot, arm, item, end, node, done,
    storageError: '',
    notify() {
      for (const ref of views) {
        const view = ref.deref();
        if (view?.root.isConnected) schedule(view);
      }
    },
    /**
     * A timer, started once per key. Started by a render, the view owns it:
     * the first render that does not start it again stops it. Started by an
     * \`on mount\` or event handler, its element does: it stops once the
     * element is gone. Either stops when the view goes.
     */
    interval(key, milliseconds, callback) {
      const [node, view] = active ? [null, active] : owner ?? [];
      if (!node) {
        if (!view) return;
        view.intervalsSeen.add(key);
      }
      const effects = view?.effects ?? timers, effect = effects.get(key);
      if (effect?.node === node) { effect.callback = callback; return; }
      // (Another element's is replaced: the same \`on mount\`, on an element made again.)
      if (effect) clearInterval(effect.id);
      const entry = { callback, id: 0, node };
      entry.id = setInterval(() => {
        if (node && !node.isConnected) { clearInterval(entry.id); effects.delete(key); return; }
        entry.callback(); autoSave(); schedule(view);
      }, Math.max(16, milliseconds));
      effects.set(key, entry);
    },
    /**
     * A hole that calls a function (\`= f(a, b);\`) with a key the compiler
     * made from its arguments: if the call at this place in this view made
     * its element last time with the same key, it is put back without the
     * call. ("" is never reused.)
     */
    memoHit(key) {
      if (!key || !active) return false;
      const entry = active.memo?.get(here());
      if (entry?.key !== key || !entry.node?.isConnected) return false;
      memoNode = entry.node;
      return true;
    },
    memoLast() { return memoNode; },
    memoKeep(key, node) { if (key && active) (active.memo ??= new Map()).set(here(), { key, node }); },
    after(callback) { afterRender.push(callback); schedule(); },
    focus(id) { afterRender.push(() => document.getElementById(id)?.focus()); schedule(); },
    cleanup(callback) { if (active) active.cleanupCallbacks[active.cleanupIndex++] = callback; },
    pushGlobal: key => keys.push({ value: String(key), explicit: true, global: true, depth: frames.length }),
    pushKey: key => keys.push({ value: String(key), explicit: true, depth: frames.length }),
    pushCall: key => keys.push({ value: key, explicit: false }),
    popKey: () => keys.pop(),
  };
  return api;
})(); } \\/;
        install();
    }
    fn storage_init() void {
        init();
        let install: fun() void = @es/\\ () => { (function installWutuStorage(api) {
  if (api.store) return;
  // A non-finite F64 becomes null in JSON; keep the other stored fields.
  api.storageReviveF64 = value => value === null ? 0 : value;
  const stores = new Map();
  const DEBOUNCE_MS = 180;
  let timer;

  function report(cause) {
    const message = String(cause.message ?? cause);
    if (api.storageError === message) return;
    api.storageError = message;
    api.notify();
  }

  function flush() {
    clearTimeout(timer); timer = 0;
    for (const [key, store] of stores) {
      if (!store.dirty || store.conflict) continue;
      try {
        const value = store.encode();
        if (value !== store.last) {
          localStorage.setItem(key, value);
          store.last = value;
        }
        store.dirty = false;
      } catch (cause) {
        report(cause);
      }
    }
  }

  function save(key) {
    const store = stores.get(key);
    if (!store) return;
    store.conflict = false;
    store.dirty = true;
    // (A timer already waiting is kept: one every render restarts never fires while a clock ticks.)
    if (!timer) timer = setTimeout(flush, DEBOUNCE_MS);
  }

  api.flush = flush;
  api.save = save;
  api.autoSave = () => {
    for (const [key, store] of stores) if (!store.manual && !store.conflict) save(key);
  };
  api.store = (key, encode, manual = false, apply = null) => {
    let last = null;
    try { last = localStorage.getItem(key); } catch { /* no store: reads '' */ }
    stores.set(key, { encode, manual, apply, last, dirty: false });
  };
  api.reload = key => {
    const store = stores.get(key);
    if (!store) return;
    try {
      const raw = localStorage.getItem(key);
      store.apply?.(raw ?? '');
      store.last = raw;
      store.dirty = false;
      store.conflict = false;
      api.storageError = '';
      api.refresh();
    } catch (cause) {
      report(cause);
    }
  };

  const on = (...a) => globalThis.addEventListener?.(...a); on('pagehide', flush);
  on('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  on('storage', event => {
    // A null key is another tab's clear(): every store is removed.
    for (const store of event.key === null ? [...stores.values()] : [stores.get(event.key)]) {
      if (!store) continue;
      if (store.dirty) {
        store.conflict = true;
        clearTimeout(timer); timer = 0;
        report('Unsaved local changes conflict with another tab. Reload or explicitly save to keep this tab.');
        continue;
      }
      try {
        store.apply?.(event.newValue ?? '');
        store.last = event.newValue;
        api.refresh();
      } catch (cause) {
        report(cause);
      }
    }
  });
})(globalThis.__utuWutu); } \\/;
        install();
    }
    fn stored_load(key: Str) Str {
        let load: fun(Str) Str = @es/\\ key=>{try{return localStorage.getItem(key)??'';}catch(e){globalThis.__utuWutu.storageError=String(e.message??e);return '';}} \\/;
        load(key);
    }
    fn stored_register(key: Str, encode: cl() Str, manual: Bool, apply: cl(Str) void) void {
        let register: fun(Str,cl() Str,Bool,cl(Str) void) void = @es/\\ (key,encode,manual,apply)=>globalThis.__utuWutu.store(key,encode,!!manual,apply) \\/;
        register(key,encode,manual,apply);
    }
    /// A shared stylesheet (\`@style\`, \`@document\`), installed once.
    fn style(sheet: Str) void {
        init();
        let install: fun(Str) void = @es/\\ (function wutuStyle(sheet) {
  /** A shared sheet joins the \`wutu.document\` layer, below element styles; its \`@import\`s go first. */
  function layered(css) {
    // (No regex here: this source ships inside an @es envelope, where a slash
    // next to a backslash would end it.)
    let imports = '', rest = '', i = 0;
    for (let at = css.indexOf('@import', i); at >= 0; at = css.indexOf('@import', i)) {
      // (The \`;\` outside strings and parentheses: a font URL may have some.)
      let end = -1, quote = '', depth = 0;
      for (let j = at; j < css.length && end < 0; j++) {
        const c = css[j];
        if (quote) { if (c === '\\\\') j++; else if (c === quote) quote = ''; }
        else if (c === '"' || c === "'") quote = c;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ';' && depth <= 0) end = j;
      }
      if (end < 0) break;
      const rule = css.slice(at, end);
      rest += css.slice(i, at);
      imports += rule.includes('layer(') ? rule + ';' : rule + ' layer(wutu.document);';
      i = end + 1;
    }
    rest += css.slice(i);
    return imports + (rest.trim() ? '@layer wutu.document{' + rest + '}' : '');
  }

  const installed = globalThis.__wutuStyles ??= new Set();
  const css = layered(sheet);
  if (installed.has(css)) return;
  installed.add(css);
  // Prerendered pages already contain their sheets.
  if ([...document.querySelectorAll('style')].some(node => node.textContent === css)) return;
  const node = document.createElement('style');
  node.textContent = css;
  document.head.append(node);
}) \\/;
        install(sheet);
    }
    fn invalidate(name: Str) void {
        let call: fun(Str) void = @es/\\ (name)=>globalThis.__utuWutu?.invalidate(name) \\/;
        call(name);
    }
    fn save(key: Str) void {
        let call: fun(Str) void = @es/\\ (key)=>globalThis.__utuWutu?.save?.(key) \\/;
        call(key);
    }
    fn flush() void {
        let call: fun() void = @es/\\ ()=>globalThis.__utuWutu?.flush?.() \\/;
        call();
    }
    fn focus(id: Str) void {
        let call: fun(Str) void = @es/\\ (id)=>globalThis.__utuWutu?.focus(id) \\/;
        call(id);
    }
    fn after_render(callback: cl() void) void {
        let call: fun(cl() void) void = @es/\\ (callback)=>globalThis.__utuWutu?.after(callback) \\/;
        call(callback);
    }
    fn on_cleanup(callback: cl() void) void {
        let call: fun(cl() void) void = @es/\\ (callback)=>globalThis.__utuWutu?.cleanup(callback) \\/;
        call(callback);
    }
    /// A template's text hole (\`= x;\`): a number or a Bool shows as its
    /// \`to_str()\`, a Str or a node as itself. The compiler picks which, by
    /// x's type; this body is never what runs.
    fn show(value: Externref) Externref {
        value;
    }
    /// A keyed loop's key (\`key k\`) as text: a Str is itself, a number or
    /// a Bool its \`to_str()\`. The compiler picks which; this body is never
    /// what runs.
    fn key_text(value: Externref) Str {
        "";
    }
    /// A text hole's reuse key (\`= f(a, b);\`): the compiler makes it, from
    /// the call and its arguments; this body is never what runs.
    fn memo_key(call: Externref, key: Str) Str {
        key;
    }
    fn route() Str {
        let call: fun() Str = @es/\\ ()=>location.hash.slice(1)||"/" \\/;
        call();
    }
    fn number(value: I32) Str {
        let format: fun(I32) Str = @es/\\ value=>String(value) \\/;
        format(value);
    }
    fn money(cents: I32) Str {
        let format: fun(I32) Str = @es/\\ cents=>(cents<0?"-$":"$")+(Math.abs(cents)/100).toFixed(2) \\/;
        format(cents);
    }
    fn decimal(value: F64, digits: I32) Str {
        let format: fun(F64,I32) Str = @es/\\ (value,digits)=>value.toFixed(Math.max(0,Math.min(20,digits))) \\/;
        format(value,digits);
    }
    fn reload_store(key: Str) void {
        let reload: fun(Str) void = @es/\\ key=>globalThis.__utuWutu?.reload?.(key) \\/;
        reload(key);
    }
    fn interval(key: Str, milliseconds: F64, callback: cl() void) void {
        let start: fun(Str, F64, cl() void) void = @es/\\ (key,ms,callback)=>globalThis.__utuWutu?.interval(key,ms,callback) \\/;
        start(key,milliseconds,callback);
    }
    fn storage_error() Str {
        let read: fun() Str = @es/\\ () => globalThis.__utuWutu?.storageError ?? "" \\/;
        read();
    }
    fn refresh() void {
        let update: fun() void = @es/\\ () => globalThis.__utuWutu?.refresh() \\/;
        update();
    }
}
`.replaceAll("@@IR_WASM@@",M)]]);Q.set("std:Browser",on);Q.set("std:JS",ln);Q.set("std:Web",fn);Q.set("std:Worker",dn);function cn(e,n,t){let r=n.findIndex(y=>y.key===t);if(r<0)throw new Error(`no loaded file ${t}`);let i=e.file_first_token(r),l=e.file_end_token(r),d=new Uint8Array(e.node_kind.buffer),f=new Int32Array(e.node_first.buffer),s=new Int32Array(e.node_last.buffer),m=new Int32Array(e.node_child.buffer),o=new Int32Array(e.node_next.buffer),a=-1;for(let y=0,c=e.node_count();y<c;y++)if(d[y]===0&&f[y]>=i&&s[y]<=l){a=y;break}if(a<0)throw new Error(`no syntax tree for ${t}`);let u=new Map,h=y=>{let c=d[y];return u.has(c)||u.set(c,e.node_kind_name(c)),u.get(c)},w=y=>{let c=[];for(let g=m[y];g>=0;g=o[g])c.push(w(g));return`(${h(y)}${c.length?` ${c.join(" ")}`:""})`};return w(a)}function Rt(e,n){let t=new TextEncoder().encode(n),r=e.source(t.length);return new Uint8Array(e.src.buffer).set(t,r),e.tokens(t.length),e.nodes(t.length)<0?null:cn(e,[{key:"<source>"}],"<source>")}var he={binding:"#2563eb",call:"#059669",import:"#d97706",type:"#7c3aed"},un={binding:"name resolves to declaration",call:"call reaches function",import:"module imports file",type:"expression uses type"};function mn(e,n,t){let r=ue(e,n),i=Z(n),l=n.find(c=>c.key===t);if(!l)throw new Error(`no loaded file ${t}`);let d=[],f=new Set,s=(c,g,x,k="")=>{if(!g||!x)return;let E=`${c}:${g.file}:${g.start}:${x.file}:${x.start}`;f.has(E)||(f.add(E),d.push({kind:c,from:g,to:x,label:k||un[c]}))};for(let{decl:c,at:g}of r.names(t)){let x=r.definition(c);x&&!(g.file===x.file&&g.start===x.start)&&s("binding",g,x)}let m=new Uint8Array(e.node_kind.buffer),o=new Int32Array(e.node_first.buffer),a=new Int32Array(e.node_last.buffer),u=new Int32Array(e.tok_start.buffer),h=new Int32Array(e.node_child.buffer),w=new Int32Array(e.node_next.buffer),y=new Int32Array(e.node_decl.buffer);for(let c=0,g=e.node_count();c<g;c++){if(o[c]>=a[c]||u[o[c]]<l.offset||u[o[c]]>=l.offset+l.bytes.length)continue;let x=r.at(c);if(!x||x.file!==t)continue;if(e.node_kind_name(m[c])==="call_expr"){let E=h[c];if(E>=0){let S=y[E];if(S<0)for(let T=h[E];T>=0;T=w[T])y[T]>=0&&(S=y[T]);S>=0&&s("call",x,r.definition(S))}}let k=e.node_type_decl?.(c,1)??-1;k>=0&&s("type",x,r.definition(k))}for(let c=0,g=e.import_count();c<g;c++){if(n[e.import_from(c)]?.key!==t)continue;let k=i(e.import_path_start(c)),E=i(e.import_path_end(c)),S=k&&{file:k.file.key,start:k.offset,end:E?.offset??k.offset},T=new TextDecoder().decode(new Uint8Array(e.src.buffer,e.import_path_start(c),e.import_path_end(c)-e.import_path_start(c))).replace(/^['"]|['"]$/g,""),R={file:n.find(N=>N.key===T||N.key.endsWith(`/${T.replace(/^\.\//,"")}`))?.key??T,start:0,end:0};s("import",S,R,`imports ${R.file}`)}return{key:t,source:l.text,edges:d}}var D=e=>String(e).replace(/[&<>"']/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[n]);function Wt(e,n,t){let{source:r,edges:i}=mn(e,n,t),l=r.split(`
`),d=[0];for(let c=0;c<r.length;c++)r[c]===`
`&&d.push(c+1);let f=c=>{let g=0,x=d.length-1;for(;g<x;){let k=g+x+1>>1;d[k]<=c?g=k:x=k-1}return{x:64+(c-d[g])*8.4,y:24+g*20}},s=i.filter(c=>c.from.file===t&&c.to.file===t),m=i.filter(c=>c.from.file===t&&c.to.file!==t),o=Math.max(720,64+Math.max(40,...l.map(c=>c.length))*8.4+180),a=32+l.length*20,u=s.map(c=>{let g=f(c.from.start),x=f(c.to.start),k=Math.min(120,24+Math.abs(g.y-x.y)*.35);return`<path class="edge ${c.kind}" d="M${g.x} ${g.y-5} C${g.x+k} ${g.y-24},${x.x+k} ${x.y-24},${x.x} ${x.y-5}" stroke="${he[c.kind]}"><title>${D(c.label)}</title></path>`}).join(`
`),h=l.map((c,g)=>`<text class="ln" x="8" y="${24+g*20}">${g+1}</text><text class="src" x="64" y="${24+g*20}">${D(c)}</text>`).join(`
`),w=Object.keys(he).map(c=>`<label><input type="checkbox" data-kind="${c}" checked><span style="color:${he[c]}">\u25CF</span> ${D(un[c])} (${i.filter(g=>g.kind===c).length})</label>`).join(" "),y=m.map(c=>`<li>${D(c.label)} \u2014 ${D(c.to.file)}</li>`).join("");return`<!doctype html><meta charset="utf-8"><title>utu graphs \u2014 ${D(t)}</title>
<style>body{font:13px system-ui,sans-serif;color:CanvasText;background:Canvas;margin:24px}h1{font-size:16px}.legend{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}.wrap{overflow:auto;border:1px solid #8886;border-radius:6px}svg{display:block;font:12px ui-monospace,monospace;white-space:pre}.ln{fill:#888}.src{fill:CanvasText}.edge{fill:none;stroke-width:1.5;opacity:.7}.edge:hover{opacity:1;stroke-width:2.5}.edge.off{display:none}</style>
<h1>Compiler graphs</h1><p>${D(t)}</p><div class="legend">${w}</div>
<div class="wrap"><svg width="${o}" height="${a}" viewBox="0 0 ${o} ${a}">${u}${h}</svg></div>
${y?`<h2>Other files</h2><ul>${y}</ul>`:""}
<script>for(const box of document.querySelectorAll('input[data-kind]'))box.addEventListener('change',()=>{for(const edge of document.querySelectorAll('.edge.'+box.dataset.kind))edge.classList.toggle('off',!box.checked)})</script>`}async function Ot(e,{map:n=null,files:t=[],source:r=!1}={}){let{print:i}=await import("./wasm-tools-Z5CCSMNW.js"),l=await i(e);if(!r||!n?.functions?.length||!t.length)return l;let d=new Map(t.map(a=>[a.key,a])),f=new Map(t.map(a=>[a.key,a.text.split(/\r?\n/)])),s=new Map;for(let a of n.entries??[])a.ownerAt==null||!a.file||!a.line||(s.has(a.ownerAt)||s.set(a.ownerAt,[]),s.get(a.ownerAt).push(a));let m=new Map,o=a=>{for(let u=t.length-1;u>=0;u--){let h=t[u];if(a<h.offset||a>=h.offset+h.bytes.length)continue;let w=new TextDecoder().decode(h.bytes.subarray(0,a-h.offset));return{file:h,line:w.split(`
`).length}}return null};for(let a=0;a<n.functions.length;a++){let u=n.functions[a];if(u==null)continue;let h=o(u);if(!h)continue;let w=s.get(u)??[],y=new Map([[`${h.file.key}:${h.line}`,h.line]]);for(let g of w)y.set(`${g.file}:${g.line}`,g.line);let c=[];for(let g of[...y.keys()].sort((x,k)=>x.localeCompare(k,void 0,{numeric:!0})).slice(0,80)){let x=g.lastIndexOf(":"),k=d.get(g.slice(0,x)),E=Number(g.slice(x+1));if(!k)continue;let S=f.get(k.key)?.[E-1]?.trim()??"";c.push(`  ;; ${g.replace(/[\r\n]/g," ")} ${S.replace(/[\r\n]/g," ")}`)}m.set(a,c.join(`
`))}return l.replace(/^(\s*)\(func (?:\$[^\s]+ )?\(;([0-9]+);\)/gm,(a,u,h)=>{let w=m.get(Number(h));return w?`${w}
${a}`:a})}export{te as MODES,le as OPTIMIZE,Q as PLATFORM_SOURCES,J as ROLE,re as TARGET,de as builtModule,ft as catalogStdlib,Rn as compile,Ye as compileProgram,gt as formatDiagnostics,At as glueSource,mn as graphData,ce as instantiate,En as loadCompiler,fe as loadProgram,Tt as loaderSource,Rt as parseSyntaxTree,Ot as printWat,ue as programIndex,Ze as readDiagnostics,Wt as renderGraphHtml,cn as syntaxTree};
