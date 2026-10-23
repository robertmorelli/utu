function ie(e,n={}){for(let t of e?.ops??[])t==="promise_then"&&(n.promise_then=Je),t==="promise_catch"&&(n.promise_catch=Le);return n}var Je=(e,n)=>{e.then(n)},Le=(e,n)=>{e.catch(n)};function se(e,n={}){for(let t of e?.awaits??[])n[`await_${t}`]=ze();return n}function ze(){if(typeof WebAssembly.Suspending!="function")throw new Error("utu: `await` needs JS Promise Integration (WebAssembly.Suspending), which this host does not provide \u2014 use `.then` instead, or run on a JSPI-capable host (Chrome 126+, Node 23+, Bun)");return new WebAssembly.Suspending(async e=>await e)}var ae=Symbol("utu.closure");function oe(e,n={}){if(!e)return n;e.new&&(n.closure_new=Ve),n.closure_rec=Ge;for(let t of e.calls??[])n[t]=Ke;return n}var Ve=(e,n,t,r)=>{let s=n==null&&!(t&2)?(...a)=>e(...a):(...a)=>e(n,...a),l=t&1?(...a)=>!!s(...a):s;return l[ae]=r,l},Ge=e=>e?.[ae]??null,Ke=(e,...n)=>e(...n),Ye={U8:"Uint8Array",I8:"Int8Array",U16:"Uint16Array",I16:"Int16Array",I32:"Int32Array",U32:"Uint32Array",I64:"BigInt64Array",U64:"BigUint64Array",F32:"Float32Array",F64:"Float64Array"};function le(e,n={}){for(let{name:r,kind:s,host:l,data:a}of e??[]){if(!l)continue;let i=Math.max(1,Math.ceil((a?a.length*3/4:0)/65536)),o=new WebAssembly.Memory({initial:i,maximum:65535}),u=globalThis[Ye[s]],d=u.BYTES_PER_ELEMENT,f=c=>{let p=Math.ceil(c/65536)-o.buffer.byteLength/65536;p>0&&o.grow(p)};n[`mem_${r}`]=o,n[`mem_copy_in_${r}`]=c=>{if(typeof c=="string")return f(c.length*3),Math.floor(new TextEncoder().encodeInto(c,new Uint8Array(o.buffer)).written/d);let p=c instanceof ArrayBuffer?new Uint8Array(c):new Uint8Array(c.buffer,c.byteOffset,c.byteLength);return f(p.byteLength),new Uint8Array(o.buffer).set(p),Math.floor(p.byteLength/d)},n[`mem_view_${r}`]=(c,p)=>new u(o.buffer,c*d,p-c)}return n}function fe(e={}){return e.js_tag=WebAssembly.JSTag,e}function de(e,n){let t=n?.asyncExports??[];if(t.length===0)return e.exports;let r={...e.exports};for(let s of t)typeof r[s]=="function"&&(r[s]=He(r[s]));return r}function He(e){return Object.defineProperty(WebAssembly.promising(e),"length",{value:e.length})}function ce(e,n){if(!n)return e;let t={Bool:i=>i!==0,U32:i=>i>>>0,U64:i=>BigInt.asUintN(64,i)},r=i=>i,s=(i,o,u,d)=>{throw new TypeError(`${i}: argument ${o+1} must be ${u}, not ${d===null?"null":typeof d}`)},l=(i,o,u)=>o==="Str"?d=>typeof d=="string"?d:s(i,u,"a string",d):o==="?Str"?d=>d==null?null:typeof d=="string"?d:s(i,u,"a string or null",d):o==="ref"?d=>d??s(i,u,"a value",d):o==="?"?d=>d===void 0?null:d:r,a={...e};for(let[i,o]of Object.entries(n)){let u=e[i];if(typeof u!="function")continue;let d=typeof o=="string"?o:o.r,f=Array.isArray(d)?d.map(_=>t[_]??r):null,c=f?_=>_.map((m,h)=>f[h](m)):t[d]??r,p=(typeof o=="string"?[]:o.p??[]).map((_,m)=>l(i,_,m));a[i]=(..._)=>{for(let h=0;h<p.length;h++)_[h]=p[h](_[h]);let m=u(..._);return m instanceof Promise?m.then(c):c(m)},Object.defineProperty(a[i],"length",{value:u.length})}return a}var re=/^\s*import\s[^;]*;/;function K(e){let n=[],t=e;for(let r=t.match(re);r;r=t.match(re))n.push(r[0].trim()),t=t.slice(r[0].length);return{imports:n,expr:t.trim()}}function C(e,n=null){let t=new Set,r=[];for(let l of Object.values(e??{}))for(let[a,i]of Object.entries(l??{})){if(n&&!n.has(a))continue;let{imports:o,expr:u}=K(i);for(let d of o)t.add(d);r.push(`export const ${U(a)} = (
${u}
);`)}return r.length===0?"":`${t.size?`${[...t].join(`
`)}

`:""}${r.join(`

`)}
`}function U(e){return/^\d/.test(e)?`$${e}`:e}function ue(e,n){let t={};for(let[r,s]of Object.entries(e??{})){t[r]={};for(let l of Object.keys(s??{})){if(!(U(l)in n))continue;let a=n[U(l)];t[r][l]=typeof a=="function"?a:()=>a}}return t}function me(e){let n={};for(let[t,r]of Object.entries(e??{})){n[t]={};for(let[s,l]of Object.entries(r??{})){let a=new Function(`return (${l});`)();n[t][s]=typeof a=="function"?a:()=>a}}return n}var Y={PARSE_ERROR:"parse-error",COMPRESSED_SOURCE:"compressed-source",UNKNOWN_ISLAND:"unknown-island",IMPORT_CYCLE:"import-cycle",UNKNOWN_IMPORT:"unknown-import",ENTRY_SURFACE_CONFLICT:"entry-surface-conflict",MODULE_VARIANCE:"module-variance",INVALID_MODULE_ARITY:"invalid-module-arity",DUPLICATE_DECLARATION:"duplicate-declaration",NON_DEFAULTABLE_TYPE:"non-defaultable-type",INVALID_NULLABLE_TYPE:"invalid-nullable-type",INTEGER_LITERAL_OUT_OF_RANGE:"integer-literal-out-of-range",INVALID_ESCAPE:"invalid-escape",UNKNOWN_TYPE:"unknown-type",UNKNOWN_VARIABLE:"unknown-variable",UNKNOWN_FIELD:"unknown-field",UNKNOWN_METHOD:"unknown-method",UNKNOWN_OPERATOR:"unknown-operator",NOT_CALLABLE:"not-callable",INVALID_AWAIT:"invalid-await",WRONG_ARITY:"wrong-arity",TYPE_MISMATCH:"type-mismatch",INVALID_ASSIGNMENT_TARGET:"invalid-assignment-target",INVALID_BREAK:"invalid-break",INVALID_GLOBAL_INITIALIZER:"invalid-global-initializer",INVALID_FOR_SOURCE:"invalid-for-source",ASSIGNMENT_TO_IMMUTABLE:"assignment-to-immutable",NULLABLE_ACCESS:"nullable-access",MISSING_FIELD:"missing-field",DUPLICATE_FIELD:"duplicate-field",RECURSIVE_TYPE:"recursive-type",NON_EXHAUSTIVE_MATCH:"non-exhaustive-match",IMPLICIT_STRUCT_INIT:"implicit-struct-init",REWRITE_INVARIANT:"rewrite-invariant",INVALID_DSL_USAGE:"invalid-dsl-usage",INVALID_ITERATOR_USAGE:"invalid-iterator-usage"};var Ze=/(?<=\b(?:if\b[^{};]*|else\s*))\{[^{};]*;?\s*\}/g;function he(e,n){let t=[],r=0,s=!1,l=[];for(let[a,i]of e.split(`
`).entries()){let o=i.length>160,u="",d=!1;if(!i.trimStart().startsWith("\\\\"))for(let c=0;c<i.length;c++){let p=i[c],_=i[c+1],m=l.length-1;if(s)p==="*"&&_==="/"&&(s=!1,c++);else if(d)p==="\\"?c++:p==='"'&&(d=!1);else if(l[m]==="text")p==="\\"?c++:p==="`"?l.pop():p==="$"&&_==="{"&&(l.push(0),c++);else{if(p==="/"&&_==="/")break;p==="/"&&_==="*"?(s=!0,c++):p==='"'?d=!0:p==="`"?l.push("text"):m>=0?p==="{"?l[m]++:p==="}"&&l[m]--===0&&l.pop():o&&(u+=p)}}let f=()=>(u.replace(Ze," ").match(/[{};]/g)??[]).length;if(o&&u.trim().length>100&&f()>=5){let c=i.search(/\S/)+1;t.push({kind:Y.COMPRESSED_SOURCE,severity:"warning",message:"This line packs multiple statements or blocks together. Put statements and block contents on separate, indented lines; keep source readable and minify build output instead.",primary:{file:n,row:a+1,col:c,endRow:a+1,endCol:i.length+1,start:r+c-1,end:r+i.length},related:[],notes:[],fixes:[]})}r+=i.length+1}return t}function Xe(e){return e.replace(/"[^"\n]*"|\/\/[^\n]*|\\\\[^\n]*/g,n=>n[0]==='"'?`"${" ".repeat(n.length-2)}"`:" ".repeat(n.length))}function pe(e,n){let t=e.slice(0,n).split(`
`);return{row:t.length,col:t.at(-1).length+1}}function _e(e){let n=new Set,t=[];for(let[r,s]of e){let l=Xe(s);for(let a of l.matchAll(/@island\s+"/g)){let i=a.index+a[0].length;n.add(s.slice(i,s.indexOf('"',i)))}if(!/^(std|node|npm):/.test(r))for(let a of l.matchAll(/\bwutu\s*\.\s*invalidate\s*\(\s*"/g)){let i=a.index+a[0].length-1,o=s.indexOf('"',i+1)+1;t.push({file:r,source:s,start:i,end:o,name:s.slice(i+1,o-1)})}}return t.filter(r=>!n.has(r.name)).map(({file:r,source:s,start:l,end:a,name:i})=>{let o=pe(s,l),u=pe(s,a),d=[...n].sort();return{kind:Y.UNKNOWN_ISLAND,severity:"warning",message:`No @island named "${i}" exists, so this invalidate refreshes nothing.${d.length?` Known islands: ${d.map(f=>`"${f}"`).join(", ")}.`:""}`,primary:{file:r,row:o.row,col:o.col,endRow:u.row,endCol:u.col,start:l,end:a},related:[],notes:[],fixes:[]}})}var R={entry:0,import:1,prelude:2},z={normal:0,test:1,comptime:2,bench:3},H={none:0,size:1,speed:2},Z={small:{optimize:"size",safe:!0},fast:{optimize:"speed",safe:!0},smallUnsafe:{optimize:"size",safe:!1},fastUnsafe:{optimize:"speed",safe:!1},debug:{optimize:"none",safe:!0}},ve=Object.freeze({builtins:["js-string"],importedStringConstants:"'"}),V=new TextDecoder,B=new TextEncoder,N=(e,n,t)=>V.decode(new Uint8Array(e.buffer,n,t-n));async function Qe(e,n={}){return(await ne(e,n)).exports}async function en(e,n,t){let r=t.mode?Z[t.mode]:null;if(t.mode&&!r)throw new Error(`no build mode ${t.mode}: ${Object.keys(Z).join(", ")}`);let{target:s="normal",optimize:l="size",debugNames:a=!1,safe:i=!1,sourceMap:o=!1,blame:u=!1,profile:d=!1}={...t,...r};e.set_optimize(H[l]??H.size),e.set_safe(i?1:0),e.set_debug_names(a?1:0),e.set_source_map?.(o||u?1:0),e.set_profile?.(d?1:0);let f,c;try{f=await Q(e,n,t),c=await je(e,z[s]??z.normal,t)}catch(_){if(!dn(_))throw _;return f=Ie.get(e)??[],{wasm:null,spec:null,diagnostics:[cn(e,f,_)],files:f}}let p=Me(e,f).concat(xn(f));return c<0?{wasm:null,spec:null,diagnostics:p,files:f}:{...ee(e,c),diagnostics:p,files:f,tests:s==="test"?on(e):[],benches:s==="bench"?tn(e):[],map:o&&e.map_count?rn(e,f):null,blame:u&&e.blame_prepare?an(e,f):null,...d?{frames:nn(e,f)}:{}}}function nn(e,n){let t=X(n),r=[];for(let s=0;s<e.profile_count();s++){let l=e.profile_at(s),a=l>=0?t(l):null;r.push({name:e.profile_name(s),file:a?.file.key??null,line:a?.line??null})}return r}function tn(e){let n=[];for(let t=0;t<e.bench_count();t++)n.push({export:`__bench_${t}`,name:xe(N(e.src,e.bench_name_start(t),e.bench_name_end(t)))});return n}function X(e){let n=e.toSorted((r,s)=>r.offset-s.offset),t=new Map;return r=>{let s=0,l=n.length-1,a=null;for(;s<=l;){let d=s+l>>1;n[d].offset<=r?(a=n[d],s=d+1):l=d-1}if(!a||r>a.offset+a.bytes.length)return null;let i=t.get(a);if(!i){i={bytes:[0],units:[0]};for(let d=0;d<a.bytes.length;d++){if(a.bytes[d]!==10)continue;let f=i.bytes.at(-1);i.units.push(i.units.at(-1)+V.decode(a.bytes.subarray(f,d+1)).length),i.bytes.push(d+1)}t.set(a,i)}let o=r-a.offset;for(s=0,l=i.bytes.length-1;s<l;){let d=s+l+1>>1;i.bytes[d]<=o?s=d:l=d-1}let u=V.decode(a.bytes.subarray(i.bytes[s],o)).length+1;return{file:a,line:s+1,column:u,offset:i.units[s]+u-1}}}function rn(e,n){let t=X(n),r=new Map,s=new Map,l=new Map,a=[];for(let o=0;o<e.map_count();o++){let u=e.map_start(o),d=e.map_end(o),f=`${u}:${d}`,c=r.get(f);if(!c){let m=u>=0?t(u):null,h=e.map_kind(o);s.has(h)||s.set(h,h>=0?e.node_kind_name(h):null);let v=e.map_owner_start(o);v>=0&&!l.has(v)&&l.set(v,e.map_owner_name(o)),c={file:m?.file.key??null,line:m?.line??null,column:m?.column??null,start:m?.offset??null,end:m?t(d)?.offset??m.offset:null,kind:s.get(h),owner:v>=0?l.get(v):null,ownerAt:v>=0?v:null},r.set(f,c)}let p=e.map_site_start?.(o)??-1,_=p>=0?t(p):null;a.push({at:e.map_offset(o),...c,site:_&&{file:_.file.key,line:_.line,column:_.column,start:_.offset,end:t(e.map_site_end(o))?.offset??_.offset}})}let i=[];for(let o=0;o<e.map_function_count();o++){let u=e.map_function_start(o);i.push(u>=0?u:null)}return{entries:a,functions:i}}var sn=["defined","import","helper","wat"];function an(e,n){e.blame_prepare();let t=X(n),r=[],s=[],l=new Map,a=new Map,i=new Map,o=m=>{let h=e.blame_node_kind(m);return i.has(h)||i.set(h,h>=0?e.node_kind_name(h):null),i.get(h)},u=m=>{let h=t(e.blame_node_start(m));return h&&{file:h.file.key,line:h.line,column:h.column,start:h.offset,end:t(e.blame_node_end(m))?.offset??h.offset}},d=m=>{if(m<0)return-1;if(!a.has(m)){let h=u(m);a.set(m,h?s.push({name:e.blame_decl_name(m),kind:o(m),...h})-1:-1)}return a.get(m)},f=m=>{if(m<0)return-1;if(!l.has(m)){let h=u(m);l.set(m,h?r.push({...h,kind:o(m),decl:d(e.blame_decl(m))})-1:-1)}return l.get(m)},c=[];for(let m=0;m<e.map_count();m++)c.push({at:e.map_offset(m),place:f(e.blame_map_node(m)),site:f(e.blame_map_site(m))});let p=[];for(let m=0;m<e.map_function_count();m++){let h=V.decode(Uint8Array.from(e.blame_func_name(m),v=>v.charCodeAt(0)));p.push({place:f(e.blame_func_node(m)),role:sn[e.blame_func_role(m)],name:h||null})}let _=(m,h)=>Array.from({length:m},(v,I)=>f(h(I)));return{places:r,decls:s,entries:c,funcs:p,types:_(e.blame_type_count(),m=>e.blame_type_node(m)),globals:_(e.blame_glob_count(),m=>e.blame_glob_node(m)),data:_(e.blame_data_count(),m=>e.blame_data_node(m)),memories:_(e.blame_memory_count(),m=>e.blame_memory_node(m))}}function on(e){let n=[];for(let t=0;t<e.test_count();t++)n.push({export:`__test_${t}`,name:xe(N(e.src,e.test_name_start(t),e.test_name_end(t)))});return n}var ln={n:`
`,t:"	",r:"\r",b:"\b",f:"\f"};function xe(e){return e.slice(1,-1).replace(/\\(u[0-9a-fA-F]{4}|.)/g,(n,t)=>t.length>1?String.fromCharCode(parseInt(t.slice(1),16)):ln[t]??t)}async function Q(e,n,t,r=new Map){let{resolvePath:s=Ee,stdlib:l}=t,a=async f=>(r.has(f)||r.set(f,await(t.readFile.bytes??t.readFile)(f)),r.get(f)),i=mn(e,l),o=[...i.files];Ie.set(e,o);let u=new Map(i.byKey),d=[];q(e,o,u,n,await a(n),R.entry);for(let f=0;f<e.import_count();f++){let c=o[e.import_from(f)],p=N(e.src,e.import_path_start(f),e.import_path_end(f)),_=ke.test(p);if(/^"?(npm|node):/.test(p)||_&&typeof l.get(p)=="function"){e.import_foreign(f),d.push({i:f,raw:p,from:c.key,name:N(e.src,e.import_name_start(f),e.import_name_end(f))});continue}let m=_?p:s(c.key,JSON.parse(p)),h=u.get(m);if(h===void 0){let v=c.role===R.prelude?R.prelude:R.import;if(_){let I=l.get(m);if(typeof I!="string")continue;h=q(e,o,u,m,I,v)}else{let I;try{I=await a(m)}catch{let T=B.encode(m);new Uint8Array(e.src.buffer).set(T,e.import_missing(f,T.length));break}h=q(e,o,u,m,I,v)}}e.import_bind(f,h)}return await yn(e,d,t)?(o.diagnostics=e.resolve(),await wn(e,n,o,t),await fn(e),o):Q(e,n,t,r)}async function fn(e){let n=e.wat_count();if(n===0)return;let{assembleWat:t}=await import("./assemble-QBZS4KRV.js"),r=a=>e.node_kind_name(new Uint8Array(e.node_kind.buffer)[a]),s=a=>{let i=new Int32Array(e.node_child.buffer),o=new Int32Array(e.node_next.buffer),u=[];for(let d=i[a];d>=0;d=o[d])u.push(d);return u},l=a=>{let i=new Int32Array(e.node_first.buffer)[a],o=new Int32Array(e.node_last.buffer)[a];return N(e.src,new Int32Array(e.tok_start.buffer)[i],new Int32Array(e.tok_end.buffer)[o-1])};for(let a=0;a<n;a++){let i=s(e.wat_function(a)),o=i.filter(p=>r(p)==="param_list").flatMap(s).map(p=>{let[_,m]=[s(p)[0],s(p).at(-1)];return{name:l(_),type:l(m)}}),u=i.find(p=>r(p)==="return_type"),d=r(s(u)[0])==="void_type"?"void":l(u),f=i.some(p=>r(p)==="self_param")||r(s(u)[0])==="yield_type",c=t({params:o,result:d,method:f,text:N(e.src,e.wat_text_start(a),e.wat_text_end(a))});if(c.code){let p=e.wat_set(a,c.code.length);new Uint8Array(e.wat_bytes.buffer).set(c.code,p)}else{let{message:p,start:_,end:m}=c.error,h=B.encode(p),v=e.wat_fail(a,_??-1,m??-1,h.length);new Uint8Array(e.src.buffer).set(h,v)}}}var ke=/^[a-z][a-zA-Z0-9_]*:[A-Za-z][a-zA-Z0-9_]*$/;function q(e,n,t,r,s,l){let a=typeof s=="string"?B.encode(s):new Uint8Array(s),i=typeof s=="string"?s:new TextDecoder("utf-8",{ignoreBOM:!0}).decode(a),o=e.file_add(a.length,l);return r.startsWith("std:")&&e.file_mark_std?.(o),new Uint8Array(e.src.buffer).set(a,e.file_offset(o)),n.push({key:r,role:l,text:i,offset:e.file_offset(o),bytes:a}),t.set(r,o),n.parsing=!0,e.file_parse(o),n.parsing=!1,o}var Ie=new WeakMap;function dn(e){return e instanceof RangeError&&/call stack/i.test(e.message)}function cn(e,n,t){let r={kind:"nested-too-deeply",code:"nested-too-deeply",severity:"error",file:null,message:"Program nested too deeply",notes:["The compiler recurses on nesting; split the expression, or the chain, into smaller ones."]},s=n.parsing?e.parse_deepest_at?.()??-1:-1;s<0&&(s=un(e,n));let l=s<0?null:n.findLast(i=>i.offset<=s&&s<=i.offset+i.bytes.length);if(!l)return{...r,message:`${r.message} (${t.message})`};let a=L(l,s,s);return{...r,file:l.key,...a,end:a.start+1,label:"nested too deeply",message:`${r.message} (at about line ${a.line})`}}function un(e,n){let t,r,s,l,a;try{a=e.node_count(),[t,r,s]=["node_child","node_next","node_first"].map(m=>new Int32Array(e[m].buffer,0,a)),l=new Int32Array(e.tok_start.buffer)}catch{return-1}let i=n.filter(m=>m.role===R.entry||m.role===R.import),o=m=>i.some(h=>h.offset<=m&&m<h.offset+h.bytes.length),u=new Uint8Array(a);for(let m=0;m<a;m++)for(let h=t[m];h>=0&&h<a&&!u[h];h=r[h])u[h]=1;let d=new Int32Array(a),f=-1,c=-1,p=0;for(let m=0;m<a;m++){if(u[m]||!o(l[s[m]]))continue;let h=[m];for(;h.length;){let v=h.pop(),I=0;for(let T=t[v];T>=0&&T<a;T=r[T])d[T]=d[v]+1,h.push(T),I++;(f<0||d[v]>d[f])&&(f=v),I>p&&(p=I,c=v)}}let _=f>=0&&d[f]>=200?f:c;return _<0?-1:l[s[_]]}var be=new WeakMap;function Se(e){let n=be.get(e);if(!n){let t=e.map(a=>B.encode(JSON.stringify(a))),r=new Int32Array(t.length),s=new Uint8Array(t.reduce((a,i)=>a+i.length+1,1)),l=0;s[l++]=91,t.forEach((a,i)=>{i>0&&(s[l++]=44),r[i]=l,s.set(a,l),l+=a.length}),s[l++]=93,n={bytes:s.subarray(0,l),offsets:r},be.set(e,n)}return n}var ye=new WeakMap;function Ae(e){let n=ye.get(e);return n||ye.set(e,n={docs:new Map,views:new Map,wanted:new Set,prelude:null,rebuild:!1}),n}function mn(e,n){let t=Ae(e);if(!t.rebuild&&t.prelude?.files.every(r=>n.get(r.key)===r.text))return e.reset_keep(),t.prelude;e.reset(),t.docs.clear(),t.views.clear();for(let r of t.wanted){let s=bn(e,r,_n(e,r,t.docs));t.views.set(r,e.abi_resident_view(s.doc,s.at))}return t.prelude=pn(e,n),e.seal(),t.rebuild=!1,t.prelude}function pn(e,n){let t=[],r=new Map,s=n.get("std:Prelude");if(typeof s!="string")return{files:t,byKey:r};q(e,t,r,"std:Prelude",s,R.prelude);for(let a=0;a<e.import_count();a++){let i=N(e.src,e.import_path_start(a),e.import_path_end(a)),o=n.get(i);!ke.test(i)||typeof o!="string"||e.import_bind(a,r.get(i)??q(e,t,r,i,o,R.prelude))}let l=n.get("std:JsonRuntime");if(typeof l=="string"&&e.json_runtime_room){let a=B.encode(l),i=e.json_runtime_room(a.length);new Uint8Array(e.src.buffer).set(a,i)}return{files:t,byKey:r}}function Te(e,n){let t=e.abi_room(n.length);return new Uint8Array(e.src.buffer).set(n,t),t}var we=new WeakMap;function hn(e){let n=we.get(e);if(!n){let{prefix:t,moduleSpecifier:r,exports:s,names:l,mutableGlobals:a}=e;n={document:Se(e.types),view:B.encode(JSON.stringify({prefix:t,moduleSpecifier:r,exports:s,names:l,mutableGlobals:a}))},we.set(e,n)}return n}function _n(e,n,t){if(!t.has(n.document)){let{bytes:r,offsets:s}=n.document,l=Te(e,r);e.abi_offsets_room(s.length),new Int32Array(e.abi_offsets.buffer,0,s.length).set(s),t.set(n.document,e.abi_doc_at(l,s.length))}return t.get(n.document)}function bn(e,n,t){return{doc:t,at:Te(e,n.view)}}async function yn(e,n,{stdlib:t,resolvePackage:r}){let s=Ae(e),l=[],a=!1;for(let{i,raw:o,from:u,name:d}of n){let f;try{let c=/^"?(npm|node):/.test(o)?await r(JSON.parse(o),{prefix:d,from:u}):await t.get(o)();f=c.document?c:hn(c.abi??c)}catch{continue}s.views.has(f)||(s.wanted.add(f),s.rebuild=!0,a=!0),l.push([i,f])}if(a)return!1;for(let[i,o]of l)e.abi_bind(i,s.views.get(o));return!0}async function wn(e,n,t,{resolvePath:r=Ee,readBinaryFile:s}){for(let l=0;l<e.embed_files();l++){let a=N(e.src,e.embed_path_start(l),e.embed_path_end(l)),i=e.embed_file?t[e.embed_file(l)]?.key??n:n,o;try{o=await s(r(i,a))}catch{e.embed_fail(l);continue}let u=e.embed_set(l,o.length);new Uint8Array(e.embed_bytes.buffer).set(o,u)}}async function je(e,n,t={}){let r=e.comptime_mems();for(let s=0;s<=r;s++){let l=[];for(let f=0;f<r;f++)(e.comptime_waiting?e.comptime_waiting(f):s===0)&&l.push(f);if(l.length===0)break;let a=e.compile_program(z.comptime);if(a<0)return-1;let i=l.filter(f=>!e.comptime_can_run||e.comptime_can_run(f));if(i.length===0){for(let f of l)e.comptime_cycle(f);break}let{wasm:o,spec:u}=ee(e,a),{exports:d}=await ne(o,u,t);for(let f of i){let c=e.comptime_name(f),p;try{p=await d[`__comptime_run_${c}`]()}catch(h){e.comptime_fail(f,d.__comptime_fuel?.value===0?8:vn(h));continue}let _=new Uint8Array(d[`__comptime_${c}`].buffer,0,p*e.comptime_value_size(f)).slice(),m=e.comptime_set(f,p);new Uint8Array(e.comptime_bytes.buffer).set(_,m)}}return gn(e,e.compile_program(n))}async function gn(e,n){if(n<0||!e.user_ir_count?.())return n;try{return await WebAssembly.compile(new Uint8Array(e.out.buffer,0,n).slice(),ve),n}catch(t){if(!(t instanceof WebAssembly.CompileError))throw t;let r=B.encode(String(t.message).replace(/^WebAssembly\.\w+(\(\): | doesn't validate: )/,"")),s=e.ir_invalid_room(r.length);return new Uint8Array(e.src.buffer).set(r,s),e.ir_invalid_report(s,r.length),-1}}function vn(e){let n=String(e?.message??e);return!(e instanceof WebAssembly.RuntimeError)&&!/call stack|recursion/i.test(n)?7:/out of bounds/i.test(n)?1:/unreachable/i.test(n)?2:/divi.*zero|by zero/i.test(n)?3:/overflow/i.test(n)&&!/stack/i.test(n)?4:/null/i.test(n)?5:/call stack|recursion|stack/i.test(n)?6:0}function ee(e,n){let t=new Uint8Array(e.out.buffer,0,n).slice(),r=e.host_json_size(),s=r?JSON.parse(N(e.host_json,0,r)):{};return{wasm:t,spec:s}}function Me(e,n){let t=[];for(let r=0;r<e.diagnostic_count();r++){let s=e.diagnostic_file(r),l=s>=0?n[s]:null,a={kind:e.diagnostic_kind(r),message:e.diagnostic_message(r),severity:"error",file:l?.key??null};if(l&&Object.assign(a,L(l,e.diagnostic_start(r),e.diagnostic_end(r))),e.diagnostic_code){a.code=e.diagnostic_code(r).replace(/(?<=[a-z0-9])(?=[A-Z])/g,"-").toLowerCase();for(let i=0;i<e.diagnostic_extras(r);i++){let o=kn[e.diagnostic_extra_kind(r,i)],u=e.diagnostic_extra_text(r,i);if(o==="note")(a.notes??=[]).push(u);else if(o==="label"){a.label=u;let d=e.diagnostic_extra_start(r,i),f=e.diagnostic_extra_end(r,i);l&&(d!==e.diagnostic_start(r)||f!==e.diagnostic_end(r))&&(a.focus=L(l,d,f))}else{let d=n[e.diagnostic_extra_file(r,i)];if(!d)continue;let f={file:d.key,...L(d,e.diagnostic_extra_start(r,i),e.diagnostic_extra_end(r,i))};o==="fix"?a.fix={...f,text:u,label:e.diagnostic_extra_label(r,i)}:(a.related??=[]).push({...f,role:o,label:u})}}}e.diagnostic_default_label&&a.label==null&&a.file&&(a.label=e.diagnostic_default_label(r)),t.push(a)}return t}function xn(e){return[...e.filter(r=>!/^(std|node|npm):/.test(r.key)).flatMap(r=>he(r.text,r.key)),..._e(e.map(r=>[r.key,r.text]))].map(({kind:r,message:s,primary:l})=>({kind:r,message:s,severity:"warning",file:l.file,start:l.start,end:l.end,line:l.row,column:l.col}))}var kn=["label","expected","found","related","note","fix"];function L(e,n,t){let{units:r,lines:s}=In(e),l=f=>r[Math.min(Math.max(0,f-e.offset),r.length-1)],a=l(n),i=l(t),o=0,u=s.length-1;for(;o<u;){let f=o+u+1>>1;s[f]<=a?o=f:u=f-1}let d=1;for(let f=s[o];f<a;f++){let c=e.text.charCodeAt(f);(c<56320||c>57343)&&d++}return{start:a,end:i,line:o+1,column:d}}var ge=new WeakMap;function In(e){let n=ge.get(e);if(!n){let{bytes:t,text:r}=e,s=new Uint32Array(t.length+1),l=0;for(let i=0;i<t.length;i++){s[i]=l;let o=t[i];(o&192)!==128&&(l+=o>=240?2:1)}s[t.length]=l;let a=[0];for(let i=0;i<r.length;i++){let o=r.charCodeAt(i);(o===10||o===13&&r.charCodeAt(i+1)!==10)&&a.push(i+1)}n={units:s,lines:a},ge.set(e,n)}return n}async function ne(e,n={},{loadGlue:t=null,profiler:r=null}={}){let s=await WebAssembly.compile(e,ve),l=n.es??{},a=C(l),i=a?t?ue(l,await t(a)):me(l):{};r&&(i.profile=r.imports),n.closures&&(i.utu=oe(n.closures,i.utu??{})),n.mems&&(i.utu=le(n.mems,i.utu??{})),n.promises&&(i.utu=ie(n.promises,i.utu??{}),i.utu=se(n.promises,i.utu)),WebAssembly.Module.imports(s).some(d=>d.module==="utu"&&d.name==="js_tag")&&(i.utu=fe(i.utu??{}));let o=await WebAssembly.instantiate(s,i),u=ce(de(o,n.promises),n.exports);return{module:s,instance:o,exports:r?r.attach(o,u):u}}function Ee(e,n){if(/^[a-z]+:\/\//i.test(e))return new URL(n,e).href;let t=e.split("/").slice(0,-1);for(let r of n.split("/"))r===".."?t.pop():r!=="."&&t.push(r);return t.join("/")}var Sn=/[0-9A-Za-z!#$%&'*+\-./:<=>?@\\^_`|~]/,An=new Set(["export","mod","struct","tag","enum","proto","fn","type","distinct","let","const","mem","vec","using"]);function Tn(e,n){let t=(b,w)=>new w(b.buffer),r=t(e.node_first,Int32Array),s=t(e.node_last,Int32Array),l=t(e.tok_start,Int32Array),a=t(e.tok_end,Int32Array),i=t(e.tok_kind,Uint8Array),o=t(e.node_decl,Int32Array),u=t(e.decl_node,Int32Array),d=t(e.decl_owner,Int32Array),f=e.node_count(),c=new Map,p=b=>{for(let w=n.length-1;w>=0;w--)if(n[w].offset<=b)return b<n[w].offset+n[w].bytes.length?n[w]:null;return null},_=(b,w)=>{let y=c.get(b);if(!y){y=new Int32Array(b.bytes.length+1);let g=0;for(let x=0;x<b.bytes.length;){let A=b.bytes[x],j=A<128?1:A<224?2:A<240?3:4;for(let O=0;O<j;O++)y[x+O]=g;x+=j,g+=j===4?2:1}y[b.bytes.length]=g,c.set(b,y)}return y[w-b.offset]},m=b=>{let w=l[r[b]],y=p(w);return y?{file:y.key,start:_(y,w),end:_(y,a[s[b]-1])}:null},h=null,v=()=>{if(h)return h;h=new Int32Array(e.decl_count()).fill(-1);for(let b=0;b<f;b++){let w=o[b];if(w<0||w>=h.length||!I(b)||u[w]<0)continue;let y=l[r[b]];if(y<l[r[u[w]]]||y>=a[s[u[w]]-1])continue;let g=h[w];(g<0||y<l[r[g]])&&(h[w]=b)}return h},I=b=>o[b]>=0&&r[b]<s[b]&&s[b]-r[b]===1,T=null,E=()=>{if(T)return T;T=new Map;let b=new Uint8Array(e.src.buffer);for(let w=0,y=e.wat_count?.()??0;w<y;w++){let g=e.wat_function(w),x=-1;for(let S=0,W=e.decl_count();S<W&&x<0;S++)u[S]===g&&(x=S);let A=new Map;for(let S=0,W=e.decl_count();S<W;S++){if(d[S]!==x||e.decl_kind_name(S)!=="Param")continue;let M=m(v()[S]>=0?v()[S]:u[S]);M&&A.set(n.find($=>$.key===M.file)?.text.slice(M.start,M.end),S)}let j=e.wat_text_start(w),O=e.wat_text_end(w),J=p(j);if(!(!J||!A.size))for(let S=j;S<O;S++){let W=b[S];if(W===59&&b[S+1]===59){for(;S<O&&b[S]!==10;)S++;continue}if(W===40&&b[S+1]===59){let G=0;for(;S<O;S++)if(b[S]===40&&b[S+1]===59)G++,S++;else if(b[S]===59&&b[S+1]===41&&(G--,S++,!G))break;continue}if(W!==36)continue;let M=S+1;for(;M<O&&Sn.test(String.fromCharCode(b[M]));)M++;let $=A.get(new TextDecoder().decode(b.subarray(S+1,M)));$!==void 0&&(T.has($)||T.set($,[]),T.get($).push({file:J.key,start:_(J,S+1),end:_(J,M)})),S=M-1}}return T},F=new TextDecoder,Pe=b=>{for(let w=r[b];w<s[b];w++){if(i[w]===8)continue;let y=p(l[w]);if(!y)return null;let g=F.decode(y.bytes.subarray(l[w]-y.offset,a[w]-y.offset));if(!An.has(g))return g!=="&"&&!/^[A-Za-z_]\w*$/.test(g)?null:{file:y.key,start:_(y,l[w]),end:_(y,a[w])}}return null};return{at:m,declarationAt(b,w){for(let y=0;y<f;y++){if(!I(y))continue;let g=m(y);if(g&&g.file===b&&g.start<=w&&w<=g.end)return o[y]}for(let[y,g]of E())if(g.some(x=>x.file===b&&x.start-1<=w&&w<=x.end))return y;return-1},definition(b){let w=u[b];if(w<0)return null;let y=v()[b];return y>=0?m(y):Pe(w)??m(w)},references(b,{includeDeclaration:w=!0}={}){let y=this.definition(b),g=[];for(let x=0;x<f;x++){if(o[x]!==b||!I(x))continue;let A=m(x);if(!A)continue;let j=y&&A.file===y.file&&A.start===y.start;j&&!w||(j?g.unshift(A):g.push(A))}return[...g,...E().get(b)??[]]},span(b){return u[b]>=0?m(u[b]):null},kind(b){return e.decl_kind_name(b)},owner(b){return d[b]},type(b){return e.decl_checked_type(b)},typeDeclaration(b){return e.decl_checked_type_decl(b)},typeDeclarationOfExpressionBefore(b,w,y=!1){let g=[];for(let x=0;x<f;x++){if(r[x]>=s[x])continue;let A=m(x);A&&A.file===b&&A.end===w&&g.push([A.start,x])}g.sort((x,A)=>x[0]-A[0]);for(let[,x]of g){let A=e.node_type_decl(x,y?1:0);if(A>=0)return A}return-1},declarations(b=null){let w=[];for(let y=0,g=e.decl_count();y<g;y++){if(u[y]<0)continue;let x=m(u[y]);x&&(b==null||x.file===b)&&w.push({decl:y,kind:e.decl_kind_name(y),owner:d[y],span:x})}return w},names(b){let w=[];for(let y=0;y<f;y++){if(!I(y))continue;let g=m(y);g&&g.file===b&&w.push({decl:o[y],at:g})}for(let[y,g]of E())for(let x of g)x.file===b&&w.push({decl:y,at:x});return w.sort((y,g)=>y.at.start-g.at.start),w.filter((y,g)=>g===0||y.at.start!==w[g-1].at.start)},tokenAt(b,w){let y=n.findIndex(g=>g.key===b);if(y<0)return null;for(let g=e.file_first_token(y),x=e.file_end_token(y);g<x;g++){let A=_(n[y],l[g]);if(A>=w)return null;let j=_(n[y],a[g]);if(w<j||w===j&&i[g]===8)return{kind:i[g],start:A,end:j}}return null},text(b){let w=n.find(y=>y.key===b.file);return w?w.text.slice(b.start,b.end):""}}}function jn(e,n){let t=new Map,r,s=i=>(t.has(i)||t.set(i,(async()=>{let[o,u]=await Promise.all([n(`${i}.types.json`),n(`${i}.offsets`)]);return{bytes:o,offsets:Mn(u)}})()),t.get(i)),l=new Map(e),a=new Map;for(let i of["std:Browser","std:JS","std:Web","std:Worker"])typeof e.get(i)=="function"&&l.set(i,()=>(a.has(i)||a.set(i,(async()=>{r??=JSON.parse(new TextDecoder().decode(await n("catalog.json")));let{document:o,view:u}=r[i],[d,f]=await Promise.all([s(o),n(`${u}.view.json`)]);return{document:d,view:f}})()),a.get(i)));return l}function Mn(e){let n=new DataView(e.buffer,e.byteOffset,e.byteLength),t=new Int32Array(e.byteLength/4);for(let r=0;r<t.length;r++)t[r]=n.getInt32(r*4,!0);return t}function En(e){let n=0;for(let t of e){let r=t.codePointAt(0);if(t==="	")n+=4;else{if(r>=768&&r<=879||r>=8203&&r<=8207||r>=65024&&r<=65039)continue;r>=4352&&r<=4447||r>=11904&&r<=42191||r>=44032&&r<=55203||r>=63744&&r<=64255||r>=65072&&r<=65103||r>=65280&&r<=65376||r>=65504&&r<=65510||r>=127744&&r<=128591||r>=129280&&r<=129535||r>=131072&&r<=262141?n+=2:n+=1}}return n}var Re={dark:{bg:[18,20,26],fg:[215,218,224],dim:[118,124,138],rail:[62,67,80],error:[255,107,107],warning:[245,185,66],trap:[199,146,234],expected:[108,182,255],found:[240,166,74],related:[154,163,178],add:[95,211,141],del:[255,123,123],keyword:[179,157,243],string:[158,206,106],number:[232,169,106],type:[125,207,255],function:[130,170,255],comment:[100,108,122],dsl:[158,206,106]},light:{bg:[253,252,249],fg:[43,46,54],dim:[128,133,144],rail:[200,196,186],error:[214,58,58],warning:[183,121,31],trap:[142,68,173],expected:[31,111,209],found:[184,98,11],related:[107,114,128],add:[31,138,76],del:[192,57,43],keyword:[124,77,204],string:[77,124,15],number:[180,83,9],type:[14,116,144],function:[37,99,235],comment:[156,163,175],dsl:[77,124,15]}};function Rn(e=globalThis.process?.env??{}){if(e.UTU_THEME==="light"||e.UTU_THEME==="dark")return e.UTU_THEME;let n=Number(e.COLORFGBG?.split(";").pop());return n===7||n===15?"light":"dark"}function Nn(e=globalThis.process?.env??{}){return/truecolor|24bit/i.test(e.COLORTERM??"")||["iTerm.app","WezTerm","vscode","ghostty","kitty"].includes(e.TERM_PROGRAM)}function Fn([e,n,t]){let r=f=>f<48?0:f<115?1:Math.min(5,Math.floor((f-35)/40)),s=16+36*r(e)+6*r(n)+r(t),l=f=>f===0?0:55+f*40,a=(l(r(e))-e)**2+(l(r(n))-n)**2+(l(r(t))-t)**2,i=Math.round(((e+n+t)/3-8)/10),o=232+Math.max(0,Math.min(23,i)),u=8+10*(o-232);return(u-e)**2+(u-n)**2+(u-t)**2<a?o:s}function On({color:e=!1,theme:n=Rn(),truecolor:t=Nn()}={}){let r=Re[n]??Re.dark,s=(i,o)=>t?`\x1B[${i};2;${o.join(";")}m`:`\x1B[${i};5;${Fn(o)}m`,l=(i,o)=>i.map((u,d)=>Math.round(r.bg[d]+(u-r.bg[d])*o)),a=!!e;return{on:a,palette:r,fg:i=>a?s(38,i):"",bg:i=>a?s(48,i):"",tint:(i,o)=>a?s(48,l(i,o)):"",bold:a?"\x1B[1m":"",italic:a?"\x1B[3m":"",strike:a?"\x1B[9m":"",reset:a?"\x1B[0m":"",paint(i,o){return a?`${s(38,i)}${o}\x1B[0m`:o}}}function Wn(e,n,t,r){let s=n.toUpperCase(),l=e.palette[n]??e.palette.error,i=[`${e.on?`${e.bg(l)}${e.fg(e.palette.bg)}${e.bold} ${s} ${e.reset}`:` ${s} `} ${e.bold}${t}${e.reset}`];return r&&i.push(`${" ".repeat(s.length+3)}${e.paint(e.palette.dim,r)}`),i}function Bn(e,n){return(n??[]).map(t=>`  ${e.paint(e.palette.dim,"note")}  ${t}`)}var $n={primary:.32,expected:.24,found:.24,related:.2};function Un(e,n,{color:t=!1,relative:r=i=>i,highlight:s=null,theme:l,truecolor:a}={}){let i=On({color:t,theme:l,truecolor:a});return e.map(o=>Cn(o,n,i,r,s)).join(`

`)}function Cn(e,n,t,r,s){let l=e.severity??"error",a=t.palette[l]??t.palette.error,i=e.code??e.kind??"",o=e.focus??e,u=e.file!=null?`${r(e.file)}${o.line!=null?`:${o.line}:${o.column}`:""}`:"",d=Wn(t,l,e.message,[i,u].filter(Boolean).join(" \xB7 ")),f=[];e.file!=null&&e.start!=null&&n.get(e.file)!=null&&f.push({file:e.file,start:e.focus?.start??e.start,end:e.focus?.end??e.end,role:"primary",label:e.label});for(let h of e.related??[])n.get(h.file)!=null&&f.push({file:h.file,start:h.start,end:h.end,role:h.role,label:h.label});let p=[...new Set(f.map(h=>h.file))].map(h=>qn(n.get(h),h,f.filter(v=>v.file===h),e.file===h)),_=Math.max(2,...p.flatMap(h=>h.rows.filter(v=>v.line!=null).map(v=>String(v.line+1).length))),m=h=>`${t.paint(t.palette.dim,String(h??"").padStart(_))} ${t.paint(t.palette.rail,"\u2502")} `;for(let h of p){d.push(""),h.file!==e.file&&d.push(`${" ".repeat(_)} ${t.paint(t.palette.rail,"\u256D\u2500")} ${t.paint(t.palette.dim,r(h.file))}`);for(let v of h.rows){if(v.gap){d.push(`${" ".repeat(_)} ${t.paint(t.palette.rail,"\u2506")}`);continue}d.push(m(v.line+1)+Dn(v,h,t,a,s));for(let I of Pn(v,t,a))d.push(m()+I)}}return e.notes?.length&&d.push("",...Bn(t,e.notes)),e.fix&&n.get(e.fix.file??e.file)!=null&&d.push("",...Jn(e.fix,n.get(e.fix.file??e.file),t,m,_)),d.join(`
`)}function qn(e,n,t,r){let s=[0];for(let f=e.indexOf(`
`);f>=0;f=e.indexOf(`
`,f+1))s.push(f+1);let l=f=>{let c=0,p=s.length-1;for(;c<p;){let _=c+p+1>>1;s[_]<=f?c=_:p=_-1}return c},a=f=>e.slice(s[f],(s[f+1]??e.length+1)-1).replace(/\r$/,""),i=new Set;for(let f of t){f.first=l(f.start),f.last=Math.max(f.first,l(Math.max(f.start,f.end-1)));for(let c=f.first;c<=f.last;c++)(f.last-f.first+1<=6||c<f.first+2||c>f.last-2)&&i.add(c)}let o=t.find(f=>f.role==="primary");if(o&&r){for(let f=Math.max(0,o.first-2);f<=Math.min(s.length-1,o.last+2);f++)i.add(f);for(;i.size>1&&!a(Math.max(...i)).trim()&&Math.max(...i)>o.last;)i.delete(Math.max(...i))}let u=[],d=null;for(let f of[...i].sort((c,p)=>c-p)){d!=null&&f>d+1&&u.push({gap:!0}),d=f;let c=a(f),p=t.filter(_=>_.first<=f&&f<=_.last).map(_=>{let m=f===_.first?_.start-s[f]:c.length-c.trimStart().length,h=f===_.last?Math.min(c.length,Math.max(m+1,_.end-s[f])):c.length;return{mark:_,from:m,to:Math.max(h,m+(c.length>m?1:0)),ends:f===_.last}});u.push({line:f,raw:c,offset:s[f],marks:p})}return{file:n,rows:u}}function Dn(e,n,t,r,s){let l=e.raw,a=c=>c.replace(/\t/g,"    ");if(!t.on)return a(l);let i=s?s(n.file,e.offset,e.offset+l.length):[],o=new Array(l.length).fill(null);for(let{mark:c,from:p,to:_}of e.marks)for(let m=p;m<_&&m<l.length;m++)o[m]=c.role;let u=new Array(l.length).fill(null);for(let c of i)for(let p=Math.max(0,c.start-e.offset);p<Math.min(l.length,c.end-e.offset);p++)u[p]=c.class;let d="",f=0;for(;f<l.length;){let c=f+1;for(;c<l.length&&o[c]===o[f]&&u[c]===u[f];)c++;let p=o[f],_=u[f],m=t.palette[_]??t.palette.fg,h=(p?t.tint(p==="primary"?r:t.palette[p],$n[p]):"")+(p==="primary"?t.bold:"")+(_==="comment"||_==="parameter"?t.italic:"")+t.fg(_==="comment"?t.palette.comment:m);d+=`${h}${a(l.slice(f,c))}${t.reset}`,f=c}return d}function Pn(e,n,t){let r=e.marks.filter(o=>o.ends).sort((o,u)=>o.from-u.from);if(!r.length)return[];let s=o=>En(e.raw.slice(0,o)),l=o=>o.mark.role==="primary"?t:n.palette[o.mark.role],a=[];if(!n.on){let o="",u=0;for(let d of r){let f=s(d.from),c=Math.max(f+1,s(d.to));f<u||(o+=" ".repeat(f-u)+(d.mark.role==="primary"?"\u2501":"\u2500").repeat(c-f),u=c)}a.push(o)}let i=r.filter(o=>o.mark.label);for(let o=i.length-1;o>=0;o--){let u="",d=0;for(let c=0;c<o;c++){let p=s(i[c].from);u+=" ".repeat(Math.max(0,p-d))+n.paint(l(i[c]),"\u2502"),d=p+1}let f=s(i[o].from);u+=" ".repeat(Math.max(0,f-d))+n.paint(l(i[o]),"\u2570\u2500")+" "+i[o].mark.label,a.push(u)}return a}function Jn(e,n,t,r){let s=n.lastIndexOf(`
`,e.start-1)+1,l=(()=>{let c=n.indexOf(`
`,e.end);return c<0?n.length:c})(),a=n.slice(s,l),i=n.slice(s,e.start)+e.text+n.slice(e.end,l),o=n.slice(0,s).split(`
`).length,u=[`  ${t.paint(t.palette.add,`${t.bold}fix`)}   ${e.label??""}`];return t.on?(Ln(a,i).map(c=>c.k==="="?t.paint(t.palette.fg,c.t):c.k==="+"?`${t.tint(t.palette.add,.28)}${t.fg(t.palette.add)}${c.t}${t.reset}`:`${t.fg(t.palette.del)}${t.strike}${c.t}${t.reset}`).join("").split(`
`).forEach((c,p)=>u.push(r(o+p)+c)),u):(i.split(`
`).forEach((c,p)=>u.push(r(o+p)+c)),u)}function Ln(e,n){let t=c=>c.match(/[A-Za-z0-9_]+|\s+|./gs)??[],r=t(e),s=t(n),l=r.length,a=s.length,i=Array.from({length:l+1},()=>new Uint16Array(a+1));for(let c=l-1;c>=0;c--)for(let p=a-1;p>=0;p--)i[c][p]=r[c]===s[p]?i[c+1][p+1]+1:Math.max(i[c+1][p],i[c][p+1]);let o=[],u=(c,p)=>{let _=o[o.length-1];_?.k===c?_.t+=p:o.push({k:c,t:p})},d=0,f=0;for(;d<l&&f<a;)r[d]===s[f]?(u("=",r[d]),d++,f++):i[d+1][f]>=i[d][f+1]?u("-",r[d++]):u("+",s[f++]);for(;d<l;)u("-",r[d++]);for(;f<a;)u("+",s[f++]);return o}function zn(e,n=null){if(!n)return C(e.es??{});let{firsts:t}=Fe(e,Ne(n));return C(e.es??{},new Set(t.values()))}var Ne=e=>WebAssembly.Module.imports(new WebAssembly.Module(e,Oe));function Fe(e,n){let t=new Set(n.filter(l=>l.module==="es").map(l=>l.name)),r=Object.entries(Object.assign({},...Object.values(e.es??{}))).filter(([l])=>t.has(l)),s=new Map;for(let[l,a]of r)s.has(a)||s.set(a,l);return{fields:r,firsts:s}}function Vn(e,n,{runtime:t,glue:r,wasm:s,streaming:l=!1}){let a=Ne(n),i=new Set,o=v=>(i.add(v),v),u=[],d=[],{fields:f,firsts:c}=Fe(e,a);if(r&&f.length){let v=!1,I=f.map(([,E])=>{let F=U(c.get(E));return Gn(K(E).expr)?F:(v=!0,`$utuValue(${F})`)});u.push(`import { ${[...c.values()].map(U).join(", ")} } from ${JSON.stringify(r)};`),v&&u.push("const $utuValue = value => typeof value === 'function' ? value : () => value;");let T=f.every(([E],F)=>E===String(F));d.push(`es: ${T?`[${I.join(", ")}]`:`{ ${f.map(([E],F)=>`${E}: ${I[F]}`).join(", ")} }`}`)}let p=[];for(let{module:v,name:I}of a)v==="utu"&&(I==="closure_new"?p.push(`closure_new: ${o("closureNew")}`):I==="closure_rec"?p.push(`closure_rec: ${o("closureRec")}`):I.startsWith("closure_call_")?p.push(`${I}: ${o("closureApply")}`):I==="promise_then"?p.push(`promise_then: ${o("promiseThen")}`):I==="promise_catch"?p.push(`promise_catch: ${o("promiseCatch")}`):I.startsWith("await_")?p.push(`${I}: ${o("awaitImport")}()`):I==="js_tag"&&p.push("js_tag: WebAssembly.JSTag"));if(p.length||e.mems){let v=`{ ${p.join(", ")} }`;d.push(`utu: ${e.mems?`${o("memoryImports")}(${JSON.stringify(e.mems)}, ${v})`:v}`)}let _=e.promises?.asyncExports??[],m="instance.exports";_.length&&(m=`{ ...instance.exports, ${_.map(I=>`${JSON.stringify(I)}: ${o("promising")}(instance.exports[${JSON.stringify(I)}])`).join(", ")} }`),e.exports&&(m=`${o("convertExports")}(${m}, ${JSON.stringify(e.exports)})`),i.size&&u.unshift(`import { ${[...i].join(", ")} } from ${JSON.stringify(t)};`);let h=l?"instantiateStreaming":"instantiate";return u.push(`export const { instance } = await WebAssembly.${h}(${s}, { ${d.join(", ")} }, ${JSON.stringify(Oe)});`),u.push(`export const exports = ${m};`),u.join(`
`)+`
`}function Gn(e){return/^(async\s+)?(function\b|[\w$]+\s*=>|\([^()]*\)\s*=>)/.test(e)||/^\((f => \((p\d+(,p\d+)*)?\) => |v => \(\) => v\)\(|v => \(w => \(\) => w\)\()/.test(e)}var Oe={builtins:["js-string"],importedStringConstants:"'"};var We=()=>import("./browser-catalog.generated-2OMWPVRO.js");async function Be(e,n,t){let r=e[`${n}_JSON`];if(r===void 0){let l=Uint8Array.from(atob(e[`${n}_GZIP`]),i=>i.charCodeAt(0)),a=new Blob([l]).stream().pipeThrough(new DecompressionStream("gzip"));r=await new Response(a).text()}let s=JSON.parse(r);if(s.version!==1)throw new Error(`Unsupported ${t} declaration ABI version`);return s}function D(e){let n;return()=>n??=e().catch(t=>{throw n=void 0,t})}var te=D(async()=>Be(await We(),"BROWSER_ABI","browser")),Kn=D(async()=>Be(await We(),"WORKER_ABI","worker"));function $e(e,n,t){let r=s=>Object.fromEntries(Object.entries(s).filter(([l])=>t(l)));return{source:`mod ${e} {}`,abi:{...n,prefix:e,exports:r(n.exports),names:r(n.names),mutableGlobals:n.mutableGlobals.filter(t)}}}async function Ue(){return{source:"mod Browser {}",abi:await te()}}var Ce=D(async()=>{let e=await te(),n=new Set(e.ecmascript??[]);return $e("JS",e,t=>n.has(t))}),Yn=["AbortController","AbortSignal","Blob","ByteLengthQueuingStrategy","CompressionStream","CountQueuingStrategy","Crypto","CryptoKey","CustomEvent","DOMException","DecompressionStream","Event","EventTarget","File","FormData","Headers","MessageChannel","MessageEvent","MessagePort","ReadableByteStreamController","ReadableStream","ReadableStreamBYOBReader","ReadableStreamBYOBRequest","ReadableStreamDefaultController","ReadableStreamDefaultReader","Request","RequestInit","Response","ResponseInit","SubtleCrypto","TextDecoder","TextDecoderStream","TextEncoder","TextEncoderStream","TransformStream","TransformStreamDefaultController","URL","URLSearchParams","WebAssembly","WritableStream","WritableStreamDefaultController","WritableStreamDefaultWriter","atob","btoa","clearInterval","clearTimeout","console","crypto","fetch","navigator","performance","queueMicrotask","reportError","setInterval","setTimeout","structuredClone"],qe=D(async()=>{let e=new Set(Yn);return $e("Web",await te(),n=>e.has(n))}),De=D(async()=>({source:"mod Worker {}",abi:await Kn()}));var k="ir-wasm-",P=new Map([["std:Array",`// std/Array.utu \u2014 Array[T1]
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
`.replaceAll("@@IR_WASM@@",k)],["std:Bool",`// std/Bool.utu \u2014 Bool scalar type module
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
`.replaceAll("@@IR_WASM@@",k)],["std:Buffer",`// Geometrically growing native buffer, including non-defaultable element types.
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
`.replaceAll("@@IR_WASM@@",k)],["std:Console",`//! The host's console: \`using console from std:Console;\`, then
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
`.replaceAll("@@IR_WASM@@",k)],["std:Externref",`// std/Externref.utu \u2014 Externref opaque external reference type module
// & maps to the WebAssembly Externref type: an opaque, garbage-collected
// reference to a host (JavaScript) object.
// Externrefs ARE nullable: ?Externref is valid.
//
// No arithmetic or comparison operators \u2014 externrefs are fully opaque.
// Host operations are accessed via @ir DSL or imported JS functions.

mod Externref {
    type & = @ir/\\ <@@IR_WASM@@ref type-repr="wasm-externref"/> \\/
}
`.replaceAll("@@IR_WASM@@",k)],["std:F32",`// std/F32.utu \u2014 F32 scalar type module
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
`.replaceAll("@@IR_WASM@@",k)],["std:F64",`// std/F64.utu \u2014 F64 scalar type module
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
`.replaceAll("@@IR_WASM@@",k)],["std:Found",`// Optional iterator result: null means empty; a present wrapper holds any T,
// including non-nullable scalar types. Use \`promote\` or \`orelse\` to unwrap.
mod Found[T] {
    struct &:
        | value: T
    fn &.new(value: T) & {
        &{ value: value };
    }
}
`.replaceAll("@@IR_WASM@@",k)],["std:Group",`mod Group[K, T] {
    struct &:
        | key: K
        | values: Array[T]
    fn &.new(key: K) & {
        &{ key: key, values: [] };
    }
}
`.replaceAll("@@IR_WASM@@",k)],["std:I31",`// std/I31.utu \u2014 I31 WasmGC reference type module
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
`.replaceAll("@@IR_WASM@@",k)],["std:I32",`// std/I32.utu \u2014 I32 scalar type module
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
`.replaceAll("@@IR_WASM@@",k)],["std:I64",`// std/I64.utu \u2014 I64 scalar type module
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
`.replaceAll("@@IR_WASM@@",k)],["std:IntMap",`// std/IntMap.utu \u2014 I32 keys to I32 values, open addressing.
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
`.replaceAll("@@IR_WASM@@",k)],["std:Interner",`// std/Interner.utu \u2014 byte strings to dense I32 ids: 0, 1, 2, \u2026 in first-seen order.
//
//   let names = Interner.new();
//   names.begin();
//   for (start ..< end) |i| { names.byte(src[i]); };   // src can be a mem
//   let id = names.finish();      // the same bytes always get the same id
//   names.size(id); names.byte_at(id, 0); names.ascii(id);
//
// Keys arrive a byte at a time, so they can come from a mem, an array, or a
// string. The bytes of a new key are kept; a repeated key's are dropped.
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

    fn &.byte |self| (b: I32) void {
        if self.used == self.bytes.len() {
            let grown = Array[I32].new(self.used * 2, 0);
            grown.copy_from(0, self.bytes, 0, self.used);
            self.bytes = grown;
        };
        self.bytes[self.used] = b & 255;
        self.used += 1;
        self.hash = (self.hash ^ (b & 255)) * 16777619;
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

    // The key as a string, one character per byte (exact for ASCII).
    fn &.ascii |self| (id: I32) Str {
        Str.from_codes(self.bytes.slice(self.starts[id], self.starts[id + 1]), self.size(id));
    }
}
`.replaceAll("@@IR_WASM@@",k)],["std:JsonRuntime",`struct JsonReader__:
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
    for (0..<(r.failed - 1)) |i| {
        if r.text[i] == 10 {
            line += 1;
            column = 1;
        } else {
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
`.replaceAll("@@IR_WASM@@",k)],["std:List",`mod List[T] {
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
`.replaceAll("@@IR_WASM@@",k)],["std:LiteralDefaults",`// std/LiteralDefaults.utu \u2014 default static type for each literal syntax kind
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
`.replaceAll("@@IR_WASM@@",k)],["std:M128",`// std/M128.utu \u2014 M128 bitmask type module
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
`.replaceAll("@@IR_WASM@@",k)],["std:M32",`// std/M32.utu \u2014 M32 bitmask type module
// & is a 32-bit bitmask value (same wasm representation as I32).
// Intended for use as a lane-selection mask, not a general integer.
// Supports bitwise and comparison ops; arithmetic (add/sub/mul) is excluded.

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
`.replaceAll("@@IR_WASM@@",k)],["std:M64",`// std/M64.utu \u2014 M64 bitmask type module
// & is a 64-bit bitmask value (same wasm representation as I64).
// Intended for use as a lane-selection mask, not a general integer.
// Supports bitwise and comparison ops; arithmetic (add/sub/mul) is excluded.

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
`.replaceAll("@@IR_WASM@@",k)],["std:NumberField",`// Keep the user's draft, including empty/invalid text, separate from a number.
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
`.replaceAll("@@IR_WASM@@",k)],["std:Ord",`//! An order, for bounded modules: \`using Ord from std:Ord;\` and
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
`.replaceAll("@@IR_WASM@@",k)],["std:PersistentSegmentTree",`// Immutable versions of an ordered monoid index. Point updates share untouched
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
`.replaceAll("@@IR_WASM@@",k)],["std:Prelude",`// std/prelude.utu \u2014 automatically injected into every compilation
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
`.replaceAll("@@IR_WASM@@",k)],["std:Promise",`// std/Promise.utu \u2014 Promise[T]
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
    fn &.then |self| (on_value: cl(T1) void) void {
        @ir/\\ <ir-promise-then><ir-ident name="self"/><ir-ident name="on_value"/></ir-promise-then> \\/;
    }

    // Subscribe to rejection. The reason is an opaque host value.
    fn &.catch |self| (on_error: cl(Externref) void) void {
        @ir/\\ <ir-promise-catch><ir-ident name="self"/><ir-ident name="on_error"/></ir-promise-catch> \\/;
    }
}
`.replaceAll("@@IR_WASM@@",k)],["std:Random",`//! Seeded random numbers: \`using Random from std:Random;\`.
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
`.replaceAll("@@IR_WASM@@",k)],["std:Result",`//! \`Result[T, E]\`: a value of type T, or the error E that kept it from being
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
`.replaceAll("@@IR_WASM@@",k)],["std:SegmentTree",`// An ordered monoid index. combine must be associative and identity neutral.
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
`.replaceAll("@@IR_WASM@@",k)],["std:Spatial",`using Buffer from std:Buffer;

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
`.replaceAll("@@IR_WASM@@",k)],["std:Str",`// std/Str.utu \u2014 Str string reference type module
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

    // Substring [start, end) \u2014 returns a new string.
    fn slice(s: &, start: I32, end_: I32) & {
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
    fn &.slice |self| (start: I32, end_: I32) & {
        @ir/\\ <ir-string-slice-wtf16>
            <ir-ident name="self"/>
            <ir-ident name="start"/>
            <ir-ident name="end_"/>
        </ir-string-slice-wtf16> \\/;
    }
    fn &.get |self| (i: I32) I32 {
        @ir/\\ <ir-string-get-wtf16><ir-ident name="self"/><ir-ident name="i"/></ir-string-get-wtf16> \\/;
    }
    fn &.get_index |self| (i: I32) I32 {
        @ir/\\ <ir-string-get-wtf16><ir-ident name="self"/><ir-ident name="i"/></ir-string-get-wtf16> \\/;
    }
    fn &.get_slice |self| (start: I32, end_: I32) & {
        @ir/\\ <ir-string-slice-wtf16>
            <ir-ident name="self"/>
            <ir-ident name="start"/>
            <ir-ident name="end_"/>
        </ir-string-slice-wtf16> \\/;
    }

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
`.replaceAll("@@IR_WASM@@",k)],["std:StrMap",`//! Str keys to values of any type: \`using StrMap from std:StrMap;\`.
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
`.replaceAll("@@IR_WASM@@",k)],["std:Stream",`//! \`Stream[T]\`: a JavaScript async iterable, held as an externref. An async
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
`.replaceAll("@@IR_WASM@@",k)],["std:Time",`//! Clocks: \`using time from std:Time;\`, then \`time.now()\`. Each function ships only when used.

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
`.replaceAll("@@IR_WASM@@",k)],["std:U32",`// std/U32.utu \u2014 U32 scalar type module
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
    fn &:bnot |a| & { @ir/\\ <ir-u32-xor><ir-ident name="a"/><ir-lit kind="int" type-name="U32" value="-1"/></ir-u32-xor> \\/; }

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
`.replaceAll("@@IR_WASM@@",k)],["std:U64",`// std/U64.utu \u2014 U64 scalar type module
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
    fn &:bnot |a| & { @ir/\\ <ir-u64-xor><ir-ident name="a"/><ir-lit kind="int" type-name="U64" value="-1"/></ir-u64-xor> \\/; }

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
`.replaceAll("@@IR_WASM@@",k)],["std:V128",`// std/V128.utu \u2014 V128 SIMD vector type module
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
`.replaceAll("@@IR_WASM@@",k)],["std:Wutu",`// Generated from src/runtime/wutu.js by the build. No runtime ships unless used.
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
   * The element for \`site\` here: last render's, a prerendered one, or what
   * \`make()\` makes. It joins its parent's children where it is entered.
   */
  function claim(site, key, tag, make) {
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
    if (node) active?.retained.add(node);
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
    if (parent) { parent.used.add(node); parent.wanted.push(node); }
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
      for (const name in attributes) element.setAttribute(name, attributes[name]);
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
    if (value === null || value === false) {
      node.removeAttribute(name);
      return;
    }
    const text = value === true ? '' : String(value);
    if (node.getAttribute(name) !== text) node.setAttribute(name, text);
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
        handler(new Event('mount'));
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
        try {
          for (const [current, isQuiet] of [...record.handlers]) {
            if (!isQuiet) loud = true;
            const result = current(e);
            if (result?.then) result.then(refresh, error => { refresh(); setTimeout(() => { throw error; }); });
          }
        } finally {
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
          run.nodes[op[1]] = claim(\`v\${run.h}:\${op[1]}\`, '', element.localName, () => element.cloneNode(true));
          break;
        }
        case 'o': {
          const [element, names] = prototypeOfTree(op[2], !!op[3]);
          run.nodes[op[1]] = open(claim(\`v\${run.h}:\${op[1]}\`, '', element.localName, () => element.cloneNode(false)), names, settable(top.ops, top.pc));
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
    return root;
  }

  function render(view) {
    const previous = [frames, active, keys], focused = document.activeElement;
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
    generation++;
    try {
      view.root = view.render();
      // cleanup() registrations are positional: ones not repeated this render run now.
      for (const callback of view.cleanupCallbacks.splice(view.cleanupIndex)) callback();
      // So are intervals: one not started again this render stops.
      for (const [key, timer] of view.effects) if (!view.intervalsSeen.has(key)) { clearInterval(timer.id); view.effects.delete(key); }
      for (const node of view.removals) {
        if (view.retained.has(node)) continue;
        dispose(node);
        node.remove();
      }
      if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
    } finally {
      [frames, active, keys] = previous;
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
    enter, append, attr, listen, leave, mount, refresh, invalidate, selectValue, here,
    put, begin, slot, arm, item, end, node, done,
    storageError: '',
    notify() {
      for (const ref of views) {
        const view = ref.deref();
        if (view?.root.isConnected) schedule(view);
      }
    },
    /**
     * A timer owned by the rendering view: started once per key, stopped by
     * the first render that does not start it again, or when the view goes.
     */
    interval(key, milliseconds, callback) {
      const view = active;
      if (!view) return;
      view.intervalsSeen.add(key);
      const effect = view.effects.get(key);
      if (effect) { effect.callback = callback; return; }
      const entry = { callback, id: 0 };
      entry.id = setInterval(() => { entry.callback(); autoSave(); schedule(view); }, Math.max(16, milliseconds));
      view.effects.set(key, entry);
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
    clearTimeout(timer);
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
    clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
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
    const store = stores.get(event.key);
    if (!store) return;
    if (store.dirty) {
      store.conflict = true;
      clearTimeout(timer);
      report('Unsaved local changes conflict with another tab. Reload or explicitly save to keep this tab.');
      return;
    }
    try {
      store.apply?.(event.newValue ?? '');
      store.last = event.newValue;
      api.refresh();
    } catch (cause) {
      report(cause);
    }
  });
})(globalThis.__utuWutu); } \\/;
        install();
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
        let format: fun(I32) Str = @es/\\ cents=>"$"+(cents/100).toFixed(2) \\/;
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
`.replaceAll("@@IR_WASM@@",k)]]);P.set("std:Browser",Ue);P.set("std:JS",Ce);P.set("std:Web",qe);P.set("std:Worker",De);export{Z as MODES,H as OPTIMIZE,P as PLATFORM_SOURCES,R as ROLE,z as TARGET,ee as builtModule,jn as catalogStdlib,en as compile,je as compileProgram,Un as formatDiagnostics,zn as glueSource,ne as instantiate,Qe as loadCompiler,Q as loadProgram,Vn as loaderSource,Tn as programIndex,Me as readDiagnostics};
