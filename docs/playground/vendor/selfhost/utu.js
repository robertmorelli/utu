function Ae(e,n={}){for(let t of e?.ops??[])t==="promise_then"&&(n.promise_then=vn),t==="promise_catch"&&(n.promise_catch=kn);return n}var Te=new WeakSet,vn=(e,n)=>{e.then(n,t=>{if(!Te.has(e))throw t})},kn=(e,n)=>{Te.add(e),e.catch(n)};function $e(e,n={}){for(let t of e?.awaits??[])n[`await_${t}`]=In(t.startsWith("null_"));return n}function In(e=!1){if(typeof WebAssembly.Suspending!="function")throw new Error("utu: `await` needs JS Promise Integration (WebAssembly.Suspending), which this host does not provide \u2014 use `.then` instead, or run on a JSPI-capable host (Chrome 126+, Node 23+, Bun)");return new WebAssembly.Suspending(e?async n=>await n??null:async n=>await n)}var je=Symbol("utu.closure");function Me(e,n={}){if(!e)return n;e.new&&(n.closure_new=e.sigs?(t,r,s,a)=>Ie(t,r,s,a,e.sigs):Ie),n.closure_rec=Sn;for(let t of e.calls??[])n[t]=An;return n}var ke=new WeakMap,Ie=(e,n,t,r,s)=>{let a=n==null&&!(t&2),f=a&&ke.get(e);if(f)return f;let d=a?(...i)=>e(...i):(...i)=>e(n,...i),l=s?.[(t>>4)-1],u=l?(...i)=>{for(let o=0;o<l.length;o++){let h=l[o];if(h==="b")i[o]=i[o]?1:0;else if(h==="n")i[o]===void 0&&(i[o]=null);else if(h==="h"&&i[o]==null)throw new TypeError(`Wrong type from JavaScript: a closure's argument ${o+1} is ${i[o]}`)}return d(...i)}:d,m=t&1?(...i)=>!!u(...i):t&4?(...i)=>u(...i)>>>0:t&8?(...i)=>BigInt.asUintN(64,u(...i)):u;return m[je]=r,a&&ke.set(e,m),m},Sn=e=>e?.[je]??null,An=(e,...n)=>e(...n),Tn={U8:"Uint8Array",I8:"Int8Array",U16:"Uint16Array",I16:"Int16Array",I32:"Int32Array",U32:"Uint32Array",I64:"BigInt64Array",U64:"BigUint64Array",F32:"Float32Array",F64:"Float64Array"};function Fe(e,n={}){for(let{name:r,kind:s,host:a,data:f}of e??[]){if(!a)continue;let d=Math.max(1,Math.ceil((f?f.length*3/4:0)/65536)),l=new WebAssembly.Memory({initial:d,maximum:65535}),u=globalThis[Tn[s]],m=u.BYTES_PER_ELEMENT,i=o=>{let h=Math.ceil(o/65536)-l.buffer.byteLength/65536;h>0&&l.grow(h)};n[`mem_${r}`]=l,n[`mem_copy_in_${r}`]=o=>{if(typeof o=="string")return i(o.length*3),Math.floor(new TextEncoder().encodeInto(o,new Uint8Array(l.buffer)).written/m);let h=o instanceof ArrayBuffer?new Uint8Array(o):new Uint8Array(o.buffer,o.byteOffset,o.byteLength);return i(h.byteLength),new Uint8Array(l.buffer).set(h),Math.floor(h.byteLength/m)},n[`mem_view_${r}`]=(o,h)=>new u(l.buffer,o*m,h-o)}return n}function Ee(e={}){return e.js_tag=WebAssembly.JSTag,e}function We(e,n){let t=n?.asyncExports??[];if(t.length===0)return e.exports;let r={...e.exports};for(let s of t)typeof r[s]=="function"&&(r[s]=$n(r[s]));return r}function $n(e){return Object.defineProperty(WebAssembly.promising(e),"length",{value:e.length})}function Re(e,n,t=[]){if(!n)return e;let r={Bool:u=>u!==0,U32:u=>u>>>0,U64:u=>BigInt.asUintN(64,u)},s=u=>u,a=(u,m,i,o)=>{throw new TypeError(`${u}: argument ${m+1} must be ${i}, not ${o===null?"null":i==="an integer"&&typeof o=="number"?o:typeof o}`)},f=u=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${u===null?"null":u instanceof Promise?"a Promise (await it: Promise[Str])":typeof u}`)},d=(u,m,i)=>{if(m==="Bool")return o=>!!o;if(m==="int")return o=>Number.isInteger(o)?o:a(u,i,"an integer",o);if(m==="big")return o=>typeof o=="bigint"?o:a(u,i,"a BigInt",o);if(m==="num")return o=>typeof o=="number"?o:a(u,i,"a number",o);if(m==="Str")return o=>typeof o=="string"?o:a(u,i,"a string",o);if(m==="?Str")return o=>o==null?null:typeof o=="string"?o:a(u,i,"a string or null",o);if(m==="ref")return o=>o??a(u,i,"a value",o);if(m==="cl")return o=>typeof o=="function"?o:a(u,i,"a function",o);if(m.startsWith("cl:")){let[,o,h]=m.split(":"),w=[...o].map(c=>c==="B"?_=>!!_:c==="U"?_=>_>>>0:c==="W"?_=>BigInt.asUintN(64,_):s),y=h==="b"?c=>c?1:0:h==="S"?c=>typeof c=="string"?c:f(c):h==="n"?c=>c??null:s;return c=>typeof c=="function"?(..._)=>y(c(..._.map((v,k)=>w[k](v)))):a(u,i,"a function",c)}return m==="?"?o=>o===void 0?null:o:s},l={...e};for(let[u,m]of Object.entries(n)){let i=e[u];if(typeof i!="function")continue;let o=typeof m=="string"?m:m.r,h=Array.isArray(o)?o.map(_=>r[_]??s):null,w=h?_=>_.map((v,k)=>h[k](v)):r[o]??s,y=(typeof m=="string"?[]:m.p??[]).map((_,v)=>d(u,_,v)),c=(..._)=>{for(let k=0;k<y.length;k++)_[k]=y[k](_[k]);let v=i(..._);return v instanceof Promise?v.then(w):w(v)};l[u]=t.includes(u)?(..._)=>{try{return c(..._)}catch(v){return Promise.reject(v)}}:c,Object.defineProperty(l[u],"length",{value:i.length})}return l}var Se=/^(?:\s|\/\/.*|\/\*[\s\S]*?\*\/)*import\s[^;]*;/,Oe="const $utuFn = (n, f) => { if (typeof f != 'function') throw new TypeError(`${n}: @es gave ${f === null ? 'null' : typeof f}, not a function`); return f; };",Ne=e=>e.includes("$utuFn(");function Y(e){let n=[],t=e;for(let r=t.match(Se);r;r=t.match(Se))n.push(r[0].trim()),t=t.slice(r[0].length);return{imports:n,expr:t.trim()}}function Z(e,n=null){let t=new Set,r=[],s=!1;for(let f of Object.values(e??{}))for(let[d,l]of Object.entries(f??{})){if(n&&!n.has(d))continue;let{imports:u,expr:m}=Y(l);for(let i of u)t.add(i);s||=Ne(m),r.push(`export const ${K(d)} = (
${m}
);`)}return r.length===0?"":`${(t.size?`${[...t].join(`
`)}

`:"")+(s?`${Oe}

`:"")}${r.join(`

`)}
`}function K(e){return/^\d/.test(e)?`$${e}`:e}function Be(e,n){let t={};for(let[r,s]of Object.entries(e??{})){t[r]={};for(let a of Object.keys(s??{})){if(!(K(a)in n))continue;let f=n[K(a)];t[r][a]=typeof f=="function"?f:()=>f}}return t}function Ce(e){let n={};for(let[t,r]of Object.entries(e??{})){n[t]={};for(let[s,a]of Object.entries(r??{})){let f=new Function(`${Ne(a)?Oe:""}return (${a});`)();n[t][s]=typeof f=="function"?f:()=>f}}return n}var jn=/(?<=\b(?:if\b[^{};]*|else\s*))\{[^{};]*;?\s*\}/g;function Ve(e,n){let t=[];if(!Mn(e))return t;let r=0,s=!1,a=[];for(let[f,d]of e.split(`
`).entries()){let l=d.length>160;if(!l&&!s&&!a.length&&(!d.includes("`")&&!d.includes("/*")||/^\s*\/\//.test(d))){r+=d.length+1;continue}let u="",m=!1;if(!d.trimStart().startsWith("\\\\"))for(let o=0;o<d.length;o++){let h=d[o],w=d[o+1],y=a.length-1;if(s)h==="*"&&w==="/"&&(s=!1,o++);else if(m)h==="\\"?o++:h==='"'&&(m=!1);else if(a[y]==="text")h==="\\"?o++:h==="`"?a.pop():h==="$"&&w==="{"&&(a.push(0),o++);else{if(h==="/"&&w==="/")break;h==="/"&&w==="*"?(s=!0,o++):h==='"'?m=!0:h==="`"?a.push("text"):y>=0?h==="{"?a[y]++:h==="}"&&a[y]--===0&&a.pop():l&&(u+=h)}}let i=()=>(u.replace(jn," ").match(/[{};]/g)??[]).length;if(l&&u.trim().length>100&&i()>=5){let o=d.search(/\S/)+1;t.push({kind:"compressed-source",severity:"warning",message:"This line packs multiple statements or blocks together. Put statements and block contents on separate, indented lines; keep source readable and minify build output instead.",primary:{file:n,row:f+1,col:o,endRow:f+1,endCol:d.length+1,start:r+o-1,end:r+d.length},related:[],notes:[],fixes:[]})}r+=d.length+1}return t}function Mn(e){for(let n=0,t;n<e.length;n=t+1)if(t=e.indexOf(`
`,n),t<0&&(t=e.length),t-n>160)return!0;return!1}function Fn(e){return e.replace(/"[^"\n]*"|\/\/[^\n]*|\\\\[^\n]*/g,n=>n[0]==='"'?`"${" ".repeat(n.length-2)}"`:" ".repeat(n.length))}function Ue(e,n){let t=e.slice(0,n).split(`
`);return{row:t.length,col:t.at(-1).length+1}}function qe(e){let n=new Set,t=[];for(let[r,s]of e){if(!s.includes("@island")&&!s.includes("invalidate"))continue;let a=Fn(s);for(let f of a.matchAll(/@island\s+"/g)){let d=f.index+f[0].length;n.add(s.slice(d,s.indexOf('"',d)))}if(!/^(std|node|npm):/.test(r))for(let f of a.matchAll(/\bwutu\s*\.\s*invalidate\s*\(\s*"/g)){let d=f.index+f[0].length-1,l=s.indexOf('"',d+1)+1;t.push({file:r,source:s,start:d,end:l,name:s.slice(d+1,l-1)})}}return t.filter(r=>!n.has(r.name)).map(({file:r,source:s,start:a,end:f,name:d})=>{let l=Ue(s,a),u=Ue(s,f),m=[...n].sort();return{kind:"unknown-island",severity:"warning",message:`No @island named "${d}" exists, so this invalidate refreshes nothing.${m.length?` Known islands: ${m.map(i=>`"${i}"`).join(", ")}.`:""}`,primary:{file:r,row:l.row,col:l.col,endRow:u.row,endCol:u.col,start:a,end:f},related:[],notes:[],fixes:[]}})}function Je(e){let n=null;try{n=JSON.parse(e)}catch{return null}return n?.version===1&&Array.isArray(n.types)&&n.exports&&n.names&&/^[A-Z][A-Za-z0-9_]*$/.test(n.prefix)?n:null}var P={entry:0,import:1,prelude:2},le={normal:0,test:1,comptime:2,bench:3,analysis:4},me={none:0,size:1,speed:2},oe={small:{optimize:"size",safe:!0},fast:{optimize:"speed",safe:!0},smallUnsafe:{optimize:"size",safe:!1},fastUnsafe:{optimize:"speed",safe:!1},debug:{optimize:"none",safe:!0}};var Ge=Object.freeze({builtins:["js-string"],importedStringConstants:"'"}),ee=new TextDecoder,D=new TextEncoder,V=(e,n,t)=>ee.decode(new Uint8Array(e.buffer,n,t-n));async function En(e,n={}){return(await ye(e,n)).exports}async function Wn(e,n,t){let r=t.mode&&Object.hasOwn(oe,t.mode)?oe[t.mode]:null;if(t.mode&&!r)throw new Error(`no build mode ${t.mode}: ${Object.keys(oe).join(", ")}`);let{target:s="normal",optimize:a="size",debugNames:f=!1,safe:d=!1,sourceMap:l=!1,blame:u=!1,profile:m=!1,run:i=!1}={...t,...r};e.set_optimize(me[a]??me.size),e.set_safe(d?1:0),e.set_debug_names(f?1:0),e.set_move_limit?.(t.moveLimit??0),e.set_source_map?.(l||u?1:0),e.set_profile?.(m?1:0),e.set_run?.(i?1:0);let o,h;try{o=await pe(e,n,t),h=await nn(e,le[s]??le.normal,t)}catch(c){if(!Pn(c))throw c;return o=Ze.get(e)??[],{wasm:null,spec:null,diagnostics:[Dn(e,o,c)],files:o}}let w=rt(e,o),y=tn(e,o).concat(w,it(o));return h<0||w.length?{wasm:null,spec:null,diagnostics:y,files:o}:{...he(e,h),diagnostics:y,files:o,tests:s==="test"?Un(e):[],benches:s==="bench"?On(e):[],map:l&&e.map_count?Nn(e,o):null,blame:u&&e.blame_prepare?Cn(e,o):null,...m?{frames:Rn(e,o)}:{},...i&&e.run_leaf?.()?{array:{levels:e.run_levels(),leaf:e.run_leaf()}}:{}}}function Rn(e,n){let t=ne(n),r=[];for(let s=0;s<e.profile_count();s++){let a=e.profile_at(s),f=a>=0?t(a):null;r.push({name:e.profile_name(s),file:f?.file.key??null,line:f?.line??null})}return r}function On(e){let n=[];for(let t=0;t<e.bench_count();t++)n.push({export:`__bench_${t}`,name:Ke(e,e.bench_mod_start(t),e.bench_mod_end(t))+He(V(e.src,e.bench_name_start(t),e.bench_name_end(t)))});return n}function ne(e){let n=e.toSorted((r,s)=>r.offset-s.offset),t=new Map;return r=>{let s=0,a=n.length-1,f=null;for(;s<=a;){let i=s+a>>1;n[i].offset<=r?(f=n[i],s=i+1):a=i-1}if(!f||r>f.offset+f.bytes.length)return null;let d=t.get(f);if(!d){d={bytes:[0],units:[0]};let{bytes:i}=f;for(let o=0;o<i.length;o++){if(i[o]!==10&&(i[o]!==13||i[o+1]===10))continue;let h=d.bytes.at(-1);d.units.push(d.units.at(-1)+ee.decode(i.subarray(h,o+1)).length),d.bytes.push(o+1)}t.set(f,d)}let l=r-f.offset;for(s=0,a=d.bytes.length-1;s<a;){let i=s+a+1>>1;d.bytes[i]<=l?s=i:a=i-1}let u=ee.decode(f.bytes.subarray(d.bytes[s],l)),m=1;for(let i=0;i<u.length;i++){let o=u.charCodeAt(i);(o<56320||o>57343)&&m++}return{file:f,line:s+1,column:m,unit:u.length+1,offset:d.units[s]+u.length}}}function Nn(e,n){let t=ne(n),r=new Map,s=new Map,a=new Map,f=[];for(let l=0;l<e.map_count();l++){let u=e.map_start(l),m=e.map_end(l),i=`${u}:${m}`,o=r.get(i);if(!o){let y=u>=0?t(u):null,c=e.map_kind(l);s.has(c)||s.set(c,c>=0?e.node_kind_name(c):null);let _=e.map_owner_start(l);_>=0&&!a.has(_)&&a.set(_,e.map_owner_name(l)),o={file:y?.file.key??null,line:y?.line??null,column:y?.column??null,unit:y?.unit??null,start:y?.offset??null,end:y?t(m)?.offset??y.offset:null,kind:s.get(c),owner:_>=0?a.get(_):null,ownerAt:_>=0?_:null},r.set(i,o)}let h=e.map_site_start?.(l)??-1,w=h>=0?t(h):null;f.push({at:e.map_offset(l),...o,site:w&&{file:w.file.key,line:w.line,column:w.column,start:w.offset,end:t(e.map_site_end(l))?.offset??w.offset}})}let d=[];for(let l=0;l<e.map_function_count();l++){let u=e.map_function_start(l);d.push(u>=0?u:null)}return{entries:f,functions:d}}var Bn=["defined","import","helper","wat"];function Cn(e,n){e.blame_prepare();let t=ne(n),r=[],s=[],a=new Map,f=new Map,d=new Map,l=y=>{let c=e.blame_node_kind(y);return d.has(c)||d.set(c,c>=0?e.node_kind_name(c):null),d.get(c)},u=y=>{let c=t(e.blame_node_start(y));return c&&{file:c.file.key,line:c.line,column:c.column,start:c.offset,end:t(e.blame_node_end(y))?.offset??c.offset}},m=y=>{if(y<0)return-1;if(!f.has(y)){let c=u(y);f.set(y,c?s.push({name:e.blame_decl_name(y),kind:l(y),...c})-1:-1)}return f.get(y)},i=y=>{if(y<0)return-1;if(!a.has(y)){let c=u(y);a.set(y,c?r.push({...c,kind:l(y),decl:m(e.blame_decl(y))})-1:-1)}return a.get(y)},o=[];for(let y=0;y<e.map_count();y++)o.push({at:e.map_offset(y),place:i(e.blame_map_node(y)),site:i(e.blame_map_site(y))});let h=[];for(let y=0;y<e.map_function_count();y++){let c=ee.decode(Uint8Array.from(e.blame_func_name(y),_=>_.charCodeAt(0)));h.push({place:i(e.blame_func_node(y)),role:Bn[e.blame_func_role(y)],name:c||null})}let w=(y,c)=>Array.from({length:y},(_,v)=>i(c(v)));return{places:r,decls:s,entries:o,funcs:h,types:w(e.blame_type_count(),y=>e.blame_type_node(y)),globals:w(e.blame_glob_count(),y=>e.blame_glob_node(y)),data:w(e.blame_data_count(),y=>e.blame_data_node(y)),memories:w(e.blame_memory_count(),y=>e.blame_memory_node(y))}}function Un(e){let n=[];for(let t=0;t<e.test_count();t++)n.push({export:`__test_${t}`,name:Ke(e,e.test_mod_start(t),e.test_mod_end(t))+He(V(e.src,e.test_name_start(t),e.test_name_end(t)))});return n}var Ke=(e,n,t)=>n<0?"":`${V(e.src,n,t)}: `,Vn={n:`
`,t:"	",r:"\r",b:"\b",f:"\f"};function He(e){return e.slice(1,-1).replace(/\\(u[0-9a-fA-F]{4}|.)/g,(n,t)=>t.length>1?String.fromCharCode(parseInt(t.slice(1),16)):Vn[t]??t)}async function pe(e,n,t,r=new Map){let{resolvePath:s=rn,stdlib:a}=t,f=async c=>(r.has(c)||r.set(c,await(t.readFile.bytes??t.readFile)(c)),r.get(c)),d=zn(e,a),l=[...d.files];Ze.set(e,l);let u=new Map(d.byKey),m=[],i=!1,o=(c,_,v)=>{if(i)return;let k=D.encode(_);new Uint8Array(e.src.buffer).set(k,e.import_missing(c,k.length,v)),i=!0},h=[],w=X(e,l,u,n,await f(n),P.entry);for(let c=0;c<e.import_count();c++){let _=l[e.import_from(c)],v=V(e.src,e.import_path_start(c),e.import_path_end(c)),k=Ye.test(v),R=!k&&/\.abi\.json"$/.test(v)?s(_.key,JSON.parse(v)):null;if(/^"?(npm|node):/.test(v)||R||k&&typeof a.get(v)=="function"){e.import_foreign(c),m.push({i:c,raw:v,from:_.key,abiFile:R,name:V(e.src,e.import_name_start(c),e.import_name_end(c))});continue}let A=k?v:s(_.key,JSON.parse(v)),T=u.get(A);if(T===void 0){let M=_.role===P.prelude?P.prelude:P.import;if(k){let F=a.get(A);if(typeof F!="string"){o(c,A,2);continue}T=X(e,l,u,A,F,M)}else{let F;try{F=await f(A)}catch{o(c,A,0);continue}T=X(e,l,u,A,F,M)}}e.import_bind(c,T),(h[e.import_from(c)]??=[]).push([c,T])}let y=qn(h,w);return y&&o(y[0],l[y[1]].key,1),await Zn(e,m,t,f)?(l.diagnostics=e.resolve(),await Qn(e,n,l,t),await Jn(e),l):pe(e,n,t,r)}function qn(e,n){let t=[],r=[[n,0]];for(t[n]=1;r.length;){let s=r.at(-1),a=e[s[0]]?.[s[1]++];if(!a){t[s[0]]=2,r.pop();continue}if(t[a[1]]===1)return a;t[a[1]]||(t[a[1]]=1,r.push([a[1],0]))}return null}async function Jn(e){let n=e.wat_count();if(n===0)return;let{assembleWat:t}=await import("./assemble-QBZS4KRV.js"),r=f=>e.node_kind_name(new Uint8Array(e.node_kind.buffer)[f]),s=f=>{let d=new Int32Array(e.node_child.buffer),l=new Int32Array(e.node_next.buffer),u=[];for(let m=d[f];m>=0;m=l[m])u.push(m);return u},a=f=>{let d=new Int32Array(e.node_first.buffer)[f],l=new Int32Array(e.node_last.buffer)[f];return V(e.src,new Int32Array(e.tok_start.buffer)[d],new Int32Array(e.tok_end.buffer)[l-1])};for(let f=0;f<n;f++){let d=s(e.wat_function(f)),l=d.filter(h=>r(h)==="param_list").flatMap(s).map(h=>{let[w,y]=[s(h)[0],s(h).at(-1)];return{name:a(w),type:a(y)}}),u=d.find(h=>r(h)==="return_type"),m=r(s(u)[0])==="void_type"?"void":a(u),i=d.some(h=>r(h)==="self_param")||r(s(u)[0])==="yield_type",o=t({params:l,result:m,method:i,text:V(e.src,e.wat_text_start(f),e.wat_text_end(f))});if(o.code){let h=e.wat_set(f,o.code.length);new Uint8Array(e.wat_bytes.buffer).set(o.code,h)}else{let{message:h,start:w,end:y}=o.error,c=D.encode(h),_=e.wat_fail(f,w??-1,y??-1,c.length);new Uint8Array(e.src.buffer).set(c,_)}}}var Ye=/^[a-z][a-zA-Z0-9_]*:[A-Za-z][a-zA-Z0-9_]*$/;function X(e,n,t,r,s,a){let f=typeof s=="string"?D.encode(s):new Uint8Array(s),d=typeof s=="string"?s:new TextDecoder("utf-8",{ignoreBOM:!0}).decode(f),l=e.file_add(f.length,a);return r.startsWith("std:")&&e.file_mark_std?.(l),new Uint8Array(e.src.buffer).set(f,e.file_offset(l)),n.push({key:r,role:a,text:d,offset:e.file_offset(l),bytes:f}),t.set(r,l),n.parsing=!0,e.file_parse(l),n.parsing=!1,l}var Ze=new WeakMap;function Pn(e){return e instanceof RangeError&&/call stack/i.test(e.message)}function Dn(e,n,t){let r={kind:"nested-too-deeply",code:"nested-too-deeply",severity:"error",file:null,message:"Program nested too deeply",notes:["The compiler recurses on nesting; split the expression, or the chain, into smaller ones."]},s=n.parsing?e.parse_deepest_at?.()??-1:-1;s<0&&(s=Ln(e,n));let a=s<0?null:n.findLast(d=>d.offset<=s&&s<=d.offset+d.bytes.length);if(!a)return{...r,message:`${r.message} (${t.message})`};let f=Q(a,s,s);return{...r,file:a.key,...f,end:f.start+1,label:"nested too deeply",message:`${r.message} (at about line ${f.line})`}}function Ln(e,n){let t,r,s,a,f;try{f=e.node_count(),[t,r,s]=["node_child","node_next","node_first"].map(y=>new Int32Array(e[y].buffer,0,f)),a=new Int32Array(e.tok_start.buffer)}catch{return-1}let d=n.filter(y=>y.role===P.entry||y.role===P.import),l=y=>d.some(c=>c.offset<=y&&y<c.offset+c.bytes.length),u=new Uint8Array(f);for(let y=0;y<f;y++)for(let c=t[y];c>=0&&c<f&&!u[c];c=r[c])u[c]=1;let m=new Int32Array(f),i=-1,o=-1,h=0;for(let y=0;y<f;y++){if(u[y]||!l(a[s[y]]))continue;let c=[y];for(;c.length;){let _=c.pop(),v=0;for(let k=t[_];k>=0&&k<f;k=r[k])m[k]=m[_]+1,c.push(k),v++;(i<0||m[_]>m[i])&&(i=_),v>h&&(h=v,o=_)}}let w=i>=0&&m[i]>=200?i:o;return w<0?-1:a[s[w]]}var Pe=new WeakMap;function Xe(e){let n=Pe.get(e);if(!n){let t=e.map(f=>D.encode(JSON.stringify(f))),r=new Int32Array(t.length),s=new Uint8Array(t.reduce((f,d)=>f+d.length+1,1)),a=0;s[a++]=91,t.forEach((f,d)=>{d>0&&(s[a++]=44),r[d]=a,s.set(f,a),a+=f.length}),s[a++]=93,n={bytes:s.subarray(0,a),offsets:r},Pe.set(e,n)}return n}var De=new WeakMap;function Qe(e){let n=De.get(e);return n||De.set(e,n={docs:new Map,views:new Map,wanted:new Set,prelude:null,rebuild:!1}),n}function zn(e,n){let t=Qe(e);if(!t.rebuild&&t.prelude?.files.every(r=>n.get(r.key)===r.text))return e.reset_keep(),t.prelude;e.reset(),t.docs.clear(),t.views.clear();for(let r of t.wanted){let s=Yn(e,r,Hn(e,r,t.docs));t.views.set(r,e.abi_resident_view(s.doc,s.at))}return t.prelude=Gn(e,n),e.seal(),t.rebuild=!1,t.prelude}function Gn(e,n){let t=[],r=new Map,s=n.get("std:Prelude");if(typeof s!="string")return{files:t,byKey:r};X(e,t,r,"std:Prelude",s,P.prelude);for(let f=0;f<e.import_count();f++){let d=V(e.src,e.import_path_start(f),e.import_path_end(f)),l=n.get(d);!Ye.test(d)||typeof l!="string"||e.import_bind(f,r.get(d)??X(e,t,r,d,l,P.prelude))}let a=n.get("std:JsonRuntime");if(typeof a=="string"&&e.json_runtime_room){let f=D.encode(a),d=e.json_runtime_room(f.length);new Uint8Array(e.src.buffer).set(f,d)}return{files:t,byKey:r}}function en(e,n){let t=e.abi_room(n.length);return new Uint8Array(e.src.buffer).set(n,t),t}var Le=new WeakMap;function Kn(e){let n=Le.get(e);if(!n){let{prefix:t,moduleSpecifier:r,exports:s,names:a,mutableGlobals:f,exportAssignment:d}=e;n={document:Xe(e.types),view:D.encode(JSON.stringify({prefix:t,moduleSpecifier:r,exports:s,names:a,mutableGlobals:f,exportAssignment:d}))},Le.set(e,n)}return n}function Hn(e,n,t){if(!t.has(n.document)){let{bytes:r,offsets:s}=n.document,a=en(e,r);e.abi_offsets_room(s.length),new Int32Array(e.abi_offsets.buffer,0,s.length).set(s),t.set(n.document,e.abi_doc_at(a,s.length))}return t.get(n.document)}function Yn(e,n,t){return{doc:t,at:en(e,n.view)}}async function Zn(e,n,{stdlib:t,resolvePackage:r},s){let a=Qe(e),f=[],d=!1;for(let{i:l,raw:u,from:m,abiFile:i,name:o}of n){let h;try{let w=i?Xn(await s(i)):/^"?(npm|node):/.test(u)?await r(JSON.parse(u),{prefix:o,from:m}):await t.get(u)();h=w.document?w:Kn(w.abi??w)}catch{continue}a.views.has(h)||(a.wanted.add(h),a.rebuild=!0,d=!0),f.push([l,h])}if(d)return!1;for(let[l,u]of f)e.abi_bind(l,a.views.get(u));return!0}var ue=new Map;function Xn(e){let n=typeof e=="string"?e:ee.decode(e);ue.has(n)||ue.set(n,Je(n));let t=ue.get(n);if(!t)throw new Error("Invalid declaration ABI");return t}async function Qn(e,n,t,{resolvePath:r=rn,readBinaryFile:s}){for(let a=0;a<e.embed_files();a++){let f=V(e.src,e.embed_path_start(a),e.embed_path_end(a)),d=e.embed_file?t[e.embed_file(a)]?.key??n:n,l;try{l=await s(r(d,f))}catch{e.embed_fail(a);continue}let u=e.embed_set(a,l.length);new Uint8Array(e.embed_bytes.buffer).set(l,u)}}async function nn(e,n,t={}){let r=e.comptime_mems();for(let s=0;s<=r;s++){let a=[];for(let i=0;i<r;i++)(e.comptime_waiting?e.comptime_waiting(i):s===0)&&a.push(i);if(a.length===0)break;let f=e.compile_program(le.comptime);if(f<0)return-1;let d=a.filter(i=>!e.comptime_can_run||e.comptime_can_run(i));if(d.length===0){for(let i of a)e.comptime_cycle(i);break}let{wasm:l,spec:u}=he(e,f),{exports:m}=await ye(l,u,t);for(let i of d){let o=e.comptime_name(i),h;try{h=await m[`__comptime_run_${o}`]()}catch(c){e.comptime_fail(i,m.__comptime_fuel?.value===0?8:nt(c));continue}let w=new Uint8Array(m[`__comptime_${o}`].buffer,0,h*e.comptime_value_size(i)).slice(),y=e.comptime_set(i,h);new Uint8Array(e.comptime_bytes.buffer).set(w,y)}}return et(e,e.compile_program(n))}async function et(e,n){if(n<0||!e.user_ir_count?.())return n;try{return await WebAssembly.compile(new Uint8Array(e.out.buffer,0,n).slice(),Ge),n}catch(t){if(!(t instanceof WebAssembly.CompileError))throw t;let r=D.encode(String(t.message).replace(/^WebAssembly\.\w+(\(\): | doesn't validate: )/,"")),s=e.ir_invalid_room(r.length);return new Uint8Array(e.src.buffer).set(r,s),e.ir_invalid_report(s,r.length),-1}}function nt(e){let n=String(e?.message??e);return!(e instanceof WebAssembly.RuntimeError)&&!/call stack|recursion/i.test(n)?7:/out of bounds/i.test(n)?1:/unreachable/i.test(n)?2:/divi.*zero|by zero/i.test(n)?3:/overflow/i.test(n)&&!/stack/i.test(n)?4:/null/i.test(n)?5:/call stack|recursion|stack/i.test(n)?6:0}function he(e,n){let t=new Uint8Array(e.out.buffer,0,n).slice(),r=e.host_json_size(),s=r?JSON.parse(V(e.host_json,0,r)):{};return{wasm:t,spec:s}}function tn(e,n){let t=[],r=new Set;for(let s=0;s<e.diagnostic_count();s++){let a=e.diagnostic_file(s),f=`${a}\0${e.diagnostic_start(s)}\0${e.diagnostic_end(s)}\0${e.diagnostic_message(s)}`;if(r.has(f))continue;r.add(f);let d=a>=0?n[a]:null,l={kind:e.diagnostic_kind(s),message:e.diagnostic_message(s),severity:"error",file:d?.key??null};if(d&&Object.assign(l,Q(d,e.diagnostic_start(s),e.diagnostic_end(s))),e.diagnostic_code){l.code=e.diagnostic_code(s).replace(/(?<=[a-z0-9])(?=[A-Z])/g,"-").toLowerCase();for(let u=0;u<e.diagnostic_extras(s);u++){let m=st[e.diagnostic_extra_kind(s,u)],i=e.diagnostic_extra_text(s,u);if(m==="note")(l.notes??=[]).push(i);else if(m==="label"){l.label=i;let o=e.diagnostic_extra_start(s,u),h=e.diagnostic_extra_end(s,u);d&&(o!==e.diagnostic_start(s)||h!==e.diagnostic_end(s))&&(l.focus=Q(d,o,h))}else{let o=n[e.diagnostic_extra_file(s,u)];if(!o)continue;let h={file:o.key,...Q(o,e.diagnostic_extra_start(s,u),e.diagnostic_extra_end(s,u))};m==="fix"?l.fix={...h,text:i,label:e.diagnostic_extra_label(s,u)}:(l.related??=[]).push({...h,role:m,label:i})}}}e.diagnostic_default_label&&l.label==null&&l.file&&(l.label=e.diagnostic_default_label(s)),t.push(l)}return t}var tt=(async()=>{}).constructor;function rt(e,n){if(!e.dsl_count)return[];let t=n.toSorted((a,f)=>a.offset-f.offset),r=a=>t.findLast(f=>f.offset<=a&&a<=f.offset+f.bytes.length)??null,s=[];for(let a=0;a<e.dsl_count();a++){let f=e.es_body_start(a);if(f<0)continue;let{expr:d}=Y(V(e.src,f,e.es_body_end(a))),l=`return (
${d}
);`,u=null;try{new Function(l)}catch(i){if(!(i instanceof SyntaxError))continue;try{new tt(l)}catch(o){o instanceof SyntaxError&&!/import\.meta/.test(o.message)&&(u=o)}}let m=u&&r(e.dsl_site_start(a));m&&s.push({kind:"es-syntax",code:"es-syntax",message:`@es body is not JavaScript: ${u.message}`,severity:"error",file:m.key,...Q(m,e.dsl_site_start(a),e.dsl_site_end(a)),label:"here"})}return s}function it(e){let n=e.filter(r=>!/^(std|node|npm):/.test(r.key));return[...n.flatMap(r=>Ve(r.text,r.key)),...qe(n.map(r=>[r.key,r.text]))].map(({kind:r,message:s,primary:a})=>({kind:r,message:s,severity:"warning",file:a.file,start:a.start,end:a.end,line:a.row,column:a.col}))}var st=["label","expected","found","related","note","fix"];function Q(e,n,t){let{units:r,lines:s}=at(e),a=i=>r[Math.min(Math.max(0,i-e.offset),r.length-1)],f=a(n),d=a(t),l=0,u=s.length-1;for(;l<u;){let i=l+u+1>>1;s[i]<=f?l=i:u=i-1}let m=1;for(let i=s[l];i<f;i++){let o=e.text.charCodeAt(i);(o<56320||o>57343)&&m++}return{start:f,end:d,line:l+1,column:m}}var ze=new WeakMap;function at(e){let n=ze.get(e);if(!n){let{bytes:t,text:r}=e,s=new Uint32Array(t.length+1),a=0;for(let d=0;d<t.length;d++){s[d]=a;let l=t[d];(l&192)!==128&&(a+=l>=240?2:1)}s[t.length]=a;let f=[0];for(let d=0;d<r.length;d++){let l=r.charCodeAt(d);(l===10||l===13&&r.charCodeAt(d+1)!==10)&&f.push(d+1)}n={units:s,lines:f},ze.set(e,n)}return n}async function ye(e,n={},{loadGlue:t=null,profiler:r=null,wrap:s=null}={}){let a=e instanceof WebAssembly.Module?e:await WebAssembly.compile(e,Ge),f=n.es??{},d=Z(f),l=d?t?Be(f,await t(d)):Ce(f):{};r&&(l.profile=r.imports),n.closures&&(l.utu=Me(n.closures,l.utu??{})),n.mems&&(l.utu=Fe(n.mems,l.utu??{})),n.promises&&(l.utu=Ae(n.promises,l.utu??{}),l.utu=$e(n.promises,l.utu)),WebAssembly.Module.imports(a).some(i=>i.module==="utu"&&i.name==="js_tag")&&(l.utu=Ee(l.utu??{})),s?.(l);let u=await WebAssembly.instantiate(a,l),m=Re(We(u,n.promises),n.exports,n.promises?.asyncExports);return{module:a,instance:u,exports:r?r.attach(u,m):m}}function rn(e,n){if(/^[a-z]+:\/\//i.test(e))return new URL(n,e).href;let t=e.split("/").slice(0,-1);for(let r of n.split("/"))r===".."?t.pop():r!=="."&&t.push(r);return t.join("/")}var ot=/[0-9A-Za-z!#$%&'*+\-./:<=>?@\\^_`|~]/,lt=new Set(["export","mod","struct","tag","enum","proto","fn","type","distinct","let","const","mem","vec","using"]);function be(e,n){let t=(b,g)=>new g(b.buffer),r=t(e.node_first,Int32Array),s=t(e.node_last,Int32Array),a=t(e.tok_start,Int32Array),f=t(e.tok_end,Int32Array),d=t(e.tok_kind,Uint8Array),l=t(e.node_decl,Int32Array),u=t(e.decl_node,Int32Array),m=t(e.decl_owner,Int32Array),i=e.node_count(),o=new Map,h=b=>{for(let g=n.length-1;g>=0;g--)if(n[g].offset<=b)return b<n[g].offset+n[g].bytes.length?n[g]:null;return null},w=(b,g)=>{let p=o.get(b);if(!p){p=new Int32Array(b.bytes.length+1);let x=0;for(let I=0;I<b.bytes.length;){let S=b.bytes[I],E=S<128?1:S<224?2:S<240?3:4;for(let N=0;N<E;N++)p[I+N]=x;I+=E,x+=E===4?2:1}p[b.bytes.length]=x,o.set(b,p)}return p[g-b.offset]},y=new Array(i),c=b=>{if(b>=0&&b<i&&y[b]!==void 0)return y[b];let g=a[r[b]],p=h(g),x=p?{file:p.key,start:w(p,g),end:w(p,f[s[b]-1])}:null;return b>=0&&b<i&&(y[b]=x),x},_=null,v=b=>{if(!_){_=new Map;for(let g=0;g<i;g++){if(r[g]>=s[g])continue;let p=c(g);p&&(_.has(p.file)||_.set(p.file,[]),_.get(p.file).push(g))}}return _.get(b)??[]},k=null,R=b=>{if(!k){k=new Map;for(let g=0;g<i;g++)M(g)&&(k.has(l[g])||k.set(l[g],[]),k.get(l[g]).push(g))}return k.get(b)??[]},A=null,T=()=>{if(A)return A;A=new Int32Array(e.decl_count()).fill(-1);for(let b=0;b<i;b++){let g=l[b];if(g<0||g>=A.length||!M(b)||u[g]<0)continue;let p=a[r[b]];if(p<a[r[u[g]]]||p>=f[s[u[g]]-1])continue;let x=A[g];(x<0||p<a[r[x]])&&(A[g]=b)}return A},M=b=>l[b]>=0&&r[b]<s[b]&&s[b]-r[b]===1,F=null,O=()=>{if(F)return F;F=new Map;let b=new Uint8Array(e.src.buffer);for(let g=0,p=e.wat_count?.()??0;g<p;g++){let x=e.wat_function(g),I=-1;for(let $=0,C=e.decl_count();$<C&&I<0;$++)u[$]===x&&(I=$);let S=new Map;for(let $=0,C=e.decl_count();$<C;$++){if(m[$]!==I||e.decl_kind_name($)!=="Param")continue;let W=c(T()[$]>=0?T()[$]:u[$]);W&&S.set(n.find(U=>U.key===W.file)?.text.slice(W.start,W.end),$)}let E=e.wat_text_start(g),N=e.wat_text_end(g),q=h(E);if(!(!q||!S.size))for(let $=E;$<N;$++){let C=b[$];if(C===59&&b[$+1]===59){for(;$<N&&b[$]!==10;)$++;continue}if(C===40&&b[$+1]===59){let de=0;for(;$<N;$++)if(b[$]===40&&b[$+1]===59)de++,$++;else if(b[$]===59&&b[$+1]===41&&(de--,$++,!de))break;continue}if(C!==36)continue;let W=$+1;for(;W<N&&ot.test(String.fromCharCode(b[W]));)W++;let U=S.get(new TextDecoder().decode(b.subarray($+1,W)));U!==void 0&&(F.has(U)||F.set(U,[]),F.get(U).push({file:q.key,start:w(q,$+1),end:w(q,W)})),$=W-1}}return F},ie=new TextDecoder,z=b=>{for(let g=r[b];g<s[b];g++){if(d[g]===9)continue;let p=h(a[g]);if(!p)return null;let x=ie.decode(p.bytes.subarray(a[g]-p.offset,f[g]-p.offset));if(!lt.has(x))return x!=="&"&&!/^[A-Za-z_]\w*$/.test(x)?null:{file:p.key,start:w(p,a[g]),end:w(p,f[g])}}return null},se=t(e.node_kind,Uint8Array),xe=(b,g)=>{if(b<0||g<b)return null;let p=h(b);return p&&g<=p.offset+p.bytes.length?{file:p.key,start:w(p,b),end:w(p,g)}:null},J=(b,g,p)=>b?.file===g&&b.start<=p&&p<=b.end,ae=(b,g,p=!1)=>{let x=-1,I=1/0;for(let S of v(b)){let E=c(S);if(!J(E,b,g))continue;let N=E.end-E.start;N<I&&!(p&&!e.node_type(S))&&(x=S,I=N)}return x},G,B=()=>G??=(()=>{let b=[];for(let g=0;g<(e.edge_count?.()??0);g++){let p=e.edge_from_decl(g),x=xe(e.edge_site_start(g),e.edge_site_end(g)),I=p>=0&&u[p]>=0?c(u[p]):null;x&&I&&!(x.file===I.file&&I.start<=x.start&&x.end<=I.end)&&(x=null),b.push({from:p,to:e.edge_to_decl(g),site:x})}return b})(),_n,ve=()=>_n??=(()=>{let b=[];for(let g=0;g<(e.coercion_count?.()??0);g++){let p=e.coercion_node(g);p<0||p>=i||r[p]>=s[p]||b.push({node:p,at:c(p),from:e.coercion_from_text(g),to:e.coercion_to_text(g),kind:e.coercion_kind(g)})}return b})(),wn,xn=()=>wn??=(()=>{let b=new Map;for(let g of B())b.has(g.from)||b.set(g.from,[]),b.get(g.from).push(g);return b})(),fe=new Map,H=b=>{if(fe.has(b))return fe.get(b);let g=new Set,p=S=>{if(S<0||g.has(S))return 0;g.add(S);let E=e.decl_effects?.(S)??0;for(let N of xn().get(S)??[])E|=p(N.to);return E},x=p(b),I={mask:x,labels:["await","host","throws","traps"].filter((S,E)=>x&1<<E)};return fe.set(b,I),I},ce=(b,g)=>{if(g<0||g>=e.decl_count())return null;let p=b.span(g),x=b.definition(g);return!p||!x?null:{decl:g,name:b.text(x),kind:b.kind(g),span:p,selection:x,effects:H(g)}};return{at:c,declarationAt(b,g){for(let p of v(b)){if(!M(p))continue;let x=c(p);if(x&&x.file===b&&x.start<=g&&g<=x.end)return l[p]}for(let[p,x]of O())if(x.some(I=>I.file===b&&I.start-1<=g&&g<=I.end))return p;return-1},definition(b){let g=u[b];if(g<0)return null;let p=T()[b];return p>=0?c(p):z(g)??c(g)},references(b,{includeDeclaration:g=!0}={}){let p=this.definition(b),x=[];for(let I of R(b)){let S=c(I);if(!S)continue;let E=p&&S.file===p.file&&S.start===p.start;E&&!g||(E?x.unshift(S):x.push(S))}return[...x,...O().get(b)??[]]},span(b){return u[b]>=0?c(u[b]):null},kind(b){return e.decl_kind_name(b)},owner(b){return m[b]},type(b){return e.decl_checked_type(b)},typeDeclaration(b){return e.decl_checked_type_decl(b)},typeDeclarationOfExpressionBefore(b,g,p=!1){let x=[];for(let I of v(b)){let S=c(I);S&&S.file===b&&S.end===g&&x.push([S.start,I])}x.sort((I,S)=>I[0]-S[0]);for(let[,I]of x){let S=e.node_type_decl(I,p?1:0);if(S>=0)return S}return-1},declarations(b=null){let g=[];for(let p=0,x=e.decl_count();p<x;p++){if(u[p]<0)continue;let I=c(u[p]);I&&(b==null||I.file===b)&&g.push({decl:p,kind:e.decl_kind_name(p),owner:m[p],span:I})}return g},names(b){let g=[];for(let p of b==null?Array.from({length:i},(x,I)=>I):v(b)){if(!M(p))continue;let x=c(p);x&&(b==null||x.file===b)&&g.push({decl:l[p],at:x})}for(let[p,x]of O())for(let I of x)(b==null||I.file===b)&&g.push({decl:p,at:I});return g.sort((p,x)=>p.at.file<x.at.file?-1:p.at.file>x.at.file?1:p.at.start-x.at.start),g.filter((p,x)=>x===0||p.at.start!==g[x-1].at.start||p.at.file!==g[x-1].at.file)},explainAt(b,g){let p=ae(b,g,!0);if(p<0)return null;let x=c(p),I=ae(b,g),S=I>=0?l[I]:-1,N=B().filter(W=>W.site&&J(W.site,b,g)).sort((W,U)=>W.site.end-W.site.start-(U.site.end-U.site.start))[0]?.to??-1,q=e.node_field_owner?.(p)??-1,$=[];for(let W=0,U=e.closure_capture_count?.(p)??0;W<U;W++)$.push(e.closure_capture_decl(p,W));let C=[];if(S>=0){let W=this.definition(S);C.push({kind:"binding",decl:S,at:W,type:this.type(S)})}return N>=0&&C.push({kind:"call result",decl:N,at:this.definition(N)}),{node:p,at:x,kind:e.node_kind_name(se[p]),type:e.node_type(p),expectedType:e.node_expected_type?.(p)||"",declaration:S,callTarget:N,field:q>=0?{owner:q,index:e.node_field_index(p)}:null,conversions:ve().filter(W=>W.node===p||J(W.at,b,g)),captures:$,effects:S>=0?H(S):N>=0?H(N):{mask:0,labels:[]},wasmType:e.node_wasm_type?.(p)||"",trace:C}},typeTrace(b,g){return this.explainAt(b,g)?.trace??[]},inlayHints(b){let g=[];for(let p=0;p<e.decl_count();p++){if(e.decl_kind_name(p)!=="Local")continue;let x=this.definition(p),I=this.span(p),S=this.type(p);if(!x||!I||x.file!==b||!S)continue;let E=this.text({file:b,start:x.end,end:I.end});/^\s*:/.test(E)||g.push({position:x.end,label:`: ${S}`,kind:"type",at:x})}for(let p of v(b)){if(e.node_kind_name(se[p])!=="closure_expr")continue;let x=c(p);if(x?.file!==b)continue;let I=[];for(let S=0,E=e.closure_capture_count(p);S<E;S++){let N=e.closure_capture_decl(p,S),q=this.definition(N);q&&I.push(this.text(q))}I.length&&g.push({position:x.end,label:` captures ${I.join(", ")}`,kind:"capture",at:x})}for(let p of ve())p.at?.file===b&&g.push({position:p.at.end,label:` \u2192 ${p.to}`,kind:"conversion",at:p.at});for(let p=0;p<e.decl_count();p++){if(u[p]<0||!["Fn","Main"].includes(this.kind(p)))continue;let x=this.definition(p);if(x?.file!==b)continue;let I=H(p);I.mask&&g.push({position:x.end,label:` !${I.labels.join(", ")}`,kind:"effect",at:x})}return g.sort((p,x)=>p.position-x.position)},effects(b){return H(b)},prepareCallHierarchy(b,g){let p=this.declarationAt(b,g);p<0&&(p=this.declarations(b).find(I=>J(this.definition(I.decl),b,g))?.decl??-1);let x=ce(this,p);return x&&["Fn","Main","ProtoMember"].includes(x.kind)?[x]:[]},incomingCalls(b){let g=new Map;for(let p of B())p.to===b&&p.from>=0&&(g.has(p.from)||g.set(p.from,[]),p.site&&g.get(p.from).push(p.site));return[...g].flatMap(([p,x])=>{let I=ce(this,p);return I?[{from:I,sites:x}]:[]})},outgoingCalls(b){let g=new Map;for(let p of B())p.from===b&&p.to>=0&&(g.has(p.to)||g.set(p.to,[]),p.site&&g.get(p.to).push(p.site));return[...g].flatMap(([p,x])=>{let I=ce(this,p);return I?[{to:I,sites:x}]:[]})},tokenAt(b,g){let p=n.findIndex(x=>x.key===b);if(p<0)return null;for(let x=e.file_first_token(p),I=e.file_end_token(p);x<I;x++){let S=w(n[p],a[x]);if(S>=g)return null;let E=w(n[p],f[x]);if(g<E||g===E&&d[x]===9)return{kind:d[x],start:S,end:E}}return null},text(b){let g=n.find(p=>p.key===b.file);return g?g.text.slice(b.start,b.end):""}}}function ft(e,n){let t=new Map,r,s=d=>(t.has(d)||t.set(d,(async()=>{let[l,u]=await Promise.all([n(`${d}.types.json`),n(`${d}.offsets`)]);return{bytes:l,offsets:ct(u)}})()),t.get(d)),a=new Map(e),f=new Map;for(let d of["std:Browser","std:JS","std:Web","std:Worker"])typeof e.get(d)=="function"&&a.set(d,()=>(f.has(d)||f.set(d,(async()=>{r??=JSON.parse(new TextDecoder().decode(await n("catalog.json")));let{document:l,view:u}=r[d],[m,i]=await Promise.all([s(l),n(`${u}.view.json`)]);return{document:m,view:i}})()),f.get(d)));return a}function ct(e){let n=new DataView(e.buffer,e.byteOffset,e.byteLength),t=new Int32Array(e.byteLength/4);for(let r=0;r<t.length;r++)t[r]=n.getInt32(r*4,!0);return t}function dt(e){let n=0;for(let t of e){let r=t.codePointAt(0);if(t==="	")n+=4;else{if(r>=768&&r<=879||r>=8203&&r<=8207||r>=65024&&r<=65039)continue;r>=4352&&r<=4447||r>=11904&&r<=42191||r>=44032&&r<=55203||r>=63744&&r<=64255||r>=65072&&r<=65103||r>=65280&&r<=65376||r>=65504&&r<=65510||r>=127744&&r<=128591||r>=129280&&r<=129535||r>=131072&&r<=262141?n+=2:n+=1}}return n}var sn={dark:{bg:[18,20,26],fg:[215,218,224],dim:[118,124,138],rail:[62,67,80],error:[255,107,107],warning:[245,185,66],trap:[199,146,234],expected:[108,182,255],found:[240,166,74],related:[154,163,178],add:[95,211,141],del:[255,123,123],keyword:[179,157,243],string:[158,206,106],number:[232,169,106],type:[125,207,255],function:[130,170,255],comment:[100,108,122],dsl:[158,206,106]},light:{bg:[253,252,249],fg:[43,46,54],dim:[128,133,144],rail:[200,196,186],error:[214,58,58],warning:[183,121,31],trap:[142,68,173],expected:[31,111,209],found:[184,98,11],related:[107,114,128],add:[31,138,76],del:[192,57,43],keyword:[124,77,204],string:[77,124,15],number:[180,83,9],type:[14,116,144],function:[37,99,235],comment:[156,163,175],dsl:[77,124,15]}};function ut(e=globalThis.process?.env??{}){if(e.UTU_THEME==="light"||e.UTU_THEME==="dark")return e.UTU_THEME;let n=Number(e.COLORFGBG?.split(";").pop());return n===7||n===15?"light":"dark"}function mt(e=globalThis.process?.env??{}){return/truecolor|24bit/i.test(e.COLORTERM??"")||["iTerm.app","WezTerm","vscode","ghostty","kitty"].includes(e.TERM_PROGRAM)}function pt([e,n,t]){let r=i=>i<48?0:i<115?1:Math.min(5,Math.floor((i-35)/40)),s=16+36*r(e)+6*r(n)+r(t),a=i=>i===0?0:55+i*40,f=(a(r(e))-e)**2+(a(r(n))-n)**2+(a(r(t))-t)**2,d=Math.round(((e+n+t)/3-8)/10),l=232+Math.max(0,Math.min(23,d)),u=8+10*(l-232);return(u-e)**2+(u-n)**2+(u-t)**2<f?l:s}function ht({color:e=!1,theme:n=ut(),truecolor:t=mt()}={}){let r=sn[n]??sn.dark,s=(d,l)=>t?`\x1B[${d};2;${l.join(";")}m`:`\x1B[${d};5;${pt(l)}m`,a=(d,l)=>d.map((u,m)=>Math.round(r.bg[m]+(u-r.bg[m])*l)),f=!!e;return{on:f,palette:r,fg:d=>f?s(38,d):"",bg:d=>f?s(48,d):"",tint:(d,l)=>f?s(48,a(d,l)):"",bold:f?"\x1B[1m":"",italic:f?"\x1B[3m":"",strike:f?"\x1B[9m":"",reset:f?"\x1B[0m":"",paint(d,l){return f?`${s(38,d)}${l}\x1B[0m`:l}}}function yt(e,n,t,r){let s=n.toUpperCase(),a=e.palette[n]??e.palette.error,d=[`${e.on?`${e.bg(a)}${e.fg(e.palette.bg)}${e.bold} ${s} ${e.reset}`:` ${s} `} ${e.bold}${t}${e.reset}`];return r&&d.push(`${" ".repeat(s.length+3)}${e.paint(e.palette.dim,r)}`),d}function bt(e,n){return(n??[]).map(t=>`  ${e.paint(e.palette.dim,"note")}  ${t}`)}var gt={primary:.32,expected:.24,found:.24,related:.2};function _t(e,n,{color:t=!1,relative:r=d=>d,highlight:s=null,theme:a,truecolor:f}={}){let d=ht({color:t,theme:a,truecolor:f}),l=new Map;return e.map(u=>wt(u,n,d,r,s,l)).join(`

`)}function an(e,n){let t=n.get(e);if(!t){t=[0];for(let r of e.matchAll(/\r\n?|\n/g))t.push(r.index+r[0].length);n.set(e,t)}return t}function ge(e,n){let t=0,r=e.length-1;for(;t<r;){let s=t+r+1>>1;e[s]<=n?t=s:r=s-1}return t}function wt(e,n,t,r,s,a){let f=e.severity??"error",d=t.palette[f]??t.palette.error,l=e.code??e.kind??"",u=e.focus??e,m=e.file!=null?`${r(e.file)}${u.line!=null?`:${u.line}:${u.column}`:""}`:"",i=yt(t,f,e.message,[l,m].filter(Boolean).join(" \xB7 ")),o=[];e.file!=null&&e.start!=null&&n.get(e.file)!=null&&o.push({file:e.file,start:e.focus?.start??e.start,end:e.focus?.end??e.end,role:"primary",label:e.label});for(let _ of e.related??[])n.get(_.file)!=null&&o.push({file:_.file,start:_.start,end:_.end,role:_.role,label:_.label});let w=[...new Set(o.map(_=>_.file))].map(_=>xt(n.get(_),an(n.get(_),a),_,o.filter(v=>v.file===_),e.file===_)),y=Math.max(2,...w.flatMap(_=>_.rows.filter(v=>v.line!=null).map(v=>String(v.line+1).length))),c=_=>`${t.paint(t.palette.dim,String(_??"").padStart(y))} ${t.paint(t.palette.rail,"\u2502")} `;for(let _ of w){i.push(""),_.file!==e.file&&i.push(`${" ".repeat(y)} ${t.paint(t.palette.rail,"\u256D\u2500")} ${t.paint(t.palette.dim,r(_.file))}`);for(let v of _.rows){if(v.gap){i.push(`${" ".repeat(y)} ${t.paint(t.palette.rail,"\u2506")}`);continue}i.push(c(v.line+1)+vt(v,_,t,d,s));for(let k of kt(v,t,d))i.push(c()+k)}}return e.notes?.length&&i.push("",...bt(t,e.notes)),e.fix&&n.get(e.fix.file??e.file)!=null&&i.push("",...It(e.fix,n.get(e.fix.file??e.file),a,t,c,y)),i.join(`
`)}function xt(e,n,t,r,s){let a=m=>e.slice(n[m],n[m+1]??e.length).replace(/\r?\n?$/,""),f=new Set;for(let m of r){m.first=ge(n,m.start),m.last=Math.max(m.first,ge(n,Math.max(m.start,m.end-1)));for(let i=m.first;i<=m.last;i++)(m.last-m.first+1<=6||i<m.first+2||i>m.last-2)&&f.add(i)}let d=r.find(m=>m.role==="primary");if(d&&s){for(let m=Math.max(0,d.first-2);m<=Math.min(n.length-1,d.last+2);m++)f.add(m);for(;f.size>1&&!a(Math.max(...f)).trim()&&Math.max(...f)>d.last;)f.delete(Math.max(...f))}let l=[],u=null;for(let m of[...f].sort((i,o)=>i-o)){u!=null&&m>u+1&&l.push({gap:!0}),u=m;let i=a(m),o=r.filter(h=>h.first<=m&&m<=h.last).map(h=>{let w=m===h.first?h.start-n[m]:i.length-i.trimStart().length,y=m===h.last?Math.min(i.length,Math.max(w+1,h.end-n[m])):i.length;return{mark:h,from:w,to:Math.max(y,w+(i.length>w?1:0)),drawn:m===h.first}});if(i.length>240){let h=Math.min(i.length,...o.map(k=>k.from)),w=Math.min(Math.max(h+1,...o.map(k=>k.to)),h+240),y=Math.max(0,h-80),c=Math.min(i.length,w+80),_=y>0?"\u2026":"",v=k=>Math.min(Math.max(k,y),c)-y+_.length;l.push({line:m,raw:_+i.slice(y,c)+(c<i.length?"\u2026":""),offset:n[m]+y-_.length,marks:o.map(k=>({...k,from:v(k.from),to:Math.max(v(k.to),v(k.from)+1)}))});continue}l.push({line:m,raw:i,offset:n[m],marks:o})}return{file:t,rows:l}}function vt(e,n,t,r,s){let a=e.raw,f=o=>o.replace(/\t/g,"    ");if(!t.on)return f(a);let d=s?s(n.file,e.offset,e.offset+a.length):[],l=new Array(a.length).fill(null);for(let{mark:o,from:h,to:w}of e.marks)for(let y=h;y<w&&y<a.length;y++)l[y]=o.role;let u=new Array(a.length).fill(null);for(let o of d)for(let h=Math.max(0,o.start-e.offset);h<Math.min(a.length,o.end-e.offset);h++)u[h]=o.class;let m="",i=0;for(;i<a.length;){let o=i+1;for(;o<a.length&&l[o]===l[i]&&u[o]===u[i];)o++;let h=l[i],w=u[i],y=t.palette[w]??t.palette.fg,c=(h?t.tint(h==="primary"?r:t.palette[h],gt[h]):"")+(h==="primary"?t.bold:"")+(w==="comment"||w==="parameter"?t.italic:"")+t.fg(w==="comment"?t.palette.comment:y);m+=`${c}${f(a.slice(i,o))}${t.reset}`,i=o}return m}function kt(e,n,t){let r=e.marks.filter(l=>l.drawn).sort((l,u)=>l.from-u.from);if(!r.length)return[];let s=l=>dt(e.raw.slice(0,l)),a=l=>l.mark.role==="primary"?t:n.palette[l.mark.role],f=[];if(!n.on){let l="",u=0;for(let m of r){let i=s(m.from),o=Math.max(i+1,s(m.to));i<u||(l+=" ".repeat(i-u)+(m.mark.role==="primary"?"\u2501":"\u2500").repeat(o-i),u=o)}f.push(l)}let d=r.filter(l=>l.mark.label);for(let l=d.length-1;l>=0;l--){let u="",m=0;for(let o=0;o<l;o++){let h=s(d[o].from);u+=" ".repeat(Math.max(0,h-m))+n.paint(a(d[o]),"\u2502"),m=h+1}let i=s(d[l].from);u+=" ".repeat(Math.max(0,i-m))+n.paint(a(d[l]),"\u2570\u2500")+" "+d[l].mark.label,f.push(u)}return f}function It(e,n,t,r,s){let a=n.slice(0,e.start),f=Math.max(a.lastIndexOf(`
`),a.lastIndexOf("\r"))+1,d=n.slice(e.end).search(/[\r\n]/),l=d<0?n.length:e.end+d,u=n.slice(f,e.start),m=n.slice(e.end,l),i=u.length>240?"\u2026"+u.slice(-80):u,o=m.length>240?m.slice(0,80)+"\u2026":m,h=i+n.slice(e.start,e.end)+o,w=i+e.text+o,y=ge(an(n,t),f)+(n[f-1]==="\r"&&n[f]===`
`?2:1),c=[`  ${r.paint(r.palette.add,`${r.bold}fix`)}   ${e.label??""}`];return r.on?(St(h,w).map(k=>k.k==="="?r.paint(r.palette.fg,k.t):k.k==="+"?`${r.tint(r.palette.add,.28)}${r.fg(r.palette.add)}${k.t}${r.reset}`:`${r.fg(r.palette.del)}${r.strike}${k.t}${r.reset}`).join("").split(/\r\n?|\n/).forEach((k,R)=>c.push(s(y+R)+k)),c):(w.split(/\r\n?|\n/).forEach((k,R)=>c.push(s(y+R)+k)),c)}function St(e,n){let t=o=>o.match(/[A-Za-z0-9_]+|\s+|./gs)??[],r=t(e),s=t(n),a=r.length,f=s.length,d=Array.from({length:a+1},()=>new Uint16Array(f+1));for(let o=a-1;o>=0;o--)for(let h=f-1;h>=0;h--)d[o][h]=r[o]===s[h]?d[o+1][h+1]+1:Math.max(d[o+1][h],d[o][h+1]);let l=[],u=(o,h)=>{let w=l[l.length-1];w?.k===o?w.t+=h:l.push({k:o,t:h})},m=0,i=0;for(;m<a&&i<f;)r[m]===s[i]?(u("=",r[m]),m++,i++):d[m+1][i]>=d[m][i+1]?u("-",r[m++]):u("+",s[i++]);for(;m<a;)u("-",r[m++]);for(;i<f;)u("+",s[i++]);return l}function At(e,n=null){if(!n)return Z(e.es??{});let{firsts:t}=ln(e,on(n));return Z(e.es??{},new Set(t.values()))}var on=e=>WebAssembly.Module.imports(new WebAssembly.Module(e,Mt));function ln(e,n){let t=new Set(n.filter(a=>a.module==="es").map(a=>a.name)),r=Object.entries(Object.assign({},...Object.values(e.es??{}))).filter(([a])=>t.has(a)),s=new Map;for(let[a,f]of r)s.has(f)||s.set(f,a);return{fields:r,firsts:s}}function Tt(e,n,{runtime:t,glue:r,wasm:s,streaming:a=!1}){let f=on(n),d=new Set,l=A=>(d.add(A),A),u=[],m=[],{fields:i,firsts:o}=ln(e,f);if(r&&i.length){let A=!1,T=i.map(([,F])=>{let O=K(o.get(F));return jt(Y(F).expr)?O:(A=!0,`$utuValue(${O})`)});u.push(`import { ${[...o.values()].map(K).join(", ")} } from ${JSON.stringify(r)};`),A&&u.push("const $utuValue = value => typeof value === 'function' ? value : () => value;");let M=i.every(([F],O)=>F===String(O));m.push(`es: ${M?`[${T.join(", ")}]`:`{ ${i.map(([F],O)=>`${F}: ${T[O]}`).join(", ")} }`}`)}let h=[];for(let{module:A,name:T}of f)A==="utu"&&(T==="closure_new"?h.push(e.closures?.sigs?`closure_new:(a,b,c,d)=>${l("closureNew")}(a,b,c,d,${JSON.stringify(e.closures.sigs)})`:`closure_new: ${l("closureNew")}`):T==="closure_rec"?h.push(`closure_rec: ${l("closureRec")}`):T.startsWith("closure_call_")?h.push(`${T}: ${l("closureApply")}`):T==="promise_then"?h.push(`promise_then: ${l("promiseThen")}`):T==="promise_catch"?h.push(`promise_catch: ${l("promiseCatch")}`):T.startsWith("await_")?h.push(`${T}: ${l("awaitImport")}(${T.startsWith("await_null_")?"true":""})`):T==="js_tag"&&h.push("js_tag:WebAssembly.JSTag"));if(h.length||e.mems){let A=`{${h.join(",")}}`;m.push(`utu: ${e.mems?`${l("memoryImports")}(${JSON.stringify(e.mems)}, ${A})`:A}`)}let w=e.promises?.asyncExports??[],y="instance.exports",c="";if(w.length&&(y=`{ ...instance.exports, ${w.map(T=>`${JSON.stringify(T)}: ${l("promising")}(instance.exports[${JSON.stringify(T)}])`).join(", ")} }`),e.exports){let A=$t(e.exports,y,w);A?(c=A.source,y=A.name):y=`${l("convertExports")}(${y}, ${JSON.stringify(e.exports)}${w.length?`, ${JSON.stringify(w)}`:""})`}d.size&&u.unshift(`import { ${[...d].join(", ")} } from ${JSON.stringify(t)};`);let _=a?"instantiateStreaming":"instantiate",v=WebAssembly.Module.imports(new WebAssembly.Module(n)).map(A=>A.module),k={};v.includes("wasm:js-string")&&(k.builtins=["js-string"]),v.includes("'")&&(k.importedStringConstants="'");let R=Object.keys(k).length?`,${JSON.stringify(k)}`:"";return u.push(`export const {instance}=await WebAssembly.${_}(${s},{${m.join(",")}}${R});`),c&&u.push(c),u.push(`export const exports=${y};`),u.join(`
`)+`
`}function $t(e,n,t=[]){let r={Bool:i=>`!!${i}`,int:i=>`Number.isInteger(${i})`,big:i=>`typeof ${i}==="bigint"`,num:i=>`typeof ${i}==="number"`,Str:i=>`typeof ${i}==="string"`,"?Str":i=>`${i}==null||typeof ${i}==="string"`,ref:i=>`${i}!=null`,cl:i=>`typeof ${i}==="function"`,"?":i=>`${i}===undefined?null:${i}`},s={int:"an integer",big:"a BigInt",num:"a number",Str:"a string","?Str":"a string or null",ref:"a value",cl:"a function"},a=(i,o)=>i==="Bool"?`${o}!==0`:i==="U32"?`${o}>>>0`:i==="U64"?`BigInt.asUintN(64,${o})`:o,f=i=>typeof i=="string",d=!1,l=!1,u=[];for(let[i,o]of Object.entries(e)){let h=typeof o=="string"?o:o.r,w=typeof o=="string"?null:o.p??null;if(!(Array.isArray(h)?h.every(f):f(h))||w?.some(M=>M!==""&&!(M in r||M.startsWith("cl:"))))return null;let y=JSON.stringify(i),c=w?w.map((M,F)=>`a${F}`):null,_=[];w?.forEach((M,F)=>{let O=c[F];if(M!=="")if(M==="Bool"||M==="?")_.push(`${O}=${r[M](O)}`);else if(M.startsWith("cl:")){d=!0;let[,ie,z]=M.split(":"),se=[...ie].map((G,B)=>`p${B}`),J=`f(${[...ie].map((G,B)=>G==="B"?`!!p${B}`:G==="U"?`p${B}>>>0`:G==="W"?`BigInt.asUintN(64,p${B})`:`p${B}`).join(",")})`,ae=z==="b"?`${J}?1:0`:z==="S"?`$utuStr(${J})`:z==="n"?`${J}??null`:J;z==="S"&&(l=!0),_.push(`${O}=typeof ${O}==="function"?(f=>(${se.join(",")})=>${ae})(${O}):$utuFail(${y},${F},"a function",${O})`)}else d=!0,_.push(`${r[M](O)}||$utuFail(${y},${F},${JSON.stringify(s[M])},${O})`),M==="?Str"&&_.push(`${O}??=null`)});let v=`$utuIn[${y}](${c?c.join(","):"...a"})`,k=M=>Array.isArray(h)?(M==="x"?"":"(v=>")+`${M==="x"?"x":"v"}.map((x,i)=>[${h.map(F=>`x=>${a(F,"x")}`).join(",")}][i](x))`+(M==="x"?"":`)(${M})`):a(h,M),R=t.includes(i)?k("x")==="x"?v:`${v}.then(x=>${k("x")})`:k(v),A=_.length?`(${[..._,R].join(",")})`:R,T=t.includes(i)&&_.length?`{try{return ${A}}catch(e){return Promise.reject(e)}}`:A;c?u.push(`${y}:(${c.join(",")})=>${T}`):u.push(`${y}:Object.defineProperty((...a)=>${T},"length",{value:$utuIn[${y}].length})`)}let m=[`const $utuIn=${n},$utuExports={...$utuIn,${u.join(",")}};`];return d&&m.unshift('const $utuFail=(name,i,what,v)=>{throw new TypeError(`${name}: argument ${i+1} must be ${what}, not ${v===null?"null":what==="an integer"&&typeof v==="number"?v:typeof v}`)};'),l&&m.unshift('const $utuStr=s=>typeof s==="string"?s:(()=>{throw new TypeError(`Wrong type from JavaScript: a Str, not ${s===null?"null":s instanceof Promise?"a Promise (await it: Promise[Str])":typeof s}`)})();'),{source:m.join(`
`),name:"$utuExports"}}function jt(e){return/^(async\s+)?(function\b|[\w$]+\s*=>|\([^()]*\)\s*=>)/.test(e)||/^\((f => \((p\d+(,p\d+)*)?\) => |v => \(\) => v\)\(|v => \(w => \(\) => w\)\()/.test(e)||e.startsWith("$utuFn(")}var Mt={builtins:["js-string"],importedStringConstants:"'"};var fn=()=>import("./browser-catalog.generated-TVPIZNWR.js");async function cn(e,n,t){let r=e[`${n}_JSON`];if(r===void 0){let a=Uint8Array.from(atob(e[`${n}_GZIP`]),d=>d.charCodeAt(0)),f=new Blob([a]).stream().pipeThrough(new DecompressionStream("gzip"));r=await new Response(f).text()}let s=JSON.parse(r);if(s.version!==1)throw new Error(`Unsupported ${t} declaration ABI version`);return s}function te(e){let n;return()=>n??=e().catch(t=>{throw n=void 0,t})}var _e=te(async()=>cn(await fn(),"BROWSER_ABI","browser")),Ft=te(async()=>cn(await fn(),"WORKER_ABI","worker"));function dn(e,n,t){let r=s=>Object.fromEntries(Object.entries(s).filter(([a])=>t(a)));return{source:`mod ${e} {}`,abi:{...n,prefix:e,exports:r(n.exports),names:r(n.names),mutableGlobals:n.mutableGlobals.filter(t)}}}async function un(){return{source:"mod Browser {}",abi:await _e()}}var mn=te(async()=>{let e=await _e(),n=new Set(e.ecmascript??[]);return dn("JS",e,t=>n.has(t))}),Et=["AbortController","AbortSignal","Blob","ByteLengthQueuingStrategy","CompressionStream","CountQueuingStrategy","Crypto","CryptoKey","CustomEvent","DOMException","DecompressionStream","Event","EventTarget","File","FormData","Headers","MessageChannel","MessageEvent","MessagePort","ReadableByteStreamController","ReadableStream","ReadableStreamBYOBReader","ReadableStreamBYOBRequest","ReadableStreamDefaultController","ReadableStreamDefaultReader","Request","RequestInit","Response","ResponseInit","SubtleCrypto","TextDecoder","TextDecoderStream","TextEncoder","TextEncoderStream","TransformStream","TransformStreamDefaultController","URL","URLSearchParams","WebAssembly","WritableStream","WritableStreamDefaultController","WritableStreamDefaultWriter","atob","btoa","clearInterval","clearTimeout","console","crypto","fetch","navigator","performance","queueMicrotask","reportError","setInterval","setTimeout","structuredClone"],pn=te(async()=>{let e=new Set(Et);return dn("Web",await _e(),n=>e.has(n))}),hn=te(async()=>({source:"mod Worker {}",abi:await Ft()}));var j="ir-wasm-",re=new Map([["std:Array",`// std/Array.utu \u2014 Array[T1]
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
        @ir/\\ <ir-array-get><ir-ident name="self"/><ir-ident name="i"/></ir-array-get> \\/
    }

    // a[i] = v \u2014 write element at index i (returns void).
    fn &.set_index |self| (i: I32, v: T1) Void {
        @ir/\\ <ir-array-set><ir-ident name="self"/><ir-ident name="i"/><ir-ident name="v"/></ir-array-set> \\/
    }

    // a[s, e] \u2014 copy subrange [start, end) into a new array.
    fn &.get_slice |self| (start: I32, end_: I32) & {
        @ir/\\ <ir-array-slice><ir-ident name="self"/><ir-ident name="start"/><ir-ident name="end_"/></ir-array-slice> \\/
    }

    // \u2500\u2500 Named methods (explicit call syntax) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

    // Create an Array of n elements, initialized with fill.
    fn &.new(n: I32, fill: T1) & {
        @ir/\\ <ir-array-new><ir-ident name="n"/><ir-ident name="fill"/></ir-array-new> \\/
    }

    // Create an Array with Wasm's default value for T1 (zero or null).
    fn &.new_default(n: I32) & {
        @ir/\\ <ir-array-new><ir-ident name="n"/></ir-array-new> \\/
    }

    // Number of elements. Call as \`array.len()\`.
    fn &.len |self| () I32 {
        @ir/\\ <ir-array-len><ir-ident name="self"/></ir-array-len> \\/
    }

    // \`[1, 2, 3]\`: each element's str, between brackets (\`console.log(xs)\`).
    fn &.str |self| () Str {
        let out = "["
        for (self, 0 ..< self.len()) |x, i| {
            if i > 0 { out = out + ", " }
            out = out + x.str()
        }
        out + "]"
    }

    // Aliases kept for explicit call sites.
    fn &.get |self| (i: I32) T1 {
        @ir/\\ <ir-array-get><ir-ident name="self"/><ir-ident name="i"/></ir-array-get> \\/
    }
    fn &.set |self| (i: I32, v: T1) Void {
        @ir/\\ <ir-array-set><ir-ident name="self"/><ir-ident name="i"/><ir-ident name="v"/></ir-array-set> \\/
    }
    fn &.slice |self| (start: I32, end_: I32) & {
        @ir/\\ <ir-array-slice><ir-ident name="self"/><ir-ident name="start"/><ir-ident name="end_"/></ir-array-slice> \\/
    }

    // self[at .. at+count) = source[start .. start+count), as one bulk copy.
    // Overlapping ranges of the same array copy correctly. Out of range traps.
    fn &.copy_from |self| (at: I32, source: &, start: I32, count: I32) Void {
        @ir/\\ <ir-array-copy>
            <ir-ident name="self"/>
            <ir-ident name="at"/>
            <ir-ident name="source"/>
            <ir-ident name="start"/>
            <ir-ident name="count"/>
        </ir-array-copy> \\/
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Bool",`// std/Bool.utu \u2014 Bool scalar type module
// & is a WasmGC I32 used as boolean (0 = false, 1 = true).
// Logical operators live here like every other operator; the compiler lowers
// \`and\`, \`or\`, \`xor\`, and \`not\` through this module instead of hardcoding them.

mod Bool {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:eq  |a, b| Bool { @ir/\\ <ir-i32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i32-eq> \\/ }
    fn &:ne  |a, b| Bool { @ir/\\ <ir-i32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ne> \\/ }
    fn &:and |a, b| Bool { @ir/\\ <ir-i32-and><ir-ident name="a"/><ir-ident name="b"/></ir-i32-and> \\/ }
    fn &:or  |a, b| Bool { @ir/\\ <ir-i32-or><ir-ident name="a"/><ir-ident name="b"/></ir-i32-or> \\/ }
    fn &:xor |a, b| Bool { @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i32-xor> \\/ }
    fn &:not |a| Bool { @ir/\\ <ir-i32-eqz><ir-ident name="a"/></ir-i32-eqz> \\/ }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(Bool) Str = @es/\\ (v) => (v ? "true" : "false") \\/
        format(self)
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Buffer",`// Geometrically growing native buffer, including non-defaultable element types.
// Its checks are kept only in a --safe build: otherwise an index past the
// length reaches the capacity beyond (and past that, the array's own bounds
// trap).
mod Buffer[T] {
    struct &:
        | values: Array[T]
        | length: I32

    fn &.new() & {
        &{ values: [], length: 0 }
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

    fn &.len |self| () I32 { self.length }

    fn &.is_empty |self| () Bool { self.length == 0 }

    // b[i] and b[i] = v.
    fn &.get_index |self| (i: I32) T {
        if checks() and (i < 0 or i >= self.length) { fatal }
        self.values[i]
    }

    fn &.set_index |self| (i: I32, value: T) Void {
        if checks() and (i < 0 or i >= self.length) { fatal }
        self.values[i] = value
    }

    // The last value, removed.
    fn &.pop |self| () T {
        if checks() and self.length == 0 { fatal }
        self.length -= 1
        self.values[self.length]
    }

    fn &.clear |self| () Void { self.length = 0 }

    // Keeps the first \`length\` values.
    fn &.truncate |self| (length: I32) Void {
        if checks() and (length < 0 or length > self.length) { fatal }
        self.length = length
    }

    // Whether the build is --safe.
    fn checks() Bool { @ir/\\ <ir-safe-checks/> \\/ }

    fn &.finish |self| () Array[T] {
        self.values.slice(0, self.length)
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Console",'//! The host\'s console: `using console from std:Console;`, then\n//! `console.log("hello")`, `console.log(42)`, `console.log(p)`: any value\n//! with a `str()` (a Str is itself), written as its str. Nothing out; each\n//! function ships only when used.\n\nmod console {\n    let host_log: fun(Str) Void = @es/\\ (s) => console.log(s) \\/\n    let host_warn: fun(Str) Void = @es/\\ (s) => console.warn(s) \\/\n    let host_error: fun(Str) Void = @es/\\ (s) => console.error(s) \\/\n\n    /// A line on standard output (`console.log`): `x.str()`.\n    fn log(x: $T) Void { host_log(x.str()) }\n\n    /// A line on standard error, as a warning (`console.warn`): `x.str()`.\n    fn warn(x: $T) Void { host_warn(x.str()) }\n\n    /// A line on standard error (`console.error`): `x.str()`.\n    fn error(x: $T) Void { host_error(x.str()) }\n}\n'.replaceAll("@@IR_WASM@@",j)],["std:Externref",`// std/Externref.utu \u2014 Externref opaque external reference type module
// & maps to the WebAssembly Externref type: an opaque, garbage-collected
// reference to a host (JavaScript) object.
// Externrefs ARE nullable: ?Externref is valid.
//
// No arithmetic or comparison operators \u2014 externrefs are fully opaque.
// Host operations are accessed via @ir DSL or imported JS functions.

mod Externref {
    type & = @ir/\\ <@@IR_WASM@@ref type-repr="wasm-externref"/> \\/
}
`.replaceAll("@@IR_WASM@@",j)],["std:F32",`// std/F32.utu \u2014 F32 scalar type module
// & is a WasmGC F32 value (stack-only, never heap-allocated, never nullable).

mod F32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-f32"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-f32-add><ir-ident name="a"/><ir-ident name="b"/></ir-f32-add> \\/ }
    fn &:sub  |a, b| & { @ir/\\ <ir-f32-sub><ir-ident name="a"/><ir-ident name="b"/></ir-f32-sub> \\/ }
    fn &:mul  |a, b| & { @ir/\\ <ir-f32-mul><ir-ident name="a"/><ir-ident name="b"/></ir-f32-mul> \\/ }
    fn &:div  |a, b| & { @ir/\\ <ir-f32-div><ir-ident name="a"/><ir-ident name="b"/></ir-f32-div> \\/ }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-f32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-f32-eq> \\/ }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-f32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-f32-ne> \\/ }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-f32-lt><ir-ident name="a"/><ir-ident name="b"/></ir-f32-lt> \\/ }
    fn &:le   |a, b| Bool { @ir/\\ <ir-f32-le><ir-ident name="a"/><ir-ident name="b"/></ir-f32-le> \\/ }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-f32-gt><ir-ident name="a"/><ir-ident name="b"/></ir-f32-gt> \\/ }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-f32-ge><ir-ident name="a"/><ir-ident name="b"/></ir-f32-ge> \\/ }
    fn &:neg  |a| & { @ir/\\ <ir-f32-neg><ir-ident name="a"/></ir-f32-neg> \\/ }
    fn abs(x: &)  & { @ir/\\ <ir-f32-abs><ir-ident name="x"/></ir-f32-abs> \\/ }
    fn sqrt(x: &) & { @ir/\\ <ir-f32-sqrt><ir-ident name="x"/></ir-f32-sqrt> \\/ }
    fn ceil(x: &) & { @ir/\\ <ir-f32-ceil><ir-ident name="x"/></ir-f32-ceil> \\/ }
    fn floor(x: &) & { @ir/\\ <ir-f32-floor><ir-ident name="x"/></ir-f32-floor> \\/ }
    fn trunc(x: &) & { @ir/\\ <ir-f32-trunc><ir-ident name="x"/></ir-f32-trunc> \\/ }
    fn nearest(x: &) & { @ir/\\ <ir-f32-nearest><ir-ident name="x"/></ir-f32-nearest> \\/ }
    fn min(a: &, b: &) & { @ir/\\ <ir-f32-min><ir-ident name="a"/><ir-ident name="b"/></ir-f32-min> \\/ }
    fn max(a: &, b: &) & { @ir/\\ <ir-f32-max><ir-ident name="a"/><ir-ident name="b"/></ir-f32-max> \\/ }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.f64 |self| () F64 { @ir/\\ <ir-f64-promote><ir-ident name="self"/></ir-f64-promote> \\/ }
    fn &.i32 |self| () I32 { @ir/\\ <ir-i32-trunc-s-sat-f32><ir-ident name="self"/></ir-i32-trunc-s-sat-f32> \\/ }
    fn &.u32 |self| () U32 { @ir/\\ <ir-u32-trunc-u-sat-f32><ir-ident name="self"/></ir-u32-trunc-u-sat-f32> \\/ }
    fn &.i64 |self| () I64 { @ir/\\ <ir-i64-trunc-s-sat-f32><ir-ident name="self"/></ir-i64-trunc-s-sat-f32> \\/ }
    fn &.u64 |self| () U64 { @ir/\\ <ir-u64-trunc-u-sat-f32><ir-ident name="self"/></ir-u64-trunc-u-sat-f32> \\/ }

    // The IEEE 754 bits, and back.
    fn &.bits |self| () I32 { @ir/\\ <ir-i32-reinterpret><ir-ident name="self"/></ir-i32-reinterpret> \\/ }
    fn from_bits(bits: I32) & { @ir/\\ <ir-f32-reinterpret><ir-ident name="bits"/></ir-f32-reinterpret> \\/ }

    // The shortest decimal that reads back as the same F32 (0.1, not
    // 0.10000000149011612). Ships only when used.
    fn &.str |self| () Str {
        let format: fun(F32) Str = @es/\\ (v) => { for (let p = 1; p < 10; p++) { const s = Number(v.toPrecision(p)); if (Math.fround(s) === v) return String(s); } return String(v); } \\/
        format(self)
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:F64",`// std/F64.utu \u2014 F64 scalar type module
// & is a WasmGC F64 value (stack-only, never heap-allocated, never nullable).

mod F64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-f64"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-f64-add><ir-ident name="a"/><ir-ident name="b"/></ir-f64-add> \\/ }
    fn &:sub  |a, b| & { @ir/\\ <ir-f64-sub><ir-ident name="a"/><ir-ident name="b"/></ir-f64-sub> \\/ }
    fn &:mul  |a, b| & { @ir/\\ <ir-f64-mul><ir-ident name="a"/><ir-ident name="b"/></ir-f64-mul> \\/ }
    fn &:div  |a, b| & { @ir/\\ <ir-f64-div><ir-ident name="a"/><ir-ident name="b"/></ir-f64-div> \\/ }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-f64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-f64-eq> \\/ }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-f64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-f64-ne> \\/ }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-f64-lt><ir-ident name="a"/><ir-ident name="b"/></ir-f64-lt> \\/ }
    fn &:le   |a, b| Bool { @ir/\\ <ir-f64-le><ir-ident name="a"/><ir-ident name="b"/></ir-f64-le> \\/ }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-f64-gt><ir-ident name="a"/><ir-ident name="b"/></ir-f64-gt> \\/ }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-f64-ge><ir-ident name="a"/><ir-ident name="b"/></ir-f64-ge> \\/ }
    fn &:neg  |a| & { @ir/\\ <ir-f64-neg><ir-ident name="a"/></ir-f64-neg> \\/ }
    fn abs(x: &)  & { @ir/\\ <ir-f64-abs><ir-ident name="x"/></ir-f64-abs> \\/ }
    fn sqrt(x: &) & { @ir/\\ <ir-f64-sqrt><ir-ident name="x"/></ir-f64-sqrt> \\/ }
    fn ceil(x: &) & { @ir/\\ <ir-f64-ceil><ir-ident name="x"/></ir-f64-ceil> \\/ }
    fn floor(x: &) & { @ir/\\ <ir-f64-floor><ir-ident name="x"/></ir-f64-floor> \\/ }
    fn trunc(x: &) & { @ir/\\ <ir-f64-trunc><ir-ident name="x"/></ir-f64-trunc> \\/ }
    fn nearest(x: &) & { @ir/\\ <ir-f64-nearest><ir-ident name="x"/></ir-f64-nearest> \\/ }
    fn min(a: &, b: &) & { @ir/\\ <ir-f64-min><ir-ident name="a"/><ir-ident name="b"/></ir-f64-min> \\/ }
    fn max(a: &, b: &) & { @ir/\\ <ir-f64-max><ir-ident name="a"/><ir-ident name="b"/></ir-f64-max> \\/ }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.f32 |self| () F32 { @ir/\\ <ir-f32-demote><ir-ident name="self"/></ir-f32-demote> \\/ }
    fn &.i32 |self| () I32 { @ir/\\ <ir-i32-trunc-s-sat-f64><ir-ident name="self"/></ir-i32-trunc-s-sat-f64> \\/ }
    fn &.u32 |self| () U32 { @ir/\\ <ir-u32-trunc-u-sat-f64><ir-ident name="self"/></ir-u32-trunc-u-sat-f64> \\/ }
    fn &.i64 |self| () I64 { @ir/\\ <ir-i64-trunc-s-sat-f64><ir-ident name="self"/></ir-i64-trunc-s-sat-f64> \\/ }
    fn &.u64 |self| () U64 { @ir/\\ <ir-u64-trunc-u-sat-f64><ir-ident name="self"/></ir-u64-trunc-u-sat-f64> \\/ }

    // The IEEE 754 bits, and back.
    fn &.bits |self| () I64 { @ir/\\ <ir-i64-reinterpret><ir-ident name="self"/></ir-i64-reinterpret> \\/ }
    fn from_bits(bits: I64) & { @ir/\\ <ir-f64-reinterpret><ir-ident name="bits"/></ir-f64-reinterpret> \\/ }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(F64) Str = @es/\\ (v) => String(v) \\/
        format(self)
    }

    // \u2500\u2500 Math \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Each ships only when used: the host's Math, one call each.

    /// The sine (of radians).
    fn &.sin |self| () & {
        let f: fun(&) & = @es/\\ Math.sin \\/
        f(self)
    }

    /// The cosine.
    fn &.cos |self| () & {
        let f: fun(&) & = @es/\\ Math.cos \\/
        f(self)
    }

    /// The tangent.
    fn &.tan |self| () & {
        let f: fun(&) & = @es/\\ Math.tan \\/
        f(self)
    }

    /// The arcsine, in radians.
    fn &.asin |self| () & {
        let f: fun(&) & = @es/\\ Math.asin \\/
        f(self)
    }

    /// The arccosine, in radians.
    fn &.acos |self| () & {
        let f: fun(&) & = @es/\\ Math.acos \\/
        f(self)
    }

    /// The arctangent, in radians.
    fn &.atan |self| () & {
        let f: fun(&) & = @es/\\ Math.atan \\/
        f(self)
    }

    /// $e^x$.
    fn &.exp |self| () & {
        let f: fun(&) & = @es/\\ Math.exp \\/
        f(self)
    }

    /// The natural logarithm (NaN below 0).
    fn &.ln |self| () & {
        let f: fun(&) & = @es/\\ Math.log \\/
        f(self)
    }

    /// The base-2 logarithm.
    fn &.log2 |self| () & {
        let f: fun(&) & = @es/\\ Math.log2 \\/
        f(self)
    }

    /// The base-10 logarithm.
    fn &.log10 |self| () & {
        let f: fun(&) & = @es/\\ Math.log10 \\/
        f(self)
    }

    /// The cube root.
    fn &.cbrt |self| () & {
        let f: fun(&) & = @es/\\ Math.cbrt \\/
        f(self)
    }

    /// \`self\` to the power \`exponent\`.
    fn &.pow |self| (exponent: &) & {
        let f: fun(&, &) & = @es/\\ Math.pow \\/
        f(self, exponent)
    }

    /// The angle of the point (\`other\`, \`self\`) from the x axis: \`y.atan2(x)\`, in radians.
    fn &.atan2 |self| (other: &) & {
        let f: fun(&, &) & = @es/\\ Math.atan2 \\/
        f(self, other)
    }

    /// $sqrt(x^2 + y^2)$, without overflow on the way.
    fn &.hypot |self| (other: &) & {
        let f: fun(&, &) & = @es/\\ Math.hypot \\/
        f(self, other)
    }

    /// Whether this is NaN, which is not equal even to itself.
    fn &.is_nan |self| () Bool { self != self }

    /// Whether this is neither infinite nor NaN.
    fn &.is_finite |self| () Bool { self - self == 0.0 }

    /// $pi$.
    fn pi() & { 3.141592653589793 }

    /// Euler's number $e$.
    fn e() & { 2.718281828459045 }

    /// Positive infinity.
    fn inf() & { 1.0 / 0.0 }

    /// Not a number.
    fn nan() & { 0.0 / 0.0 }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Found",`// Optional iterator result: null means empty; a present wrapper holds any T,
// including non-nullable scalar types. Use \`promote\` or \`orelse\` to unwrap.
mod Found[T] {
    struct &:
        | value: T
    fn &.new(value: T) & {
        &{ value: value }
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Group",`mod Group[K, T] {
    struct &:
        | key: K
        | values: Array[T]
    fn &.new(key: K) & {
        &{ key: key, values: [] }
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:I31",`// std/I31.utu \u2014 I31 WasmGC reference type module
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
        @ir/\\ <ir-i31-new><ir-ident name="x"/></ir-i31-new> \\/
    }

    // Unpack as signed I32 (sign-extends from 31 bits).
    fn get_s(r: &) I32 {
        @ir/\\ <ir-i31-get-s><ir-ident name="r"/></ir-i31-get-s> \\/
    }

    // Unpack as unsigned I32 (zero-extends from 31 bits).
    fn get_u(r: &) I32 {
        @ir/\\ <ir-i31-get-u><ir-ident name="r"/></ir-i31-get-u> \\/
    }

    // Reference equality (same I31 value \u2192 same reference \u2192 eq).
    fn &:eq |a, b| Bool { @ir/\\ <ir-ref-eq><ir-ident name="a"/><ir-ident name="b"/></ir-ref-eq> \\/ }
    fn &:ne |a, b| Bool { @ir/\\ <ir-ref-ne><ir-ident name="a"/><ir-ident name="b"/></ir-ref-ne> \\/ }
}
`.replaceAll("@@IR_WASM@@",j)],["std:I32",`// std/I32.utu \u2014 I32 scalar type module
// & is a WasmGC I32 value (stack-only, never heap-allocated, never nullable).

mod I32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-i32-add><ir-ident name="a"/><ir-ident name="b"/></ir-i32-add> \\/ }
    fn &:sub  |a, b| & { @ir/\\ <ir-i32-sub><ir-ident name="a"/><ir-ident name="b"/></ir-i32-sub> \\/ }
    fn &:mul  |a, b| & { @ir/\\ <ir-i32-mul><ir-ident name="a"/><ir-ident name="b"/></ir-i32-mul> \\/ }
    fn &:div  |a, b| & { @ir/\\ <ir-i32-div-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-div-s> \\/ }
    fn &:rem  |a, b| & { @ir/\\ <ir-i32-rem-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-rem-s> \\/ }
    fn &:band |a, b| & { @ir/\\ <ir-i32-and><ir-ident name="a"/><ir-ident name="b"/></ir-i32-and> \\/ }
    fn &:bor  |a, b| & { @ir/\\ <ir-i32-or><ir-ident name="a"/><ir-ident name="b"/></ir-i32-or> \\/ }
    fn &:bxor |a, b| & { @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i32-xor> \\/ }
    fn &:shl  |a, b| & { @ir/\\ <ir-i32-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shl> \\/ }
    fn &:shr  |a, b| & { @ir/\\ <ir-i32-shr-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-s> \\/ }
    fn &:ushr |a, b| & { @ir/\\ <ir-i32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-u> \\/ }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-i32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i32-eq> \\/ }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-i32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ne> \\/ }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-i32-lt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-lt-s> \\/ }
    fn &:le   |a, b| Bool { @ir/\\ <ir-i32-le-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-le-s> \\/ }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-i32-gt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-gt-s> \\/ }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-i32-ge-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ge-s> \\/ }
    // wasm has no I32.neg / I32.not; express them with real ops.
    //   neg a  = 0 - a
    //   bnot a = a xor 0xFFFFFFFF (-1)
    // The lesser and the greater of two; the size of one (the least I32's is itself: 0 - x wraps).
    fn min(p: &, q: &) & { if p < q { p } else { q } }
    fn max(p: &, q: &) & { if q < p { p } else { q } }
    fn abs(v: &) & { if v < 0 { -v } else { v } }
    fn &:neg  |a| & { @ir/\\ <ir-i32-sub><ir-lit kind="int" type-name="I32" value="0"/><ir-ident name="a"/></ir-i32-sub> \\/ }
    fn &:bnot |a| & { @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I32" value="-1"/></ir-i32-xor> \\/ }
    fn clz(x: &) & { @ir/\\ <ir-i32-clz><ir-ident name="x"/></ir-i32-clz> \\/ }
    fn ctz(x: &) & { @ir/\\ <ir-i32-ctz><ir-ident name="x"/></ir-i32-ctz> \\/ }
    fn popcnt(x: &) & { @ir/\\ <ir-i32-popcnt><ir-ident name="x"/></ir-i32-popcnt> \\/ }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.i64 |self| () I64 { @ir/\\ <ir-i64-extend-s><ir-ident name="self"/></ir-i64-extend-s> \\/ }
    fn &.u64 |self| () U64 { @ir/\\ <ir-u64-extend-s><ir-ident name="self"/></ir-u64-extend-s> \\/ }
    fn &.u32 |self| () U32 { @ir/\\ <ir-u32-or><ir-ident name="self"/><ir-lit kind="int" type-name="U32" value="0"/></ir-u32-or> \\/ }
    fn &.f32 |self| () F32 { @ir/\\ <ir-f32-convert-s-i32><ir-ident name="self"/></ir-f32-convert-s-i32> \\/ }
    fn &.f64 |self| () F64 { @ir/\\ <ir-f64-convert-s-i32><ir-ident name="self"/></ir-f64-convert-s-i32> \\/ }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(I32) Str = @es/\\ (v) => String(v) \\/
        format(self)
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:I64",`// std/I64.utu \u2014 I64 scalar type module
mod I64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i64"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-i64-add><ir-ident name="a"/><ir-ident name="b"/></ir-i64-add> \\/ }
    fn &:sub  |a, b| & { @ir/\\ <ir-i64-sub><ir-ident name="a"/><ir-ident name="b"/></ir-i64-sub> \\/ }
    fn &:mul  |a, b| & { @ir/\\ <ir-i64-mul><ir-ident name="a"/><ir-ident name="b"/></ir-i64-mul> \\/ }
    fn &:div  |a, b| & { @ir/\\ <ir-i64-div-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-div-s> \\/ }
    fn &:rem  |a, b| & { @ir/\\ <ir-i64-rem-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-rem-s> \\/ }
    fn &:band |a, b| & { @ir/\\ <ir-i64-and><ir-ident name="a"/><ir-ident name="b"/></ir-i64-and> \\/ }
    fn &:bor  |a, b| & { @ir/\\ <ir-i64-or><ir-ident name="a"/><ir-ident name="b"/></ir-i64-or> \\/ }
    fn &:bxor |a, b| & { @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i64-xor> \\/ }
    fn &:shl  |a, b| & { @ir/\\ <ir-i64-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shl> \\/ }
    fn &:shr  |a, b| & { @ir/\\ <ir-i64-shr-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-s> \\/ }
    fn &:ushr |a, b| & { @ir/\\ <ir-i64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-u> \\/ }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-i64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i64-eq> \\/ }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-i64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i64-ne> \\/ }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-i64-lt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-lt-s> \\/ }
    fn &:le   |a, b| Bool { @ir/\\ <ir-i64-le-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-le-s> \\/ }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-i64-gt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-gt-s> \\/ }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-i64-ge-s><ir-ident name="a"/><ir-ident name="b"/></ir-i64-ge-s> \\/ }
    // wasm has no I64.neg / I64.not; express them with real ops.
    //   neg a  = 0 - a
    //   bnot a = a xor 0xFFFFFFFFFFFFFFFF (-1)
    // The lesser and the greater of two; the size of one (the least I64's is itself: 0 - x wraps).
    fn min(p: &, q: &) & { if p < q { p } else { q } }
    fn max(p: &, q: &) & { if q < p { p } else { q } }
    fn abs(v: &) & { if v < 0 { -v } else { v } }
    fn &:neg  |a| & { @ir/\\ <ir-i64-sub><ir-lit kind="int" type-name="I64" value="0"/><ir-ident name="a"/></ir-i64-sub> \\/ }
    fn &:bnot |a| & { @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I64" value="-1"/></ir-i64-xor> \\/ }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.i32 |self| () I32 { @ir/\\ <ir-i32-wrap><ir-ident name="self"/></ir-i32-wrap> \\/ }
    fn &.u32 |self| () U32 { @ir/\\ <ir-u32-wrap><ir-ident name="self"/></ir-u32-wrap> \\/ }
    fn &.u64 |self| () U64 { @ir/\\ <ir-u64-or><ir-ident name="self"/><ir-lit kind="int" type-name="U64" value="0"/></ir-u64-or> \\/ }
    fn &.f32 |self| () F32 { @ir/\\ <ir-f32-convert-s-i64><ir-ident name="self"/></ir-f32-convert-s-i64> \\/ }
    fn &.f64 |self| () F64 { @ir/\\ <ir-f64-convert-s-i64><ir-ident name="self"/></ir-f64-convert-s-i64> \\/ }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(I64) Str = @es/\\ (v) => String(v) \\/
        format(self)
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:IntMap",`// std/IntMap.utu \u2014 I32 keys to I32 values, open addressing.
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
        &{ keys: Array[I32].new(16, 0), values: Array[I32].new(16, 0), full: Array[I32].new(16, 0), count: 0, shift: 28 }
    }

    fn &.len |self| () I32 {
        self.count
    }

    // The slot holding key, or the empty slot where it belongs.
    fn &.slot |self| (key: I32) I32 {
        let mask = self.keys.len() - 1
        let i = (key * -1640531535) >>> self.shift
        while (self.full[i] != 0 and self.keys[i] != key) { i = (i + 1) & mask }
        i
    }

    fn &.has |self| (key: I32) Bool {
        self.full[self.slot(key)] != 0
    }

    fn &.get |self| (key: I32, missing: I32) I32 {
        let i = self.slot(key)
        if self.full[i] != 0 { self.values[i] } else { missing }
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
`.replaceAll("@@IR_WASM@@",j)],["std:Interner",`// std/Interner.utu \u2014 byte strings to dense I32 ids: 0, 1, 2, \u2026 in first-seen order.
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
           count: 0, table: Array[I32].new(64, 0), start: 0, hash: 0 }
    }

    // Distinct keys so far.
    fn &.len |self| () I32 {
        self.count
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
        self.finish()
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
        id
    }

    fn &.same |self| (id: I32, length: I32) Bool {
        let at = self.starts[id]
        if self.starts[id + 1] - at != length { return false }
        for (0 ..< length) |k| {
            if self.bytes[at + k] != self.bytes[self.start + k] { return false }
        }
        true
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
        self.starts[id + 1] - self.starts[id]
    }

    fn &.byte_at |self| (id: I32, k: I32) I32 {
        if checks() and (k < 0 or k >= self.size(id)) { fatal }
        self.bytes[self.starts[id] + k]
    }

    fn checks() Bool { @ir/\\ <ir-safe-checks/> \\/ }

    // The key as a string, one character per byte: exact for ASCII; a
    // multi-byte UTF-8 character shows as its bytes.
    fn &.ascii |self| (id: I32) Str {
        Str.from_codes(self.bytes.slice(self.starts[id], self.starts[id + 1]), self.size(id))
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:JsonRuntime",`struct JsonReader__:
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
    codes
}

