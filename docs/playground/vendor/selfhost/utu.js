function Ae(e,n={}){for(let t of e?.ops??[])t==="promise_then"&&(n.promise_then=vn),t==="promise_catch"&&(n.promise_catch=kn);return n}var Te=new WeakSet,vn=(e,n)=>{e.then(n,t=>{if(!Te.has(e))throw t})},kn=(e,n)=>{Te.add(e),e.catch(n)};function $e(e,n={}){for(let t of e?.awaits??[])n[`await_${t}`]=In(t.startsWith("null_"));return n}function In(e=!1){if(typeof WebAssembly.Suspending!="function")throw new Error("utu: `await` needs JS Promise Integration (WebAssembly.Suspending), which this host does not provide \u2014 use `.then` instead, or run on a JSPI-capable host (Chrome 126+, Node 23+, Bun)");return new WebAssembly.Suspending(e?async n=>await n??null:async n=>await n)}var je=Symbol("utu.closure");function Me(e,n={}){if(!e)return n;e.new&&(n.closure_new=e.sigs?(t,r,s,a)=>Ie(t,r,s,a,e.sigs):Ie),n.closure_rec=Sn;for(let t of e.calls??[])n[t]=An;return n}var ke=new WeakMap,Ie=(e,n,t,r,s)=>{let a=n==null&&!(t&2),f=a&&ke.get(e);if(f)return f;let c=a?(...i)=>e(...i):(...i)=>e(n,...i),o=s?.[(t>>4)-1],u=o?(...i)=>{for(let l=0;l<o.length;l++){let p=o[l];if(p==="b")i[l]=i[l]?1:0;else if(p==="n")i[l]===void 0&&(i[l]=null);else if(p==="h"&&i[l]==null)throw new TypeError(`Wrong type from JavaScript: a closure's argument ${l+1} is ${i[l]}`)}return c(...i)}:c,m=t&1?(...i)=>!!u(...i):t&4?(...i)=>u(...i)>>>0:t&8?(...i)=>BigInt.asUintN(64,u(...i)):u;return m[je]=r,a&&ke.set(e,m),m},Sn=e=>e?.[je]??null,An=(e,...n)=>e(...n),Tn={U8:"Uint8Array",I8:"Int8Array",U16:"Uint16Array",I16:"Int16Array",I32:"Int32Array",U32:"Uint32Array",I64:"BigInt64Array",U64:"BigUint64Array",F32:"Float32Array",F64:"Float64Array"};function Fe(e,n={}){for(let{name:r,kind:s,host:a,data:f}of e??[]){if(!a)continue;let c=Math.max(1,Math.ceil((f?f.length*3/4:0)/65536)),o=new WebAssembly.Memory({initial:c,maximum:65535}),u=globalThis[Tn[s]],m=u.BYTES_PER_ELEMENT,i=l=>{let p=Math.ceil(l/65536)-o.buffer.byteLength/65536;p>0&&o.grow(p)};n[`mem_${r}`]=o,n[`mem_copy_in_${r}`]=l=>{if(typeof l=="string")return i(l.length*3),Math.floor(new TextEncoder().encodeInto(l,new Uint8Array(o.buffer)).written/m);let p=l instanceof ArrayBuffer?new Uint8Array(l):new Uint8Array(l.buffer,l.byteOffset,l.byteLength);return i(p.byteLength),new Uint8Array(o.buffer).set(p),Math.floor(p.byteLength/m)},n[`mem_view_${r}`]=(l,p)=>new u(o.buffer,l*m,p-l)}return n}function Ee(e={}){return e.js_tag=WebAssembly.JSTag,e}function Be(e,n){let t=n?.asyncExports??[];if(t.length===0)return e.exports;let r={...e.exports};for(let s of t)typeof r[s]=="function"&&(r[s]=$n(r[s]));return r}function $n(e){return Object.defineProperty(WebAssembly.promising(e),"length",{value:e.length})}function Re(e,n,t=[]){if(!n)return e;let r={Bool:u=>u!==0,U32:u=>u>>>0,U64:u=>BigInt.asUintN(64,u)},s=u=>u,a=(u,m,i,l)=>{throw new TypeError(`${u}: argument ${m+1} must be ${i}, not ${l===null?"null":i==="an integer"&&typeof l=="number"?l:typeof l}`)},f=u=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${u===null?"null":u instanceof Promise?"a Promise (await it: Promise[Str])":typeof u}`)},c=(u,m,i)=>{if(m==="Bool")return l=>!!l;if(m==="int")return l=>Number.isInteger(l)?l:a(u,i,"an integer",l);if(m==="big")return l=>typeof l=="bigint"?l:a(u,i,"a BigInt",l);if(m==="num")return l=>typeof l=="number"?l:a(u,i,"a number",l);if(m==="Str")return l=>typeof l=="string"?l:a(u,i,"a string",l);if(m==="?Str")return l=>l==null?null:typeof l=="string"?l:a(u,i,"a string or null",l);if(m==="ref")return l=>l??a(u,i,"a value",l);if(m==="cl")return l=>typeof l=="function"?l:a(u,i,"a function",l);if(m.startsWith("cl:")){let[,l,p]=m.split(":"),w=[...l].map(d=>d==="B"?_=>!!_:d==="U"?_=>_>>>0:d==="W"?_=>BigInt.asUintN(64,_):s),g=p==="b"?d=>d?1:0:p==="S"?d=>typeof d=="string"?d:f(d):p==="n"?d=>d??null:s;return d=>typeof d=="function"?(..._)=>g(d(..._.map((v,k)=>w[k](v)))):a(u,i,"a function",d)}return m==="?"?l=>l===void 0?null:l:s},o={...e};for(let[u,m]of Object.entries(n)){let i=e[u];if(typeof i!="function")continue;let l=typeof m=="string"?m:m.r,p=Array.isArray(l)?l.map(_=>r[_]??s):null,w=p?_=>_.map((v,k)=>p[k](v)):r[l]??s,g=(typeof m=="string"?[]:m.p??[]).map((_,v)=>c(u,_,v)),d=(..._)=>{for(let k=0;k<g.length;k++)_[k]=g[k](_[k]);let v=i(..._);return v instanceof Promise?v.then(w):w(v)};o[u]=t.includes(u)?(..._)=>{try{return d(..._)}catch(v){return Promise.reject(v)}}:d,Object.defineProperty(o[u],"length",{value:i.length})}return o}var Se=/^(?:\s|\/\/.*|\/\*[\s\S]*?\*\/)*import\s[^;]*;/,Oe="const $utuFn = (n, f) => { if (typeof f != 'function') throw new TypeError(`${n}: @es gave ${f === null ? 'null' : typeof f}, not a function`); return f; };",We=e=>e.includes("$utuFn(");function H(e){let n=[],t=e;for(let r=t.match(Se);r;r=t.match(Se))n.push(r[0].trim()),t=t.slice(r[0].length);return{imports:n,expr:t.trim()}}function Z(e,n=null){let t=new Set,r=[],s=!1;for(let f of Object.values(e??{}))for(let[c,o]of Object.entries(f??{})){if(n&&!n.has(c))continue;let{imports:u,expr:m}=H(o);for(let i of u)t.add(i);s||=We(m),r.push(`export const ${K(c)} = (
${m}
);`)}return r.length===0?"":`${(t.size?`${[...t].join(`
`)}

`:"")+(s?`${Oe}

`:"")}${r.join(`

`)}
`}function K(e){return/^\d/.test(e)?`$${e}`:e}function Ne(e,n){let t={};for(let[r,s]of Object.entries(e??{})){t[r]={};for(let a of Object.keys(s??{})){if(!(K(a)in n))continue;let f=n[K(a)];t[r][a]=typeof f=="function"?f:()=>f}}return t}function Ue(e){let n={};for(let[t,r]of Object.entries(e??{})){n[t]={};for(let[s,a]of Object.entries(r??{})){let f=new Function(`${We(a)?Oe:""}return (${a});`)();n[t][s]=typeof f=="function"?f:()=>f}}return n}var jn=/(?<=\b(?:if\b[^{};]*|else\s*))\{[^{};]*;?\s*\}/g;function Ve(e,n){let t=[];if(!Mn(e))return t;let r=0,s=!1,a=[];for(let[f,c]of e.split(`
`).entries()){let o=c.length>160;if(!o&&!s&&!a.length&&(!c.includes("`")&&!c.includes("/*")||/^\s*\/\//.test(c))){r+=c.length+1;continue}let u="",m=!1;if(!c.trimStart().startsWith("\\\\"))for(let l=0;l<c.length;l++){let p=c[l],w=c[l+1],g=a.length-1;if(s)p==="*"&&w==="/"&&(s=!1,l++);else if(m)p==="\\"?l++:p==='"'&&(m=!1);else if(a[g]==="text")p==="\\"?l++:p==="`"?a.pop():p==="$"&&w==="{"&&(a.push(0),l++);else{if(p==="/"&&w==="/")break;p==="/"&&w==="*"?(s=!0,l++):p==='"'?m=!0:p==="`"?a.push("text"):g>=0?p==="{"?a[g]++:p==="}"&&a[g]--===0&&a.pop():o&&(u+=p)}}let i=()=>(u.replace(jn," ").match(/[{};]/g)??[]).length;if(o&&u.trim().length>100&&i()>=5){let l=c.search(/\S/)+1;t.push({kind:"compressed-source",severity:"warning",message:"This line packs multiple statements or blocks together. Put statements and block contents on separate, indented lines; keep source readable and minify build output instead.",primary:{file:n,row:f+1,col:l,endRow:f+1,endCol:c.length+1,start:r+l-1,end:r+c.length},related:[],notes:[],fixes:[]})}r+=c.length+1}return t}function Mn(e){for(let n=0,t;n<e.length;n=t+1)if(t=e.indexOf(`
`,n),t<0&&(t=e.length),t-n>160)return!0;return!1}function Fn(e){return e.replace(/"[^"\n]*"|\/\/[^\n]*|\\\\[^\n]*/g,n=>n[0]==='"'?`"${" ".repeat(n.length-2)}"`:" ".repeat(n.length))}function Ce(e,n){let t=e.slice(0,n).split(`
`);return{row:t.length,col:t.at(-1).length+1}}function Pe(e){let n=new Set,t=[];for(let[r,s]of e){if(!s.includes("@island")&&!s.includes("invalidate"))continue;let a=Fn(s);for(let f of a.matchAll(/@island\s+"/g)){let c=f.index+f[0].length;n.add(s.slice(c,s.indexOf('"',c)))}if(!/^(std|node|npm):/.test(r))for(let f of a.matchAll(/\bwutu\s*\.\s*invalidate\s*\(\s*"/g)){let c=f.index+f[0].length-1,o=s.indexOf('"',c+1)+1;t.push({file:r,source:s,start:c,end:o,name:s.slice(c+1,o-1)})}}return t.filter(r=>!n.has(r.name)).map(({file:r,source:s,start:a,end:f,name:c})=>{let o=Ce(s,a),u=Ce(s,f),m=[...n].sort();return{kind:"unknown-island",severity:"warning",message:`No @island named "${c}" exists, so this invalidate refreshes nothing.${m.length?` Known islands: ${m.map(i=>`"${i}"`).join(", ")}.`:""}`,primary:{file:r,row:o.row,col:o.col,endRow:u.row,endCol:u.col,start:a,end:f},related:[],notes:[],fixes:[]}})}function qe(e){let n=null;try{n=JSON.parse(e)}catch{return null}return n?.version===1&&Array.isArray(n.types)&&n.exports&&n.names&&/^[A-Z][A-Za-z0-9_]*$/.test(n.prefix)?n:null}var D={entry:0,import:1,prelude:2},le={normal:0,test:1,comptime:2,bench:3,analysis:4},me={none:0,size:1,speed:2},oe={small:{optimize:"size",safe:!0},fast:{optimize:"speed",safe:!0},smallUnsafe:{optimize:"size",safe:!1},fastUnsafe:{optimize:"speed",safe:!1},debug:{optimize:"none",safe:!0}};var Ge=Object.freeze({builtins:["js-string"],importedStringConstants:"'"}),ee=new TextDecoder,J=new TextEncoder,V=(e,n,t)=>ee.decode(new Uint8Array(e.buffer,n,t-n));async function En(e,n={}){return(await ge(e,n)).exports}async function Bn(e,n,t){let r=t.mode&&Object.hasOwn(oe,t.mode)?oe[t.mode]:null;if(t.mode&&!r)throw new Error(`no build mode ${t.mode}: ${Object.keys(oe).join(", ")}`);let{target:s="normal",optimize:a="size",debugNames:f=!1,safe:c=!1,sourceMap:o=!1,blame:u=!1,profile:m=!1,run:i=!1,luge:l=!1}={...t,...r};e.set_optimize(me[a]??me.size),e.set_luge?.(l?1:0),e.set_safe(c?1:0),e.set_debug_names(f?1:0),e.set_move_limit?.(t.moveLimit??0),e.set_source_map?.(o||u?1:0),e.set_profile?.(m?1:0),e.set_run?.(i?1:0);let p,w;try{p=await pe(e,n,t),w=await nn(e,le[s]??le.normal,t)}catch(_){if(!Dn(_))throw _;return p=Ze.get(e)??[],{wasm:null,spec:null,diagnostics:[Jn(e,p,_)],files:p}}let g=rt(e,p),d=tn(e,p).concat(g,it(p));return w<0||g.length?{wasm:null,spec:null,diagnostics:d,files:p}:{...he(e,w),diagnostics:d,files:p,tests:s==="test"?Cn(e):[],benches:s==="bench"?On(e):[],map:o&&e.map_count?Wn(e,p):null,blame:u&&e.blame_prepare?Un(e,p):null,...m?{frames:Rn(e,p)}:{},...i&&e.run_leaf?.()?{array:{levels:e.run_levels(),leaf:e.run_leaf()}}:{}}}function Rn(e,n){let t=ne(n),r=[];for(let s=0;s<e.profile_count();s++){let a=e.profile_at(s),f=a>=0?t(a):null;r.push({name:e.profile_name(s),file:f?.file.key??null,line:f?.line??null})}return r}function On(e){let n=[];for(let t=0;t<e.bench_count();t++)n.push({export:`__bench_${t}`,name:Ke(e,e.bench_mod_start(t),e.bench_mod_end(t))+Ye(V(e.src,e.bench_name_start(t),e.bench_name_end(t)))});return n}function ne(e){let n=e.toSorted((r,s)=>r.offset-s.offset),t=new Map;return r=>{let s=0,a=n.length-1,f=null;for(;s<=a;){let i=s+a>>1;n[i].offset<=r?(f=n[i],s=i+1):a=i-1}if(!f||r>f.offset+f.bytes.length)return null;let c=t.get(f);if(!c){c={bytes:[0],units:[0]};let{bytes:i}=f;for(let l=0;l<i.length;l++){if(i[l]!==10&&(i[l]!==13||i[l+1]===10))continue;let p=c.bytes.at(-1);c.units.push(c.units.at(-1)+ee.decode(i.subarray(p,l+1)).length),c.bytes.push(l+1)}t.set(f,c)}let o=r-f.offset;for(s=0,a=c.bytes.length-1;s<a;){let i=s+a+1>>1;c.bytes[i]<=o?s=i:a=i-1}let u=ee.decode(f.bytes.subarray(c.bytes[s],o)),m=1;for(let i=0;i<u.length;i++){let l=u.charCodeAt(i);(l<56320||l>57343)&&m++}return{file:f,line:s+1,column:m,unit:u.length+1,offset:c.units[s]+u.length}}}function Wn(e,n){let t=ne(n),r=new Map,s=new Map,a=new Map,f=[];for(let o=0;o<e.map_count();o++){let u=e.map_start(o),m=e.map_end(o),i=`${u}:${m}`,l=r.get(i);if(!l){let g=u>=0?t(u):null,d=e.map_kind(o);s.has(d)||s.set(d,d>=0?e.node_kind_name(d):null);let _=e.map_owner_start(o);_>=0&&!a.has(_)&&a.set(_,e.map_owner_name(o)),l={file:g?.file.key??null,line:g?.line??null,column:g?.column??null,unit:g?.unit??null,start:g?.offset??null,end:g?t(m)?.offset??g.offset:null,kind:s.get(d),owner:_>=0?a.get(_):null,ownerAt:_>=0?_:null},r.set(i,l)}let p=e.map_site_start?.(o)??-1,w=p>=0?t(p):null;f.push({at:e.map_offset(o),...l,site:w&&{file:w.file.key,line:w.line,column:w.column,start:w.offset,end:t(e.map_site_end(o))?.offset??w.offset}})}let c=[];for(let o=0;o<e.map_function_count();o++){let u=e.map_function_start(o);c.push(u>=0?u:null)}return{entries:f,functions:c}}var Nn=["defined","import","helper","wat"];function Un(e,n){e.blame_prepare();let t=ne(n),r=[],s=[],a=new Map,f=new Map,c=new Map,o=g=>{let d=e.blame_node_kind(g);return c.has(d)||c.set(d,d>=0?e.node_kind_name(d):null),c.get(d)},u=g=>{let d=t(e.blame_node_start(g));return d&&{file:d.file.key,line:d.line,column:d.column,start:d.offset,end:t(e.blame_node_end(g))?.offset??d.offset}},m=g=>{if(g<0)return-1;if(!f.has(g)){let d=u(g);f.set(g,d?s.push({name:e.blame_decl_name(g),kind:o(g),...d})-1:-1)}return f.get(g)},i=g=>{if(g<0)return-1;if(!a.has(g)){let d=u(g);a.set(g,d?r.push({...d,kind:o(g),decl:m(e.blame_decl(g))})-1:-1)}return a.get(g)},l=[];for(let g=0;g<e.map_count();g++)l.push({at:e.map_offset(g),place:i(e.blame_map_node(g)),site:i(e.blame_map_site(g))});let p=[];for(let g=0;g<e.map_function_count();g++){let d=ee.decode(Uint8Array.from(e.blame_func_name(g),_=>_.charCodeAt(0)));p.push({place:i(e.blame_func_node(g)),role:Nn[e.blame_func_role(g)],name:d||null})}let w=(g,d)=>Array.from({length:g},(_,v)=>i(d(v)));return{places:r,decls:s,entries:l,funcs:p,types:w(e.blame_type_count(),g=>e.blame_type_node(g)),globals:w(e.blame_glob_count(),g=>e.blame_glob_node(g)),data:w(e.blame_data_count(),g=>e.blame_data_node(g)),memories:w(e.blame_memory_count(),g=>e.blame_memory_node(g))}}function Cn(e){let n=[];for(let t=0;t<e.test_count();t++)n.push({export:`__test_${t}`,name:Ke(e,e.test_mod_start(t),e.test_mod_end(t))+Ye(V(e.src,e.test_name_start(t),e.test_name_end(t)))});return n}var Ke=(e,n,t)=>n<0?"":`${V(e.src,n,t)}: `,Vn={n:`
`,t:"	",r:"\r",b:"\b",f:"\f"};function Ye(e){return e.slice(1,-1).replace(/\\(u[0-9a-fA-F]{4}|.)/g,(n,t)=>t.length>1?String.fromCharCode(parseInt(t.slice(1),16)):Vn[t]??t)}async function pe(e,n,t,r=new Map){let{resolvePath:s=rn,stdlib:a}=t,f=async d=>(r.has(d)||r.set(d,await(t.readFile.bytes??t.readFile)(d)),r.get(d)),c=zn(e,a),o=[...c.files];Ze.set(e,o);let u=new Map(c.byKey),m=[],i=!1,l=(d,_,v)=>{if(i)return;let k=J.encode(_);new Uint8Array(e.src.buffer).set(k,e.import_missing(d,k.length,v)),i=!0},p=[],w=X(e,o,u,n,await f(n),D.entry);for(let d=0;d<e.import_count();d++){let _=o[e.import_from(d)],v=V(e.src,e.import_path_start(d),e.import_path_end(d)),k=He.test(v),R=!k&&/\.abi\.json"$/.test(v)?s(_.key,JSON.parse(v)):null;if(/^"?(npm|node):/.test(v)||R||k&&typeof a.get(v)=="function"){e.import_foreign(d),m.push({i:d,raw:v,from:_.key,abiFile:R,name:V(e.src,e.import_name_start(d),e.import_name_end(d))});continue}let A=k?v:s(_.key,JSON.parse(v)),T=u.get(A);if(T===void 0){let M=_.role===D.prelude?D.prelude:D.import;if(k){let F=a.get(A);if(typeof F!="string"){l(d,A,2);continue}T=X(e,o,u,A,F,M)}else{let F;try{F=await f(A)}catch{l(d,A,0);continue}T=X(e,o,u,A,F,M)}}e.import_bind(d,T),(p[e.import_from(d)]??=[]).push([d,T])}let g=Pn(p,w);return g&&l(g[0],o[g[1]].key,1),await Zn(e,m,t,f)?(o.diagnostics=e.resolve(),await Qn(e,n,o,t),await qn(e),o):pe(e,n,t,r)}function Pn(e,n){let t=[],r=[[n,0]];for(t[n]=1;r.length;){let s=r.at(-1),a=e[s[0]]?.[s[1]++];if(!a){t[s[0]]=2,r.pop();continue}if(t[a[1]]===1)return a;t[a[1]]||(t[a[1]]=1,r.push([a[1],0]))}return null}async function qn(e){let n=e.wat_count();if(n===0)return;let{assembleWat:t}=await import("./assemble-EOXNQ5ET.js"),r=f=>e.node_kind_name(new Uint8Array(e.node_kind.buffer)[f]),s=f=>{let c=new Int32Array(e.node_child.buffer),o=new Int32Array(e.node_next.buffer),u=[];for(let m=c[f];m>=0;m=o[m])u.push(m);return u},a=f=>{let c=new Int32Array(e.node_first.buffer)[f],o=new Int32Array(e.node_last.buffer)[f];return V(e.src,new Int32Array(e.tok_start.buffer)[c],new Int32Array(e.tok_end.buffer)[o-1])};for(let f=0;f<n;f++){let c=s(e.wat_function(f)),o=c.filter(p=>r(p)==="param_list").flatMap(s).map(p=>{let[w,g]=[s(p)[0],s(p).at(-1)];return{name:a(w),type:a(g)}}),u=c.find(p=>r(p)==="return_type"),m=r(s(u)[0])==="void_type"?"void":a(u),i=c.some(p=>r(p)==="self_param")||r(s(u)[0])==="yield_type",l=t({params:o,result:m,method:i,text:V(e.src,e.wat_text_start(f),e.wat_text_end(f))});if(l.code){let p=e.wat_set(f,l.code.length);new Uint8Array(e.wat_bytes.buffer).set(l.code,p)}else{let{message:p,start:w,end:g}=l.error,d=J.encode(p),_=e.wat_fail(f,w??-1,g??-1,d.length);new Uint8Array(e.src.buffer).set(d,_)}}}var He=/^[a-z][a-zA-Z0-9_]*:[A-Za-z][a-zA-Z0-9_]*$/;function X(e,n,t,r,s,a){let f=typeof s=="string"?J.encode(s):new Uint8Array(s),c=typeof s=="string"?s:new TextDecoder("utf-8",{ignoreBOM:!0}).decode(f),o=e.file_add(f.length,a);return r.startsWith("std:")&&e.file_mark_std?.(o),new Uint8Array(e.src.buffer).set(f,e.file_offset(o)),n.push({key:r,role:a,text:c,offset:e.file_offset(o),bytes:f}),t.set(r,o),n.parsing=!0,e.file_parse(o),n.parsing=!1,o}var Ze=new WeakMap;function Dn(e){return e instanceof RangeError&&/call stack/i.test(e.message)}function Jn(e,n,t){let r={kind:"nested-too-deeply",code:"nested-too-deeply",severity:"error",file:null,message:"Program nested too deeply",notes:["The compiler recurses on nesting; split the expression, or the chain, into smaller ones."]},s=n.parsing?e.parse_deepest_at?.()??-1:-1;s<0&&(s=Ln(e,n));let a=s<0?null:n.findLast(c=>c.offset<=s&&s<=c.offset+c.bytes.length);if(!a)return{...r,message:`${r.message} (${t.message})`};let f=Q(a,s,s);return{...r,file:a.key,...f,end:f.start+1,label:"nested too deeply",message:`${r.message} (at about line ${f.line})`}}function Ln(e,n){let t,r,s,a,f;try{f=e.node_count(),[t,r,s]=["node_child","node_next","node_first"].map(g=>new Int32Array(e[g].buffer,0,f)),a=new Int32Array(e.tok_start.buffer)}catch{return-1}let c=n.filter(g=>g.role===D.entry||g.role===D.import),o=g=>c.some(d=>d.offset<=g&&g<d.offset+d.bytes.length),u=new Uint8Array(f);for(let g=0;g<f;g++)for(let d=t[g];d>=0&&d<f&&!u[d];d=r[d])u[d]=1;let m=new Int32Array(f),i=-1,l=-1,p=0;for(let g=0;g<f;g++){if(u[g]||!o(a[s[g]]))continue;let d=[g];for(;d.length;){let _=d.pop(),v=0;for(let k=t[_];k>=0&&k<f;k=r[k])m[k]=m[_]+1,d.push(k),v++;(i<0||m[_]>m[i])&&(i=_),v>p&&(p=v,l=_)}}let w=i>=0&&m[i]>=200?i:l;return w<0?-1:a[s[w]]}var De=new WeakMap;function Xe(e){let n=De.get(e);if(!n){let t=e.map(f=>J.encode(JSON.stringify(f))),r=new Int32Array(t.length),s=new Uint8Array(t.reduce((f,c)=>f+c.length+1,1)),a=0;s[a++]=91,t.forEach((f,c)=>{c>0&&(s[a++]=44),r[c]=a,s.set(f,a),a+=f.length}),s[a++]=93,n={bytes:s.subarray(0,a),offsets:r},De.set(e,n)}return n}var Je=new WeakMap;function Qe(e){let n=Je.get(e);return n||Je.set(e,n={docs:new Map,views:new Map,wanted:new Set,prelude:null,rebuild:!1}),n}function zn(e,n){let t=Qe(e);if(!t.rebuild&&t.prelude?.files.every(r=>n.get(r.key)===r.text))return e.reset_keep(),t.prelude;e.reset(),t.docs.clear(),t.views.clear();for(let r of t.wanted){let s=Hn(e,r,Yn(e,r,t.docs));t.views.set(r,e.abi_resident_view(s.doc,s.at))}return t.prelude=Gn(e,n),e.seal(),t.rebuild=!1,t.prelude}function Gn(e,n){let t=[],r=new Map,s=n.get("std:Prelude");if(typeof s!="string")return{files:t,byKey:r};X(e,t,r,"std:Prelude",s,D.prelude);for(let f=0;f<e.import_count();f++){let c=V(e.src,e.import_path_start(f),e.import_path_end(f)),o=n.get(c);!He.test(c)||typeof o!="string"||e.import_bind(f,r.get(c)??X(e,t,r,c,o,D.prelude))}let a=n.get("std:JsonRuntime");if(typeof a=="string"&&e.json_runtime_room){let f=J.encode(a),c=e.json_runtime_room(f.length);new Uint8Array(e.src.buffer).set(f,c)}return{files:t,byKey:r}}function en(e,n){let t=e.abi_room(n.length);return new Uint8Array(e.src.buffer).set(n,t),t}var Le=new WeakMap;function Kn(e){let n=Le.get(e);if(!n){let{prefix:t,moduleSpecifier:r,exports:s,names:a,mutableGlobals:f,exportAssignment:c}=e;n={document:Xe(e.types),view:J.encode(JSON.stringify({prefix:t,moduleSpecifier:r,exports:s,names:a,mutableGlobals:f,exportAssignment:c}))},Le.set(e,n)}return n}function Yn(e,n,t){if(!t.has(n.document)){let{bytes:r,offsets:s}=n.document,a=en(e,r);e.abi_offsets_room(s.length),new Int32Array(e.abi_offsets.buffer,0,s.length).set(s),t.set(n.document,e.abi_doc_at(a,s.length))}return t.get(n.document)}function Hn(e,n,t){return{doc:t,at:en(e,n.view)}}async function Zn(e,n,{stdlib:t,resolvePackage:r},s){let a=Qe(e),f=[],c=!1;for(let{i:o,raw:u,from:m,abiFile:i,name:l}of n){let p;try{let w=i?Xn(await s(i)):/^"?(npm|node):/.test(u)?await r(JSON.parse(u),{prefix:l,from:m}):await t.get(u)();p=w.document?w:Kn(w.abi??w)}catch{continue}a.views.has(p)||(a.wanted.add(p),a.rebuild=!0,c=!0),f.push([o,p])}if(c)return!1;for(let[o,u]of f)e.abi_bind(o,a.views.get(u));return!0}var ue=new Map;function Xn(e){let n=typeof e=="string"?e:ee.decode(e);ue.has(n)||ue.set(n,qe(n));let t=ue.get(n);if(!t)throw new Error("Invalid declaration ABI");return t}async function Qn(e,n,t,{resolvePath:r=rn,readBinaryFile:s}){for(let a=0;a<e.embed_files();a++){let f=V(e.src,e.embed_path_start(a),e.embed_path_end(a)),c=e.embed_file?t[e.embed_file(a)]?.key??n:n,o;try{o=await s(r(c,f))}catch{e.embed_fail(a);continue}let u=e.embed_set(a,o.length);new Uint8Array(e.embed_bytes.buffer).set(o,u)}}async function nn(e,n,t={}){let r=e.comptime_mems();for(let s=0;s<=r;s++){let a=[];for(let i=0;i<r;i++)(e.comptime_waiting?e.comptime_waiting(i):s===0)&&a.push(i);if(a.length===0)break;let f=e.compile_program(le.comptime);if(f<0)return-1;let c=a.filter(i=>!e.comptime_can_run||e.comptime_can_run(i));if(c.length===0){for(let i of a)e.comptime_cycle(i);break}let{wasm:o,spec:u}=he(e,f),{exports:m}=await ge(o,u,t);for(let i of c){let l=e.comptime_name(i),p;try{p=await m[`__comptime_run_${l}`]()}catch(d){e.comptime_fail(i,m.__comptime_fuel?.value===0?8:nt(d));continue}let w=new Uint8Array(m[`__comptime_${l}`].buffer,0,p*e.comptime_value_size(i)).slice(),g=e.comptime_set(i,p);new Uint8Array(e.comptime_bytes.buffer).set(w,g)}}return et(e,e.compile_program(n))}async function et(e,n){if(n<0||!e.user_ir_count?.())return n;try{return await WebAssembly.compile(new Uint8Array(e.out.buffer,0,n).slice(),Ge),n}catch(t){if(!(t instanceof WebAssembly.CompileError))throw t;let r=J.encode(String(t.message).replace(/^WebAssembly\.\w+(\(\): | doesn't validate: )/,"")),s=e.ir_invalid_room(r.length);return new Uint8Array(e.src.buffer).set(r,s),e.ir_invalid_report(s,r.length),-1}}function nt(e){let n=String(e?.message??e);return!(e instanceof WebAssembly.RuntimeError)&&!/call stack|recursion/i.test(n)?7:/out of bounds/i.test(n)?1:/unreachable/i.test(n)?2:/divi.*zero|by zero/i.test(n)?3:/overflow/i.test(n)&&!/stack/i.test(n)?4:/null/i.test(n)?5:/call stack|recursion|stack/i.test(n)?6:0}function he(e,n){let t=new Uint8Array(e.out.buffer,0,n).slice(),r=e.host_json_size(),s=r?JSON.parse(V(e.host_json,0,r)):{};return{wasm:t,spec:s}}function tn(e,n){let t=[],r=new Set;for(let s=0;s<e.diagnostic_count();s++){let a=e.diagnostic_file(s),f=`${a}\0${e.diagnostic_start(s)}\0${e.diagnostic_end(s)}\0${e.diagnostic_message(s)}`;if(r.has(f))continue;r.add(f);let c=a>=0?n[a]:null,o={kind:e.diagnostic_kind(s),message:e.diagnostic_message(s),severity:"error",file:c?.key??null};if(c&&Object.assign(o,Q(c,e.diagnostic_start(s),e.diagnostic_end(s))),e.diagnostic_code){o.code=e.diagnostic_code(s).replace(/(?<=[a-z0-9])(?=[A-Z])/g,"-").toLowerCase();for(let u=0;u<e.diagnostic_extras(s);u++){let m=st[e.diagnostic_extra_kind(s,u)],i=e.diagnostic_extra_text(s,u);if(m==="note")(o.notes??=[]).push(i);else if(m==="label"){o.label=i;let l=e.diagnostic_extra_start(s,u),p=e.diagnostic_extra_end(s,u);c&&(l!==e.diagnostic_start(s)||p!==e.diagnostic_end(s))&&(o.focus=Q(c,l,p))}else{let l=n[e.diagnostic_extra_file(s,u)];if(!l)continue;let p={file:l.key,...Q(l,e.diagnostic_extra_start(s,u),e.diagnostic_extra_end(s,u))};m==="fix"?o.fix={...p,text:i,label:e.diagnostic_extra_label(s,u)}:(o.related??=[]).push({...p,role:m,label:i})}}}e.diagnostic_default_label&&o.label==null&&o.file&&(o.label=e.diagnostic_default_label(s)),t.push(o)}return t}var tt=(async()=>{}).constructor;function rt(e,n){if(!e.dsl_count)return[];let t=n.toSorted((a,f)=>a.offset-f.offset),r=a=>t.findLast(f=>f.offset<=a&&a<=f.offset+f.bytes.length)??null,s=[];for(let a=0;a<e.dsl_count();a++){let f=e.es_body_start(a);if(f<0)continue;let{expr:c}=H(V(e.src,f,e.es_body_end(a))),o=`return (
${c}
);`,u=null;try{new Function(o)}catch(i){if(!(i instanceof SyntaxError))continue;try{new tt(o)}catch(l){l instanceof SyntaxError&&!/import\.meta/.test(l.message)&&(u=l)}}let m=u&&r(e.dsl_site_start(a));m&&s.push({kind:"es-syntax",code:"es-syntax",message:`@es body is not JavaScript: ${u.message}`,severity:"error",file:m.key,...Q(m,e.dsl_site_start(a),e.dsl_site_end(a)),label:"here"})}return s}function it(e){let n=e.filter(r=>!/^(std|node|npm):/.test(r.key));return[...n.flatMap(r=>Ve(r.text,r.key)),...Pe(n.map(r=>[r.key,r.text]))].map(({kind:r,message:s,primary:a})=>({kind:r,message:s,severity:"warning",file:a.file,start:a.start,end:a.end,line:a.row,column:a.col}))}var st=["label","expected","found","related","note","fix"];function Q(e,n,t){let{units:r,lines:s}=at(e),a=i=>r[Math.min(Math.max(0,i-e.offset),r.length-1)],f=a(n),c=a(t),o=0,u=s.length-1;for(;o<u;){let i=o+u+1>>1;s[i]<=f?o=i:u=i-1}let m=1;for(let i=s[o];i<f;i++){let l=e.text.charCodeAt(i);(l<56320||l>57343)&&m++}return{start:f,end:c,line:o+1,column:m}}var ze=new WeakMap;function at(e){let n=ze.get(e);if(!n){let{bytes:t,text:r}=e,s=new Uint32Array(t.length+1),a=0;for(let c=0;c<t.length;c++){s[c]=a;let o=t[c];(o&192)!==128&&(a+=o>=240?2:1)}s[t.length]=a;let f=[0];for(let c=0;c<r.length;c++){let o=r.charCodeAt(c);(o===10||o===13&&r.charCodeAt(c+1)!==10)&&f.push(c+1)}n={units:s,lines:f},ze.set(e,n)}return n}async function ge(e,n={},{loadGlue:t=null,profiler:r=null,wrap:s=null}={}){let a=e instanceof WebAssembly.Module?e:await WebAssembly.compile(e,Ge),f=n.es??{},c=Z(f),o=c?t?Ne(f,await t(c)):Ue(f):{};r&&(o.profile=r.imports),n.closures&&(o.utu=Me(n.closures,o.utu??{})),n.mems&&(o.utu=Fe(n.mems,o.utu??{})),n.promises&&(o.utu=Ae(n.promises,o.utu??{}),o.utu=$e(n.promises,o.utu)),WebAssembly.Module.imports(a).some(i=>i.module==="utu"&&i.name==="js_tag")&&(o.utu=Ee(o.utu??{})),s?.(o);let u=await WebAssembly.instantiate(a,o),m=Re(Be(u,n.promises),n.exports,n.promises?.asyncExports);return{module:a,instance:u,exports:r?r.attach(u,m):m}}function rn(e,n){if(/^[a-z]+:\/\//i.test(e))return new URL(n,e).href;let t=e.split("/").slice(0,-1);for(let r of n.split("/"))r===".."?t.pop():r!=="."&&t.push(r);return t.join("/")}var ot=/[0-9A-Za-z!#$%&'*+\-./:<=>?@\\^_`|~]/,lt=new Set(["export","mod","struct","tag","enum","proto","fn","type","distinct","let","const","mem","vec","using"]);function ye(e,n){let t=(y,b)=>new b(y.buffer),r=t(e.node_first,Int32Array),s=t(e.node_last,Int32Array),a=t(e.tok_start,Int32Array),f=t(e.tok_end,Int32Array),c=t(e.tok_kind,Uint8Array),o=t(e.node_decl,Int32Array),u=t(e.decl_node,Int32Array),m=t(e.decl_owner,Int32Array),i=e.node_count(),l=new Map,p=y=>{for(let b=n.length-1;b>=0;b--)if(n[b].offset<=y)return y<n[b].offset+n[b].bytes.length?n[b]:null;return null},w=(y,b)=>{let h=l.get(y);if(!h){h=new Int32Array(y.bytes.length+1);let x=0;for(let I=0;I<y.bytes.length;){let S=y.bytes[I],E=S<128?1:S<224?2:S<240?3:4;for(let W=0;W<E;W++)h[I+W]=x;I+=E,x+=E===4?2:1}h[y.bytes.length]=x,l.set(y,h)}return h[b-y.offset]},g=new Array(i),d=y=>{if(y>=0&&y<i&&g[y]!==void 0)return g[y];let b=a[r[y]],h=p(b),x=h?{file:h.key,start:w(h,b),end:w(h,f[s[y]-1])}:null;return y>=0&&y<i&&(g[y]=x),x},_=null,v=y=>{if(!_){_=new Map;for(let b=0;b<i;b++){if(r[b]>=s[b])continue;let h=d(b);h&&(_.has(h.file)||_.set(h.file,[]),_.get(h.file).push(b))}}return _.get(y)??[]},k=null,R=y=>{if(!k){k=new Map;for(let b=0;b<i;b++)M(b)&&(k.has(o[b])||k.set(o[b],[]),k.get(o[b]).push(b))}return k.get(y)??[]},A=null,T=()=>{if(A)return A;A=new Int32Array(e.decl_count()).fill(-1);for(let y=0;y<i;y++){let b=o[y];if(b<0||b>=A.length||!M(y)||u[b]<0)continue;let h=a[r[y]];if(h<a[r[u[b]]]||h>=f[s[u[b]]-1])continue;let x=A[b];(x<0||h<a[r[x]])&&(A[b]=y)}return A},M=y=>o[y]>=0&&r[y]<s[y]&&s[y]-r[y]===1,F=null,O=()=>{if(F)return F;F=new Map;let y=new Uint8Array(e.src.buffer);for(let b=0,h=e.wat_count?.()??0;b<h;b++){let x=e.wat_function(b),I=-1;for(let j=0,U=e.decl_count();j<U&&I<0;j++)u[j]===x&&(I=j);let S=new Map;for(let j=0,U=e.decl_count();j<U;j++){if(m[j]!==I||e.decl_kind_name(j)!=="Param")continue;let B=d(T()[j]>=0?T()[j]:u[j]);B&&S.set(n.find(C=>C.key===B.file)?.text.slice(B.start,B.end),j)}let E=e.wat_text_start(b),W=e.wat_text_end(b),P=p(E);if(!(!P||!S.size))for(let j=E;j<W;j++){let U=y[j];if(U===59&&y[j+1]===59){for(;j<W&&y[j]!==10;)j++;continue}if(U===40&&y[j+1]===59){let ce=0;for(;j<W;j++)if(y[j]===40&&y[j+1]===59)ce++,j++;else if(y[j]===59&&y[j+1]===41&&(ce--,j++,!ce))break;continue}if(U!==36)continue;let B=j+1;for(;B<W&&ot.test(String.fromCharCode(y[B]));)B++;let C=S.get(new TextDecoder().decode(y.subarray(j+1,B)));C!==void 0&&(F.has(C)||F.set(C,[]),F.get(C).push({file:P.key,start:w(P,j+1),end:w(P,B)})),j=B-1}}return F},ie=new TextDecoder,z=y=>{for(let b=r[y];b<s[y];b++){if(c[b]===9)continue;let h=p(a[b]);if(!h)return null;let x=ie.decode(h.bytes.subarray(a[b]-h.offset,f[b]-h.offset));if(!lt.has(x))return x!=="&"&&!/^[A-Za-z_]\w*$/.test(x)?null:{file:h.key,start:w(h,a[b]),end:w(h,f[b])}}return null},se=t(e.node_kind,Uint8Array),xe=(y,b)=>{if(y<0||b<y)return null;let h=p(y);return h&&b<=h.offset+h.bytes.length?{file:h.key,start:w(h,y),end:w(h,b)}:null},q=(y,b,h)=>y?.file===b&&y.start<=h&&h<=y.end,ae=(y,b,h=!1)=>{let x=-1,I=1/0;for(let S of v(y)){let E=d(S);if(!q(E,y,b))continue;let W=E.end-E.start;W<I&&!(h&&!e.node_type(S))&&(x=S,I=W)}return x},G,N=()=>G??=(()=>{let y=[];for(let b=0;b<(e.edge_count?.()??0);b++){let h=e.edge_from_decl(b),x=xe(e.edge_site_start(b),e.edge_site_end(b)),I=h>=0&&u[h]>=0?d(u[h]):null;x&&I&&!(x.file===I.file&&I.start<=x.start&&x.end<=I.end)&&(x=null),y.push({from:h,to:e.edge_to_decl(b),site:x})}return y})(),_n,ve=()=>_n??=(()=>{let y=[];for(let b=0;b<(e.coercion_count?.()??0);b++){let h=e.coercion_node(b);h<0||h>=i||r[h]>=s[h]||y.push({node:h,at:d(h),from:e.coercion_from_text(b),to:e.coercion_to_text(b),kind:e.coercion_kind(b)})}return y})(),wn,xn=()=>wn??=(()=>{let y=new Map;for(let b of N())y.has(b.from)||y.set(b.from,[]),y.get(b.from).push(b);return y})(),fe=new Map,Y=y=>{if(fe.has(y))return fe.get(y);let b=new Set,h=S=>{if(S<0||b.has(S))return 0;b.add(S);let E=e.decl_effects?.(S)??0;for(let W of xn().get(S)??[])E|=h(W.to);return E},x=h(y),I={mask:x,labels:["await","host","throws","traps"].filter((S,E)=>x&1<<E)};return fe.set(y,I),I},de=(y,b)=>{if(b<0||b>=e.decl_count())return null;let h=y.span(b),x=y.definition(b);return!h||!x?null:{decl:b,name:y.text(x),kind:y.kind(b),span:h,selection:x,effects:Y(b)}};return{at:d,declarationAt(y,b){for(let h of v(y)){if(!M(h))continue;let x=d(h);if(x&&x.file===y&&x.start<=b&&b<=x.end)return o[h]}for(let[h,x]of O())if(x.some(I=>I.file===y&&I.start-1<=b&&b<=I.end))return h;return-1},definition(y){let b=u[y];if(b<0)return null;let h=T()[y];return h>=0?d(h):z(b)??d(b)},references(y,{includeDeclaration:b=!0}={}){let h=this.definition(y),x=[];for(let I of R(y)){let S=d(I);if(!S)continue;let E=h&&S.file===h.file&&S.start===h.start;E&&!b||(E?x.unshift(S):x.push(S))}return[...x,...O().get(y)??[]]},span(y){return u[y]>=0?d(u[y]):null},kind(y){return e.decl_kind_name(y)},owner(y){return m[y]},type(y){return e.decl_checked_type(y)},typeDeclaration(y){return e.decl_checked_type_decl(y)},typeDeclarationOfExpressionBefore(y,b,h=!1){let x=[];for(let I of v(y)){let S=d(I);S&&S.file===y&&S.end===b&&x.push([S.start,I])}x.sort((I,S)=>I[0]-S[0]);for(let[,I]of x){let S=e.node_type_decl(I,h?1:0);if(S>=0)return S}return-1},declarations(y=null){let b=[];for(let h=0,x=e.decl_count();h<x;h++){if(u[h]<0)continue;let I=d(u[h]);I&&(y==null||I.file===y)&&b.push({decl:h,kind:e.decl_kind_name(h),owner:m[h],span:I})}return b},names(y){let b=[];for(let h of y==null?Array.from({length:i},(x,I)=>I):v(y)){if(!M(h))continue;let x=d(h);x&&(y==null||x.file===y)&&b.push({decl:o[h],at:x})}for(let[h,x]of O())for(let I of x)(y==null||I.file===y)&&b.push({decl:h,at:I});return b.sort((h,x)=>h.at.file<x.at.file?-1:h.at.file>x.at.file?1:h.at.start-x.at.start),b.filter((h,x)=>x===0||h.at.start!==b[x-1].at.start||h.at.file!==b[x-1].at.file)},explainAt(y,b){let h=ae(y,b,!0);if(h<0)return null;let x=d(h),I=ae(y,b),S=I>=0?o[I]:-1,W=N().filter(B=>B.site&&q(B.site,y,b)).sort((B,C)=>B.site.end-B.site.start-(C.site.end-C.site.start))[0]?.to??-1,P=e.node_field_owner?.(h)??-1,j=[];for(let B=0,C=e.closure_capture_count?.(h)??0;B<C;B++)j.push(e.closure_capture_decl(h,B));let U=[];if(S>=0){let B=this.definition(S);U.push({kind:"binding",decl:S,at:B,type:this.type(S)})}return W>=0&&U.push({kind:"call result",decl:W,at:this.definition(W)}),{node:h,at:x,kind:e.node_kind_name(se[h]),type:e.node_type(h),expectedType:e.node_expected_type?.(h)||"",declaration:S,callTarget:W,field:P>=0?{owner:P,index:e.node_field_index(h)}:null,conversions:ve().filter(B=>B.node===h||q(B.at,y,b)),captures:j,effects:S>=0?Y(S):W>=0?Y(W):{mask:0,labels:[]},wasmType:e.node_wasm_type?.(h)||"",trace:U}},typeTrace(y,b){return this.explainAt(y,b)?.trace??[]},inlayHints(y){let b=[];for(let h=0;h<e.decl_count();h++){if(e.decl_kind_name(h)!=="Local")continue;let x=this.definition(h),I=this.span(h),S=this.type(h);if(!x||!I||x.file!==y||!S)continue;let E=this.text({file:y,start:x.end,end:I.end});/^\s*:/.test(E)||b.push({position:x.end,label:`: ${S}`,kind:"type",at:x})}for(let h of v(y)){if(e.node_kind_name(se[h])!=="closure_expr")continue;let x=d(h);if(x?.file!==y)continue;let I=[];for(let S=0,E=e.closure_capture_count(h);S<E;S++){let W=e.closure_capture_decl(h,S),P=this.definition(W);P&&I.push(this.text(P))}I.length&&b.push({position:x.end,label:` captures ${I.join(", ")}`,kind:"capture",at:x})}for(let h of ve())h.at?.file===y&&b.push({position:h.at.end,label:` \u2192 ${h.to}`,kind:"conversion",at:h.at});for(let h=0;h<e.decl_count();h++){if(u[h]<0||!["Fn","Main"].includes(this.kind(h)))continue;let x=this.definition(h);if(x?.file!==y)continue;let I=Y(h);I.mask&&b.push({position:x.end,label:` !${I.labels.join(", ")}`,kind:"effect",at:x})}return b.sort((h,x)=>h.position-x.position)},effects(y){return Y(y)},prepareCallHierarchy(y,b){let h=this.declarationAt(y,b);h<0&&(h=this.declarations(y).find(I=>q(this.definition(I.decl),y,b))?.decl??-1);let x=de(this,h);return x&&["Fn","Main","ProtoMember"].includes(x.kind)?[x]:[]},incomingCalls(y){let b=new Map;for(let h of N())h.to===y&&h.from>=0&&(b.has(h.from)||b.set(h.from,[]),h.site&&b.get(h.from).push(h.site));return[...b].flatMap(([h,x])=>{let I=de(this,h);return I?[{from:I,sites:x}]:[]})},outgoingCalls(y){let b=new Map;for(let h of N())h.from===y&&h.to>=0&&(b.has(h.to)||b.set(h.to,[]),h.site&&b.get(h.to).push(h.site));return[...b].flatMap(([h,x])=>{let I=de(this,h);return I?[{to:I,sites:x}]:[]})},tokenAt(y,b){let h=n.findIndex(x=>x.key===y);if(h<0)return null;for(let x=e.file_first_token(h),I=e.file_end_token(h);x<I;x++){let S=w(n[h],a[x]);if(S>=b)return null;let E=w(n[h],f[x]);if(b<E||b===E&&c[x]===9)return{kind:c[x],start:S,end:E}}return null},text(y){let b=n.find(h=>h.key===y.file);return b?b.text.slice(y.start,y.end):""}}}function ft(e,n){let t=new Map,r,s=c=>(t.has(c)||t.set(c,(async()=>{let[o,u]=await Promise.all([n(`${c}.types.json`),n(`${c}.offsets`)]);return{bytes:o,offsets:dt(u)}})()),t.get(c)),a=new Map(e),f=new Map;for(let c of["std:Browser","std:JS","std:Web","std:Worker"])typeof e.get(c)=="function"&&a.set(c,()=>(f.has(c)||f.set(c,(async()=>{r??=JSON.parse(new TextDecoder().decode(await n("catalog.json")));let{document:o,view:u}=r[c],[m,i]=await Promise.all([s(o),n(`${u}.view.json`)]);return{document:m,view:i}})()),f.get(c)));return a}function dt(e){let n=new DataView(e.buffer,e.byteOffset,e.byteLength),t=new Int32Array(e.byteLength/4);for(let r=0;r<t.length;r++)t[r]=n.getInt32(r*4,!0);return t}function ct(e){let n=0;for(let t of e){let r=t.codePointAt(0);if(t==="	")n+=4;else{if(r>=768&&r<=879||r>=8203&&r<=8207||r>=65024&&r<=65039)continue;r>=4352&&r<=4447||r>=11904&&r<=42191||r>=44032&&r<=55203||r>=63744&&r<=64255||r>=65072&&r<=65103||r>=65280&&r<=65376||r>=65504&&r<=65510||r>=127744&&r<=128591||r>=129280&&r<=129535||r>=131072&&r<=262141?n+=2:n+=1}}return n}var sn={dark:{bg:[18,20,26],fg:[215,218,224],dim:[118,124,138],rail:[62,67,80],error:[255,107,107],warning:[245,185,66],trap:[199,146,234],expected:[108,182,255],found:[240,166,74],related:[154,163,178],add:[95,211,141],del:[255,123,123],keyword:[179,157,243],string:[158,206,106],number:[232,169,106],type:[125,207,255],function:[130,170,255],comment:[100,108,122],dsl:[158,206,106]},light:{bg:[253,252,249],fg:[43,46,54],dim:[128,133,144],rail:[200,196,186],error:[214,58,58],warning:[183,121,31],trap:[142,68,173],expected:[31,111,209],found:[184,98,11],related:[107,114,128],add:[31,138,76],del:[192,57,43],keyword:[124,77,204],string:[77,124,15],number:[180,83,9],type:[14,116,144],function:[37,99,235],comment:[156,163,175],dsl:[77,124,15]}};function ut(e=globalThis.process?.env??{}){if(e.UTU_THEME==="light"||e.UTU_THEME==="dark")return e.UTU_THEME;let n=Number(e.COLORFGBG?.split(";").pop());return n===7||n===15?"light":"dark"}function mt(e=globalThis.process?.env??{}){return/truecolor|24bit/i.test(e.COLORTERM??"")||["iTerm.app","WezTerm","vscode","ghostty","kitty"].includes(e.TERM_PROGRAM)}function pt([e,n,t]){let r=i=>i<48?0:i<115?1:Math.min(5,Math.floor((i-35)/40)),s=16+36*r(e)+6*r(n)+r(t),a=i=>i===0?0:55+i*40,f=(a(r(e))-e)**2+(a(r(n))-n)**2+(a(r(t))-t)**2,c=Math.round(((e+n+t)/3-8)/10),o=232+Math.max(0,Math.min(23,c)),u=8+10*(o-232);return(u-e)**2+(u-n)**2+(u-t)**2<f?o:s}function ht({color:e=!1,theme:n=ut(),truecolor:t=mt()}={}){let r=sn[n]??sn.dark,s=(c,o)=>t?`\x1B[${c};2;${o.join(";")}m`:`\x1B[${c};5;${pt(o)}m`,a=(c,o)=>c.map((u,m)=>Math.round(r.bg[m]+(u-r.bg[m])*o)),f=!!e;return{on:f,palette:r,fg:c=>f?s(38,c):"",bg:c=>f?s(48,c):"",tint:(c,o)=>f?s(48,a(c,o)):"",bold:f?"\x1B[1m":"",italic:f?"\x1B[3m":"",strike:f?"\x1B[9m":"",reset:f?"\x1B[0m":"",paint(c,o){return f?`${s(38,c)}${o}\x1B[0m`:o}}}function gt(e,n,t,r){let s=n.toUpperCase(),a=e.palette[n]??e.palette.error,c=[`${e.on?`${e.bg(a)}${e.fg(e.palette.bg)}${e.bold} ${s} ${e.reset}`:` ${s} `} ${e.bold}${t}${e.reset}`];return r&&c.push(`${" ".repeat(s.length+3)}${e.paint(e.palette.dim,r)}`),c}function yt(e,n){return(n??[]).map(t=>`  ${e.paint(e.palette.dim,"note")}  ${t}`)}var bt={primary:.32,expected:.24,found:.24,related:.2};function _t(e,n,{color:t=!1,relative:r=c=>c,highlight:s=null,theme:a,truecolor:f}={}){let c=ht({color:t,theme:a,truecolor:f}),o=new Map;return e.map(u=>wt(u,n,c,r,s,o)).join(`

`)}function an(e,n){let t=n.get(e);if(!t){t=[0];for(let r of e.matchAll(/\r\n?|\n/g))t.push(r.index+r[0].length);n.set(e,t)}return t}function be(e,n){let t=0,r=e.length-1;for(;t<r;){let s=t+r+1>>1;e[s]<=n?t=s:r=s-1}return t}function wt(e,n,t,r,s,a){let f=e.severity??"error",c=t.palette[f]??t.palette.error,o=e.code??e.kind??"",u=e.focus??e,m=e.file!=null?`${r(e.file)}${u.line!=null?`:${u.line}:${u.column}`:""}`:"",i=gt(t,f,e.message,[o,m].filter(Boolean).join(" \xB7 ")),l=[];e.file!=null&&e.start!=null&&n.get(e.file)!=null&&l.push({file:e.file,start:e.focus?.start??e.start,end:e.focus?.end??e.end,role:"primary",label:e.label});for(let _ of e.related??[])n.get(_.file)!=null&&l.push({file:_.file,start:_.start,end:_.end,role:_.role,label:_.label});let w=[...new Set(l.map(_=>_.file))].map(_=>xt(n.get(_),an(n.get(_),a),_,l.filter(v=>v.file===_),e.file===_)),g=Math.max(2,...w.flatMap(_=>_.rows.filter(v=>v.line!=null).map(v=>String(v.line+1).length))),d=_=>`${t.paint(t.palette.dim,String(_??"").padStart(g))} ${t.paint(t.palette.rail,"\u2502")} `;for(let _ of w){i.push(""),_.file!==e.file&&i.push(`${" ".repeat(g)} ${t.paint(t.palette.rail,"\u256D\u2500")} ${t.paint(t.palette.dim,r(_.file))}`);for(let v of _.rows){if(v.gap){i.push(`${" ".repeat(g)} ${t.paint(t.palette.rail,"\u2506")}`);continue}i.push(d(v.line+1)+vt(v,_,t,c,s));for(let k of kt(v,t,c))i.push(d()+k)}}return e.notes?.length&&i.push("",...yt(t,e.notes)),e.fix&&n.get(e.fix.file??e.file)!=null&&i.push("",...It(e.fix,n.get(e.fix.file??e.file),a,t,d,g)),i.join(`
`)}function xt(e,n,t,r,s){let a=m=>e.slice(n[m],n[m+1]??e.length).replace(/\r?\n?$/,""),f=new Set;for(let m of r){m.first=be(n,m.start),m.last=Math.max(m.first,be(n,Math.max(m.start,m.end-1)));for(let i=m.first;i<=m.last;i++)(m.last-m.first+1<=6||i<m.first+2||i>m.last-2)&&f.add(i)}let c=r.find(m=>m.role==="primary");if(c&&s){for(let m=Math.max(0,c.first-2);m<=Math.min(n.length-1,c.last+2);m++)f.add(m);for(;f.size>1&&!a(Math.max(...f)).trim()&&Math.max(...f)>c.last;)f.delete(Math.max(...f))}let o=[],u=null;for(let m of[...f].sort((i,l)=>i-l)){u!=null&&m>u+1&&o.push({gap:!0}),u=m;let i=a(m),l=r.filter(p=>p.first<=m&&m<=p.last).map(p=>{let w=m===p.first?p.start-n[m]:i.length-i.trimStart().length,g=m===p.last?Math.min(i.length,Math.max(w+1,p.end-n[m])):i.length;return{mark:p,from:w,to:Math.max(g,w+(i.length>w?1:0)),drawn:m===p.first}});if(i.length>240){let p=Math.min(i.length,...l.map(k=>k.from)),w=Math.min(Math.max(p+1,...l.map(k=>k.to)),p+240),g=Math.max(0,p-80),d=Math.min(i.length,w+80),_=g>0?"\u2026":"",v=k=>Math.min(Math.max(k,g),d)-g+_.length;o.push({line:m,raw:_+i.slice(g,d)+(d<i.length?"\u2026":""),offset:n[m]+g-_.length,marks:l.map(k=>({...k,from:v(k.from),to:Math.max(v(k.to),v(k.from)+1)}))});continue}o.push({line:m,raw:i,offset:n[m],marks:l})}return{file:t,rows:o}}function vt(e,n,t,r,s){let a=e.raw,f=l=>l.replace(/\t/g,"    ");if(!t.on)return f(a);let c=s?s(n.file,e.offset,e.offset+a.length):[],o=new Array(a.length).fill(null);for(let{mark:l,from:p,to:w}of e.marks)for(let g=p;g<w&&g<a.length;g++)o[g]=l.role;let u=new Array(a.length).fill(null);for(let l of c)for(let p=Math.max(0,l.start-e.offset);p<Math.min(a.length,l.end-e.offset);p++)u[p]=l.class;let m="",i=0;for(;i<a.length;){let l=i+1;for(;l<a.length&&o[l]===o[i]&&u[l]===u[i];)l++;let p=o[i],w=u[i],g=t.palette[w]??t.palette.fg,d=(p?t.tint(p==="primary"?r:t.palette[p],bt[p]):"")+(p==="primary"?t.bold:"")+(w==="comment"||w==="parameter"?t.italic:"")+t.fg(w==="comment"?t.palette.comment:g);m+=`${d}${f(a.slice(i,l))}${t.reset}`,i=l}return m}function kt(e,n,t){let r=e.marks.filter(o=>o.drawn).sort((o,u)=>o.from-u.from);if(!r.length)return[];let s=o=>ct(e.raw.slice(0,o)),a=o=>o.mark.role==="primary"?t:n.palette[o.mark.role],f=[];if(!n.on){let o="",u=0;for(let m of r){let i=s(m.from),l=Math.max(i+1,s(m.to));i<u||(o+=" ".repeat(i-u)+(m.mark.role==="primary"?"\u2501":"\u2500").repeat(l-i),u=l)}f.push(o)}let c=r.filter(o=>o.mark.label);for(let o=c.length-1;o>=0;o--){let u="",m=0;for(let l=0;l<o;l++){let p=s(c[l].from);u+=" ".repeat(Math.max(0,p-m))+n.paint(a(c[l]),"\u2502"),m=p+1}let i=s(c[o].from);u+=" ".repeat(Math.max(0,i-m))+n.paint(a(c[o]),"\u2570\u2500")+" "+c[o].mark.label,f.push(u)}return f}function It(e,n,t,r,s){let a=n.slice(0,e.start),f=Math.max(a.lastIndexOf(`
`),a.lastIndexOf("\r"))+1,c=n.slice(e.end).search(/[\r\n]/),o=c<0?n.length:e.end+c,u=n.slice(f,e.start),m=n.slice(e.end,o),i=u.length>240?"\u2026"+u.slice(-80):u,l=m.length>240?m.slice(0,80)+"\u2026":m,p=i+n.slice(e.start,e.end)+l,w=i+e.text+l,g=be(an(n,t),f)+(n[f-1]==="\r"&&n[f]===`
`?2:1),d=[`  ${r.paint(r.palette.add,`${r.bold}fix`)}   ${e.label??""}`];return r.on?(St(p,w).map(k=>k.k==="="?r.paint(r.palette.fg,k.t):k.k==="+"?`${r.tint(r.palette.add,.28)}${r.fg(r.palette.add)}${k.t}${r.reset}`:`${r.fg(r.palette.del)}${r.strike}${k.t}${r.reset}`).join("").split(/\r\n?|\n/).forEach((k,R)=>d.push(s(g+R)+k)),d):(w.split(/\r\n?|\n/).forEach((k,R)=>d.push(s(g+R)+k)),d)}function St(e,n){let t=l=>l.match(/[A-Za-z0-9_]+|\s+|./gs)??[],r=t(e),s=t(n),a=r.length,f=s.length,c=Array.from({length:a+1},()=>new Uint16Array(f+1));for(let l=a-1;l>=0;l--)for(let p=f-1;p>=0;p--)c[l][p]=r[l]===s[p]?c[l+1][p+1]+1:Math.max(c[l+1][p],c[l][p+1]);let o=[],u=(l,p)=>{let w=o[o.length-1];w?.k===l?w.t+=p:o.push({k:l,t:p})},m=0,i=0;for(;m<a&&i<f;)r[m]===s[i]?(u("=",r[m]),m++,i++):c[m+1][i]>=c[m][i+1]?u("-",r[m++]):u("+",s[i++]);for(;m<a;)u("-",r[m++]);for(;i<f;)u("+",s[i++]);return o}function At(e,n=null){if(!n)return Z(e.es??{});let{firsts:t}=ln(e,on(n));return Z(e.es??{},new Set(t.values()))}var on=e=>WebAssembly.Module.imports(new WebAssembly.Module(e,Mt));function ln(e,n){let t=new Set(n.filter(a=>a.module==="es").map(a=>a.name)),r=Object.entries(Object.assign({},...Object.values(e.es??{}))).filter(([a])=>t.has(a)),s=new Map;for(let[a,f]of r)s.has(f)||s.set(f,a);return{fields:r,firsts:s}}function Tt(e,n,{runtime:t,glue:r,wasm:s,streaming:a=!1}){let f=on(n),c=new Set,o=A=>(c.add(A),A),u=[],m=[],{fields:i,firsts:l}=ln(e,f);if(r&&i.length){let A=!1,T=i.map(([,F])=>{let O=K(l.get(F));return jt(H(F).expr)?O:(A=!0,`$utuValue(${O})`)});u.push(`import { ${[...l.values()].map(K).join(", ")} } from ${JSON.stringify(r)};`),A&&u.push("const $utuValue = value => typeof value === 'function' ? value : () => value;");let M=i.every(([F],O)=>F===String(O));m.push(`es: ${M?`[${T.join(", ")}]`:`{ ${i.map(([F],O)=>`${F}: ${T[O]}`).join(", ")} }`}`)}let p=[];for(let{module:A,name:T}of f)A==="utu"&&(T==="closure_new"?p.push(e.closures?.sigs?`closure_new:(a,b,c,d)=>${o("closureNew")}(a,b,c,d,${JSON.stringify(e.closures.sigs)})`:`closure_new: ${o("closureNew")}`):T==="closure_rec"?p.push(`closure_rec: ${o("closureRec")}`):T.startsWith("closure_call_")?p.push(`${T}: ${o("closureApply")}`):T==="promise_then"?p.push(`promise_then: ${o("promiseThen")}`):T==="promise_catch"?p.push(`promise_catch: ${o("promiseCatch")}`):T.startsWith("await_")?p.push(`${T}: ${o("awaitImport")}(${T.startsWith("await_null_")?"true":""})`):T==="js_tag"&&p.push("js_tag:WebAssembly.JSTag"));if(p.length||e.mems){let A=`{${p.join(",")}}`;m.push(`utu: ${e.mems?`${o("memoryImports")}(${JSON.stringify(e.mems)}, ${A})`:A}`)}let w=e.promises?.asyncExports??[],g="instance.exports",d="";if(w.length&&(g=`{ ...instance.exports, ${w.map(T=>`${JSON.stringify(T)}: ${o("promising")}(instance.exports[${JSON.stringify(T)}])`).join(", ")} }`),e.exports){let A=$t(e.exports,g,w);A?(d=A.source,g=A.name):g=`${o("convertExports")}(${g}, ${JSON.stringify(e.exports)}${w.length?`, ${JSON.stringify(w)}`:""})`}c.size&&u.unshift(`import { ${[...c].join(", ")} } from ${JSON.stringify(t)};`);let _=a?"instantiateStreaming":"instantiate",v=WebAssembly.Module.imports(new WebAssembly.Module(n)).map(A=>A.module),k={};v.includes("wasm:js-string")&&(k.builtins=["js-string"]),v.includes("'")&&(k.importedStringConstants="'");let R=Object.keys(k).length?`,${JSON.stringify(k)}`:"";return u.push(`export const {instance}=await WebAssembly.${_}(${s},{${m.join(",")}}${R});`),d&&u.push(d),u.push(`export const exports=${g};`),u.join(`
`)+`
`}function $t(e,n,t=[]){let r={Bool:i=>`!!${i}`,int:i=>`Number.isInteger(${i})`,big:i=>`typeof ${i}==="bigint"`,num:i=>`typeof ${i}==="number"`,Str:i=>`typeof ${i}==="string"`,"?Str":i=>`${i}==null||typeof ${i}==="string"`,ref:i=>`${i}!=null`,cl:i=>`typeof ${i}==="function"`,"?":i=>`${i}===undefined?null:${i}`},s={int:"an integer",big:"a BigInt",num:"a number",Str:"a string","?Str":"a string or null",ref:"a value",cl:"a function"},a=(i,l)=>i==="Bool"?`${l}!==0`:i==="U32"?`${l}>>>0`:i==="U64"?`BigInt.asUintN(64,${l})`:l,f=i=>typeof i=="string",c=!1,o=!1,u=[];for(let[i,l]of Object.entries(e)){let p=typeof l=="string"?l:l.r,w=typeof l=="string"?null:l.p??null;if(!(Array.isArray(p)?p.every(f):f(p))||w?.some(M=>M!==""&&!(M in r||M.startsWith("cl:"))))return null;let g=JSON.stringify(i),d=w?w.map((M,F)=>`a${F}`):null,_=[];w?.forEach((M,F)=>{let O=d[F];if(M!=="")if(M==="Bool"||M==="?")_.push(`${O}=${r[M](O)}`);else if(M.startsWith("cl:")){c=!0;let[,ie,z]=M.split(":"),se=[...ie].map((G,N)=>`p${N}`),q=`f(${[...ie].map((G,N)=>G==="B"?`!!p${N}`:G==="U"?`p${N}>>>0`:G==="W"?`BigInt.asUintN(64,p${N})`:`p${N}`).join(",")})`,ae=z==="b"?`${q}?1:0`:z==="S"?`$utuStr(${q})`:z==="n"?`${q}??null`:q;z==="S"&&(o=!0),_.push(`${O}=typeof ${O}==="function"?(f=>(${se.join(",")})=>${ae})(${O}):$utuFail(${g},${F},"a function",${O})`)}else c=!0,_.push(`${r[M](O)}||$utuFail(${g},${F},${JSON.stringify(s[M])},${O})`),M==="?Str"&&_.push(`${O}??=null`)});let v=`$utuIn[${g}](${d?d.join(","):"...a"})`,k=M=>Array.isArray(p)?(M==="x"?"":"(v=>")+`${M==="x"?"x":"v"}.map((x,i)=>[${p.map(F=>`x=>${a(F,"x")}`).join(",")}][i](x))`+(M==="x"?"":`)(${M})`):a(p,M),R=t.includes(i)?k("x")==="x"?v:`${v}.then(x=>${k("x")})`:k(v),A=_.length?`(${[..._,R].join(",")})`:R,T=t.includes(i)&&_.length?`{try{return ${A}}catch(e){return Promise.reject(e)}}`:A;d?u.push(`${g}:(${d.join(",")})=>${T}`):u.push(`${g}:Object.defineProperty((...a)=>${T},"length",{value:$utuIn[${g}].length})`)}let m=[`const $utuIn=${n},$utuExports={...$utuIn,${u.join(",")}};`];return c&&m.unshift('const $utuFail=(name,i,what,v)=>{throw new TypeError(`${name}: argument ${i+1} must be ${what}, not ${v===null?"null":what==="an integer"&&typeof v==="number"?v:typeof v}`)};'),o&&m.unshift('const $utuStr=s=>typeof s==="string"?s:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${s===null?"null":s instanceof Promise?"a Promise (await it: Promise[Str])":typeof s}`)})();'),{source:m.join(`
`),name:"$utuExports"}}function jt(e){return/^(async\s+)?(function\b|[\w$]+\s*=>|\([^()]*\)\s*=>)/.test(e)||/^\((f => \((p\d+(,p\d+)*)?\) => |v => \(\) => v\)\(|v => \(w => \(\) => w\)\()/.test(e)||e.startsWith("$utuFn(")}var Mt={builtins:["js-string"],importedStringConstants:"'"};var fn=()=>import("./browser-catalog.generated-TVPIZNWR.js");async function dn(e,n,t){let r=e[`${n}_JSON`];if(r===void 0){let a=Uint8Array.from(atob(e[`${n}_GZIP`]),c=>c.charCodeAt(0)),f=new Blob([a]).stream().pipeThrough(new DecompressionStream("gzip"));r=await new Response(f).text()}let s=JSON.parse(r);if(s.version!==1)throw new Error(`Unsupported ${t} declaration ABI version`);return s}function te(e){let n;return()=>n??=e().catch(t=>{throw n=void 0,t})}var _e=te(async()=>dn(await fn(),"BROWSER_ABI","browser")),Ft=te(async()=>dn(await fn(),"WORKER_ABI","worker"));function cn(e,n,t){let r=s=>Object.fromEntries(Object.entries(s).filter(([a])=>t(a)));return{source:`mod ${e} {}`,abi:{...n,prefix:e,exports:r(n.exports),names:r(n.names),mutableGlobals:n.mutableGlobals.filter(t)}}}async function un(){return{source:"mod Browser {}",abi:await _e()}}var mn=te(async()=>{let e=await _e(),n=new Set(e.ecmascript??[]);return cn("JS",e,t=>n.has(t))}),Et=["AbortController","AbortSignal","Blob","ByteLengthQueuingStrategy","CompressionStream","CountQueuingStrategy","Crypto","CryptoKey","CustomEvent","DOMException","DecompressionStream","Event","EventTarget","File","FormData","Headers","MessageChannel","MessageEvent","MessagePort","ReadableByteStreamController","ReadableStream","ReadableStreamBYOBReader","ReadableStreamBYOBRequest","ReadableStreamDefaultController","ReadableStreamDefaultReader","Request","RequestInit","Response","ResponseInit","SubtleCrypto","TextDecoder","TextDecoderStream","TextEncoder","TextEncoderStream","TransformStream","TransformStreamDefaultController","URL","URLSearchParams","WebAssembly","WritableStream","WritableStreamDefaultController","WritableStreamDefaultWriter","atob","btoa","clearInterval","clearTimeout","console","crypto","fetch","navigator","performance","queueMicrotask","reportError","setInterval","setTimeout","structuredClone"],pn=te(async()=>{let e=await _e(),n=new Set([...e.ecmascript??[],...Et]);return cn("Web",e,t=>n.has(t))}),hn=te(async()=>({source:"mod Worker {}",abi:await Ft()}));var $="ir-wasm-",re=new Map([["std:Array",`// std/Array.utu \u2014 Array[T1]
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
    fn &.get_index |self| (i: I32) T1 => @ir/\\ <ir-array-get><ir-ident name="self"/><ir-ident name="i"/></ir-array-get> \\/;

    // a[i] = v \u2014 write element at index i (returns void).
    fn &.set_index |self| (i: I32, v: T1) Void => @ir/\\ <ir-array-set><ir-ident name="self"/><ir-ident name="i"/><ir-ident name="v"/></ir-array-set> \\/;

    // a[s, e] \u2014 copy subrange [start, end) into a new array.
    fn &.get_slice |self| (start: I32, end_: I32) & => @ir/\\ <ir-array-slice><ir-ident name="self"/><ir-ident name="start"/><ir-ident name="end_"/></ir-array-slice> \\/;

    // \u2500\u2500 Named methods (explicit call syntax) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

    // Create an Array of n elements, initialized with fill.
    fn &.new(n: I32, fill: T1) & => @ir/\\ <ir-array-new><ir-ident name="n"/><ir-ident name="fill"/></ir-array-new> \\/;

    // Create an Array with Wasm's default value for T1 (zero or null).
    fn &.new_default(n: I32) & => @ir/\\ <ir-array-new><ir-ident name="n"/></ir-array-new> \\/;

    // Number of elements. Call as \`array.len()\`.
    fn &.len |self| () I32 => @ir/\\ <ir-array-len><ir-ident name="self"/></ir-array-len> \\/;

    // \`[1, 2, 3]\`: each element's str, between brackets (\`console.log(xs)\`).
    fn &.str |self| () Str {
        let out = "["
        for (self, 0 ..< self.len()) |x, i| {
            if i > 0 { out = out + ", " }
            out = out + x.str()
        }
        return out + "]"
    }

    // Aliases kept for explicit call sites.
    fn &.get |self| (i: I32) T1 => @ir/\\ <ir-array-get><ir-ident name="self"/><ir-ident name="i"/></ir-array-get> \\/;
    fn &.set |self| (i: I32, v: T1) Void => @ir/\\ <ir-array-set><ir-ident name="self"/><ir-ident name="i"/><ir-ident name="v"/></ir-array-set> \\/;
    fn &.slice |self| (start: I32, end_: I32) & => @ir/\\ <ir-array-slice><ir-ident name="self"/><ir-ident name="start"/><ir-ident name="end_"/></ir-array-slice> \\/;

    // self[at .. at+count) = source[start .. start+count), as one bulk copy.
    // Overlapping ranges of the same array copy correctly. Out of range traps.
    fn &.copy_from |self| (at: I32, source: &, start: I32, count: I32) Void => @ir/\\ <ir-array-copy>
            <ir-ident name="self"/>
            <ir-ident name="at"/>
            <ir-ident name="source"/>
            <ir-ident name="start"/>
            <ir-ident name="count"/>
        </ir-array-copy> \\/;
}
`.replaceAll("@@IR_WASM@@",$)],["std:Bool",`// std/Bool.utu \u2014 Bool scalar type module
// & is a WasmGC I32 used as boolean (0 = false, 1 = true).
// Logical operators live here like every other operator; the compiler lowers
// \`and\`, \`or\`, \`xor\`, and \`not\` through this module instead of hardcoding them.

mod Bool {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:eq  |a, b| Bool => @ir/\\ <ir-i32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i32-eq> \\/;
    fn &:ne  |a, b| Bool => @ir/\\ <ir-i32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ne> \\/;
    fn &:and |a, b| Bool => @ir/\\ <ir-i32-and><ir-ident name="a"/><ir-ident name="b"/></ir-i32-and> \\/;
    fn &:or  |a, b| Bool => @ir/\\ <ir-i32-or><ir-ident name="a"/><ir-ident name="b"/></ir-i32-or> \\/;
    fn &:xor |a, b| Bool => @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i32-xor> \\/;
    fn &:not |a| Bool => @ir/\\ <ir-i32-eqz><ir-ident name="a"/></ir-i32-eqz> \\/;

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(Bool) Str = @es/\\ (v) => (v ? "true" : "false") \\/
        return format(self)
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Buffer",`// Geometrically growing native buffer, including non-defaultable element types.
// Its checks are kept only in a --safe build: otherwise an index past the
// length reaches the capacity beyond (and past that, the array's own bounds
// trap).
mod Buffer[T] {
    struct &:
        | values: Array[T]
        | length: I32

    fn &.new() & {
        return &{ values: [], length: 0 }
    }

    fn &.push |self| (value: T) Void {
        if self.length == self.values.len() {
            if checks() and self.length > 536870911 { fatal }
            let capacity = if self.length == 0 { 8 } else { self.length * 2 }
            let grown = Array[T].new(capacity, value)
            grown.copy_from(0, self.values, 0, self.length)
            self.values = grown
        }
        self.values[self.length] = value
        self.length += 1
    }

    fn &.len |self| () I32 { return self.length }

    fn &.is_empty |self| () Bool { return self.length == 0 }

    // b[i] and b[i] = v.
    fn &.get_index |self| (i: I32) T {
        if checks() and (i < 0 or i >= self.length) { fatal }
        return self.values[i]
    }

    fn &.set_index |self| (i: I32, value: T) Void {
        if checks() and (i < 0 or i >= self.length) { fatal }
        self.values[i] = value
    }

    // The last value, removed.
    fn &.pop |self| () T {
        if checks() and self.length == 0 { fatal }
        self.length -= 1
        return self.values[self.length]
    }

    fn &.clear |self| () Void { self.length = 0 }

    // Keeps the first \`length\` values.
    fn &.truncate |self| (length: I32) Void {
        if checks() and (length < 0 or length > self.length) { fatal }
        self.length = length
    }

    // Whether the build is --safe.
    fn checks() Bool => @ir/\\ <ir-safe-checks/> \\/;

    fn &.finish |self| () Array[T] {
        return self.values.slice(0, self.length)
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Bytes",`//! Bytes between JavaScript and utu: \`using Bytes from std:Bytes;\`, then
//! \`Bytes.from_js(view)\`, a \`JS.Uint8Array\` (or a \`Browser.Uint8Array\`, or
//! Node's \`Buffer\`, which is one) copied into an \`Array[I32]\` of 0 to 255, and
//! \`Bytes.to_js(bytes)\`, the reverse: a new \`Uint8Array\`. Each copies four
//! bytes a host call. Nothing is shared: changing one side after a copy does
//! not change the other. Each function ships only when used.
//!
//! \`\`\`
//! let data = Bytes.from_js(Fs.readFileSync(path))
//! Fs.writeFileSync(out, Bytes.to_js(data))
//! let body = Bytes.from_js(new JS.Uint8Array(await response.arrayBuffer()))
//! \`\`\`
//!
//! For bytes read or written in place, without a copy, see a \`mem\`'s
//! \`copy_in\` and \`view\`.

using JS from std:JS

mod Bytes {
    /// The bytes of \`view\`, each 0 to 255.
    fn from_js(view: JS.Uint8Array) Array[I32] {
        let size: fun(JS.Uint8Array) I32 = @es/\\ (v) => v.length \\/
        let word: fun(JS.Uint8Array, I32) I32 = @es/\\ (v, i) => v[i] | v[i + 1] << 8 | v[i + 2] << 16 | v[i + 3] << 24 \\/
        let byte: fun(JS.Uint8Array, I32) I32 = @es/\\ (v, i) => v[i] \\/
        let n = size(view)
        let out = Array[I32].new(n, 0)
        let i = 0
        while (i + 4 <= n) {
            let w = word(view, i)
            out[i] = w & 255
            out[i + 1] = (w >> 8) & 255
            out[i + 2] = (w >> 16) & 255
            out[i + 3] = (w >> 24) & 255
            i += 4
        }
        while (i < n) {
            out[i] = byte(view, i)
            i += 1
        }
        return out
    }

    /// A new \`Uint8Array\` of \`bytes\`, each kept to its low eight bits.
    fn to_js(bytes: Array[I32]) JS.Uint8Array {
        let make: fun(I32) JS.Uint8Array = @es/\\ (n) => new Uint8Array(n) \\/
        let word: fun(JS.Uint8Array, I32, I32) Void = @es/\\ (v, i, w) => { v[i] = w; v[i + 1] = w >> 8; v[i + 2] = w >> 16; v[i + 3] = w >> 24 } \\/
        let byte: fun(JS.Uint8Array, I32, I32) Void = @es/\\ (v, i, b) => { v[i] = b } \\/
        let n = bytes.len()
        let view = make(n)
        let i = 0
        while (i + 4 <= n) {
            word(view, i, bytes[i] & 255 | (bytes[i + 1] & 255) << 8 | (bytes[i + 2] & 255) << 16 | bytes[i + 3] << 24)
            i += 4
        }
        while (i < n) {
            byte(view, i, bytes[i])
            i += 1
        }
        return view
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Externref",`// std/Externref.utu \u2014 Externref opaque external reference type module
// & maps to the WebAssembly Externref type: an opaque, garbage-collected
// reference to a host (JavaScript) object.
// Externrefs ARE nullable: ?Externref is valid.
//
// No arithmetic or comparison operators \u2014 externrefs are fully opaque.
// Host operations are accessed via @ir DSL or imported JS functions.

mod Externref {
    type & = @ir/\\ <@@IR_WASM@@ref type-repr="wasm-externref"/> \\/
}
`.replaceAll("@@IR_WASM@@",$)],["std:F32",`// std/F32.utu \u2014 F32 scalar type module
// & is a WasmGC F32 value (stack-only, never heap-allocated, never nullable).

mod F32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-f32"/> \\/

    fn &:add  |a, b| & => @ir/\\ <ir-f32-add><ir-ident name="a"/><ir-ident name="b"/></ir-f32-add> \\/;
    fn &:sub  |a, b| & => @ir/\\ <ir-f32-sub><ir-ident name="a"/><ir-ident name="b"/></ir-f32-sub> \\/;
    fn &:mul  |a, b| & => @ir/\\ <ir-f32-mul><ir-ident name="a"/><ir-ident name="b"/></ir-f32-mul> \\/;
    fn &:div  |a, b| & => @ir/\\ <ir-f32-div><ir-ident name="a"/><ir-ident name="b"/></ir-f32-div> \\/;
    fn &:eq   |a, b| Bool => @ir/\\ <ir-f32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-f32-eq> \\/;
    fn &:ne   |a, b| Bool => @ir/\\ <ir-f32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-f32-ne> \\/;
    fn &:lt   |a, b| Bool => @ir/\\ <ir-f32-lt><ir-ident name="a"/><ir-ident name="b"/></ir-f32-lt> \\/;
    fn &:le   |a, b| Bool => @ir/\\ <ir-f32-le><ir-ident name="a"/><ir-ident name="b"/></ir-f32-le> \\/;
    fn &:gt   |a, b| Bool => @ir/\\ <ir-f32-gt><ir-ident name="a"/><ir-ident name="b"/></ir-f32-gt> \\/;
    fn &:ge   |a, b| Bool => @ir/\\ <ir-f32-ge><ir-ident name="a"/><ir-ident name="b"/></ir-f32-ge> \\/;
    fn &:neg  |a| & => @ir/\\ <ir-f32-neg><ir-ident name="a"/></ir-f32-neg> \\/;
    fn abs(x: &)  & => @ir/\\ <ir-f32-abs><ir-ident name="x"/></ir-f32-abs> \\/;
    fn sqrt(x: &) & => @ir/\\ <ir-f32-sqrt><ir-ident name="x"/></ir-f32-sqrt> \\/;
    fn ceil(x: &) & => @ir/\\ <ir-f32-ceil><ir-ident name="x"/></ir-f32-ceil> \\/;
    fn floor(x: &) & => @ir/\\ <ir-f32-floor><ir-ident name="x"/></ir-f32-floor> \\/;
    fn trunc(x: &) & => @ir/\\ <ir-f32-trunc><ir-ident name="x"/></ir-f32-trunc> \\/;
    fn nearest(x: &) & => @ir/\\ <ir-f32-nearest><ir-ident name="x"/></ir-f32-nearest> \\/;
    fn min(a: &, b: &) & => @ir/\\ <ir-f32-min><ir-ident name="a"/><ir-ident name="b"/></ir-f32-min> \\/;
    fn max(a: &, b: &) & => @ir/\\ <ir-f32-max><ir-ident name="a"/><ir-ident name="b"/></ir-f32-max> \\/;

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.f64 |self| () F64 => @ir/\\ <ir-f64-promote><ir-ident name="self"/></ir-f64-promote> \\/;
    fn &.i32 |self| () I32 => @ir/\\ <ir-i32-trunc-s-sat-f32><ir-ident name="self"/></ir-i32-trunc-s-sat-f32> \\/;
    fn &.u32 |self| () U32 => @ir/\\ <ir-u32-trunc-u-sat-f32><ir-ident name="self"/></ir-u32-trunc-u-sat-f32> \\/;
    fn &.i64 |self| () I64 => @ir/\\ <ir-i64-trunc-s-sat-f32><ir-ident name="self"/></ir-i64-trunc-s-sat-f32> \\/;
    fn &.u64 |self| () U64 => @ir/\\ <ir-u64-trunc-u-sat-f32><ir-ident name="self"/></ir-u64-trunc-u-sat-f32> \\/;

    // The IEEE 754 bits, and back.
    fn &.bits |self| () I32 => @ir/\\ <ir-i32-reinterpret><ir-ident name="self"/></ir-i32-reinterpret> \\/;
    fn from_bits(bits: I32) & => @ir/\\ <ir-f32-reinterpret><ir-ident name="bits"/></ir-f32-reinterpret> \\/;

    // The shortest decimal that reads back as the same F32 (0.1, not
    // 0.10000000149011612). Ships only when used.
    fn &.str |self| () Str {
        let format: fun(F32) Str = @es/\\ (v) => { for (let p = 1; p < 10; p++) { const s = Number(v.toPrecision(p)); if (Math.fround(s) === v) return String(s); } return String(v); } \\/
        return format(self)
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:F64",`// std/F64.utu \u2014 F64 scalar type module
// & is a WasmGC F64 value (stack-only, never heap-allocated, never nullable).

mod F64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-f64"/> \\/

    fn &:add  |a, b| & => @ir/\\ <ir-f64-add><ir-ident name="a"/><ir-ident name="b"/></ir-f64-add> \\/;
    fn &:sub  |a, b| & => @ir/\\ <ir-f64-sub><ir-ident name="a"/><ir-ident name="b"/></ir-f64-sub> \\/;
    fn &:mul  |a, b| & => @ir/\\ <ir-f64-mul><ir-ident name="a"/><ir-ident name="b"/></ir-f64-mul> \\/;
    fn &:div  |a, b| & => @ir/\\ <ir-f64-div><ir-ident name="a"/><ir-ident name="b"/></ir-f64-div> \\/;
    fn &:eq   |a, b| Bool => @ir/\\ <ir-f64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-f64-eq> \\/;
    fn &:ne   |a, b| Bool => @ir/\\ <ir-f64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-f64-ne> \\/;
    fn &:lt   |a, b| Bool => @ir/\\ <ir-f64-lt><ir-ident name="a"/><ir-ident name="b"/></ir-f64-lt> \\/;
    fn &:le   |a, b| Bool => @ir/\\ <ir-f64-le><ir-ident name="a"/><ir-ident name="b"/></ir-f64-le> \\/;
    fn &:gt   |a, b| Bool => @ir/\\ <ir-f64-gt><ir-ident name="a"/><ir-ident name="b"/></ir-f64-gt> \\/;
    fn &:ge   |a, b| Bool => @ir/\\ <ir-f64-ge><ir-ident name="a"/><ir-ident name="b"/></ir-f64-ge> \\/;
    fn &:neg  |a| & => @ir/\\ <ir-f64-neg><ir-ident name="a"/></ir-f64-neg> \\/;
    fn abs(x: &)  & => @ir/\\ <ir-f64-abs><ir-ident name="x"/></ir-f64-abs> \\/;
    fn sqrt(x: &) & => @ir/\\ <ir-f64-sqrt><ir-ident name="x"/></ir-f64-sqrt> \\/;
    fn ceil(x: &) & => @ir/\\ <ir-f64-ceil><ir-ident name="x"/></ir-f64-ceil> \\/;
    fn floor(x: &) & => @ir/\\ <ir-f64-floor><ir-ident name="x"/></ir-f64-floor> \\/;
    fn trunc(x: &) & => @ir/\\ <ir-f64-trunc><ir-ident name="x"/></ir-f64-trunc> \\/;
    fn nearest(x: &) & => @ir/\\ <ir-f64-nearest><ir-ident name="x"/></ir-f64-nearest> \\/;
    fn min(a: &, b: &) & => @ir/\\ <ir-f64-min><ir-ident name="a"/><ir-ident name="b"/></ir-f64-min> \\/;
    fn max(a: &, b: &) & => @ir/\\ <ir-f64-max><ir-ident name="a"/><ir-ident name="b"/></ir-f64-max> \\/;

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.f32 |self| () F32 => @ir/\\ <ir-f32-demote><ir-ident name="self"/></ir-f32-demote> \\/;
    fn &.i32 |self| () I32 => @ir/\\ <ir-i32-trunc-s-sat-f64><ir-ident name="self"/></ir-i32-trunc-s-sat-f64> \\/;
    fn &.u32 |self| () U32 => @ir/\\ <ir-u32-trunc-u-sat-f64><ir-ident name="self"/></ir-u32-trunc-u-sat-f64> \\/;
    fn &.i64 |self| () I64 => @ir/\\ <ir-i64-trunc-s-sat-f64><ir-ident name="self"/></ir-i64-trunc-s-sat-f64> \\/;
    fn &.u64 |self| () U64 => @ir/\\ <ir-u64-trunc-u-sat-f64><ir-ident name="self"/></ir-u64-trunc-u-sat-f64> \\/;

    // The IEEE 754 bits, and back.
    fn &.bits |self| () I64 => @ir/\\ <ir-i64-reinterpret><ir-ident name="self"/></ir-i64-reinterpret> \\/;
    fn from_bits(bits: I64) & => @ir/\\ <ir-f64-reinterpret><ir-ident name="bits"/></ir-f64-reinterpret> \\/;

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(F64) Str = @es/\\ (v) => String(v) \\/
        return format(self)
    }

    // \u2500\u2500 Math \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Each ships only when used: the host's Math, one call each.

    /// The sine (of radians).
    fn &.sin |self| () & {
        let f: fun(&) & = @es/\\ Math.sin \\/
        return f(self)
    }

    /// The cosine.
    fn &.cos |self| () & {
        let f: fun(&) & = @es/\\ Math.cos \\/
        return f(self)
    }

    /// The tangent.
    fn &.tan |self| () & {
        let f: fun(&) & = @es/\\ Math.tan \\/
        return f(self)
    }

    /// The arcsine, in radians.
    fn &.asin |self| () & {
        let f: fun(&) & = @es/\\ Math.asin \\/
        return f(self)
    }

    /// The arccosine, in radians.
    fn &.acos |self| () & {
        let f: fun(&) & = @es/\\ Math.acos \\/
        return f(self)
    }

    /// The arctangent, in radians.
    fn &.atan |self| () & {
        let f: fun(&) & = @es/\\ Math.atan \\/
        return f(self)
    }

    /// $e^x$.
    fn &.exp |self| () & {
        let f: fun(&) & = @es/\\ Math.exp \\/
        return f(self)
    }

    /// The natural logarithm (NaN below 0).
    fn &.ln |self| () & {
        let f: fun(&) & = @es/\\ Math.log \\/
        return f(self)
    }

    /// The base-2 logarithm.
    fn &.log2 |self| () & {
        let f: fun(&) & = @es/\\ Math.log2 \\/
        return f(self)
    }

    /// The base-10 logarithm.
    fn &.log10 |self| () & {
        let f: fun(&) & = @es/\\ Math.log10 \\/
        return f(self)
    }

    /// The cube root.
    fn &.cbrt |self| () & {
        let f: fun(&) & = @es/\\ Math.cbrt \\/
        return f(self)
    }

    /// \`self\` to the power \`exponent\`.
    fn &.pow |self| (exponent: &) & {
        let f: fun(&, &) & = @es/\\ Math.pow \\/
        return f(self, exponent)
    }

    /// The angle of the point (\`other\`, \`self\`) from the x axis: \`y.atan2(x)\`, in radians.
    fn &.atan2 |self| (other: &) & {
        let f: fun(&, &) & = @es/\\ Math.atan2 \\/
        return f(self, other)
    }

    /// $sqrt(x^2 + y^2)$, without overflow on the way.
    fn &.hypot |self| (other: &) & {
        let f: fun(&, &) & = @es/\\ Math.hypot \\/
        return f(self, other)
    }

    /// Whether this is NaN, which is not equal even to itself.
    fn &.is_nan |self| () Bool { return self != self }

    /// Whether this is neither infinite nor NaN.
    fn &.is_finite |self| () Bool { return self - self == 0.0 }

    /// $pi$.
    fn pi() & { return 3.141592653589793 }

    /// Euler's number $e$.
    fn e() & { return 2.718281828459045 }

    /// Positive infinity.
    fn inf() & { return 1.0 / 0.0 }

    /// Not a number.
    fn nan() & { return 0.0 / 0.0 }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Found",`// Optional iterator result: null means empty; a present wrapper holds any T,
// including non-nullable scalar types. Use \`promote\` or \`orelse\` to unwrap.
mod Found[T] {
    struct &:
        | value: T
    fn &.new(value: T) & {
        return &{ value: value }
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Gpu",`// Generated from src/runtime/gpu.js by the build. No runtime ships unless used.
mod gpu {
    fn init() Void {
        let install: fun() Void = @es/\\ () => { globalThis.__utuGpu ??= (function createGpuRuntime() {
  const MAP_READ = typeof GPUMapMode !== 'undefined' ? GPUMapMode.READ : 0x0001;
  const U_MAP_READ = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.MAP_READ : 0x0001;
  const U_COPY_SRC = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.COPY_SRC : 0x0004;
  const U_COPY_DST = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.COPY_DST : 0x0008;
  const U_UNIFORM = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.UNIFORM : 0x0040;
  const U_STORAGE = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage.STORAGE : 0x0080;

  let cachedGpu = null;
  let cachedDevicePromise = null;
  let pipelineCache = new Map();

  async function getDevice() {
    const gpu = globalThis.navigator?.gpu;
    if (!gpu) throw new Error('WebGPU is not available (navigator.gpu is undefined)');
    if (gpu !== cachedGpu) {
      cachedGpu = gpu;
      cachedDevicePromise = null;
      pipelineCache = new Map();
    }
    if (!cachedDevicePromise) {
      cachedDevicePromise = (async () => {
        const adapter = await gpu.requestAdapter();
        if (!adapter) throw new Error('WebGPU adapter unavailable');
        return await adapter.requestDevice();
      })();
    }
    return await cachedDevicePromise;
  }

  function getPipeline(device, wgsl, entry) {
    const key = wgsl + '\\0' + entry;
    let p = pipelineCache.get(key);
    if (!p) {
      const module = device.createShaderModule({ code: wgsl });
      p = device.createComputePipeline({
        layout: 'auto',
        compute: { module, entryPoint: entry },
      });
      pipelineCache.set(key, p);
    }
    return p;
  }

  return {
    begin() {
      return {
        buffers: [],
        dispatches: [],
        pendingBinds: [],
        readbackBytes: new Map(),
      };
    },
    upload(session, view, readback) {
      const id = session.buffers.length;
      const copy = new Uint32Array(view.length);
      copy.set(view);
      session.buffers.push({
        kind: 'upload',
        data: copy,
        byteLength: copy.byteLength,
        readback: !!readback,
      });
      return id;
    },
    allocOut(session, byteLength) {
      const id = session.buffers.length;
      session.buffers.push({
        kind: 'out',
        data: null,
        byteLength: byteLength | 0,
        readback: true,
      });
      return id;
    },
    allocScratch(session, byteLength) {
      const id = session.buffers.length;
      session.buffers.push({
        kind: 'scratch',
        data: null,
        byteLength: byteLength | 0,
        readback: false,
      });
      return id;
    },
    bind(session, bufId) {
      session.pendingBinds.push(bufId | 0);
    },
    dispatch(session, wgsl, entry, wgX, wgY, wgZ, gx, gy, gz, uniView) {
      const binds = session.pendingBinds;
      session.pendingBinds = [];
      const uniform = new Uint32Array(uniView.length);
      uniform.set(uniView);
      session.dispatches.push({
        wgsl,
        entry,
        wgX: wgX | 0,
        wgY: wgY | 0,
        wgZ: wgZ | 0,
        gx: gx >>> 0,
        gy: gy >>> 0,
        gz: gz >>> 0,
        binds,
        uniform,
      });
    },
    copyReadback(session, bufId, view) {
      const bytes = session.readbackBytes.get(bufId | 0);
      if (!bytes) return;
      const dst = new Uint8Array(view.buffer, view.byteOffset, Math.min(view.byteLength, bytes.byteLength));
      dst.set(bytes.subarray(0, dst.byteLength));
    },
    async submit(session, onReadback) {
      const device = await getDevice();
      const gpuBuffers = [];
      const toDestroy = [];
      try {
        for (let i = 0; i < session.buffers.length; i++) {
          const b = session.buffers[i];
          const size = Math.max(4, (b.byteLength + 3) & ~3);
          let usage = U_STORAGE;
          if (b.kind === 'upload') {
            usage |= U_COPY_DST;
            if (b.readback) usage |= U_COPY_SRC;
          } else if (b.kind === 'out') {
            usage |= U_COPY_SRC;
          }
          const gpuBuf = device.createBuffer({ size, usage });
          gpuBuffers.push(gpuBuf);
          toDestroy.push(gpuBuf);
          if (b.kind === 'upload' && b.byteLength > 0) {
            device.queue.writeBuffer(gpuBuf, 0, b.data.buffer, b.data.byteOffset, b.data.byteLength);
          }
        }

        const encoder = device.createCommandEncoder();
        for (let i = 0; i < session.dispatches.length; i++) {
          const d = session.dispatches[i];
          const pipeline = getPipeline(device, d.wgsl, d.entry);
          const uniSize = Math.max(16, (d.uniform.byteLength + 15) & ~15);
          const uniBuf = device.createBuffer({ size: uniSize, usage: U_UNIFORM | U_COPY_DST });
          toDestroy.push(uniBuf);
          device.queue.writeBuffer(uniBuf, 0, d.uniform.buffer, d.uniform.byteOffset, d.uniform.byteLength);

          const entries = [];
          for (let k = 0; k < d.binds.length; k++) {
            entries.push({ binding: k, resource: { buffer: gpuBuffers[d.binds[k]] } });
          }
          entries.push({ binding: d.binds.length, resource: { buffer: uniBuf } });
          const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries,
          });
          const pass = encoder.beginComputePass();
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bindGroup);
          if (d.gx > 0 && d.gy > 0 && d.gz > 0) {
            pass.dispatchWorkgroups(
              Math.ceil(d.gx / d.wgX),
              Math.ceil(d.gy / d.wgY),
              Math.ceil(d.gz / d.wgZ),
            );
          }
          pass.end();
        }

        const stagings = [];
        for (let i = 0; i < session.buffers.length; i++) {
          const b = session.buffers[i];
          if (b.readback && b.byteLength > 0) {
            const size = (b.byteLength + 3) & ~3;
            const staging = device.createBuffer({ size, usage: U_MAP_READ | U_COPY_DST });
            encoder.copyBufferToBuffer(gpuBuffers[i], 0, staging, 0, size);
            stagings.push({ id: i, staging, byteLength: b.byteLength });
            toDestroy.push(staging);
          }
        }

        device.queue.submit([encoder.finish()]);

        if (stagings.length > 0) {
          await Promise.all(stagings.map(s => s.staging.mapAsync(MAP_READ)));
          for (const s of stagings) {
            const mapped = new Uint8Array(s.staging.getMappedRange(), 0, s.byteLength);
            const copy = new Uint8Array(s.byteLength);
            copy.set(mapped);
            session.readbackBytes.set(s.id, copy);
            s.staging.unmap();
          }
        }

        if (onReadback) onReadback();
      } finally {
        for (const buf of toDestroy) {
          try { buf.destroy?.(); } catch {}
        }
      }
    },
  };
})(); } \\/;
        install();
    }
    fn begin() Externref {
        init();
        let f: fun() Externref = @es/\\ () => globalThis.__utuGpu.begin() \\/;
        return f();
    }
    fn upload(session: Externref, view: Externref, readback: Bool) I32 {
        let f: fun(Externref, Externref, Bool) I32 = @es/\\ (s, v, rb) => globalThis.__utuGpu.upload(s, v, rb) \\/;
        return f(session, view, readback);
    }
    fn alloc_out(session: Externref, byte_len: I32) I32 {
        let f: fun(Externref, I32) I32 = @es/\\ (s, n) => globalThis.__utuGpu.allocOut(s, n) \\/;
        return f(session, byte_len);
    }
    fn alloc_scratch(session: Externref, byte_len: I32) I32 {
        let f: fun(Externref, I32) I32 = @es/\\ (s, n) => globalThis.__utuGpu.allocScratch(s, n) \\/;
        return f(session, byte_len);
    }
    fn bind(session: Externref, buf_id: I32) Void {
        let f: fun(Externref, I32) Void = @es/\\ (s, id) => { globalThis.__utuGpu.bind(s, id); } \\/;
        f(session, buf_id);
    }
    fn dispatch(session: Externref, wgsl: Str, entry: Str, wg_x: I32, wg_y: I32, wg_z: I32, gx: U32, gy: U32, gz: U32, uni_view: Externref) Void {
        let f: fun(Externref, Str, Str, I32, I32, I32, U32, U32, U32, Externref) Void = @es/\\ (s, wgsl, entry, wx, wy, wz, gx, gy, gz, u) => { globalThis.__utuGpu.dispatch(s, wgsl, entry, wx, wy, wz, gx, gy, gz, u); } \\/;
        f(session, wgsl, entry, wg_x, wg_y, wg_z, gx, gy, gz, uni_view);
    }
    fn copy_readback(session: Externref, buf_id: I32, view: Externref) Void {
        let f: fun(Externref, I32, Externref) Void = @es/\\ (s, id, v) => { globalThis.__utuGpu.copyReadback(s, id, v); } \\/;
        f(session, buf_id, view);
    }
    fn submit(session: Externref, on_readback: cl() Void) Promise[Void] {
        let f: fun(Externref, cl() Void) Promise[Void] = @es/\\ (s, cb) => globalThis.__utuGpu.submit(s, cb) \\/;
        return f(session, on_readback);
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Group",`mod Group[K, T] {
    struct &:
        | key: K
        | values: Array[T]
    fn &.new(key: K) & {
        return &{ key: key, values: [] }
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:I31",`// std/I31.utu \u2014 I31 WasmGC reference type module
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
    fn from_i32(x: I32) & => @ir/\\ <ir-i31-new><ir-ident name="x"/></ir-i31-new> \\/;

    // Unpack as signed I32 (sign-extends from 31 bits).
    fn get_s(r: &) I32 => @ir/\\ <ir-i31-get-s><ir-ident name="r"/></ir-i31-get-s> \\/;

    // Unpack as unsigned I32 (zero-extends from 31 bits).
    fn get_u(r: &) I32 => @ir/\\ <ir-i31-get-u><ir-ident name="r"/></ir-i31-get-u> \\/;

    // Reference equality (same I31 value \u2192 same reference \u2192 eq).
    fn &:eq |a, b| Bool => @ir/\\ <ir-ref-eq><ir-ident name="a"/><ir-ident name="b"/></ir-ref-eq> \\/;
    fn &:ne |a, b| Bool => @ir/\\ <ir-ref-ne><ir-ident name="a"/><ir-ident name="b"/></ir-ref-ne> \\/;
}
`.replaceAll("@@IR_WASM@@",$)],["std:I32",`// std/I32.utu \u2014 I32 scalar type module
// & is a WasmGC I32 value (stack-only, never heap-allocated, never nullable).

mod I32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:add  |a, b| & => @ir/\\ <ir-i32-add><ir-ident name="a"/><ir-ident name="b"/></ir-i32-add> \\/;
    fn &:sub  |a, b| & => @ir/\\ <ir-i32-sub><ir-ident name="a"/><ir-ident name="b"/></ir-i32-sub> \\/;
    fn &:mul  |a, b| & => @ir/\\ <ir-i32-mul><ir-ident name="a"/><ir-ident name="b"/></ir-i32-mul> \\/;
    fn &:div  |a, b| & => @ir/\\ <ir-i32-div-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-div-s> \\/;
    fn &:rem  |a, b| & => @ir/\\ <ir-i32-rem-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-rem-s> \\/;
    fn &:band |a, b| & => @ir/\\ <ir-i32-and><ir-ident name="a"/><ir-ident name="b"/></ir-i32-and> \\/;
    fn &:bor  |a, b| & => @ir/\\ <ir-i32-or><ir-ident name="a"/><ir-ident name="b"/></ir-i32-or> \\/;
    fn &:bxor |a, b| & => @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i32-xor> \\/;
    fn &:shl  |a, b| & => @ir/\\ <ir-i32-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shl> \\/;
    fn &:shr  |a, b| & => @ir/\\ <ir-i32-shr-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-s> \\/;
    fn &:ushr |a, b| & => @ir/\\ <ir-i32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-u> \\/;
    fn &:eq   |a, b| Bool => @ir/\\ <ir-i32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i32-eq> \\/;
    fn &:ne   |a, b| Bool => @ir/\\ <ir-i32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ne> \\/;
    fn &:lt   |a, b| Bool => @ir/\\ <ir-i32-lt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-lt-s> \\/;
    fn &:le   |a, b| Bool => @ir/\\ <ir-i32-le-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-le-s> \\/;
    fn &:gt   |a, b| Bool => @ir/\\ <ir-i32-gt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-gt-s> \\/;
    fn &:ge   |a, b| Bool => @ir/\\ <ir-i32-ge-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ge-s> \\/;
    // wasm has no I32.neg / I32.not; express them with real ops.
    //   neg a  = 0 - a
    //   bnot a = a xor 0xFFFFFFFF (-1)
    // The lesser and the greater of two; the size of one (the least I32's is itself: 0 - x wraps).
    fn min(p: &, q: &) & { return if p < q { p } else { q } }
    fn max(p: &, q: &) & { return if q < p { p } else { q } }
    fn abs(v: &) & { return if v < 0 { -v } else { v } }
    fn &:neg  |a| & => @ir/\\ <ir-i32-sub><ir-lit kind="int" type-name="I32" value="0"/><ir-ident name="a"/></ir-i32-sub> \\/;
    fn &:bnot |a| & => @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I32" value="-1"/></ir-i32-xor> \\/;
    fn clz(x: &) & => @ir/\\ <ir-i32-clz><ir-ident name="x"/></ir-i32-clz> \\/;
    fn ctz(x: &) & => @ir/\\ <ir-i32-ctz><ir-ident name="x"/></ir-i32-ctz> \\/;
    fn popcnt(x: &) & => @ir/\\ <ir-i32-popcnt><ir-ident name="x"/></ir-i32-popcnt> \\/;

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.i64 |self| () I64 => @ir/\\ <ir-i64-extend-s><ir-ident name="self"/></ir-i64-extend-s> \\/;
    fn &.u64 |self| () U64 => @ir/\\ <ir-u64-extend-s><ir-ident name="self"/></ir-u64-extend-s> \\/;
    fn &.u32 |self| () U32 => @ir/\\ <ir-u32-or><ir-ident name="self"/><ir-lit kind="int" type-name="U32" value="0"/></ir-u32-or> \\/;
    fn &.f32 |self| () F32 => @ir/\\ <ir-f32-convert-s-i32><ir-ident name="self"/></ir-f32-convert-s-i32> \\/;
    fn &.f64 |self| () F64 => @ir/\\ <ir-f64-convert-s-i32><ir-ident name="self"/></ir-f64-convert-s-i32> \\/;

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(I32) Str = @es/\\ (v) => String(v) \\/
        return format(self)
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:I64",`// std/I64.utu \u2014 I64 scalar type module
mod I64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i64"/> \\/

    fn &:add  |a, b| & => @ir/\\ <ir-i64-add><ir-ident name="a"/><ir-ident name="b"/></ir-i64-add> \\/;
    fn &:sub  |a, b| & => @ir/\\ <ir-i64-sub><ir-ident name="a"/><ir-ident name="b"/></ir-i64-sub> \\/;
    fn &:mul  |a, b| & => @ir/\\ <ir-i64-mul><ir-ident name="a"/><ir-ident name="b"/></ir-i64-mul> \\/;
    fn &:div  |a, b| & => @ir/\\ <ir-i64-div-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-div-s> \\/;
    fn &:rem  |a, b| & => @ir/\\ <ir-i64-rem-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-rem-s> \\/;
    fn &:band |a, b| & => @ir/\\ <ir-i64-and><ir-ident name="a"/><ir-ident name="b"/></ir-i64-and> \\/;
    fn &:bor  |a, b| & => @ir/\\ <ir-i64-or><ir-ident name="a"/><ir-ident name="b"/></ir-i64-or> \\/;
    fn &:bxor |a, b| & => @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i64-xor> \\/;
    fn &:shl  |a, b| & => @ir/\\ <ir-i64-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shl> \\/;
    fn &:shr  |a, b| & => @ir/\\ <ir-i64-shr-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-s> \\/;
    fn &:ushr |a, b| & => @ir/\\ <ir-i64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-u> \\/;
    fn &:eq   |a, b| Bool => @ir/\\ <ir-i64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i64-eq> \\/;
    fn &:ne   |a, b| Bool => @ir/\\ <ir-i64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i64-ne> \\/;
    fn &:lt   |a, b| Bool => @ir/\\ <ir-i64-lt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-lt-s> \\/;
    fn &:le   |a, b| Bool => @ir/\\ <ir-i64-le-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-le-s> \\/;
    fn &:gt   |a, b| Bool => @ir/\\ <ir-i64-gt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-gt-s> \\/;
    fn &:ge   |a, b| Bool => @ir/\\ <ir-i64-ge-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-ge-s> \\/;
    // wasm has no I64.neg / I64.not; express them with real ops.
    //   neg a  = 0 - a
    //   bnot a = a xor 0xFFFFFFFFFFFFFFFF (-1)
    // The lesser and the greater of two; the size of one (the least I64's is itself: 0 - x wraps).
    fn min(p: &, q: &) & { return if p < q { p } else { q } }
    fn max(p: &, q: &) & { return if q < p { p } else { q } }
    fn abs(v: &) & { return if v < 0 { -v } else { v } }
    fn &:neg  |a| & => @ir/\\ <ir-i64-sub><ir-lit kind="int" type-name="I64" value="0"/><ir-ident name="a"/></ir-i64-sub> \\/;
    fn &:bnot |a| & => @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I64" value="-1"/></ir-i64-xor> \\/;

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.i32 |self| () I32 => @ir/\\ <ir-i32-wrap><ir-ident name="self"/></ir-i32-wrap> \\/;
    fn &.u32 |self| () U32 => @ir/\\ <ir-u32-wrap><ir-ident name="self"/></ir-u32-wrap> \\/;
    fn &.u64 |self| () U64 => @ir/\\ <ir-u64-or><ir-ident name="self"/><ir-lit kind="int" type-name="U64" value="0"/></ir-u64-or> \\/;
    fn &.f32 |self| () F32 => @ir/\\ <ir-f32-convert-s-i64><ir-ident name="self"/></ir-f32-convert-s-i64> \\/;
    fn &.f64 |self| () F64 => @ir/\\ <ir-f64-convert-s-i64><ir-ident name="self"/></ir-f64-convert-s-i64> \\/;

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(I64) Str = @es/\\ (v) => String(v) \\/
        return format(self)
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:IntMap",`// std/IntMap.utu \u2014 I32 keys to I32 values, open addressing.
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
        return &{ keys: Array[I32].new(16, 0), values: Array[I32].new(16, 0), full: Array[I32].new(16, 0), count: 0, shift: 28 }
    }

    fn &.len |self| () I32 {
        return self.count
    }

    // The slot holding key, or the empty slot where it belongs.
    fn &.slot |self| (key: I32) I32 {
        let mask = self.keys.len() - 1
        let i = (key * -1640531535) >>> self.shift
        while (self.full[i] != 0 and self.keys[i] != key) { i = (i + 1) & mask }
        return i
    }

    fn &.has |self| (key: I32) Bool {
        return self.full[self.slot(key)] != 0
    }

    fn &.get |self| (key: I32, missing: I32) I32 {
        let i = self.slot(key)
        return if self.full[i] != 0 { self.values[i] } else { missing }
    }

    fn &.set |self| (key: I32, value: I32) Void {
        let i = self.slot(key)
        if self.full[i] == 0 {
            if (self.count + 1) * 2 > self.keys.len() {
                self.grow()
                i = self.slot(key)
            }
            self.full[i] = 1
            self.keys[i] = key
            self.count += 1
        }
        self.values[i] = value
    }

    fn &.grow |self| () Void {
        let keys = self.keys
        let values = self.values
        let full = self.full
        let size = keys.len() * 2
        self.keys = Array[I32].new(size, 0)
        self.values = Array[I32].new(size, 0)
        self.full = Array[I32].new(size, 0)
        self.shift -= 1
        for (0 ..< keys.len()) |j| {
            if full[j] != 0 {
                let i = self.slot(keys[j])
                self.full[i] = 1
                self.keys[i] = keys[j]
                self.values[i] = values[j]
            }
        }
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Interner",`// std/Interner.utu \u2014 byte strings to dense I32 ids: 0, 1, 2, \u2026 in first-seen order.
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
        return &{ bytes: Array[I32].new(256, 0), used: 0, starts: Array[I32].new(64, 0), hashes: Array[I32].new(64, 0),
           count: 0, table: Array[I32].new(64, 0), start: 0, hash: 0 }
    }

    // Distinct keys so far.
    fn &.len |self| () I32 {
        return self.count
    }

    fn &.begin |self| () Void {
        self.start = self.used
        self.hash = -2128831035
    }

    // One byte of the key, 0 to 255.
    fn &.byte |self| (b: I32) Void {
        if checks() and (b < 0 or b > 255) { fatal }
        if self.used == self.bytes.len() {
            let grown = Array[I32].new(self.used * 2, 0)
            grown.copy_from(0, self.bytes, 0, self.used)
            self.bytes = grown
        }
        self.bytes[self.used] = b & 255
        self.used += 1
        self.hash = (self.hash ^ (b & 255)) * 16777619
    }

    // The id of \`s\` as UTF-8, adding it if it is new: begin, its bytes, finish.
    // A lone surrogate is 3 bytes of its own (WTF-8), so distinct strings
    // always get distinct ids.
    fn &.str |self| (s: Str) I32 {
        self.begin()
        let n = s.len()
        let i = 0
        while (i < n) {
            let c = s[i]
            i += 1
            if c >= 55296 and c <= 56319 and i < n and s[i] >= 56320 and s[i] <= 57343 {
                c = 65536 + ((c - 55296) << 10) + (s[i] - 56320)
                i += 1
            }
            if c < 128 {
                self.byte(c)
            } else if c < 2048 {
                self.byte(192 | (c >> 6))
                self.byte(128 | (c & 63))
            } else if c < 65536 {
                self.byte(224 | (c >> 12))
                self.byte(128 | ((c >> 6) & 63))
                self.byte(128 | (c & 63))
            } else {
                self.byte(240 | (c >> 18))
                self.byte(128 | ((c >> 12) & 63))
                self.byte(128 | ((c >> 6) & 63))
                self.byte(128 | (c & 63))
            }
        }
        return self.finish()
    }

    // The id of the bytes since begin(), adding them if they are new.
    fn &.finish |self| () I32 {
        let mask = self.table.len() - 1
        let i = self.hash & mask
        let length = self.used - self.start
        while (self.table[i] != 0) {
            let id = self.table[i] - 1
            if self.hashes[id] == self.hash and self.same(id, length) {
                self.used = self.start
                return id
            }
            i = (i + 1) & mask
        }
        let id = self.count
        if id + 1 == self.starts.len() {
            let starts = Array[I32].new(self.starts.len() * 2, 0)
            starts.copy_from(0, self.starts, 0, self.starts.len())
            self.starts = starts
            let hashes = Array[I32].new(self.hashes.len() * 2, 0)
            hashes.copy_from(0, self.hashes, 0, self.hashes.len())
            self.hashes = hashes
        }
        self.starts[id] = self.start
        self.starts[id + 1] = self.used
        self.hashes[id] = self.hash
        self.count += 1
        self.table[i] = id + 1
        if self.count * 2 > self.table.len() { self.rehash() }
        return id
    }

    fn &.same |self| (id: I32, length: I32) Bool {
        let at = self.starts[id]
        if self.starts[id + 1] - at != length { return false }
        for (0 ..< length) |k| {
            if self.bytes[at + k] != self.bytes[self.start + k] { return false }
        }
        return true
    }

    fn &.rehash |self| () Void {
        let table = Array[I32].new(self.table.len() * 2, 0)
        let mask = table.len() - 1
        for (0 ..< self.count) |id| {
            let i = self.hashes[id] & mask
            while (table[i] != 0) { i = (i + 1) & mask }
            table[i] = id + 1
        }
        self.table = table
    }

    // Byte length of a key.
    fn &.size |self| (id: I32) I32 {
        return self.starts[id + 1] - self.starts[id]
    }

    fn &.byte_at |self| (id: I32, k: I32) I32 {
        if checks() and (k < 0 or k >= self.size(id)) { fatal }
        return self.bytes[self.starts[id] + k]
    }

    fn checks() Bool => @ir/\\ <ir-safe-checks/> \\/;

    // The key as a string, one character per byte: exact for ASCII; a
    // multi-byte UTF-8 character shows as its bytes.
    fn &.ascii |self| (id: I32) Str {
        return Str.from_codes(self.bytes.slice(self.starts[id], self.starts[id + 1]), self.size(id))
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:JsonRuntime",`struct JsonReader__:
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

let __json_number: fun(Str) F64 = @es/\\ s => +s \\/
let __json_float_text: fun(F64) Str = @es/\\ x => Number.isFinite(x) ? String(x) : 'null' \\/

fn __json_codes(s: Str) Array[I32] {
    let codes = Array[I32].new_default(s.len())
    for (0..<s.len()) |i| {
        codes[i] = s[i]
    }
    return codes
}

fn __json_reader(text: Str) JsonReader__ {
    return JsonReader__ { text: text, at: 0, n: text.len(), failed: 0, reason: "", ks: 0, kl: 0, key: "", depth: 0, names: __json_codes(__json_names()), where: "", matched: 0 }
}

// Start over from the beginning, for the next match arm.
fn __json_restart(r: JsonReader__) Void {
    r.at = 0
    r.failed = 0
    r.reason = ""
    r.depth = 0
    r.where = ""
    r.matched = 0
}

// After one part of a match pattern: count it, or name where it failed.
fn __json_at(r: JsonReader__, was_ok: Bool, where: Str) Void {
    if was_ok {
        if r.failed != 0 {
            r.where = where
        } else {
            r.matched += 1
        }
    }
}

// Record the first problem; then every later read stops at the end of input.
fn __json_fail(r: JsonReader__, why: Str) Void {
    if r.failed == 0 {
        r.failed = r.at + 1
        r.reason = why
    }
    r.at = r.n
}

fn __json_ws(r: JsonReader__) Void {
    let t = r.text
    let n = r.n
    let i = r.at
    while (i < n) {
        let c = t[i]
        if c == 32 or c == 10 or c == 13 or c == 9 {
            i += 1
        } else {
            break
        }
    }
    r.at = i
}

fn __json_peek(r: JsonReader__) I32 {
    __json_ws(r)
    return if r.at < r.n { r.text[r.at] } else { -1 }
}

fn __json_open(r: JsonReader__, c: I32, why: Str) Void {
    if __json_peek(r) == c {
        r.at += 1
        if c != 58 {
            __json_enter(r)
        }
    } else {
        __json_fail(r, why)
    }
}

// Into an object or array: one level deeper (out again at its close).
fn __json_enter(r: JsonReader__) Void {
    r.depth += 1
    if r.depth > 512 {
        __json_fail(r, "nested too deeply")
    }
}

fn __json_colon(r: JsonReader__) Void {
    __json_open(r, 58, "expected ':'")
}

// After an opening bracket: whether the container has a first element.
fn __json_first(r: JsonReader__, close: I32) Bool {
    return if __json_peek(r) == close {
        r.at += 1
        r.depth -= 1
        false
    } else {
        r.failed == 0
    }
}

// After an element: whether another one follows.
fn __json_next(r: JsonReader__, close: I32) Bool {
    let c = __json_peek(r)
    return if c == 44 {
        r.at += 1
        true
    } else {
        if c == close {
            r.at += 1
            r.depth -= 1
        } else {
            __json_fail(r, if close == 125 { "expected ',' or '}'" } else { "expected ',' or ']'" })
        }
        false
    }
}

fn __json_end(r: JsonReader__) Void {
    if __json_peek(r) != -1 {
        __json_fail(r, "unexpected text after the value")
    }
}

fn __json_missing(r: JsonReader__, name: Str) Void {
    __json_fail(r, "missing field \\"" + name + "\\"")
}

fn __json_word(r: JsonReader__, word: Str) Bool {
    let n = word.len()
    let ok = r.at + n <= r.n
    let i = 0
    while (ok and i < n) {
        ok = r.text[r.at + i] == word[i]
        i += 1
    }
    if ok {
        r.at += n
    }
    return ok
}

fn __json_hex(r: JsonReader__, at: I32) I32 {
    let v = 0
    for (0..<4) |k| {
        let c = if at + k < r.n { r.text[at + k] } else { 0 }
        let d = if c >= 48 and c <= 57 { c - 48 } else { if c >= 97 and c <= 102 { c - 87 } else { if c >= 65 and c <= 70 { c - 55 } else { -1 } } }
        v = if d < 0 or v < 0 { -1 } else { v * 16 + d }
    }
    return v
}

// Read a string token. Without escapes it stays a span of the input
// (ks, kl); with escapes it is decoded into key and ks is -1.
fn __json_span(r: JsonReader__) Void {
    r.ks = 0
    r.kl = 0
    if __json_peek(r) != 34 {
        __json_fail(r, "expected a string")
        return
    }
    let t = r.text
    let n = r.n
    let start = r.at + 1
    let i = start
    while (i < n) {
        let c = t[i]
        if c == 34 or c == 92 or c < 32 {
            break
        }
        i += 1
    }
    if i < n and t[i] == 34 {
        r.ks = start
        r.kl = i - start
        r.at = i + 1
        return
    }
    let w = __json_writer(i - start + 16)
    for (start..<i) |k| {
        __json_put(w, t[k])
    }
    let done = false
    while (not done) {
        if i >= n {
            r.at = n
            __json_fail(r, "unterminated string")
            done = true
        } else {
            let c = t[i]
            if c == 34 {
                i += 1
                done = true
            } else {
                if c < 32 {
                    r.at = i
                    __json_fail(r, "control character in string")
                    done = true
                } else {
                    if c == 92 {
                        let e = if i + 1 < n { t[i + 1] } else { 0 }
                        i += 2
                        match e {
                            34 => { __json_put(w, 34) },
                            92 => { __json_put(w, 92) },
                            47 => { __json_put(w, 47) },
                            98 => { __json_put(w, 8) },
                            102 => { __json_put(w, 12) },
                            110 => { __json_put(w, 10) },
                            114 => { __json_put(w, 13) },
                            116 => { __json_put(w, 9) },
                            117 => {
                                let h = __json_hex(r, i)
                                if h < 0 {
                                    r.at = i - 2
                                    __json_fail(r, "invalid \\\\u escape")
                                    done = true
                                } else {
                                    __json_put(w, h)
                                    i += 4
                                }
                            },
                            ~> {
                                r.at = i - 2
                                __json_fail(r, "invalid escape")
                                done = true
                            },
                        }
                    } else {
                        __json_put(w, c)
                        i += 1
                    }
                }
            }
        }
    }
    if r.failed == 0 {
        r.at = i
        r.ks = -1
        r.key = Str.from_codes(w.buf, w.n)
    }
}

// Whether the string just read equals names[at ..< at + n].
fn __json_is(r: JsonReader__, at: I32, n: I32) Bool {
    return if r.ks < 0 {
        let ok = r.key.len() == n
        let i = 0
        while (ok and i < n) {
            ok = r.key[i] == r.names[at + i]
            i += 1
        }
        ok
    } else {
        let ok = r.kl == n
        let i = 0
        while (ok and i < n) {
            ok = r.text[r.ks + i] == r.names[at + i]
            i += 1
        }
        ok
    }
}

fn __json_str(r: JsonReader__) Str {
    __json_span(r)
    return if r.ks < 0 { r.key } else { r.text.slice(r.ks, r.ks + r.kl) }
}

fn __json_bool(r: JsonReader__) Bool {
    let c = __json_peek(r)
    return if c == 116 and __json_word(r, "true") {
        true
    } else {
        if not (c == 102 and __json_word(r, "false")) {
            __json_fail(r, "expected true or false")
        }
        false
    }
}

fn __json_null(r: JsonReader__) Bool {
    return __json_peek(r) == 110 and __json_word(r, "null")
}

fn __json_digits(r: JsonReader__, at: I32) I32 {
    let i = at
    while (i < r.n and r.text[i] >= 48 and r.text[i] <= 57) {
        i += 1
    }
    return i
}

// Scan a number token from r.at. Returns its end, or -1 if it is malformed.
// kl is 1 when it has a fraction or an exponent.
fn __json_number_end(r: JsonReader__) I32 {
    let t = r.text
    let i = r.at
    if i < r.n and t[i] == 45 {
        i += 1
    }
    let whole = i
    i = __json_digits(r, i)
    if i == whole or (t[whole] == 48 and i - whole > 1) {
        return -1
    }
    r.kl = 0
    if i < r.n and t[i] == 46 {
        r.kl = 1
        let fraction = i + 1
        i = __json_digits(r, fraction)
        if i == fraction {
            return -1
        }
    }
    if i < r.n and (t[i] == 101 or t[i] == 69) {
        r.kl = 1
        i += 1
        if i < r.n and (t[i] == 43 or t[i] == 45) {
            i += 1
        }
        let exponent = i
        i = __json_digits(r, exponent)
        if i == exponent {
            return -1
        }
    }
    return i
}

fn __json_f64(r: JsonReader__) F64 {
    __json_ws(r)
    let start = r.at
    let end = __json_number_end(r)
    if end < 0 {
        __json_fail(r, "expected a number")
        return 0.0
    }
    r.at = end
    let negative = r.text[start] == 45
    let whole = if negative { start + 1 } else { start }
    return if r.kl == 0 and end - whole <= 15 {
        // Integers below 10^15 are exact in F64: no host call.
        let v: F64 = 0.0
        for (whole..<end) |k| {
            v = v * 10.0 + (r.text[k] - 48).f64()
        }
        if negative { v * -1.0 } else { v }
    } else {
        let v = __json_number(r.text.slice(start, end))
        // (v - v is NaN for an infinity.)
        if v - v != 0.0 {
            r.at = start
            __json_fail(r, "number out of range")
        }
        v
    }
}

fn __json_f32(r: JsonReader__) F32 {
    let start = r.at
    let v = __json_f64(r).f32()
    if v - v != 0.0 {
        r.at = start
        __json_fail(r, "number out of range")
    }
    return v
}

// Integers are read exactly, digit by digit, on the negative side so that
// the minimum I64 fits.
fn __json_i64(r: JsonReader__) I64 {
    __json_ws(r)
    let start = r.at
    let end = __json_number_end(r)
    if end < 0 or r.kl != 0 {
        __json_fail(r, "expected an integer")
        return 0
    }
    let negative = r.text[start] == 45
    let whole = if negative { start + 1 } else { start }
    let v: I64 = 0
    let limit: I64 = -922337203685477580
    let overflow = false
    for (whole..<end) |k| {
        let d = (r.text[k] - 48).i64()
        if v < limit or (v == limit and d > 8) {
            overflow = true
        }
        v = v * 10 - d
    }
    if overflow or (not negative and v == limit * 10 - 8) {
        __json_fail(r, "integer out of range")
        return 0
    }
    r.at = end
    return if negative { v } else { 0 - v }
}

fn __json_i32(r: JsonReader__) I32 {
    __json_ws(r)
    let start = r.at
    let v = __json_i64(r)
    let low: I64 = -2147483648
    let high: I64 = 2147483647
    return if v < low or v > high {
        r.at = start
        __json_fail(r, "integer out of range")
        0
    } else {
        v.i32()
    }
}

fn __json_u32(r: JsonReader__) U32 {
    __json_ws(r)
    let start = r.at
    let v = __json_i64(r)
    let high: I64 = 4294967295
    if v < 0 or v > high {
        r.at = start
        __json_fail(r, "integer out of range")
    }
    return v.u32()
}

// Skip one value of any shape (unknown fields).
fn __json_skip(r: JsonReader__) Void {
    let c = __json_peek(r)
    if c == 123 {
        r.at += 1
        __json_enter(r)
        let more = __json_first(r, 125)
        while (more) {
            __json_span(r)
            __json_colon(r)
            __json_skip(r)
            more = __json_next(r, 125)
        }
    } else {
        if c == 91 {
            r.at += 1
            __json_enter(r)
            let more = __json_first(r, 93)
            while (more) {
                __json_skip(r)
                more = __json_next(r, 93)
            }
        } else {
            if c == 34 {
                __json_span(r)
            } else {
                if c == 116 or c == 102 {
                    let flag = __json_bool(r)
                } else {
                    if not __json_null(r) {
                        let end = __json_number_end(r)
                        if end < 0 {
                            __json_fail(r, "expected a value")
                        } else {
                            r.at = end
                        }
                    }
                }
            }
        }
    }
}

// Skip the remaining fields of an object whose first field was already read.
fn __json_rest(r: JsonReader__) Void {
    let more = __json_next(r, 125)
    while (more) {
        __json_span(r)
        __json_colon(r)
        __json_skip(r)
        more = __json_next(r, 125)
    }
}

fn __json_describe(r: JsonReader__) Str {
    if r.failed == 0 {
        return ""
    }
    let line = 1
    let column = 1
    // A line ends at \\n, \\r\\n, or a lone \\r; a column counts characters
    // (not a surrogate pair's second half).
    for (0..<(r.failed - 1)) |i| {
        let c = r.text[i]
        if c == 10 or (c == 13 and (i + 1 >= r.text.len() or r.text[i + 1] != 10)) {
            line += 1
            column = 1
        } else if c < 56320 or c > 57343 {
            column += 1
        }
    }
    let place = if r.where.len() > 0 { r.where + ": " } else { "" }
    return place + r.reason + " at line " + line.str() + ", column " + column.str()
}

fn __json_writer(capacity: I32) JsonWriter__ {
    return JsonWriter__ { buf: Array[I32].new_default(capacity), n: 0, names: __json_codes(__json_names()) }
}

// Make room for count more code units, so writes can skip the check.
fn __json_reserve(w: JsonWriter__, count: I32) Void {
    if w.n + count > w.buf.len() {
        let grown = Array[I32].new_default(w.n * 2 + count + 16)
        grown.copy_from(0, w.buf, 0, w.n)
        w.buf = grown
    }
}

fn __json_put(w: JsonWriter__, c: I32) Void {
    __json_reserve(w, 1)
    w.buf[w.n] = c
    w.n += 1
}

fn __json_raw(w: JsonWriter__, s: Str) Void {
    let n = s.len()
    __json_reserve(w, n)
    for (0..<n) |i| {
        w.buf[w.n + i] = s[i]
    }
    w.n += n
}

// prefix, then "name": with the name copied from the table in one array.copy.
fn __json_name(w: JsonWriter__, prefix: I32, at: I32, n: I32) Void {
    __json_reserve(w, n + 4)
    let o = w.n
    if prefix != 0 {
        w.buf[o] = prefix
        o += 1
    }
    w.buf[o] = 34
    w.buf.copy_from(o + 1, w.names, at, n)
    w.buf[o + n + 1] = 34
    w.buf[o + n + 2] = 58
    w.n = o + n + 3
}

// "name", as an enum value.
fn __json_tag(w: JsonWriter__, at: I32, n: I32) Void {
    __json_reserve(w, n + 2)
    w.buf[w.n] = 34
    w.buf.copy_from(w.n + 1, w.names, at, n)
    w.buf[w.n + n + 1] = 34
    w.n += n + 2
}

fn __json_hex_digit(v: I32) I32 {
    return if v < 10 { v + 48 } else { v + 87 }
}

fn __json_put_str(w: JsonWriter__, s: Str) Void {
    let n = s.len()
    __json_reserve(w, n + 2)
    w.buf[w.n] = 34
    w.n += 1
    let i = 0
    // Plain characters copy straight into reserved space.
    while (i < n) {
        let c = s[i]
        if c == 34 or c == 92 or c < 32 or (c >= 55296 and c <= 57343) {
            break
        }
        w.buf[w.n] = c
        w.n += 1
        i += 1
    }
    while (i < n) {
        let c = s[i]
        i += 1
        if c == 34 or c == 92 {
            __json_put(w, 92)
            __json_put(w, c)
        } else {
            if c >= 55296 and c <= 57343 {
                // A surrogate pair as it is; a lone surrogate escaped, as JSON.stringify does.
                if c <= 56319 and i < n and s[i] >= 56320 and s[i] <= 57343 {
                    __json_put(w, c)
                    __json_put(w, s[i])
                    i += 1
                } else {
                    __json_raw(w, "\\\\u")
                    __json_put(w, __json_hex_digit(c >> 12))
                    __json_put(w, __json_hex_digit((c >> 8) & 15))
                    __json_put(w, __json_hex_digit((c >> 4) & 15))
                    __json_put(w, __json_hex_digit(c & 15))
                }
            } else if c >= 32 {
                __json_put(w, c)
            } else {
                match c {
                    10 => { __json_raw(w, "\\\\n") },
                    13 => { __json_raw(w, "\\\\r") },
                    9 => { __json_raw(w, "\\\\t") },
                    ~> {
                        __json_raw(w, "\\\\u00")
                        __json_put(w, __json_hex_digit(c >> 4))
                        __json_put(w, __json_hex_digit(c & 15))
                    },
                }
            }
        }
    }
    __json_put(w, 34)
}

fn __json_put_i64(w: JsonWriter__, v: I64) Void {
    __json_reserve(w, 20)
    if v < 0 {
        w.buf[w.n] = 45
        w.n += 1
    }
    // Digits of |v|, worked out on the negative side so the minimum I64 fits.
    let m = if v < 0 { v } else { 0 - v }
    let start = w.n
    let more = true
    while (more) {
        w.buf[w.n] = 48 - (m % 10).i32()
        w.n += 1
        m = m / 10
        more = m != 0
    }
    let a = start
    let b = w.n - 1
    while (a < b) {
        let c = w.buf[a]
        w.buf[a] = w.buf[b]
        w.buf[b] = c
        a += 1
        b -= 1
    }
}

fn __json_put_f64(w: JsonWriter__, x: F64) Void {
    if x > -9007199254740992.0 and x < 9007199254740992.0 {
        let whole = x.i64()
        if whole.f64() == x {
            __json_put_i64(w, whole)
            return
        }
    }
    __json_raw(w, __json_float_text(x))
}

fn __json_put_f32(w: JsonWriter__, x: F32) Void {
    let wide = x.f64()
    if wide > -16777216.0 and wide < 16777216.0 and wide.i64().f64() == wide {
        __json_put_i64(w, wide.i64())
    } else {
        if wide - wide == 0.0 {
            __json_raw(w, x.str())
        } else {
            __json_raw(w, "null")
        }
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:List",`mod List[T] {
    // Persistent edits; the input remains unchanged.
    fn append(self: Array[T], value: T) Array[T] {
        let result = Array[T].new(self.len() + 1, value)
        let i = 0
        while (i < self.len()) { result[i] = self[i]; i += 1 }
        return result
    }
    fn remove_at(self: Array[T], index: I32) Array[T] {
        return if index < 0 or index >= self.len() { self } else {
            let result = Array[T].new(self.len() - 1, self[0])
            let i = 0
            while (i < result.len()) { result[i] = self[if i < index { i } else { i + 1 }]; i += 1 }
            result
        }
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:LiteralDefaults",`// std/LiteralDefaults.utu \u2014 default static type for each literal syntax kind
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
`.replaceAll("@@IR_WASM@@",$)],["std:M128",`// std/M128.utu \u2014 M128 bitmask type module
// & is a 128-bit SIMD mask value (same wasm representation as V128).
// Used for lane-selection in SIMD operations.
// Supports bitwise ops; interpreted as four 32-bit lanes of all-zeros/all-ones.

mod M128 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-v128"/> \\/

    fn zero() & => @ir/\\ <ir-v128-const data-type-name="M128" bytes="0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"/> \\/;
    fn ones() & => @ir/\\ <ir-v128-const data-type-name="M128" bytes="255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255"/> \\/;

    fn &:band |a, b| & => @ir/\\ <ir-v128-and><ir-ident name="a"/><ir-ident name="b"/></ir-v128-and> \\/;
    fn &:bor  |a, b| & => @ir/\\ <ir-v128-or><ir-ident name="a"/><ir-ident name="b"/></ir-v128-or> \\/;
    fn &:bxor |a, b| & => @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/;
    fn &:bnot |a| & => @ir/\\ <ir-v128-not><ir-ident name="a"/></ir-v128-not> \\/;
    fn &:eq   |a, b| & => @ir/\\ <ir-v128-not><ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor></ir-v128-not> \\/;
    fn &:ne   |a, b| & => @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/;

    // Select lanes from two vectors using this mask (all-ones = take from a, all-zeros = take from b).
    fn bitselect(a: M128, b: M128, mask: M128) M128 => @ir/\\ <ir-v128-bitselect>
            <ir-ident name="a"/>
            <ir-ident name="b"/>
            <ir-ident name="mask"/>
        </ir-v128-bitselect> \\/;
    fn andnot(a: M128, b: M128) M128 => @ir/\\ <ir-v128-andnot><ir-ident name="a"/><ir-ident name="b"/></ir-v128-andnot> \\/;
    fn any_true(a: M128) Bool => @ir/\\ <ir-v128-any-true><ir-ident name="a"/></ir-v128-any-true> \\/;
}
`.replaceAll("@@IR_WASM@@",$)],["std:M32",`// std/M32.utu \u2014 M32 bitmask type module
// & is a 32-bit bitmask value (same wasm representation as I32).
// Intended for use as a lane-selection mask, not a general integer.
// Supports bitwise and comparison ops; arithmetic (add/sub/mul) is excluded.
// A mask has no sign: \`>>\` is a logical shift, the same as \`>>>\` (zeros in).

mod M32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:band |a, b| & => @ir/\\ <ir-i32-and><ir-ident name="a"/><ir-ident name="b"/></ir-i32-and> \\/;
    fn &:bor  |a, b| & => @ir/\\ <ir-i32-or><ir-ident name="a"/><ir-ident name="b"/></ir-i32-or> \\/;
    fn &:bxor |a, b| & => @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i32-xor> \\/;
    // wasm has no bitwise not; synthesise it as xor with the all-ones mask.
    fn &:bnot |a| & => @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I32" value="-1"/></ir-i32-xor> \\/;
    fn &:shl  |a, b| & => @ir/\\ <ir-i32-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shl> \\/;
    fn &:shr  |a, b| & => @ir/\\ <ir-i32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-u> \\/;
    fn &:ushr |a, b| & => @ir/\\ <ir-i32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-u> \\/;
    fn &:eq   |a, b| Bool => @ir/\\ <ir-i32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i32-eq> \\/;
    fn &:ne   |a, b| Bool => @ir/\\ <ir-i32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ne> \\/;
}
`.replaceAll("@@IR_WASM@@",$)],["std:M64",`// std/M64.utu \u2014 M64 bitmask type module
// & is a 64-bit bitmask value (same wasm representation as I64).
// Intended for use as a lane-selection mask, not a general integer.
// Supports bitwise and comparison ops; arithmetic (add/sub/mul) is excluded.
// A mask has no sign: \`>>\` is a logical shift, the same as \`>>>\` (zeros in).

mod M64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i64"/> \\/

    fn &:band |a, b| & => @ir/\\ <ir-i64-and><ir-ident name="a"/><ir-ident name="b"/></ir-i64-and> \\/;
    fn &:bor  |a, b| & => @ir/\\ <ir-i64-or><ir-ident name="a"/><ir-ident name="b"/></ir-i64-or> \\/;
    fn &:bxor |a, b| & => @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i64-xor> \\/;
    // wasm has no bitwise not; synthesise it as xor with the all-ones mask.
    fn &:bnot |a| & => @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I64" value="-1"/></ir-i64-xor> \\/;
    fn &:shl  |a, b| & => @ir/\\ <ir-i64-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shl> \\/;
    fn &:shr  |a, b| & => @ir/\\ <ir-i64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-u> \\/;
    fn &:ushr |a, b| & => @ir/\\ <ir-i64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-u> \\/;
    fn &:eq   |a, b| Bool => @ir/\\ <ir-i64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i64-eq> \\/;
    fn &:ne   |a, b| Bool => @ir/\\ <ir-i64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i64-ne> \\/;
}
`.replaceAll("@@IR_WASM@@",$)],["std:NumberField",`// Keep the user's draft, including empty/invalid text, separate from a number.
mod NumberField {
    struct &:
        | text: Str
    fn &.new(text: Str) & { return &{ text: text } }
    fn &.valid |self| (min: F64, max: F64) Bool {
        let check: fun(Str, F64, F64) Bool = @es/\\ (text,min,max)=>text.trim()!==''&&Number.isFinite(Number(text))&&Number(text)>=min&&Number(text)<=max \\/
        return check(self.text,min,max)
    }
    fn &.value |self| () F64 {
        let parse: fun(Str) F64 = @es/\\ text=>Number(text) \\/
        return parse(self.text)
    }
    fn &.error |self| (min: F64, max: F64) Str {
        return if self.valid(min,max) { "" } else { "Enter a number within the allowed range." }
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Ord",`//! An order, for bounded modules: \`using Ord from std:Ord;\` and
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

    fn Ord[I32].cmp |a| (b: I32) I32 { return if a < b { -1 } else if a > b { 1 } else { 0 } }
    fn Ord[U32].cmp |a| (b: U32) I32 { return if a < b { -1 } else if a > b { 1 } else { 0 } }
    fn Ord[I64].cmp |a| (b: I64) I32 { return if a < b { -1 } else if a > b { 1 } else { 0 } }
    fn Ord[U64].cmp |a| (b: U64) I32 { return if a < b { -1 } else if a > b { 1 } else { 0 } }
    /// NaN ties with everything.
    fn Ord[F32].cmp |a| (b: F32) I32 { return if a < b { -1 } else if a > b { 1 } else { 0 } }
    /// NaN ties with everything.
    fn Ord[F64].cmp |a| (b: F64) I32 { return if a < b { -1 } else if a > b { 1 } else { 0 } }

    /// By UTF-16 code units, as JavaScript's \`<\` orders strings.
    fn Ord[Str].cmp |a| (b: Str) I32 {
        let n = if a.len() < b.len() { a.len() } else { b.len() }
        for (0 ..< n) |i| {
            if a[i] != b[i] { return a[i] - b[i] }
        }
        return a.len() - b.len()
    }
}

mod Order[T[Ord]] {
    /// The greater of two (a, when they tie).
    fn max(a: T, b: T) T { return if b.cmp(a) > 0 { b } else { a } }

    /// The lesser of two (a, when they tie).
    fn min(a: T, b: T) T { return if b.cmp(a) < 0 { b } else { a } }

    /// \`x\`, or the nearer of \`low\` and \`high\` when it is outside them.
    /// With \`low\` after \`high\`: \`low\` when \`x\` is before \`low\`, else \`high\`.
    fn clamp(x: T, low: T, high: T) T {
        return if x.cmp(low) < 0 { low } else if x.cmp(high) > 0 { high } else { x }
    }

    /// Whether each element comes before or ties with the next.
    fn is_sorted(xs: Array[T]) Bool {
        for (1 ..< xs.len()) |i| {
            if xs[i - 1].cmp(xs[i]) > 0 { return false }
        }
        return true
    }

    /// Sorts \`xs\` in place, first to last, keeping ties in their order: a
    /// merge sort, O(n log n).
    fn sort(xs: Array[T]) Void {
        let n = xs.len()
        if n < 2 { return }
        let from = xs
        let to = Array[T].new(n, xs[0])
        let width = 1
        let back = false   // whether the sorted run is in the copy, not xs
        while (width < n) {
            let lo = 0
            while (lo < n) {
                let mid = if lo + width < n { lo + width } else { n }
                let hi = if mid + width < n { mid + width } else { n }
                let i = lo
                let j = mid
                for (lo ..< hi) |k| {
                    if i < mid and (j >= hi or from[i].cmp(from[j]) <= 0) {
                        to[k] = from[i]
                        i += 1
                    } else {
                        to[k] = from[j]
                        j += 1
                    }
                }
                lo = hi
            }
            let t = from
            from = to
            to = t
            back = not back
            width *= 2
        }
        if back { for (0 ..< n) |k| { xs[k] = from[k] } }
    }

    /// Where \`x\` is in sorted \`xs\`, or -1.
    fn search(xs: Array[T], x: T) I32 {
        let lo = 0
        let hi = xs.len()
        while (lo < hi) {
            let mid = lo + (hi - lo) / 2
            let c = xs[mid].cmp(x)
            if c == 0 { return mid }
            if c < 0 { lo = mid + 1 } else { hi = mid }
        }
        return -1
    }

    /// The greatest element of \`xs\`, the first of those that tie; \`xs\` is not empty.
    fn max_of(xs: Array[T]) T {
        let best = xs[0]
        for (1 ..< xs.len()) |i| { if xs[i].cmp(best) > 0 { best = xs[i] } }
        return best
    }

    /// The least element of \`xs\`, the first of those that tie; \`xs\` is not empty.
    fn min_of(xs: Array[T]) T {
        let best = xs[0]
        for (1 ..< xs.len()) |i| { if xs[i].cmp(best) < 0 { best = xs[i] } }
        return best
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:PersistentSegmentTree",`// Immutable versions of an ordered monoid index. Point updates share untouched
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
        if start == end_ { return null }
        if end_ - start == 1 {
            return Node { value: values[start], left: null, right: null }
        }
        let mid = start + (end_ - start) / 2
        let left = build(values, start, mid, combine) orelse fatal
        let right = build(values, mid, end_, combine) orelse fatal
        return Node { value: combine(left.value, right.value), left: left, right: right }
    }

    fn &.new(values: Array[T], identity: T, combine: fun(T, T) T) & {
        return &{ root: build(values, 0, values.len(), combine), length: values.len(), identity: identity }
    }

    fn replace(node: Node, start: I32, end_: I32, index: I32, value: T, combine: fun(T, T) T) Node {
        if end_ - start == 1 {
            return Node { value: value, left: null, right: null }
        }
        let mid = start + (end_ - start) / 2
        let left = node.left orelse fatal
        let right = node.right orelse fatal
        if index < mid {
            left = replace(left, start, mid, index, value, combine)
        } else {
            right = replace(right, mid, end_, index, value, combine)
        }
        return Node { value: combine(left.value, right.value), left: left, right: right }
    }

    fn &.set |self| (index: I32, value: T, combine: fun(T, T) T) & {
        if index < 0 or index >= self.length { fatal }
        return &{
            root: replace(self.root orelse fatal, 0, self.length, index, value, combine),
            length: self.length,
            identity: self.identity,
        }
    }

    fn range(node: ?Node, start: I32, end_: I32, low: I32, high: I32, identity: T, combine: fun(T, T) T) T {
        if low >= end_ or high <= start { return identity }
        let current = node orelse fatal
        if low <= start and end_ <= high { return current.value }
        let mid = start + (end_ - start) / 2
        return combine(
            range(current.left, start, mid, low, high, identity, combine),
            range(current.right, mid, end_, low, high, identity, combine)
        )
    }

    fn &.query |self| (start: I32, end_: I32, combine: fun(T, T) T) T {
        if start < 0 or end_ < start or end_ > self.length { fatal }
        return range(self.root, 0, self.length, start, end_, self.identity, combine)
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Prelude",`// std/prelude.utu \u2014 automatically injected into every compilation
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

using I32              from std:I32
using U32              from std:U32
using I64              from std:I64
using U64              from std:U64
using F32              from std:F32
using F64              from std:F64
using Bool             from std:Bool
using M32              from std:M32
using M64              from std:M64
using M128             from std:M128
using V128             from std:V128
using Str              from std:Str
using Externref        from std:Externref
using I31              from std:I31
using Array            from std:Array
using Promise          from std:Promise
using Stream           from std:Stream
using LiteralDefaults from std:LiteralDefaults
using Found from std:Found
using Group from std:Group
using Result from std:Result
using wutu from std:wutu
using Component from std:wutu
using gpu from std:Gpu
`.replaceAll("@@IR_WASM@@",$)],["std:Promise",`// std/Promise.utu \u2014 Promise[T]
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
    fn &.then |self| (on_value: cl(T1) Void) Void => @ir/\\ <ir-promise-then><ir-ident name="self"/><ir-ident name="on_value"/></ir-promise-then> \\/;

    // Subscribe to rejection. The reason is an opaque host value. Marks the
    // promise handled, so a \`then\` on it no longer reports the rejection.
    fn &.catch |self| (on_error: cl(Externref) Void) Void => @ir/\\ <ir-promise-catch><ir-ident name="self"/><ir-ident name="on_error"/></ir-promise-catch> \\/;
}
`.replaceAll("@@IR_WASM@@",$)],["std:Random",`//! Seeded random numbers: \`using Random from std:Random;\`.
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
    fn &.new(seed: I32) & { return seeded(seed) }

    /// A generator seeded from the host's randomness (\`crypto.getRandomValues\`).
    fn &.from_host() & {
        let seed: fun() I32 = @es/\\ () => crypto.getRandomValues(new Int32Array(1))[0] \\/
        return seeded(seed())
    }

    /// The next 32 random bits.
    fn &.bits |self| () I32 {
        let result = rotl(self.b * 5, 7) * 9
        let t = self.b << 9
        self.c = self.c ^ self.a
        self.d = self.d ^ self.b
        self.b = self.b ^ self.c
        self.a = self.a ^ self.d
        self.c = self.c ^ t
        self.d = rotl(self.d, 11)
        return result
    }

    /// A number in [0, 1), with 32 random bits.
    fn &.float |self| () F64 {
        return self.bits().u32().f64() / 4294967296.0
    }

    /// An integer in [\`low\`, \`high\`), every one equally likely (empty: \`low\`).
    fn &.int |self| (low: I32, high: I32) I32 {
        if high <= low { return low }
        let span = (high - low).u32().u64()
        // Lemire's method: a multiply, and a retry only when a value would be biased.
        let product = self.bits().u32().u64() * span
        let fraction = product.u32()
        if fraction < span.u32() {
            let threshold = (0.u32() - span.u32()) % span.u32()
            while (fraction < threshold) {
                product = self.bits().u32().u64() * span
                fraction = product.u32()
            }
        }
        return low + (product >> 32.u64()).i32()
    }

    /// True with probability \`p\`.
    fn &.chance |self| (p: F64) Bool { return self.float() < p }

    fn seeded(seed: I32) & {
        let s = seed + -1640531527
        return &{ a: mix(s), b: mix(s + -1640531527), c: mix(s - 1013904242), d: mix(s + 626627285) }
    }

    // splitmix32's output function.
    fn mix(x: I32) I32 {
        let z = x
        z = (z ^ (z >>> 16)) * -2048144789
        z = (z ^ (z >>> 13)) * -1028477387
        return z ^ (z >>> 16)
    }

    fn rotl(x: I32, k: I32) I32 { return (x << k) | (x >>> (32 - k)) }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Result",`//! \`Result[T, E]\`: a value of type T, or the error E that kept it from being
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
    fn &.ok(value: T) & { return &{ _ok: true, _value: value } }

    /// A failure holding \`error\`.
    fn &.err(error: E) & { return &{ _ok: false, _error: error } }

    fn &.is_ok |self| () Bool { return self._ok }

    fn &.is_err |self| () Bool { return not self._ok }

    /// The value; fatal when it is an error.
    fn &.value |self| () T {
        if not self._ok { fatal }
        return self._value
    }

    /// The error; fatal when it is a value.
    fn &.error |self| () E {
        if self._ok { fatal }
        return self._error
    }

    /// The value, or \`fallback\` when it is an error.
    fn &.value_or |self| (fallback: T) T { return if self._ok { self._value } else { fallback } }
}
`.replaceAll("@@IR_WASM@@",$)],["std:SegmentTree",`// An ordered monoid index. combine must be associative and identity neutral.
// Build O(n), point replacement / half-open range query O(log n), space O(n).
mod SegmentTree[T] {
    struct &:
        | nodes: Array[T]
        | size: I32
        | length: I32
        | identity: T

    fn &.new(values: Array[T], identity: T, combine: fun(T, T) T) & {
        let size = 1
        while (size < values.len()) {
            if size > 536870911 { fatal }
            size *= 2
        }
        let nodes = Array[T].new(size * 2, identity)
        values each |value, index| {
            nodes[size + index.i64().i32()] = value
        }
        let i = size - 1
        while (i > 0) {
            nodes[i] = combine(nodes[i * 2], nodes[i * 2 + 1])
            i -= 1
        }
        return &{ nodes: nodes, size: size, length: values.len(), identity: identity }
    }

    fn &.set |self| (index: I32, value: T, combine: fun(T, T) T) Void {
        if index < 0 or index >= self.length { fatal }
        let i = self.size + index
        self.nodes[i] = value
        while (i > 1) {
            i /= 2
            self.nodes[i] = combine(self.nodes[i * 2], self.nodes[i * 2 + 1])
        }
    }

    fn &.query |self| (start: I32, end_: I32, combine: fun(T, T) T) T {
        if start < 0 or end_ < start or end_ > self.length { fatal }
        let left = start + self.size
        let right = end_ + self.size
        let before = self.identity
        let after = self.identity
        while (left < right) {
            if left % 2 == 1 {
                before = combine(before, self.nodes[left])
                left += 1
            }
            if right % 2 == 1 {
                right -= 1
                after = combine(self.nodes[right], after)
            }
            left /= 2
            right /= 2
        }
        return combine(before, after)
    }

    // First index whose inclusive prefix satisfies a monotone false->true predicate.
    // Returns length if no prefix satisfies it; requires nonempty-prefix semantics.
    fn &.first_prefix |self| (matches: fun(T) Bool, combine: fun(T, T) T) I32 {
        if self.length == 0 or not matches(self.nodes[1]) { return self.length }
        let i = 1
        let before = self.identity
        while (i < self.size) {
            let candidate = combine(before, self.nodes[i * 2])
            if matches(candidate) {
                i *= 2
            } else {
                before = candidate
                i = i * 2 + 1
            }
        }
        return i - self.size
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Spatial",`using Buffer from std:Buffer

// Static priority search tree: minimum y at each node, balanced x partitions.
// Coordinates are copied at construction. Query results are caller-supplied IDs.
mod Spatial {
    struct Point:
        | x: F64
        | y: F64
        | id: I32

    // Keep squared distances finite, including the difference of two coordinates.
    fn check_coordinate(value: F64) Void {
        if value != value or F64.abs(value) > 1.0e150 { fatal }
    }

    fn point(x: F64, y: F64, id: I32) Point {
        return Point { x: x, y: y, id: id }
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
        if points.len() == 0 { return null }
        let best = 0
        let max_y = points[0].y
        let i = 1
        while (i < points.len()) {
            if points[i].y < points[best].y { best = i }
            if points[i].y > max_y { max_y = points[i].y }
            i += 1
        }
        let rest = points filter |point, index| {
            index.i64().i32() != best
        } collect(Point)
        let mid = rest.len() / 2
        return Node {
            point: points[best],
            left: build(rest.slice(0, mid)),
            right: build(rest.slice(mid, rest.len())),
            min_x: points[0].x,
            max_x: points[points.len() - 1].x,
            min_y: points[best].y,
            max_y: max_y
        }
    }

    fn &.new(points: Array[Point]) & {
        let copied = points map |point| {
            check_coordinate(point.x)
            check_coordinate(point.y)
            Point { x: point.x, y: point.y, id: point.id }
        } sort(Point) |a, b| {
            a.x < b.x or (a.x == b.x and a.id < b.id)
        }
        return &{ root: build(copied) }
    }

    fn rectangle(node: ?Node, min_x: F64, max_x: F64, min_y: F64, max_y: F64, out: Buffer[I32]) Void {
        promote node {
            |current| => {
                if current.max_x < min_x or current.min_x > max_x
                    or current.max_y < min_y or current.min_y > max_y { return }
                let point = current.point
                if point.x >= min_x and point.x <= max_x and point.y >= min_y and point.y <= max_y {
                    out.push(point.id)
                }
                rectangle(current.left, min_x, max_x, min_y, max_y, out)
                rectangle(current.right, min_x, max_x, min_y, max_y, out)
            },
            ~> {},
        }
    }

    fn &.within |self| (min_x: F64, max_x: F64, min_y: F64, max_y: F64) Array[I32] {
        check_coordinate(min_x)
        check_coordinate(max_x)
        check_coordinate(min_y)
        check_coordinate(max_y)
        if min_x > max_x or min_y > max_y { fatal }
        let out = Buffer[I32].new()
        rectangle(self.root, min_x, max_x, min_y, max_y, out)
        return out.finish()
    }

    // Three-sided reporting: inclusive x interval, y <= ceiling.
    fn below_node(node: ?Node, min_x: F64, max_x: F64, ceiling: F64, out: Buffer[I32]) Void {
        promote node {
            |current| => {
                if current.max_x < min_x or current.min_x > max_x or current.min_y > ceiling { return }
                if current.point.x >= min_x and current.point.x <= max_x {
                    out.push(current.point.id)
                }
                below_node(current.left, min_x, max_x, ceiling, out)
                below_node(current.right, min_x, max_x, ceiling, out)
            },
            ~> {},
        }
    }

    fn &.below |self| (min_x: F64, max_x: F64, ceiling: F64) Array[I32] {
        check_coordinate(min_x)
        check_coordinate(max_x)
        check_coordinate(ceiling)
        if min_x > max_x { fatal }
        let out = Buffer[I32].new()
        below_node(self.root, min_x, max_x, ceiling, out)
        return out.finish()
    }

    fn box_distance(node: Node, x: F64, y: F64) F64 {
        let dx = if x < node.min_x { node.min_x - x } else {
            if x > node.max_x { x - node.max_x } else { 0.0 }
        }
        let dy = if y < node.min_y { node.min_y - y } else {
            if y > node.max_y { y - node.max_y } else { 0.0 }
        }
        return dx * dx + dy * dy
    }

    fn radius_node(node: ?Node, x: F64, y: F64, squared: F64, out: Buffer[I32]) Void {
        promote node {
            |current| => {
                if box_distance(current, x, y) > squared { return }
                let dx = current.point.x - x
                let dy = current.point.y - y
                if dx * dx + dy * dy <= squared { out.push(current.point.id) }
                radius_node(current.left, x, y, squared, out)
                radius_node(current.right, x, y, squared, out)
            },
            ~> {},
        }
    }

    fn &.radius |self| (x: F64, y: F64, radius: F64) Array[I32] {
        check_coordinate(x)
        check_coordinate(y)
        check_coordinate(radius)
        if radius < 0.0 { fatal }
        let out = Buffer[I32].new()
        radius_node(self.root, x, y, radius * radius, out)
        return out.finish()
    }

    struct Nearest:
        | id: I32
        | squared: F64

    fn nearest_node(node: ?Node, x: F64, y: F64, best: Nearest) Void {
        promote node {
            |current| => {
                if box_distance(current, x, y) > best.squared { return }
                let dx = current.point.x - x
                let dy = current.point.y - y
                let squared = dx * dx + dy * dy
                if squared < best.squared or (squared == best.squared and current.point.id < best.id) {
                    best.id = current.point.id
                    best.squared = squared
                }
                nearest_node(current.left, x, y, best)
                nearest_node(current.right, x, y, best)
            },
            ~> {},
        }
    }

    fn &.nearest |self| (x: F64, y: F64) ?Found[I32] {
        check_coordinate(x)
        check_coordinate(y)
        return promote self.root {
            |root| => {
                let dx = root.point.x - x
                let dy = root.point.y - y
                let best = Nearest { id: root.point.id, squared: dx * dx + dy * dy }
                nearest_node(root, x, y, best)
                Found[I32].new(best.id)
            },
            ~> null,
        }
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Str",`// std/Str.utu \u2014 Str string reference type module
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
    fn &:add |a, b| & => @ir/\\ <ir-string-concat><ir-ident name="a"/><ir-ident name="b"/></ir-string-concat> \\/;

    // Equality \u2014 structural (content) comparison.
    fn &:eq |a, b| Bool => @ir/\\ <ir-string-eq><ir-ident name="a"/><ir-ident name="b"/></ir-string-eq> \\/;
    fn &:ne |a, b| Bool => @ir/\\ <ir-string-ne><ir-ident name="a"/><ir-ident name="b"/></ir-string-ne> \\/;

    // Order: by UTF-16 code units, as JavaScript compares strings ("B" < "a").
    fn &:lt |a, b| Bool { return compare(a, b) < 0 }
    fn &:le |a, b| Bool { return compare(a, b) <= 0 }
    fn &:gt |a, b| Bool { return compare(a, b) > 0 }
    fn &:ge |a, b| Bool { return compare(a, b) >= 0 }

    // -1, 0, or 1: a before, equal to, or after b, by UTF-16 code units.
    fn compare(a: &, b: &) I32 {
        let n = len(a)
        let m = len(b)
        let i = 0
        while (i < n and i < m) {
            let x = get(a, i)
            let y = get(b, i)
            if x != y {
                if x < y { return -1 }
                return 1
            }
            i += 1
        }
        return if n < m { -1 } else if n > m { 1 } else { 0 }
    }

    // Number of UTF-16 code units in the host string.
    fn len(s: &) I32 => @ir/\\ <ir-string-measure-utf16><ir-ident name="s"/></ir-string-measure-utf16> \\/;

    // Substring [start, end) \u2014 returns a new string. An end past the string
    // stops at its end, as in JavaScript; a negative start or an end before
    // start traps in --safe builds, as Array's slice does.
    fn slice(s: &, start: I32, end_: I32) & {
        if checks() and (start < 0 or end_ < start) { fatal }
        return slice_unchecked(s, start, end_)
    }

    // \`slice\` without the --safe check: a negative index reads as unsigned.
    fn slice_unchecked(s: &, start: I32, end_: I32) & => @ir/\\ <ir-string-slice-wtf16>
            <ir-ident name="s"/>
            <ir-ident name="start"/>
            <ir-ident name="end_"/>
        </ir-string-slice-wtf16> \\/;

    // Read one UTF-16 code unit at index i.
    fn get(s: &, i: I32) I32 => @ir/\\ <ir-string-get-wtf16><ir-ident name="s"/><ir-ident name="i"/></ir-string-get-wtf16> \\/;

    // A one-code-point string.
    fn from_code_point(code: I32) & => @ir/\\ <ir-string-from-code-point><ir-ident name="code"/></ir-string-from-code-point> \\/;

    // The first \`count\` UTF-16 code units of \`codes\`, as one string. Build
    // text in an Array[I32] and convert once, rather than concatenating.
    fn from_codes(codes: Array[I32], count: I32) & => @ir/\\ <ir-string-from-codes><ir-ident name="codes"/><ir-ident name="count"/></ir-string-from-codes> \\/;

    // Receiver/index forms mirror Array's surface while preserving the
    // existing static Str.len/slice/get entry points.
    fn &.len |self| () I32 => @ir/\\ <ir-string-measure-utf16><ir-ident name="self"/></ir-string-measure-utf16> \\/;
    fn &.slice |self| (start: I32, end_: I32) & { return slice(self, start, end_) }
    fn &.get |self| (i: I32) I32 => @ir/\\ <ir-string-get-wtf16><ir-ident name="self"/><ir-ident name="i"/></ir-string-get-wtf16> \\/;
    fn &.get_index |self| (i: I32) I32 => @ir/\\ <ir-string-get-wtf16><ir-ident name="self"/><ir-ident name="i"/></ir-string-get-wtf16> \\/;
    fn &.get_slice |self| (start: I32, end_: I32) & { return slice(self, start, end_) }

    // Whether the build is --safe.
    fn checks() Bool => @ir/\\ <ir-safe-checks/> \\/;

    // The string itself: what \`\${s}\` in a template string calls.
    fn &.str |self| () & => @ir/\\ <ir-ident name="self"/> \\/;

    // \u2500\u2500 Text \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Each ships only when used. Offsets and lengths are in UTF-16 code
    // units, as \`len\` and \`slice\` count them.

    /// Where \`part\` first occurs at or after \`from\`, or -1.
    fn &.index_of |self| (part: &, from: I32) I32 {
        let find: fun(&, &, I32) I32 = @es/\\ (s, p, i) => s.indexOf(p, i) \\/
        return find(self, part, from)
    }

    /// Where \`part\` last occurs, or -1.
    fn &.last_index_of |self| (part: &) I32 {
        let find: fun(&, &) I32 = @es/\\ (s, p) => s.lastIndexOf(p) \\/
        return find(self, part)
    }

    /// Whether \`part\` occurs in the string.
    fn &.contains |self| (part: &) Bool { return self.index_of(part, 0) >= 0 }

    /// Whether the string begins with \`part\`.
    fn &.starts_with |self| (part: &) Bool {
        return part.len() <= self.len() and self.slice(0, part.len()) == part
    }

    /// Whether the string ends with \`part\`.
    fn &.ends_with |self| (part: &) Bool {
        return part.len() <= self.len() and self.slice(self.len() - part.len(), self.len()) == part
    }

    /// Without the white space at either end.
    fn &.trim |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.trim() \\/
        return f(self)
    }

    /// Without the white space at its start.
    fn &.trim_start |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.trimStart() \\/
        return f(self)
    }

    /// Without the white space at its end.
    fn &.trim_end |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.trimEnd() \\/
        return f(self)
    }

    /// In upper case (\`"Stra\xDFe"\` is \`"STRASSE"\`).
    fn &.to_upper |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.toUpperCase() \\/
        return f(self)
    }

    /// In lower case.
    fn &.to_lower |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.toLowerCase() \\/
        return f(self)
    }

    /// The string \`count\` times over.
    fn &.repeat |self| (count: I32) & {
        let f: fun(&, I32) & = @es/\\ (s, n) => s.repeat(Math.max(0, n)) \\/
        return f(self, count)
    }

    /// Every occurrence of \`part\` replaced by \`with\`, as it is (a \`$\` in it is a \`$\`).
    fn &.replace |self| (part: &, with: &) & {
        let f: fun(&, &, &) & = @es/\\ (s, p, w) => s.replaceAll(p, () => w) \\/
        return f(self, part, with)
    }

    /// At least \`width\` long: \`fill\` repeated before it as needed (\`"7".pad_start(3, "0")\` is \`"007"\`).
    fn &.pad_start |self| (width: I32, fill: &) & {
        let f: fun(&, I32, &) & = @es/\\ (s, n, f) => s.padStart(n, f) \\/
        return f(self, width, fill)
    }

    /// At least \`width\` long: \`fill\` repeated after it as needed.
    fn &.pad_end |self| (width: I32, fill: &) & {
        let f: fun(&, I32, &) & = @es/\\ (s, n, f) => s.padEnd(n, f) \\/
        return f(self, width, fill)
    }

    /// The pieces between the occurrences of \`separator\` (\`"a,b,,c"\` is \`["a", "b", "", "c"]\`).
    /// An empty separator splits into code units.
    fn &.split |self| (separator: &) Array[Str] {
        if separator.len() == 0 {
            let units = Array[Str].new(self.len(), "")
            for (0 ..< self.len()) |i| { units[i] = self.slice(i, i + 1) }
            return units
        }
        let count = 1
        let at = self.index_of(separator, 0)
        while (at >= 0) {
            count += 1
            at = self.index_of(separator, at + separator.len())
        }
        let pieces = Array[Str].new(count, "")
        let start = 0
        for (0 ..< count) |k| {
            let end_ = self.index_of(separator, start)
            if end_ < 0 { end_ = self.len() }
            pieces[k] = self.slice(start, end_)
            start = end_ + separator.len()
        }
        return pieces
    }

    /// The \`parts\`, with the string between each two (\`", ".join(["a", "b"])\` is \`"a, b"\`).
    fn &.join |self| (parts: Array[Str]) & {
        if parts.len() == 0 { return "" }
        let out = parts[0]
        for (1 ..< parts.len()) |i| { out = out + self + parts[i] }
        return out
    }

    /// The integer the string is, or \`fallback\` when it is not one or does not
    /// fit in an I32: white space around it, then a sign (\`+\` or \`-\`) if any,
    /// then decimal digits or hexadecimal ones after \`0x\`.
    fn &.parse_i32 |self| (fallback: I32) I32 {
        let f: fun(&, I32) I32 = @es/\\ (s, d) => { const m = /^([+-]?)(0x[0-9a-f]+|\\d+)$/i.exec(s.trim()); if (!m) return d; const v = (m[1] === '-' ? -1 : 1) * Number(m[2]); return v >= -2147483648 && v <= 2147483647 ? v : d; } \\/
        return f(self, fallback)
    }

    /// The number the string is, or NaN when it is not one (\`F64.is_nan\`), as
    /// JavaScript's \`Number\` reads it after the white space around it: so
    /// also \`0x\u2026\`, \`0b\u2026\`, \`0o\u2026\`, and \`Infinity\`, but not \`inf\`.
    fn &.parse_f64 |self| () F64 {
        let f: fun(&) F64 = @es/\\ (s) => { const t = s.trim(); return t === '' ? NaN : Number(t); } \\/
        return f(self)
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:StrMap",`//! Str keys to values of any type: \`using StrMap from std:StrMap;\`.
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
        return &{ keys: Array[Str].new(0, ""), full: Array[I32].new(0, 0), hashes: Array[I32].new(0, 0), values: [], count: 0 }
    }

    /// How many keys it has.
    fn &.len |self| () I32 { return self.count }

    /// Whether it has \`key\`.
    fn &.has |self| (key: Str) Bool {
        if self.count == 0 { return false }
        return self.full[self.slot(key, hash(key))] != 0
    }

    /// The value of \`key\`, or \`missing\` when it has none.
    fn &.get |self| (key: Str, missing: V) V {
        if self.count == 0 { return missing }
        let i = self.slot(key, hash(key))
        return if self.full[i] == 0 { missing } else { self.values[i] }
    }

    /// \`key\`'s value is now \`value\`.
    fn &.set |self| (key: Str, value: V) Void {
        let h = hash(key)
        let i = if self.keys.len() > 0 { self.slot(key, h) } else { -1 }
        if i < 0 or self.full[i] == 0 {
            // A new key: room for it first.
            if (self.count + 1) * 2 > self.keys.len() {
                self.grow(value)
                i = self.slot(key, h)
            }
            self.full[i] = 1
            self.keys[i] = key
            self.hashes[i] = h
            self.count += 1
        }
        self.values[i] = value
    }

    /// Removes \`key\`; whether it had one. (Its value stays referenced until
    /// another key takes its slot: a map has no empty value of V to put there.)
    fn &.remove |self| (key: Str) Bool {
        if self.count == 0 { return false }
        let mask = self.keys.len() - 1
        let i = self.slot(key, hash(key))
        if self.full[i] == 0 { return false }
        // Backward-shift deletion: later keys of the run move up, so no tombstones.
        let j = i
        while (true) {
            j = (j + 1) & mask
            if self.full[j] == 0 { break }
            let home = self.hashes[j] & mask
            // Move j's key to the hole at i unless its home lies in (i, j].
            let stays = if i <= j { home > i and home <= j } else { home > i or home <= j }
            if not stays {
                self.keys[i] = self.keys[j]
                self.hashes[i] = self.hashes[j]
                self.values[i] = self.values[j]
                i = j
            }
        }
        self.full[i] = 0
        self.keys[i] = ""
        self.count -= 1
        return true
    }

    /// Its keys, in no particular order.
    fn &.keys |self| () Array[Str] {
        let out = Array[Str].new(self.count, "")
        let k = 0
        for (0 ..< self.keys.len()) |i| {
            if self.full[i] != 0 {
                out[k] = self.keys[i]
                k += 1
            }
        }
        return out
    }

    // The slot of \`key\` (hash \`h\`), or the empty one where it would go.
    fn &.slot |self| (key: Str, h: I32) I32 {
        let mask = self.keys.len() - 1
        let i = h & mask
        while (true) {
            if self.full[i] == 0 { return i }
            if self.hashes[i] == h and self.keys[i] == key { return i }
            i = (i + 1) & mask
        }
        return i
    }

    // Twice the room (16 at first); \`fill\` fills the new values.
    fn &.grow |self| (fill: V) Void {
        let old_keys = self.keys
        let old_full = self.full
        let old_hashes = self.hashes
        let old_values = self.values
        let n = if old_keys.len() == 0 { 16 } else { old_keys.len() * 2 }
        self.keys = Array[Str].new(n, "")
        self.full = Array[I32].new(n, 0)
        self.hashes = Array[I32].new(n, 0)
        self.values = Array[V].new(n, fill)
        let mask = n - 1
        for (0 ..< old_keys.len()) |i| {
            if old_full[i] != 0 {
                let j = old_hashes[i] & mask
                while (self.full[j] != 0) { j = (j + 1) & mask }
                self.full[j] = 1
                self.keys[j] = old_keys[i]
                self.hashes[j] = old_hashes[i]
                self.values[j] = old_values[i]
            }
        }
    }

    fn hash(key: Str) I32 {
        let f: fun(Str) I32 = @es/\\ (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; } \\/
        return f(key)
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:Stream",`//! \`Stream[T]\`: a JavaScript async iterable, held as an externref. An async
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
        let adopt: fun(Externref) & = @es/\\ (s) => s \\/
        return adopt(iterable)
    }

    /// The values of an array, in order.
    fn of(values: Array[T1]) & {
        let make: fun(I32, cl(I32) T1) & = @es/\\ (n, at) => (async function* () { for (let i = 0; i < n; i++) yield at(i); })() \\/
        return make(values.len(), cl(i) { return values[i] })
    }

    /// \`count\` values, each \`make(i)\` for i from 0, made as they are read.
    fn generate(count: I32, make: cl(I32) T1) & {
        let gen: fun(I32, cl(I32) T1) & = @es/\\ (n, at) => (async function* () { for (let i = 0; i < n; i++) yield at(i); })() \\/
        return gen(count, make)
    }

    // \u2500\u2500 Transforming \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Each is a new stream that reads this one as it is read.

    /// The first \`n\` values.
    fn &.take |self| (n: I32) & {
        let f: fun(&, I32) & = @es/\\ (s, n) => (async function* () { if (n <= 0) return; let i = 0; for await (const v of s) { yield v; if (++i >= n) return; } })() \\/
        return f(self, n)
    }

    /// All but the first \`n\` values.
    fn &.skip |self| (n: I32) & {
        let f: fun(&, I32) & = @es/\\ (s, n) => (async function* () { let i = 0; for await (const v of s) if (i++ >= n) yield v; })() \\/
        return f(self, n)
    }

    /// The values \`keep\` is true of.
    fn &.filter |self| (keep: cl(T1) Bool) & {
        let f: fun(&, cl(T1) Bool) & = @es/\\ (s, keep) => (async function* () { for await (const v of s) if (keep(v)) yield v; })() \\/
        return f(self, keep)
    }

    /// Each value, changed by \`f\` (to a value of the same type).
    fn &.map |self| (f: cl(T1) T1) & {
        let m: fun(&, cl(T1) T1) & = @es/\\ (s, f) => (async function* () { for await (const v of s) yield f(v); })() \\/
        return m(self, f)
    }

    /// This stream's values, then \`other\`'s.
    fn &.chain |self| (other: &) & {
        let f: fun(&, &) & = @es/\\ (a, b) => (async function* () { yield* a; yield* b; })() \\/
        return f(self, other)
    }

    // \u2500\u2500 What \`await for\` calls \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // \`await for (s) |v| { body }\` is
    //
    //   let it = s.iterator(); defer s.close(it);
    //   while (true) { let r = await s.next(it); if s.done(r) { break; }; let v = s.value(r); body };
    //
    // Any type with these methods is read the same way.

    fn &.iterator |self| () Externref {
        let f: fun(&) Externref = @es/\\ (s) => s[Symbol.asyncIterator]() \\/
        return f(self)
    }

    fn &.next |self| (iterator: Externref) Promise[Externref] {
        let f: fun(Externref) Promise[Externref] = @es/\\ (it) => it.next() \\/
        return f(iterator)
    }

    fn &.done |self| (result: Externref) Bool {
        let f: fun(Externref) Bool = @es/\\ (r) => r.done === true \\/
        return f(result)
    }

    fn &.value |self| (result: Externref) T1 {
        let f: fun(Externref) T1 = @es/\\ (r) => r.value \\/
        return f(result)
    }

    /// Settles once the stream has finished closing (its \`finally\` blocks run).
    fn &.close |self| (iterator: Externref) Void {
        let f: fun(Externref) Promise[Externref] = @es/\\ (it) => Promise.resolve(it.return?.()) \\/
        await f(iterator)
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:U32",`// std/U32.utu \u2014 U32 scalar type module
mod U32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:add  |a, b| & => @ir/\\ <ir-u32-add><ir-ident name="a"/><ir-ident name="b"/></ir-u32-add> \\/;
    fn &:sub  |a, b| & => @ir/\\ <ir-u32-sub><ir-ident name="a"/><ir-ident name="b"/></ir-u32-sub> \\/;
    fn &:mul  |a, b| & => @ir/\\ <ir-u32-mul><ir-ident name="a"/><ir-ident name="b"/></ir-u32-mul> \\/;
    fn &:div  |a, b| & => @ir/\\ <ir-u32-div-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-div-u> \\/;
    fn &:rem  |a, b| & => @ir/\\ <ir-u32-rem-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-rem-u> \\/;
    fn &:band |a, b| & => @ir/\\ <ir-u32-and><ir-ident name="a"/><ir-ident name="b"/></ir-u32-and> \\/;
    fn &:bor  |a, b| & => @ir/\\ <ir-u32-or><ir-ident name="a"/><ir-ident name="b"/></ir-u32-or> \\/;
    fn &:bxor |a, b| & => @ir/\\ <ir-u32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-u32-xor> \\/;
    fn &:shl  |a, b| & => @ir/\\ <ir-u32-shl><ir-ident name="a"/><ir-ident name="b"/></ir-u32-shl> \\/;
    fn &:shr  |a, b| & => @ir/\\ <ir-u32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-shr-u> \\/;
    fn &:ushr |a, b| & => @ir/\\ <ir-u32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-shr-u> \\/;
    fn &:eq   |a, b| Bool => @ir/\\ <ir-u32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-u32-eq> \\/;
    fn &:ne   |a, b| Bool => @ir/\\ <ir-u32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-u32-ne> \\/;
    fn &:lt   |a, b| Bool => @ir/\\ <ir-u32-lt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-lt-u> \\/;
    fn &:le   |a, b| Bool => @ir/\\ <ir-u32-le-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-le-u> \\/;
    fn &:gt   |a, b| Bool => @ir/\\ <ir-u32-gt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-gt-u> \\/;
    fn &:ge   |a, b| Bool => @ir/\\ <ir-u32-ge-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-ge-u> \\/;
    // wasm has no U32.neg / U32.not; express them with real ops.
    //   neg a  = 0 - a   (well-defined mod 2^32)
    //   bnot a = a xor 0xFFFFFFFF
    fn &:neg  |a| & => @ir/\\ <ir-u32-sub><ir-lit kind="int" type-name="U32" value="0"/><ir-ident name="a"/></ir-u32-sub> \\/;
    fn &:bnot |a| & => @ir/\\ <ir-u32-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I32" value="-1"/></ir-u32-xor> \\/;

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.i32 |self| () I32 => @ir/\\ <ir-i32-or><ir-ident name="self"/><ir-lit kind="int" type-name="I32" value="0"/></ir-i32-or> \\/;
    fn &.i64 |self| () I64 => @ir/\\ <ir-i64-extend-u><ir-ident name="self"/></ir-i64-extend-u> \\/;
    fn &.u64 |self| () U64 => @ir/\\ <ir-u64-extend-u><ir-ident name="self"/></ir-u64-extend-u> \\/;
    fn &.f32 |self| () F32 => @ir/\\ <ir-f32-convert-u-i32><ir-ident name="self"/></ir-f32-convert-u-i32> \\/;
    fn &.f64 |self| () F64 => @ir/\\ <ir-f64-convert-u-i32><ir-ident name="self"/></ir-f64-convert-u-i32> \\/;

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(U32) Str = @es/\\ (v) => String(v >>> 0) \\/
        return format(self)
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:U64",`// std/U64.utu \u2014 U64 scalar type module
mod U64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i64"/> \\/

    fn &:add  |a, b| & => @ir/\\ <ir-u64-add><ir-ident name="a"/><ir-ident name="b"/></ir-u64-add> \\/;
    fn &:sub  |a, b| & => @ir/\\ <ir-u64-sub><ir-ident name="a"/><ir-ident name="b"/></ir-u64-sub> \\/;
    fn &:mul  |a, b| & => @ir/\\ <ir-u64-mul><ir-ident name="a"/><ir-ident name="b"/></ir-u64-mul> \\/;
    fn &:div  |a, b| & => @ir/\\ <ir-u64-div-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-div-u> \\/;
    fn &:rem  |a, b| & => @ir/\\ <ir-u64-rem-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-rem-u> \\/;
    fn &:band |a, b| & => @ir/\\ <ir-u64-and><ir-ident name="a"/><ir-ident name="b"/></ir-u64-and> \\/;
    fn &:bor  |a, b| & => @ir/\\ <ir-u64-or><ir-ident name="a"/><ir-ident name="b"/></ir-u64-or> \\/;
    fn &:bxor |a, b| & => @ir/\\ <ir-u64-xor><ir-ident name="a"/><ir-ident name="b"/></ir-u64-xor> \\/;
    fn &:shl  |a, b| & => @ir/\\ <ir-u64-shl><ir-ident name="a"/><ir-ident name="b"/></ir-u64-shl> \\/;
    fn &:shr  |a, b| & => @ir/\\ <ir-u64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-shr-u> \\/;
    fn &:ushr |a, b| & => @ir/\\ <ir-u64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-shr-u> \\/;
    fn &:eq   |a, b| Bool => @ir/\\ <ir-u64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-u64-eq> \\/;
    fn &:ne   |a, b| Bool => @ir/\\ <ir-u64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-u64-ne> \\/;
    fn &:lt   |a, b| Bool => @ir/\\ <ir-u64-lt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-lt-u> \\/;
    fn &:le   |a, b| Bool => @ir/\\ <ir-u64-le-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-le-u> \\/;
    fn &:gt   |a, b| Bool => @ir/\\ <ir-u64-gt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-gt-u> \\/;
    fn &:ge   |a, b| Bool => @ir/\\ <ir-u64-ge-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-ge-u> \\/;
    // wasm has no U64.neg / U64.not; express them with real ops.
    //   neg a  = 0 - a   (well-defined mod 2^64)
    //   bnot a = a xor 0xFFFFFFFFFFFFFFFF
    fn &:neg  |a| & => @ir/\\ <ir-u64-sub><ir-lit kind="int" type-name="U64" value="0"/><ir-ident name="a"/></ir-u64-sub> \\/;
    fn &:bnot |a| & => @ir/\\ <ir-u64-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I64" value="-1"/></ir-u64-xor> \\/;

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.u32 |self| () U32 => @ir/\\ <ir-u32-wrap><ir-ident name="self"/></ir-u32-wrap> \\/;
    fn &.i32 |self| () I32 => @ir/\\ <ir-i32-wrap><ir-ident name="self"/></ir-i32-wrap> \\/;
    fn &.i64 |self| () I64 => @ir/\\ <ir-i64-or><ir-ident name="self"/><ir-lit kind="int" type-name="I64" value="0"/></ir-i64-or> \\/;
    fn &.f32 |self| () F32 => @ir/\\ <ir-f32-convert-u-i64><ir-ident name="self"/></ir-f32-convert-u-i64> \\/;
    fn &.f64 |self| () F64 => @ir/\\ <ir-f64-convert-u-i64><ir-ident name="self"/></ir-f64-convert-u-i64> \\/;

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(U64) Str = @es/\\ (v) => String(BigInt.asUintN(64, v)) \\/
        return format(self)
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:V128",`// std/V128.utu \u2014 V128 SIMD vector type module
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

    fn zero() & => @ir/\\ <ir-v128-const data-type-name="V128" bytes="0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"/> \\/;
    fn ones() & => @ir/\\ <ir-v128-const data-type-name="V128" bytes="255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255"/> \\/;

    fn &:band |a, b| & => @ir/\\ <ir-v128-and><ir-ident name="a"/><ir-ident name="b"/></ir-v128-and> \\/;
    fn &:bor  |a, b| & => @ir/\\ <ir-v128-or><ir-ident name="a"/><ir-ident name="b"/></ir-v128-or> \\/;
    fn &:bxor |a, b| & => @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/;
    fn &:bnot |a| & => @ir/\\ <ir-v128-not><ir-ident name="a"/></ir-v128-not> \\/;
    fn &:eq   |a, b| & => @ir/\\ <ir-v128-not><ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor></ir-v128-not> \\/;
    fn &:ne   |a, b| & => @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/;

    fn andnot(a: V128, b: V128) V128 => @ir/\\ <ir-v128-andnot><ir-ident name="a"/><ir-ident name="b"/></ir-v128-andnot> \\/;
    fn bitselect(a: V128, b: V128, mask: V128) V128 => @ir/\\ <ir-v128-bitselect>
            <ir-ident name="a"/>
            <ir-ident name="b"/>
            <ir-ident name="mask"/>
        </ir-v128-bitselect> \\/;
    fn any_true(a: V128) Bool => @ir/\\ <ir-v128-any-true><ir-ident name="a"/></ir-v128-any-true> \\/;
}
`.replaceAll("@@IR_WASM@@",$)],["std:console",'//! The host\'s console: `using console from std:console;`, then\n//! `console.log("hello")`, `console.log(42)`, `console.log(p)`: any value\n//! with a `str()` (a Str is itself), written as its str. Nothing out; each\n//! function ships only when used.\n\nmod console {\n    let host_log: fun(Str) Void = @es/\\ (s) => console.log(s) \\/\n    let host_warn: fun(Str) Void = @es/\\ (s) => console.warn(s) \\/\n    let host_error: fun(Str) Void = @es/\\ (s) => console.error(s) \\/\n\n    /// A line on standard output (`console.log`): `x.str()`.\n    fn log(x: $T) Void { host_log(x.str()) }\n\n    /// A line on standard error, as a warning (`console.warn`): `x.str()`.\n    fn warn(x: $T) Void { host_warn(x.str()) }\n\n    /// A line on standard error (`console.error`): `x.str()`.\n    fn error(x: $T) Void { host_error(x.str()) }\n}\n'.replaceAll("@@IR_WASM@@",$)],["std:time",`//! Clocks: \`using time from std:time;\`, then \`time.now()\`. Each function ships only when used.

mod time {
    /// Milliseconds since an arbitrary start, with sub-millisecond precision
    /// where the host has it (\`performance.now\`): for measuring.
    fn now() F64 {
        let f: fun() F64 = @es/\\ () => performance.now() \\/
        return f()
    }

    /// Milliseconds since 1970-01-01 UTC (\`Date.now\`): for dates.
    fn epoch_ms() F64 {
        let f: fun() F64 = @es/\\ () => Date.now() \\/
        return f()
    }
}
`.replaceAll("@@IR_WASM@@",$)],["std:wutu",`// Generated from src/runtime/wutu.js by the build. No runtime ships unless used.
mod Component {
    proto &:
        | render() Externref
}

mod wutu {
    fn init() Void {
        let install: fun() Void = @es/\\ () => { globalThis.__utuWutu ??= (function createWutuRuntime() {
  // A DocumentFragment is the public transport; its anchors retain the live range
  // after the browser consumes its children. Single-element templates need neither.
  const fragments = new WeakMap();
  const ranges = new WeakMap();
  function rangeNodes(range, inclusive = true) {
    // Deferred removals are still in the DOM until the enclosing render ends.
    // A returned fragment contains only this render's wanted nodes.
    if (range.pending) return inclusive ? [range.start, ...range.pending, range.end] : range.pending;
    const nodes = [];
    for (let node = inclusive ? range.start : range.start.nextSibling; node; node = node.nextSibling) {
      if (node === range.end) { if (inclusive) nodes.push(node); break; }
      nodes.push(node);
    }
    return nodes;
  }
  function connected(value) {
    if (Array.isArray(value)) return value.every(connected);
    const range = fragments.get(value);
    return range ? range.start.isConnected && range.end.isConnected : !!value?.isConnected;
  }
  function descendants(root) {
    const range = fragments.get(root);
    if (!range) return root?.querySelectorAll?.('[data-wutu]') ?? [];
    return rangeNodes(range, false).flatMap(node => node.nodeType === 1
      ? [node, ...node.querySelectorAll('[data-wutu]')] : []);
  }
  function fragment() {
    const parent = frames.at(-1);
    let from = 0, global = false, explicit = false;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].global) { from = i; global = keys[i].depth === frames.length; }
      if (keys[i].explicit) explicit = keys[i].depth === frames.length;
    }
    const key = parent ? keys.slice(from).map(k => \`\${k.explicit ? 'k' : 'c'}\${k.value.length}:\${k.value}\`).join(':') : active?.scope ?? '';
    const identity = \`wutu:\${run.h}:\${encodeURIComponent(key)}\`;
    claimIdentity(parent, identity, global, explicit);
    // Index sibling boundaries once, so a list of fragments reconciles linearly.
    const index = nodes => {
      const result = new Map();
      for (const node of nodes) if (node.nodeType === 8 && node.data.startsWith('wutu:')) {
        let queue = result.get(node.data);
        if (!queue) result.set(node.data, queue = { nodes: [], index: 0 });
        queue.nodes.push(node);
      }
      return result;
    };
    const take = map => {
      const queue = map.get(identity);
      while (queue && queue.index < queue.nodes.length) {
        const node = queue.nodes[queue.index++];
        if (!parent?.used.has(node) && !loose?.used.has(node)) return node;
      }
    };
    let start = parent && take(parent.ranges ??= index(parent.old));
    if (!start && !parent) start = fragments.get(active?.root)?.start;
    if (!start) {
      const outer = frames[0]?.node;
      if (!loose || loose.root !== outer) loose = { root: outer, index: null, used: new Set() };
      if (!loose.comments) {
        const comments = [];
        const scan = node => {
          if (node.nodeType === 8 && (parent || !ranges.has(node))) comments.push(node);
          for (const child of node.childNodes ?? []) scan(child);
        };
        const outerRange = fragments.get(outer);
        if (outerRange) for (const node of rangeNodes(outerRange, false)) scan(node);
        else scan(outer ?? document);
        loose.comments = index(comments);
      }
      start = take(loose.comments);
    }
    let range = start && ranges.get(start);
    if (!range && start) {
      let end = start.nextSibling;
      while (end && !(end.nodeType === 8 && end.data === '/' + identity)) end = end.nextSibling;
      if (end) range = { start, end, value: document.createDocumentFragment() };
    }
    if (!range) {
      const value = document.createDocumentFragment();
      range = { value, start: document.createComment(identity), end: document.createComment('/' + identity) };
      value.append(range.start, range.end);
    }
    fragments.set(range.value, range);
    ranges.set(range.start, range);
    if (parent) parent.used.add(range.start);
    loose?.used.add(range.start);
    run.fragment = range;
    frames.push({ node: range.value, range, old: rangeNodes(range, false), used: new Set(), wanted: [], byKey: null, keyed: null });
  }
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
  function place(parent, wanted, range = null) {
    // Usually they already are.
    const children = range ? rangeNodes(range, false) : parent.childNodes;
    if (children.length === wanted.length) {
      let same = true;
      for (let i = 0; same && i < wanted.length; i++) same = children[i] === wanted[i];
      if (same) return;
    }
    const focused = document.activeElement;
    const selection = focused && 'selectionStart' in focused
      ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection]
      : null;
    let cursor = range ? range.start.nextSibling : parent.firstChild;
    for (const node of wanted) {
      if (node === cursor) { cursor = cursor.nextSibling; continue; }
      if (parent.moveBefore && node.parentNode === parent) parent.moveBefore(node, cursor);
      else parent.insertBefore(node, cursor);
    }
    const keep = new Set(wanted);
    for (const node of [...children]) {
      if (keep.has(node)) continue;
      // The page's <head> (an \`html { }\` template may not write one) and Wutu's own
      // stylesheets in it are no template's to drop.
      if (node.nodeType === 1 && (node.nodeName === 'HEAD' || node.hasAttribute('data-wutu-style'))) continue;
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
      for (const node of descendants(active.root)) active.globalNodes.set(identityOfNode(node), node);
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
      for (const node of descendants(root)) {
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
    if (parent && !isLoose) { parent.wanted.push(node); parent.appended?.add(node); }
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
    const range = fragments.get(value);
    if (range || Array.isArray(value) || value?.nodeType === 11) {
      for (const child of range ? rangeNodes(range) : Array.isArray(value) ? value : [...value.childNodes]) append(child);
      return;
    }
    if (value?.nodeType) {
      frame.appended ??= new Set(frame.wanted);
      if (!frame.appended.has(value)) { frame.appended.add(value); frame.used.add(value); frame.wanted.push(value); }
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
    run = { h: program[1], nodes: [], stack: [{ ops: program[0], pc: 0, kind: 'top' }], outer: run, pending: null, depth: frames.length, fragment: null };
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
        case 'r': fragment(); break;
        case 's': {
          const [element] = prototypeOfTree(op[2], !!op[3]);
          run.nodes[op[1]] = claim(\`v\${run.h}:\${op[1]}\`, '', element.localName, () => element.cloneNode(true), frames.length === run.depth);
          break;
        }
        case 'o': {
          const [element, names] = prototypeOfTree(op[2], !!op[3]);
          run.nodes[op[1]] = open(claim(\`v\${run.h}:\${op[1]}\`, '', element.localName, () => element.cloneNode(false), frames.length === run.depth), names, settable(top.ops, top.pc));
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

  /** An if takes its then (1) or else (0) arm; a match takes arm \`which\`. */
  function arm(which) {
    const op = advance();
    run.stack.push({ ops: op[0] === 'k' ? op[1][which] : (which ? op[1] : op[2]), pc: 0, kind: 'arm' });
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

  /** The template's end: its element or retained fragment range. */
  function done() {
    while (advance() !== null) { /* (only static ops remain) */ }
    let root = run.nodes[0];
    if (run.fragment) {
      const frame = frames.pop(), range = run.fragment;
      place(range.start.parentNode, frame.wanted, range);
      if (active) { range.pending = frame.wanted; (active.pendingRanges ??= new Set()).add(range); }
      root = range.value;
      if (run.depth === 0) {
        for (const node of frame.wanted) if (node.nodeType === 1) node.setAttribute('data-wutu-root', \`fragment:\${run.h}\`);
      }
    }
    run = run.outer;
    if (!run) loose = null;
    return root;
  }

  function render(view) {
    const previous = [frames, active, keys, loose, run], focused = document.activeElement;
    view.cleanupIndex = 0;
    view.cleanupCallbacks ??= [];
    view.intervalsSeen = new Set();
    view.removals = new Set();
    view.pendingRanges = null;
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
      [frames, active, keys, loose, run] = previous;
      view.globalNodes = null;
      if (view.pendingRanges) for (const range of view.pendingRanges) range.pending = null;
      view.pendingRanges = null;
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
      if (existing && connected(existing.root)) {
        if (existing.dirty) { existing.dirty = false; render(existing); }
        return existing.root;
      }
    }
    const view = { render: factory, root: null, scope, dirty: false, cleanupCallbacks: [], effects: new Map() };
    const root = render(view);
    views.add(new WeakRef(view));
    if (scope) scopes.set(scope, new WeakRef(view));
    const owner = fragments.get(root)?.start ?? root;
    metadata.set(owner, { ...metadata.get(owner), view });
    return root;
  }

  function drain() {
    scheduled = false;
    const batch = [...dirty];
    dirty.clear();
    for (const view of batch) {
      if (!connected(view.root)) continue;
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
      if (connected(view.root)) dirty.add(view);
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
    for (const child of node.childNodes ?? []) dispose(child);
  }

  // (Where there is a window: a DOM without one, in tests, has no routes.)
  globalThis.addEventListener?.('hashchange', refresh);
  globalThis.addEventListener?.('popstate', refresh);

  const api = {
    enter, append, attr, url, listen, leave, mount, refresh, invalidate, selectValue, here,
    put, begin, slot, arm, item, end, node, done,
    nodes(value) {
      const range = fragments.get(value);
      return range ? rangeNodes(range) : Array.isArray(value) ? value.flatMap(api.nodes)
        : value?.nodeType === 11 ? [...value.childNodes] : [value];
    },
    storageError: '',
    notify() {
      for (const ref of views) {
        const view = ref.deref();
        if (view && connected(view.root)) schedule(view);
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
      if (entry?.key !== key || !connected(entry.node)) return false;
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
    fn page(root: Externref) Void {
        // The page's <html>: in place of the document's, with the styles Wutu
        // has put in the old head (a prerendered page adopts its own: no swap).
        let attach: fun(Externref) Void = @es/\\ root=>{if(root===document.documentElement)return;const head=root.querySelector(':scope>head')??root.insertBefore(document.createElement('head'),root.firstChild);for(const s of document.head.querySelectorAll('style'))head.append(s);document.replaceChild(root,document.documentElement)} \\/;
        attach(root);
    }
    fn storage_init() Void {
        init();
        let install: fun() Void = @es/\\ () => { (function installWutuStorage(api) {
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
        api.storageError = '';
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
        return load(key);
    }
    fn stored_register(key: Str, encode: cl() Str, manual: Bool, apply: cl(Str) Void) Void {
        let register: fun(Str,cl() Str,Bool,cl(Str) Void) Void = @es/\\ (key,encode,manual,apply)=>globalThis.__utuWutu.store(key,encode,!!manual,apply) \\/;
        register(key,encode,manual,apply);
    }
    /// A shared stylesheet (\`@style\`, \`@document\`), installed once.
    fn style(sheet: Str) Void {
        init();
        let install: fun(Str) Void = @es/\\ (function wutuStyle(sheet) {
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
  node.setAttribute('data-wutu-style', '');
  node.textContent = css;
  document.head.append(node);
}) \\/;
        install(sheet);
    }
    fn invalidate(name: Str) Void {
        let call: fun(Str) Void = @es/\\ (name)=>globalThis.__utuWutu?.invalidate(name) \\/;
        call(name);
    }
    fn save(key: Str) Void {
        let call: fun(Str) Void = @es/\\ (key)=>globalThis.__utuWutu?.save?.(key) \\/;
        call(key);
    }
    fn flush() Void {
        let call: fun() Void = @es/\\ ()=>globalThis.__utuWutu?.flush?.() \\/;
        call();
    }
    fn focus(id: Str) Void {
        let call: fun(Str) Void = @es/\\ (id)=>globalThis.__utuWutu?.focus(id) \\/;
        call(id);
    }
    fn after_render(callback: cl() Void) Void {
        let call: fun(cl() Void) Void = @es/\\ (callback)=>globalThis.__utuWutu?.after(callback) \\/;
        call(callback);
    }
    fn on_cleanup(callback: cl() Void) Void {
        let call: fun(cl() Void) Void = @es/\\ (callback)=>globalThis.__utuWutu?.cleanup(callback) \\/;
        call(callback);
    }
    /// A template's text hole (\`= x;\`): a number or a Bool shows as its
    /// \`str()\`, a Str or a node as itself. The compiler picks which, by
    /// x's type; this body is never what runs.
    fn show_list(values: Array[$T]) Externref {
        let make: fun() Externref = @es/\\ ()=>[] \\/;
        let push: fun(Externref, Externref) Void = @es/\\ (a,v)=>{a.push(v)} \\/;
        let begin_item: fun(I32) Void = @es/\\ i=>globalThis.__utuWutu.pushCall('list:'+i) \\/;
        let end_item: fun() Void = @es/\\ ()=>globalThis.__utuWutu.popKey() \\/;
        let result = make();
        for (values, 0 ..< values.len()) |value, index| {
            begin_item(index);
            push(result, wutu.show(value));
            end_item();
        }
        return result;
    }
    fn show(value: Externref) Externref {
        return value;
    }
    /// A keyed loop's key (\`key k\`) as text: a Str is itself, a number or
    /// a Bool its \`str()\`. The compiler picks which; this body is never
    /// what runs.
    fn key_text(value: Externref) Str {
        return "";
    }
    /// A text hole's reuse key (\`= f(a, b);\`): the compiler makes it, from
    /// the call and its arguments; this body is never what runs.
    fn memo_key(call: Externref, key: Str) Str {
        return key;
    }
    fn route() Str {
        let call: fun() Str = @es/\\ ()=>location.hash.slice(1)||"/" \\/;
        return call();
    }
    fn number(value: I32) Str {
        let format: fun(I32) Str = @es/\\ value=>String(value) \\/;
        return format(value);
    }
    fn money(cents: I32) Str {
        let format: fun(I32) Str = @es/\\ cents=>(cents<0?"-$":"$")+(Math.abs(cents)/100).toFixed(2) \\/;
        return format(cents);
    }
    fn decimal(value: F64, digits: I32) Str {
        let format: fun(F64,I32) Str = @es/\\ (value,digits)=>value.toFixed(Math.max(0,Math.min(20,digits))) \\/;
        return format(value,digits);
    }
    fn reload_store(key: Str) Void {
        let reload: fun(Str) Void = @es/\\ key=>globalThis.__utuWutu?.reload?.(key) \\/;
        reload(key);
    }
    fn interval(key: Str, milliseconds: F64, callback: cl() Void) Void {
        let start: fun(Str, F64, cl() Void) Void = @es/\\ (key,ms,callback)=>globalThis.__utuWutu?.interval(key,ms,callback) \\/;
        start(key,milliseconds,callback);
    }
    fn storage_error() Str {
        let read: fun() Str = @es/\\ () => globalThis.__utuWutu?.storageError ?? "" \\/;
        return read();
    }
    fn refresh() Void {
        let update: fun() Void = @es/\\ () => globalThis.__utuWutu?.refresh() \\/;
        update();
    }
}
`.replaceAll("@@IR_WASM@@",$)]]);re.set("std:Browser",un);re.set("std:JS",mn);re.set("std:Web",pn);re.set("std:Worker",hn);function gn(e,n,t){let r=n.findIndex(g=>g.key===t);if(r<0)throw new Error(`no loaded file ${t}`);let s=e.file_first_token(r),a=e.file_end_token(r),f=new Uint8Array(e.node_kind.buffer),c=new Int32Array(e.node_first.buffer),o=new Int32Array(e.node_last.buffer),u=new Int32Array(e.node_child.buffer),m=new Int32Array(e.node_next.buffer),i=-1;for(let g=0,d=e.node_count();g<d;g++)if(f[g]===0&&c[g]>=s&&o[g]<=a){i=g;break}if(i<0)throw new Error(`no syntax tree for ${t}`);let l=new Map,p=g=>{let d=f[g];return l.has(d)||l.set(d,e.node_kind_name(d)),l.get(d)},w=g=>{let d=[];for(let _=u[g];_>=0;_=m[_])d.push(w(_));return`(${p(g)}${d.length?` ${d.join(" ")}`:""})`};return w(i)}function Bt(e,n){let t=new TextEncoder().encode(n),r=e.source(t.length);return new Uint8Array(e.src.buffer).set(t,r),e.tokens(t.length),e.nodes(t.length)<0?null:gn(e,[{key:"<source>"}],"<source>")}var we={binding:"#2563eb",call:"#059669",import:"#d97706",type:"#7c3aed"},yn={binding:"name resolves to declaration",call:"call reaches function",import:"module imports file",type:"expression uses type"};function bn(e,n,t){let r=ye(e,n),s=ne(n),a=n.find(d=>d.key===t);if(!a)throw new Error(`no loaded file ${t}`);let f=[],c=new Set,o=(d,_,v,k="")=>{if(!_||!v)return;let R=`${d}:${_.file}:${_.start}:${v.file}:${v.start}`;c.has(R)||(c.add(R),f.push({kind:d,from:_,to:v,label:k||yn[d]}))};for(let{decl:d,at:_}of r.names(t)){let v=r.definition(d);v&&!(_.file===v.file&&_.start===v.start)&&o("binding",_,v)}let u=new Uint8Array(e.node_kind.buffer),m=new Int32Array(e.node_first.buffer),i=new Int32Array(e.node_last.buffer),l=new Int32Array(e.tok_start.buffer),p=new Int32Array(e.node_child.buffer),w=new Int32Array(e.node_next.buffer),g=new Int32Array(e.node_decl.buffer);for(let d=0,_=e.node_count();d<_;d++){if(m[d]>=i[d]||l[m[d]]<a.offset||l[m[d]]>=a.offset+a.bytes.length)continue;let v=r.at(d);if(!v||v.file!==t)continue;if(e.node_kind_name(u[d])==="call_expr"){let R=p[d];if(R>=0){let A=g[R];if(A<0)for(let T=p[R];T>=0;T=w[T])g[T]>=0&&(A=g[T]);A>=0&&o("call",v,r.definition(A))}}let k=e.node_type_decl?.(d,1)??-1;k>=0&&o("type",v,r.definition(k))}for(let d=0,_=e.import_count();d<_;d++){if(n[e.import_from(d)]?.key!==t)continue;let k=s(e.import_path_start(d)),R=s(e.import_path_end(d)),A=k&&{file:k.file.key,start:k.offset,end:R?.offset??k.offset},T=new TextDecoder().decode(new Uint8Array(e.src.buffer,e.import_path_start(d),e.import_path_end(d)-e.import_path_start(d))).replace(/^['"]|['"]$/g,""),F={file:n.find(O=>O.key===T||O.key.endsWith(`/${T.replace(/^\.\//,"")}`))?.key??T,start:0,end:0};o("import",A,F,`imports ${F.file}`)}return{key:t,source:a.text,edges:f}}var L=e=>String(e).replace(/[&<>"']/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[n]);function Rt(e,n,t){let{source:r,edges:s}=bn(e,n,t),a=r.split(`
`),f=[0];for(let d=0;d<r.length;d++)r[d]===`
`&&f.push(d+1);let c=d=>{let _=0,v=f.length-1;for(;_<v;){let k=_+v+1>>1;f[k]<=d?_=k:v=k-1}return{x:64+(d-f[_])*8.4,y:24+_*20}},o=s.filter(d=>d.from.file===t&&d.to.file===t),u=s.filter(d=>d.from.file===t&&d.to.file!==t),m=Math.max(720,64+Math.max(40,...a.map(d=>d.length))*8.4+180),i=32+a.length*20,l=o.map(d=>{let _=c(d.from.start),v=c(d.to.start),k=Math.min(120,24+Math.abs(_.y-v.y)*.35);return`<path class="edge ${d.kind}" d="M${_.x} ${_.y-5} C${_.x+k} ${_.y-24},${v.x+k} ${v.y-24},${v.x} ${v.y-5}" stroke="${we[d.kind]}"><title>${L(d.label)}</title></path>`}).join(`
`),p=a.map((d,_)=>`<text class="ln" x="8" y="${24+_*20}">${_+1}</text><text class="src" x="64" y="${24+_*20}">${L(d)}</text>`).join(`
`),w=Object.keys(we).map(d=>`<label><input type="checkbox" data-kind="${d}" checked><span style="color:${we[d]}">\u25CF</span> ${L(yn[d])} (${s.filter(_=>_.kind===d).length})</label>`).join(" "),g=u.map(d=>`<li>${L(d.label)} \u2014 ${L(d.to.file)}</li>`).join("");return`<!doctype html><meta charset="utf-8"><title>utu graphs \u2014 ${L(t)}</title>
<style>body{font:13px system-ui,sans-serif;color:CanvasText;background:Canvas;margin:24px}h1{font-size:16px}.legend{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}.wrap{overflow:auto;border:1px solid #8886;border-radius:6px}svg{display:block;font:12px ui-monospace,monospace;white-space:pre}.ln{fill:#888}.src{fill:CanvasText}.edge{fill:none;stroke-width:1.5;opacity:.7}.edge:hover{opacity:1;stroke-width:2.5}.edge.off{display:none}</style>
<h1>Compiler graphs</h1><p>${L(t)}</p><div class="legend">${w}</div>
<div class="wrap"><svg width="${m}" height="${i}" viewBox="0 0 ${m} ${i}">${l}${p}</svg></div>
${g?`<h2>Other files</h2><ul>${g}</ul>`:""}
<script>for(const box of document.querySelectorAll('input[data-kind]'))box.addEventListener('change',()=>{for(const edge of document.querySelectorAll('.edge.'+box.dataset.kind))edge.classList.toggle('off',!box.checked)})</script>`}async function Ot(e,{map:n=null,files:t=[],source:r=!1}={}){let{print:s}=await import("./wasm-tools-4LXQBNK6.js"),a=await s(e);if(!r||!n?.functions?.length||!t.length)return a;let f=new Map(t.map(i=>[i.key,i])),c=new Map(t.map(i=>[i.key,i.text.split(/\r?\n/)])),o=new Map;for(let i of n.entries??[])i.ownerAt==null||!i.file||!i.line||(o.has(i.ownerAt)||o.set(i.ownerAt,[]),o.get(i.ownerAt).push(i));let u=new Map,m=i=>{for(let l=t.length-1;l>=0;l--){let p=t[l];if(i<p.offset||i>=p.offset+p.bytes.length)continue;let w=new TextDecoder().decode(p.bytes.subarray(0,i-p.offset));return{file:p,line:w.split(`
`).length}}return null};for(let i=0;i<n.functions.length;i++){let l=n.functions[i];if(l==null)continue;let p=m(l);if(!p)continue;let w=o.get(l)??[],g=new Map([[`${p.file.key}:${p.line}`,p.line]]);for(let _ of w)g.set(`${_.file}:${_.line}`,_.line);let d=[];for(let _ of[...g.keys()].sort((v,k)=>v.localeCompare(k,void 0,{numeric:!0})).slice(0,80)){let v=_.lastIndexOf(":"),k=f.get(_.slice(0,v)),R=Number(_.slice(v+1));if(!k)continue;let A=c.get(k.key)?.[R-1]?.trim()??"";d.push(`  ;; ${_.replace(/[\r\n]/g," ")} ${A.replace(/[\r\n]/g," ")}`)}u.set(i,d.join(`
`))}return a.replace(/^(\s*)\(func (?:\$[^\s]+ )?\(;([0-9]+);\)/gm,(i,l,p)=>{let w=u.get(Number(p));return w?`${w}
${i}`:i})}export{oe as MODES,me as OPTIMIZE,re as PLATFORM_SOURCES,D as ROLE,le as TARGET,he as builtModule,ft as catalogStdlib,Bn as compile,nn as compileProgram,_t as formatDiagnostics,At as glueSource,bn as graphData,ge as instantiate,En as loadCompiler,pe as loadProgram,Tt as loaderSource,Bt as parseSyntaxTree,Ot as printWat,ye as programIndex,tn as readDiagnostics,Rt as renderGraphHtml,gn as syntaxTree};