fn __json_reader(text: Str) JsonReader__ {
    JsonReader__ { text: text, at: 0, n: text.len(), failed: 0, reason: "", ks: 0, kl: 0, key: "", depth: 0, names: __json_codes(__json_names()), where: "", matched: 0 }
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
    if r.at < r.n { r.text[r.at] } else { -1 }
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
    if __json_peek(r) == close {
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
    if c == 44 {
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
    ok
}

fn __json_hex(r: JsonReader__, at: I32) I32 {
    let v = 0
    for (0..<4) |k| {
        let c = if at + k < r.n { r.text[at + k] } else { 0 }
        let d = if c >= 48 and c <= 57 { c - 48 } else { if c >= 97 and c <= 102 { c - 87 } else { if c >= 65 and c <= 70 { c - 55 } else { -1 } } }
        v = if d < 0 or v < 0 { -1 } else { v * 16 + d }
    }
    v
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
    if r.ks < 0 {
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
    if r.ks < 0 { r.key } else { r.text.slice(r.ks, r.ks + r.kl) }
}

fn __json_bool(r: JsonReader__) Bool {
    let c = __json_peek(r)
    if c == 116 and __json_word(r, "true") {
        true
    } else {
        if not (c == 102 and __json_word(r, "false")) {
            __json_fail(r, "expected true or false")
        }
        false
    }
}

fn __json_null(r: JsonReader__) Bool {
    __json_peek(r) == 110 and __json_word(r, "null")
}

fn __json_digits(r: JsonReader__, at: I32) I32 {
    let i = at
    while (i < r.n and r.text[i] >= 48 and r.text[i] <= 57) {
        i += 1
    }
    i
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
    i
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
    if r.kl == 0 and end - whole <= 15 {
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
    v
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
    if negative { v } else { 0 - v }
}

fn __json_i32(r: JsonReader__) I32 {
    __json_ws(r)
    let start = r.at
    let v = __json_i64(r)
    let low: I64 = -2147483648
    let high: I64 = 2147483647
    if v < low or v > high {
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
    v.u32()
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
    place + r.reason + " at line " + line.str() + ", column " + column.str()
}

fn __json_writer(capacity: I32) JsonWriter__ {
    JsonWriter__ { buf: Array[I32].new_default(capacity), n: 0, names: __json_codes(__json_names()) }
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
    if v < 10 { v + 48 } else { v + 87 }
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
`.replaceAll("@@IR_WASM@@",j)],["std:List",`mod List[T] {
    // Persistent edits; the input remains unchanged.
    fn append(self: Array[T], value: T) Array[T] {
        let result = Array[T].new(self.len() + 1, value)
        let i = 0
        while (i < self.len()) { result[i] = self[i]; i += 1 }
        result
    }
    fn remove_at(self: Array[T], index: I32) Array[T] {
        if index < 0 or index >= self.len() { self } else {
            let result = Array[T].new(self.len() - 1, self[0])
            let i = 0
            while (i < result.len()) { result[i] = self[if i < index { i } else { i + 1 }]; i += 1 }
            result
        }
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:LiteralDefaults",`// std/LiteralDefaults.utu \u2014 default static type for each literal syntax kind
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
`.replaceAll("@@IR_WASM@@",j)],["std:M128",`// std/M128.utu \u2014 M128 bitmask type module
// & is a 128-bit SIMD mask value (same wasm representation as V128).
// Used for lane-selection in SIMD operations.
// Supports bitwise ops; interpreted as four 32-bit lanes of all-zeros/all-ones.

mod M128 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-v128"/> \\/

    fn zero() & { @ir/\\ <ir-v128-const data-type-name="M128" bytes="0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"/> \\/ }
    fn ones() & { @ir/\\ <ir-v128-const data-type-name="M128" bytes="255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255"/> \\/ }

    fn &:band |a, b| & { @ir/\\ <ir-v128-and><ir-ident name="a"/><ir-ident name="b"/></ir-v128-and> \\/ }
    fn &:bor  |a, b| & { @ir/\\ <ir-v128-or><ir-ident name="a"/><ir-ident name="b"/></ir-v128-or> \\/ }
    fn &:bxor |a, b| & { @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/ }
    fn &:bnot |a| & { @ir/\\ <ir-v128-not><ir-ident name="a"/></ir-v128-not> \\/ }
    fn &:eq   |a, b| & {
        @ir/\\ <ir-v128-not><ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor></ir-v128-not> \\/
    }
    fn &:ne   |a, b| & {
        @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/
    }

    // Select lanes from two vectors using this mask (all-ones = take from a, all-zeros = take from b).
    fn bitselect(a: M128, b: M128, mask: M128) M128 {
        @ir/\\ <ir-v128-bitselect>
            <ir-ident name="a"/>
            <ir-ident name="b"/>
            <ir-ident name="mask"/>
        </ir-v128-bitselect> \\/
    }
    fn andnot(a: M128, b: M128) M128 {
        @ir/\\ <ir-v128-andnot><ir-ident name="a"/><ir-ident name="b"/></ir-v128-andnot> \\/
    }
    fn any_true(a: M128) Bool {
        @ir/\\ <ir-v128-any-true><ir-ident name="a"/></ir-v128-any-true> \\/
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:M32",`// std/M32.utu \u2014 M32 bitmask type module
// & is a 32-bit bitmask value (same wasm representation as I32).
// Intended for use as a lane-selection mask, not a general integer.
// Supports bitwise and comparison ops; arithmetic (add/sub/mul) is excluded.
// A mask has no sign: \`>>\` is a logical shift, the same as \`>>>\` (zeros in).

mod M32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:band |a, b| & { @ir/\\ <ir-i32-and><ir-ident name="a"/><ir-ident name="b"/></ir-i32-and> \\/ }
    fn &:bor  |a, b| & { @ir/\\ <ir-i32-or><ir-ident name="a"/><ir-ident name="b"/></ir-i32-or> \\/ }
    fn &:bxor |a, b| & { @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i32-xor> \\/ }
    // wasm has no bitwise not; synthesise it as xor with the all-ones mask.
    fn &:bnot |a| & { @ir/\\ <ir-i32-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I32" value="-1"/></ir-i32-xor> \\/ }
    fn &:shl  |a, b| & { @ir/\\ <ir-i32-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shl> \\/ }
    fn &:shr  |a, b| & { @ir/\\ <ir-i32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-u> \\/ }
    fn &:ushr |a, b| & { @ir/\\ <ir-i32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i32-shr-u> \\/ }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-i32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i32-eq> \\/ }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-i32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i32-ne> \\/ }
}
`.replaceAll("@@IR_WASM@@",j)],["std:M64",`// std/M64.utu \u2014 M64 bitmask type module
// & is a 64-bit bitmask value (same wasm representation as I64).
// Intended for use as a lane-selection mask, not a general integer.
// Supports bitwise and comparison ops; arithmetic (add/sub/mul) is excluded.
// A mask has no sign: \`>>\` is a logical shift, the same as \`>>>\` (zeros in).

mod M64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i64"/> \\/

    fn &:band |a, b| & { @ir/\\ <ir-i64-and><ir-ident name="a"/><ir-ident name="b"/></ir-i64-and> \\/ }
    fn &:bor  |a, b| & { @ir/\\ <ir-i64-or><ir-ident name="a"/><ir-ident name="b"/></ir-i64-or> \\/ }
    fn &:bxor |a, b| & { @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-ident name="b"/></ir-i64-xor> \\/ }
    // wasm has no bitwise not; synthesise it as xor with the all-ones mask.
    fn &:bnot |a| & { @ir/\\ <ir-i64-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I64" value="-1"/></ir-i64-xor> \\/ }
    fn &:shl  |a, b| & { @ir/\\ <ir-i64-shl><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shl> \\/ }
    fn &:shr  |a, b| & { @ir/\\ <ir-i64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-u> \\/ }
    fn &:ushr |a, b| & { @ir/\\ <ir-i64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-i64-shr-u> \\/ }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-i64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-i64-eq> \\/ }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-i64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-i64-ne> \\/ }
}
`.replaceAll("@@IR_WASM@@",j)],["std:NumberField",`// Keep the user's draft, including empty/invalid text, separate from a number.
mod NumberField {
    struct &:
        | text: Str
    fn &.new(text: Str) & { &{ text: text } }
    fn &.valid |self| (min: F64, max: F64) Bool {
        let check: fun(Str, F64, F64) Bool = @es/\\ (text,min,max)=>text.trim()!==''&&Number.isFinite(Number(text))&&Number(text)>=min&&Number(text)<=max \\/
        check(self.text,min,max)
    }
    fn &.value |self| () F64 {
        let parse: fun(Str) F64 = @es/\\ text=>Number(text) \\/
        parse(self.text)
    }
    fn &.error |self| (min: F64, max: F64) Str {
        if self.valid(min,max) { "" } else { "Enter a number within the allowed range." }
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Ord",`//! An order, for bounded modules: \`using Ord from std:Ord;\` and
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

    fn Ord[I32].cmp |a| (b: I32) I32 { if a < b { -1 } else if a > b { 1 } else { 0 } }
    fn Ord[U32].cmp |a| (b: U32) I32 { if a < b { -1 } else if a > b { 1 } else { 0 } }
    fn Ord[I64].cmp |a| (b: I64) I32 { if a < b { -1 } else if a > b { 1 } else { 0 } }
    fn Ord[U64].cmp |a| (b: U64) I32 { if a < b { -1 } else if a > b { 1 } else { 0 } }
    /// NaN ties with everything.
    fn Ord[F32].cmp |a| (b: F32) I32 { if a < b { -1 } else if a > b { 1 } else { 0 } }
    /// NaN ties with everything.
    fn Ord[F64].cmp |a| (b: F64) I32 { if a < b { -1 } else if a > b { 1 } else { 0 } }

    /// By UTF-16 code units, as JavaScript's \`<\` orders strings.
    fn Ord[Str].cmp |a| (b: Str) I32 {
        let n = if a.len() < b.len() { a.len() } else { b.len() }
        for (0 ..< n) |i| {
            if a[i] != b[i] { return a[i] - b[i] }
        }
        a.len() - b.len()
    }
}

mod Order[T[Ord]] {
    /// The greater of two (a, when they tie).
    fn max(a: T, b: T) T { if b.cmp(a) > 0 { b } else { a } }

    /// The lesser of two (a, when they tie).
    fn min(a: T, b: T) T { if b.cmp(a) < 0 { b } else { a } }

    /// \`x\`, or the nearer of \`low\` and \`high\` when it is outside them.
    /// With \`low\` after \`high\`: \`low\` when \`x\` is before \`low\`, else \`high\`.
    fn clamp(x: T, low: T, high: T) T {
        if x.cmp(low) < 0 { low } else if x.cmp(high) > 0 { high } else { x }
    }

    /// Whether each element comes before or ties with the next.
    fn is_sorted(xs: Array[T]) Bool {
        for (1 ..< xs.len()) |i| {
            if xs[i - 1].cmp(xs[i]) > 0 { return false }
        }
        true
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
        -1
    }

    /// The greatest element of \`xs\`, the first of those that tie; \`xs\` is not empty.
    fn max_of(xs: Array[T]) T {
        let best = xs[0]
        for (1 ..< xs.len()) |i| { if xs[i].cmp(best) > 0 { best = xs[i] } }
        best
    }

    /// The least element of \`xs\`, the first of those that tie; \`xs\` is not empty.
    fn min_of(xs: Array[T]) T {
        let best = xs[0]
        for (1 ..< xs.len()) |i| { if xs[i].cmp(best) < 0 { best = xs[i] } }
        best
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:PersistentSegmentTree",`// Immutable versions of an ordered monoid index. Point updates share untouched
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
        Node { value: combine(left.value, right.value), left: left, right: right }
    }

    fn &.new(values: Array[T], identity: T, combine: fun(T, T) T) & {
        &{ root: build(values, 0, values.len(), combine), length: values.len(), identity: identity }
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
        Node { value: combine(left.value, right.value), left: left, right: right }
    }

    fn &.set |self| (index: I32, value: T, combine: fun(T, T) T) & {
        if index < 0 or index >= self.length { fatal }
        &{
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
        combine(
            range(current.left, start, mid, low, high, identity, combine),
            range(current.right, mid, end_, low, high, identity, combine)
        )
    }

    fn &.query |self| (start: I32, end_: I32, combine: fun(T, T) T) T {
        if start < 0 or end_ < start or end_ > self.length { fatal }
        range(self.root, 0, self.length, start, end_, self.identity, combine)
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Prelude",`// std/prelude.utu \u2014 automatically injected into every compilation
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
using wutu from std:Wutu
using Component from std:Wutu
`.replaceAll("@@IR_WASM@@",j)],["std:Promise",`// std/Promise.utu \u2014 Promise[T]
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
    fn &.then |self| (on_value: cl(T1) Void) Void {
        @ir/\\ <ir-promise-then><ir-ident name="self"/><ir-ident name="on_value"/></ir-promise-then> \\/
    }

    // Subscribe to rejection. The reason is an opaque host value. Marks the
    // promise handled, so a \`then\` on it no longer reports the rejection.
    fn &.catch |self| (on_error: cl(Externref) Void) Void {
        @ir/\\ <ir-promise-catch><ir-ident name="self"/><ir-ident name="on_error"/></ir-promise-catch> \\/
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Random",`//! Seeded random numbers: \`using Random from std:Random;\`.
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
    fn &.new(seed: I32) & { seeded(seed) }

    /// A generator seeded from the host's randomness (\`crypto.getRandomValues\`).
    fn &.from_host() & {
        let seed: fun() I32 = @es/\\ () => crypto.getRandomValues(new Int32Array(1))[0] \\/
        seeded(seed())
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
        result
    }

    /// A number in [0, 1), with 32 random bits.
    fn &.float |self| () F64 {
        self.bits().u32().f64() / 4294967296.0
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
        low + (product >> 32.u64()).i32()
    }

    /// True with probability \`p\`.
    fn &.chance |self| (p: F64) Bool { self.float() < p }

    fn seeded(seed: I32) & {
        let s = seed + -1640531527
        &{ a: mix(s), b: mix(s + -1640531527), c: mix(s - 1013904242), d: mix(s + 626627285) }
    }

    // splitmix32's output function.
    fn mix(x: I32) I32 {
        let z = x
        z = (z ^ (z >>> 16)) * -2048144789
        z = (z ^ (z >>> 13)) * -1028477387
        z ^ (z >>> 16)
    }

    fn rotl(x: I32, k: I32) I32 { (x << k) | (x >>> (32 - k)) }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Result",`//! \`Result[T, E]\`: a value of type T, or the error E that kept it from being
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
    fn &.ok(value: T) & { &{ _ok: true, _value: value } }

    /// A failure holding \`error\`.
    fn &.err(error: E) & { &{ _ok: false, _error: error } }

    fn &.is_ok |self| () Bool { self._ok }

    fn &.is_err |self| () Bool { not self._ok }

    /// The value; fatal when it is an error.
    fn &.value |self| () T {
        if not self._ok { fatal }
        self._value
    }

    /// The error; fatal when it is a value.
    fn &.error |self| () E {
        if self._ok { fatal }
        self._error
    }

    /// The value, or \`fallback\` when it is an error.
    fn &.value_or |self| (fallback: T) T { if self._ok { self._value } else { fallback } }
}
`.replaceAll("@@IR_WASM@@",j)],["std:SegmentTree",`// An ordered monoid index. combine must be associative and identity neutral.
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
        &{ nodes: nodes, size: size, length: values.len(), identity: identity }
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
        combine(before, after)
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
        i - self.size
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Spatial",`using Buffer from std:Buffer

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
        Point { x: x, y: y, id: id }
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
        Node {
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
        &{ root: build(copied) }
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
        out.finish()
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
        out.finish()
    }

    fn box_distance(node: Node, x: F64, y: F64) F64 {
        let dx = if x < node.min_x { node.min_x - x } else {
            if x > node.max_x { x - node.max_x } else { 0.0 }
        }
        let dy = if y < node.min_y { node.min_y - y } else {
            if y > node.max_y { y - node.max_y } else { 0.0 }
        }
        dx * dx + dy * dy
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
        out.finish()
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
        promote self.root {
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
`.replaceAll("@@IR_WASM@@",j)],["std:Str",`// std/Str.utu \u2014 Str string reference type module
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
    fn &:add |a, b| & { @ir/\\ <ir-string-concat><ir-ident name="a"/><ir-ident name="b"/></ir-string-concat> \\/ }

    // Equality \u2014 structural (content) comparison.
    fn &:eq |a, b| Bool { @ir/\\ <ir-string-eq><ir-ident name="a"/><ir-ident name="b"/></ir-string-eq> \\/ }
    fn &:ne |a, b| Bool { @ir/\\ <ir-string-ne><ir-ident name="a"/><ir-ident name="b"/></ir-string-ne> \\/ }

    // Order: by UTF-16 code units, as JavaScript compares strings ("B" < "a").
    fn &:lt |a, b| Bool { compare(a, b) < 0 }
    fn &:le |a, b| Bool { compare(a, b) <= 0 }
    fn &:gt |a, b| Bool { compare(a, b) > 0 }
    fn &:ge |a, b| Bool { compare(a, b) >= 0 }

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
        if n < m { -1 } else if n > m { 1 } else { 0 }
    }

    // Number of UTF-16 code units in the host string.
    fn len(s: &) I32 {
        @ir/\\ <ir-string-measure-utf16><ir-ident name="s"/></ir-string-measure-utf16> \\/
    }

    // Substring [start, end) \u2014 returns a new string. An end past the string
    // stops at its end, as in JavaScript; a negative start or an end before
    // start traps in --safe builds, as Array's slice does.
    fn slice(s: &, start: I32, end_: I32) & {
        if checks() and (start < 0 or end_ < start) { fatal }
        slice_unchecked(s, start, end_)
    }

    // \`slice\` without the --safe check: a negative index reads as unsigned.
    fn slice_unchecked(s: &, start: I32, end_: I32) & {
        @ir/\\ <ir-string-slice-wtf16>
            <ir-ident name="s"/>
            <ir-ident name="start"/>
            <ir-ident name="end_"/>
        </ir-string-slice-wtf16> \\/
    }

    // Read one UTF-16 code unit at index i.
    fn get(s: &, i: I32) I32 {
        @ir/\\ <ir-string-get-wtf16><ir-ident name="s"/><ir-ident name="i"/></ir-string-get-wtf16> \\/
    }

    // A one-code-point string.
    fn from_code_point(code: I32) & {
        @ir/\\ <ir-string-from-code-point><ir-ident name="code"/></ir-string-from-code-point> \\/
    }

    // The first \`count\` UTF-16 code units of \`codes\`, as one string. Build
    // text in an Array[I32] and convert once, rather than concatenating.
    fn from_codes(codes: Array[I32], count: I32) & {
        @ir/\\ <ir-string-from-codes><ir-ident name="codes"/><ir-ident name="count"/></ir-string-from-codes> \\/
    }

    // Receiver/index forms mirror Array's surface while preserving the
    // existing static Str.len/slice/get entry points.
    fn &.len |self| () I32 {
        @ir/\\ <ir-string-measure-utf16><ir-ident name="self"/></ir-string-measure-utf16> \\/
    }
    fn &.slice |self| (start: I32, end_: I32) & { slice(self, start, end_) }
    fn &.get |self| (i: I32) I32 {
        @ir/\\ <ir-string-get-wtf16><ir-ident name="self"/><ir-ident name="i"/></ir-string-get-wtf16> \\/
    }
    fn &.get_index |self| (i: I32) I32 {
        @ir/\\ <ir-string-get-wtf16><ir-ident name="self"/><ir-ident name="i"/></ir-string-get-wtf16> \\/
    }
    fn &.get_slice |self| (start: I32, end_: I32) & { slice(self, start, end_) }

    // Whether the build is --safe.
    fn checks() Bool { @ir/\\ <ir-safe-checks/> \\/ }

    // The string itself: what \`\${s}\` in a template string calls.
    fn &.str |self| () & { @ir/\\ <ir-ident name="self"/> \\/ }

    // \u2500\u2500 Text \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Each ships only when used. Offsets and lengths are in UTF-16 code
    // units, as \`len\` and \`slice\` count them.

    /// Where \`part\` first occurs at or after \`from\`, or -1.
    fn &.index_of |self| (part: &, from: I32) I32 {
        let find: fun(&, &, I32) I32 = @es/\\ (s, p, i) => s.indexOf(p, i) \\/
        find(self, part, from)
    }

    /// Where \`part\` last occurs, or -1.
    fn &.last_index_of |self| (part: &) I32 {
        let find: fun(&, &) I32 = @es/\\ (s, p) => s.lastIndexOf(p) \\/
        find(self, part)
    }

    /// Whether \`part\` occurs in the string.
    fn &.contains |self| (part: &) Bool { self.index_of(part, 0) >= 0 }

    /// Whether the string begins with \`part\`.
    fn &.starts_with |self| (part: &) Bool {
        part.len() <= self.len() and self.slice(0, part.len()) == part
    }

    /// Whether the string ends with \`part\`.
    fn &.ends_with |self| (part: &) Bool {
        part.len() <= self.len() and self.slice(self.len() - part.len(), self.len()) == part
    }

    /// Without the white space at either end.
    fn &.trim |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.trim() \\/
        f(self)
    }

    /// Without the white space at its start.
    fn &.trim_start |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.trimStart() \\/
        f(self)
    }

    /// Without the white space at its end.
    fn &.trim_end |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.trimEnd() \\/
        f(self)
    }

    /// In upper case (\`"Stra\xDFe"\` is \`"STRASSE"\`).
    fn &.to_upper |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.toUpperCase() \\/
        f(self)
    }

    /// In lower case.
    fn &.to_lower |self| () & {
        let f: fun(&) & = @es/\\ (s) => s.toLowerCase() \\/
        f(self)
    }

    /// The string \`count\` times over.
    fn &.repeat |self| (count: I32) & {
        let f: fun(&, I32) & = @es/\\ (s, n) => s.repeat(Math.max(0, n)) \\/
        f(self, count)
    }

    /// Every occurrence of \`part\` replaced by \`with\`, as it is (a \`$\` in it is a \`$\`).
    fn &.replace |self| (part: &, with: &) & {
        let f: fun(&, &, &) & = @es/\\ (s, p, w) => s.replaceAll(p, () => w) \\/
        f(self, part, with)
    }

    /// At least \`width\` long: \`fill\` repeated before it as needed (\`"7".pad_start(3, "0")\` is \`"007"\`).
    fn &.pad_start |self| (width: I32, fill: &) & {
        let f: fun(&, I32, &) & = @es/\\ (s, n, f) => s.padStart(n, f) \\/
        f(self, width, fill)
    }

    /// At least \`width\` long: \`fill\` repeated after it as needed.
    fn &.pad_end |self| (width: I32, fill: &) & {
        let f: fun(&, I32, &) & = @es/\\ (s, n, f) => s.padEnd(n, f) \\/
        f(self, width, fill)
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
        pieces
    }

    /// The \`parts\`, with the string between each two (\`", ".join(["a", "b"])\` is \`"a, b"\`).
    fn &.join |self| (parts: Array[Str]) & {
        if parts.len() == 0 { return "" }
        let out = parts[0]
        for (1 ..< parts.len()) |i| { out = out + self + parts[i] }
        out
    }

    /// The integer the string is, or \`fallback\` when it is not one or does not
    /// fit in an I32: white space around it, then a sign (\`+\` or \`-\`) if any,
    /// then decimal digits or hexadecimal ones after \`0x\`.
    fn &.parse_i32 |self| (fallback: I32) I32 {
        let f: fun(&, I32) I32 = @es/\\ (s, d) => { const m = /^([+-]?)(0x[0-9a-f]+|\\d+)$/i.exec(s.trim()); if (!m) return d; const v = (m[1] === '-' ? -1 : 1) * Number(m[2]); return v >= -2147483648 && v <= 2147483647 ? v : d; } \\/
        f(self, fallback)
    }

    /// The number the string is, or NaN when it is not one (\`F64.is_nan\`), as
    /// JavaScript's \`Number\` reads it after the white space around it: so
    /// also \`0x\u2026\`, \`0b\u2026\`, \`0o\u2026\`, and \`Infinity\`, but not \`inf\`.
    fn &.parse_f64 |self| () F64 {
        let f: fun(&) F64 = @es/\\ (s) => { const t = s.trim(); return t === '' ? NaN : Number(t); } \\/
        f(self)
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:StrMap",`//! Str keys to values of any type: \`using StrMap from std:StrMap;\`.
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
        &{ keys: Array[Str].new(0, ""), full: Array[I32].new(0, 0), hashes: Array[I32].new(0, 0), values: [], count: 0 }
    }

    /// How many keys it has.
    fn &.len |self| () I32 { self.count }

    /// Whether it has \`key\`.
    fn &.has |self| (key: Str) Bool {
        if self.count == 0 { return false }
        self.full[self.slot(key, hash(key))] != 0
    }

    /// The value of \`key\`, or \`missing\` when it has none.
    fn &.get |self| (key: Str, missing: V) V {
        if self.count == 0 { return missing }
        let i = self.slot(key, hash(key))
        if self.full[i] == 0 { missing } else { self.values[i] }
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
        true
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
        out
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
        i
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
        f(key)
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Stream",`//! \`Stream[T]\`: a JavaScript async iterable, held as an externref. An async
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
        adopt(iterable)
    }

    /// The values of an array, in order.
    fn of(values: Array[T1]) & {
        let make: fun(I32, cl(I32) T1) & = @es/\\ (n, at) => (async function* () { for (let i = 0; i < n; i++) yield at(i); })() \\/
        make(values.len(), cl(i) { values[i] })
    }

    /// \`count\` values, each \`make(i)\` for i from 0, made as they are read.
    fn generate(count: I32, make: cl(I32) T1) & {
        let gen: fun(I32, cl(I32) T1) & = @es/\\ (n, at) => (async function* () { for (let i = 0; i < n; i++) yield at(i); })() \\/
        gen(count, make)
    }

    // \u2500\u2500 Transforming \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Each is a new stream that reads this one as it is read.

    /// The first \`n\` values.
    fn &.take |self| (n: I32) & {
        let f: fun(&, I32) & = @es/\\ (s, n) => (async function* () { if (n <= 0) return; let i = 0; for await (const v of s) { yield v; if (++i >= n) return; } })() \\/
        f(self, n)
    }

    /// All but the first \`n\` values.
    fn &.skip |self| (n: I32) & {
        let f: fun(&, I32) & = @es/\\ (s, n) => (async function* () { let i = 0; for await (const v of s) if (i++ >= n) yield v; })() \\/
        f(self, n)
    }

    /// The values \`keep\` is true of.
    fn &.filter |self| (keep: cl(T1) Bool) & {
        let f: fun(&, cl(T1) Bool) & = @es/\\ (s, keep) => (async function* () { for await (const v of s) if (keep(v)) yield v; })() \\/
        f(self, keep)
    }

    /// Each value, changed by \`f\` (to a value of the same type).
    fn &.map |self| (f: cl(T1) T1) & {
        let m: fun(&, cl(T1) T1) & = @es/\\ (s, f) => (async function* () { for await (const v of s) yield f(v); })() \\/
        m(self, f)
    }

    /// This stream's values, then \`other\`'s.
    fn &.chain |self| (other: &) & {
        let f: fun(&, &) & = @es/\\ (a, b) => (async function* () { yield* a; yield* b; })() \\/
        f(self, other)
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
        f(self)
    }

    fn &.next |self| (iterator: Externref) Promise[Externref] {
        let f: fun(Externref) Promise[Externref] = @es/\\ (it) => it.next() \\/
        f(iterator)
    }

    fn &.done |self| (result: Externref) Bool {
        let f: fun(Externref) Bool = @es/\\ (r) => r.done === true \\/
        f(result)
    }

    fn &.value |self| (result: Externref) T1 {
        let f: fun(Externref) T1 = @es/\\ (r) => r.value \\/
        f(result)
    }

    /// Settles once the stream has finished closing (its \`finally\` blocks run).
    fn &.close |self| (iterator: Externref) Void {
        let f: fun(Externref) Promise[Externref] = @es/\\ (it) => Promise.resolve(it.return?.()) \\/
        await f(iterator)
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Time",`//! Clocks: \`using time from std:Time;\`, then \`time.now()\`. Each function ships only when used.

mod time {
    /// Milliseconds since an arbitrary start, with sub-millisecond precision
    /// where the host has it (\`performance.now\`): for measuring.
    fn now() F64 {
        let f: fun() F64 = @es/\\ () => performance.now() \\/
        f()
    }

    /// Milliseconds since 1970-01-01 UTC (\`Date.now\`): for dates.
    fn epoch_ms() F64 {
        let f: fun() F64 = @es/\\ () => Date.now() \\/
        f()
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:U32",`// std/U32.utu \u2014 U32 scalar type module
mod U32 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i32"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-u32-add><ir-ident name="a"/><ir-ident name="b"/></ir-u32-add> \\/ }
    fn &:sub  |a, b| & { @ir/\\ <ir-u32-sub><ir-ident name="a"/><ir-ident name="b"/></ir-u32-sub> \\/ }
    fn &:mul  |a, b| & { @ir/\\ <ir-u32-mul><ir-ident name="a"/><ir-ident name="b"/></ir-u32-mul> \\/ }
    fn &:div  |a, b| & { @ir/\\ <ir-u32-div-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-div-u> \\/ }
    fn &:rem  |a, b| & { @ir/\\ <ir-u32-rem-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-rem-u> \\/ }
    fn &:band |a, b| & { @ir/\\ <ir-u32-and><ir-ident name="a"/><ir-ident name="b"/></ir-u32-and> \\/ }
    fn &:bor  |a, b| & { @ir/\\ <ir-u32-or><ir-ident name="a"/><ir-ident name="b"/></ir-u32-or> \\/ }
    fn &:bxor |a, b| & { @ir/\\ <ir-u32-xor><ir-ident name="a"/><ir-ident name="b"/></ir-u32-xor> \\/ }
    fn &:shl  |a, b| & { @ir/\\ <ir-u32-shl><ir-ident name="a"/><ir-ident name="b"/></ir-u32-shl> \\/ }
    fn &:shr  |a, b| & { @ir/\\ <ir-u32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-shr-u> \\/ }
    fn &:ushr |a, b| & { @ir/\\ <ir-u32-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-shr-u> \\/ }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-u32-eq><ir-ident name="a"/><ir-ident name="b"/></ir-u32-eq> \\/ }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-u32-ne><ir-ident name="a"/><ir-ident name="b"/></ir-u32-ne> \\/ }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-u32-lt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-lt-u> \\/ }
    fn &:le   |a, b| Bool { @ir/\\ <ir-u32-le-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-le-u> \\/ }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-u32-gt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-gt-u> \\/ }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-u32-ge-u><ir-ident name="a"/><ir-ident name="b"/></ir-u32-ge-u> \\/ }
    // wasm has no U32.neg / U32.not; express them with real ops.
    //   neg a  = 0 - a   (well-defined mod 2^32)
    //   bnot a = a xor 0xFFFFFFFF
    fn &:neg  |a| & { @ir/\\ <ir-u32-sub><ir-lit kind="int" type-name="U32" value="0"/><ir-ident name="a"/></ir-u32-sub> \\/ }
    fn &:bnot |a| & { @ir/\\ <ir-u32-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I32" value="-1"/></ir-u32-xor> \\/ }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.i32 |self| () I32 { @ir/\\ <ir-i32-or><ir-ident name="self"/><ir-lit kind="int" type-name="I32" value="0"/></ir-i32-or> \\/ }
    fn &.i64 |self| () I64 { @ir/\\ <ir-i64-extend-u><ir-ident name="self"/></ir-i64-extend-u> \\/ }
    fn &.u64 |self| () U64 { @ir/\\ <ir-u64-extend-u><ir-ident name="self"/></ir-u64-extend-u> \\/ }
    fn &.f32 |self| () F32 { @ir/\\ <ir-f32-convert-u-i32><ir-ident name="self"/></ir-f32-convert-u-i32> \\/ }
    fn &.f64 |self| () F64 { @ir/\\ <ir-f64-convert-u-i32><ir-ident name="self"/></ir-f64-convert-u-i32> \\/ }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(U32) Str = @es/\\ (v) => String(v >>> 0) \\/
        format(self)
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:U64",`// std/U64.utu \u2014 U64 scalar type module
mod U64 {
    type & = @ir/\\ <@@IR_WASM@@scalar type-repr="wasm-i64"/> \\/

    fn &:add  |a, b| & { @ir/\\ <ir-u64-add><ir-ident name="a"/><ir-ident name="b"/></ir-u64-add> \\/ }
    fn &:sub  |a, b| & { @ir/\\ <ir-u64-sub><ir-ident name="a"/><ir-ident name="b"/></ir-u64-sub> \\/ }
    fn &:mul  |a, b| & { @ir/\\ <ir-u64-mul><ir-ident name="a"/><ir-ident name="b"/></ir-u64-mul> \\/ }
    fn &:div  |a, b| & { @ir/\\ <ir-u64-div-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-div-u> \\/ }
    fn &:rem  |a, b| & { @ir/\\ <ir-u64-rem-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-rem-u> \\/ }
    fn &:band |a, b| & { @ir/\\ <ir-u64-and><ir-ident name="a"/><ir-ident name="b"/></ir-u64-and> \\/ }
    fn &:bor  |a, b| & { @ir/\\ <ir-u64-or><ir-ident name="a"/><ir-ident name="b"/></ir-u64-or> \\/ }
    fn &:bxor |a, b| & { @ir/\\ <ir-u64-xor><ir-ident name="a"/><ir-ident name="b"/></ir-u64-xor> \\/ }
    fn &:shl  |a, b| & { @ir/\\ <ir-u64-shl><ir-ident name="a"/><ir-ident name="b"/></ir-u64-shl> \\/ }
    fn &:shr  |a, b| & { @ir/\\ <ir-u64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-shr-u> \\/ }
    fn &:ushr |a, b| & { @ir/\\ <ir-u64-shr-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-shr-u> \\/ }
    fn &:eq   |a, b| Bool { @ir/\\ <ir-u64-eq><ir-ident name="a"/><ir-ident name="b"/></ir-u64-eq> \\/ }
    fn &:ne   |a, b| Bool { @ir/\\ <ir-u64-ne><ir-ident name="a"/><ir-ident name="b"/></ir-u64-ne> \\/ }
    fn &:lt   |a, b| Bool { @ir/\\ <ir-u64-lt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-lt-u> \\/ }
    fn &:le   |a, b| Bool { @ir/\\ <ir-u64-le-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-le-u> \\/ }
    fn &:gt   |a, b| Bool { @ir/\\ <ir-u64-gt-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-gt-u> \\/ }
    fn &:ge   |a, b| Bool { @ir/\\ <ir-u64-ge-u><ir-ident name="a"/><ir-ident name="b"/></ir-u64-ge-u> \\/ }
    // wasm has no U64.neg / U64.not; express them with real ops.
    //   neg a  = 0 - a   (well-defined mod 2^64)
    //   bnot a = a xor 0xFFFFFFFFFFFFFFFF
    fn &:neg  |a| & { @ir/\\ <ir-u64-sub><ir-lit kind="int" type-name="U64" value="0"/><ir-ident name="a"/></ir-u64-sub> \\/ }
    fn &:bnot |a| & { @ir/\\ <ir-u64-xor><ir-ident name="a"/><ir-lit kind="int" type-name="I64" value="-1"/></ir-u64-xor> \\/ }

    // Conversions are one wasm instruction each. Float \u2192 int saturates (NaN \u2192 0), like Rust \`as\`.
    fn &.u32 |self| () U32 { @ir/\\ <ir-u32-wrap><ir-ident name="self"/></ir-u32-wrap> \\/ }
    fn &.i32 |self| () I32 { @ir/\\ <ir-i32-wrap><ir-ident name="self"/></ir-i32-wrap> \\/ }
    fn &.i64 |self| () I64 { @ir/\\ <ir-i64-or><ir-ident name="self"/><ir-lit kind="int" type-name="I64" value="0"/></ir-i64-or> \\/ }
    fn &.f32 |self| () F32 { @ir/\\ <ir-f32-convert-u-i64><ir-ident name="self"/></ir-f32-convert-u-i64> \\/ }
    fn &.f64 |self| () F64 { @ir/\\ <ir-f64-convert-u-i64><ir-ident name="self"/></ir-f64-convert-u-i64> \\/ }

    // Decimal text, as JavaScript's String() spells it. Ships only when used.
    fn &.str |self| () Str {
        let format: fun(U64) Str = @es/\\ (v) => String(BigInt.asUintN(64, v)) \\/
        format(self)
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:V128",`// std/V128.utu \u2014 V128 SIMD vector type module
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

    fn zero() & { @ir/\\ <ir-v128-const data-type-name="V128" bytes="0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"/> \\/ }
    fn ones() & { @ir/\\ <ir-v128-const data-type-name="V128" bytes="255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255"/> \\/ }

    fn &:band |a, b| & { @ir/\\ <ir-v128-and><ir-ident name="a"/><ir-ident name="b"/></ir-v128-and> \\/ }
    fn &:bor  |a, b| & { @ir/\\ <ir-v128-or><ir-ident name="a"/><ir-ident name="b"/></ir-v128-or> \\/ }
    fn &:bxor |a, b| & { @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/ }
    fn &:bnot |a| & { @ir/\\ <ir-v128-not><ir-ident name="a"/></ir-v128-not> \\/ }
    fn &:eq   |a, b| & {
        @ir/\\ <ir-v128-not><ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor></ir-v128-not> \\/
    }
    fn &:ne   |a, b| & {
        @ir/\\ <ir-v128-xor><ir-ident name="a"/><ir-ident name="b"/></ir-v128-xor> \\/
    }

    fn andnot(a: V128, b: V128) V128 {
        @ir/\\ <ir-v128-andnot><ir-ident name="a"/><ir-ident name="b"/></ir-v128-andnot> \\/
    }
    fn bitselect(a: V128, b: V128, mask: V128) V128 {
        @ir/\\ <ir-v128-bitselect>
            <ir-ident name="a"/>
            <ir-ident name="b"/>
            <ir-ident name="mask"/>
        </ir-v128-bitselect> \\/
    }
    fn any_true(a: V128) Bool {
        @ir/\\ <ir-v128-any-true><ir-ident name="a"/></ir-v128-any-true> \\/
    }
}
`.replaceAll("@@IR_WASM@@",j)],["std:Wutu",`// Generated from src/runtime/wutu.js by the build. No runtime ships unless used.
mod Component {
    proto &:
        | render() Externref
}

mod wutu {
    fn init() Void {
        let install: fun() Void = @es/\\ () => { globalThis.__utuWutu ??= (function createWutuRuntime() {
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
        load(key);
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
    fn show(value: Externref) Externref {
        value;
    }
    /// A keyed loop's key (\`key k\`) as text: a Str is itself, a number or
    /// a Bool its \`str()\`. The compiler picks which; this body is never
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
        read();
    }
    fn refresh() Void {
        let update: fun() Void = @es/\\ () => globalThis.__utuWutu?.refresh() \\/;
        update();
    }
}
`.replaceAll("@@IR_WASM@@",j)]]);re.set("std:Browser",un);re.set("std:JS",mn);re.set("std:Web",pn);re.set("std:Worker",hn);function yn(e,n,t){let r=n.findIndex(y=>y.key===t);if(r<0)throw new Error(`no loaded file ${t}`);let s=e.file_first_token(r),a=e.file_end_token(r),f=new Uint8Array(e.node_kind.buffer),d=new Int32Array(e.node_first.buffer),l=new Int32Array(e.node_last.buffer),u=new Int32Array(e.node_child.buffer),m=new Int32Array(e.node_next.buffer),i=-1;for(let y=0,c=e.node_count();y<c;y++)if(f[y]===0&&d[y]>=s&&l[y]<=a){i=y;break}if(i<0)throw new Error(`no syntax tree for ${t}`);let o=new Map,h=y=>{let c=f[y];return o.has(c)||o.set(c,e.node_kind_name(c)),o.get(c)},w=y=>{let c=[];for(let _=u[y];_>=0;_=m[_])c.push(w(_));return`(${h(y)}${c.length?` ${c.join(" ")}`:""})`};return w(i)}function Wt(e,n){let t=new TextEncoder().encode(n),r=e.source(t.length);return new Uint8Array(e.src.buffer).set(t,r),e.tokens(t.length),e.nodes(t.length)<0?null:yn(e,[{key:"<source>"}],"<source>")}var we={binding:"#2563eb",call:"#059669",import:"#d97706",type:"#7c3aed"},bn={binding:"name resolves to declaration",call:"call reaches function",import:"module imports file",type:"expression uses type"};function gn(e,n,t){let r=be(e,n),s=ne(n),a=n.find(c=>c.key===t);if(!a)throw new Error(`no loaded file ${t}`);let f=[],d=new Set,l=(c,_,v,k="")=>{if(!_||!v)return;let R=`${c}:${_.file}:${_.start}:${v.file}:${v.start}`;d.has(R)||(d.add(R),f.push({kind:c,from:_,to:v,label:k||bn[c]}))};for(let{decl:c,at:_}of r.names(t)){let v=r.definition(c);v&&!(_.file===v.file&&_.start===v.start)&&l("binding",_,v)}let u=new Uint8Array(e.node_kind.buffer),m=new Int32Array(e.node_first.buffer),i=new Int32Array(e.node_last.buffer),o=new Int32Array(e.tok_start.buffer),h=new Int32Array(e.node_child.buffer),w=new Int32Array(e.node_next.buffer),y=new Int32Array(e.node_decl.buffer);for(let c=0,_=e.node_count();c<_;c++){if(m[c]>=i[c]||o[m[c]]<a.offset||o[m[c]]>=a.offset+a.bytes.length)continue;let v=r.at(c);if(!v||v.file!==t)continue;if(e.node_kind_name(u[c])==="call_expr"){let R=h[c];if(R>=0){let A=y[R];if(A<0)for(let T=h[R];T>=0;T=w[T])y[T]>=0&&(A=y[T]);A>=0&&l("call",v,r.definition(A))}}let k=e.node_type_decl?.(c,1)??-1;k>=0&&l("type",v,r.definition(k))}for(let c=0,_=e.import_count();c<_;c++){if(n[e.import_from(c)]?.key!==t)continue;let k=s(e.import_path_start(c)),R=s(e.import_path_end(c)),A=k&&{file:k.file.key,start:k.offset,end:R?.offset??k.offset},T=new TextDecoder().decode(new Uint8Array(e.src.buffer,e.import_path_start(c),e.import_path_end(c)-e.import_path_start(c))).replace(/^['"]|['"]$/g,""),F={file:n.find(O=>O.key===T||O.key.endsWith(`/${T.replace(/^\.\//,"")}`))?.key??T,start:0,end:0};l("import",A,F,`imports ${F.file}`)}return{key:t,source:a.text,edges:f}}var L=e=>String(e).replace(/[&<>"']/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[n]);function Rt(e,n,t){let{source:r,edges:s}=gn(e,n,t),a=r.split(`
`),f=[0];for(let c=0;c<r.length;c++)r[c]===`
`&&f.push(c+1);let d=c=>{let _=0,v=f.length-1;for(;_<v;){let k=_+v+1>>1;f[k]<=c?_=k:v=k-1}return{x:64+(c-f[_])*8.4,y:24+_*20}},l=s.filter(c=>c.from.file===t&&c.to.file===t),u=s.filter(c=>c.from.file===t&&c.to.file!==t),m=Math.max(720,64+Math.max(40,...a.map(c=>c.length))*8.4+180),i=32+a.length*20,o=l.map(c=>{let _=d(c.from.start),v=d(c.to.start),k=Math.min(120,24+Math.abs(_.y-v.y)*.35);return`<path class="edge ${c.kind}" d="M${_.x} ${_.y-5} C${_.x+k} ${_.y-24},${v.x+k} ${v.y-24},${v.x} ${v.y-5}" stroke="${we[c.kind]}"><title>${L(c.label)}</title></path>`}).join(`
`),h=a.map((c,_)=>`<text class="ln" x="8" y="${24+_*20}">${_+1}</text><text class="src" x="64" y="${24+_*20}">${L(c)}</text>`).join(`
`),w=Object.keys(we).map(c=>`<label><input type="checkbox" data-kind="${c}" checked><span style="color:${we[c]}">\u25CF</span> ${L(bn[c])} (${s.filter(_=>_.kind===c).length})</label>`).join(" "),y=u.map(c=>`<li>${L(c.label)} \u2014 ${L(c.to.file)}</li>`).join("");return`<!doctype html><meta charset="utf-8"><title>utu graphs \u2014 ${L(t)}</title>
<style>body{font:13px system-ui,sans-serif;color:CanvasText;background:Canvas;margin:24px}h1{font-size:16px}.legend{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}.wrap{overflow:auto;border:1px solid #8886;border-radius:6px}svg{display:block;font:12px ui-monospace,monospace;white-space:pre}.ln{fill:#888}.src{fill:CanvasText}.edge{fill:none;stroke-width:1.5;opacity:.7}.edge:hover{opacity:1;stroke-width:2.5}.edge.off{display:none}</style>
<h1>Compiler graphs</h1><p>${L(t)}</p><div class="legend">${w}</div>
<div class="wrap"><svg width="${m}" height="${i}" viewBox="0 0 ${m} ${i}">${o}${h}</svg></div>
${y?`<h2>Other files</h2><ul>${y}</ul>`:""}
<script>for(const box of document.querySelectorAll('input[data-kind]'))box.addEventListener('change',()=>{for(const edge of document.querySelectorAll('.edge.'+box.dataset.kind))edge.classList.toggle('off',!box.checked)})</script>`}async function Ot(e,{map:n=null,files:t=[],source:r=!1}={}){let{print:s}=await import("./wasm-tools-4LXQBNK6.js"),a=await s(e);if(!r||!n?.functions?.length||!t.length)return a;let f=new Map(t.map(i=>[i.key,i])),d=new Map(t.map(i=>[i.key,i.text.split(/\r?\n/)])),l=new Map;for(let i of n.entries??[])i.ownerAt==null||!i.file||!i.line||(l.has(i.ownerAt)||l.set(i.ownerAt,[]),l.get(i.ownerAt).push(i));let u=new Map,m=i=>{for(let o=t.length-1;o>=0;o--){let h=t[o];if(i<h.offset||i>=h.offset+h.bytes.length)continue;let w=new TextDecoder().decode(h.bytes.subarray(0,i-h.offset));return{file:h,line:w.split(`
`).length}}return null};for(let i=0;i<n.functions.length;i++){let o=n.functions[i];if(o==null)continue;let h=m(o);if(!h)continue;let w=l.get(o)??[],y=new Map([[`${h.file.key}:${h.line}`,h.line]]);for(let _ of w)y.set(`${_.file}:${_.line}`,_.line);let c=[];for(let _ of[...y.keys()].sort((v,k)=>v.localeCompare(k,void 0,{numeric:!0})).slice(0,80)){let v=_.lastIndexOf(":"),k=f.get(_.slice(0,v)),R=Number(_.slice(v+1));if(!k)continue;let A=d.get(k.key)?.[R-1]?.trim()??"";c.push(`  ;; ${_.replace(/[\r\n]/g," ")} ${A.replace(/[\r\n]/g," ")}`)}u.set(i,c.join(`
`))}return a.replace(/^(\s*)\(func (?:\$[^\s]+ )?\(;([0-9]+);\)/gm,(i,o,h)=>{let w=u.get(Number(h));return w?`${w}
${i}`:i})}export{oe as MODES,me as OPTIMIZE,re as PLATFORM_SOURCES,P as ROLE,le as TARGET,he as builtModule,ft as catalogStdlib,Wn as compile,nn as compileProgram,_t as formatDiagnostics,At as glueSource,gn as graphData,ye as instantiate,En as loadCompiler,pe as loadProgram,Tt as loaderSource,Wt as parseSyntaxTree,Ot as printWat,be as programIndex,tn as readDiagnostics,Rt as renderGraphHtml,yn as syntaxTree};
