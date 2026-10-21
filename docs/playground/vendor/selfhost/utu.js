function X(e,r={}){for(let t of e?.ops??[])t==="promise_then"&&(r.promise_then=(n,s)=>{n.then(s)}),t==="promise_catch"&&(r.promise_catch=(n,s)=>{n.catch(s)});return r}function ee(e,r={}){for(let t of e?.awaits??[]){if(typeof WebAssembly.Suspending!="function")throw new Error("utu: `await` needs JS Promise Integration (WebAssembly.Suspending), which this host does not provide \u2014 use `.then` instead, or run on a JSPI-capable host (Chrome 126+, Node 23+, Bun)");r[`await_${t}`]=new WebAssembly.Suspending(async n=>await n)}return r}function ne(e,r={}){if(!e)return r;e.new&&(r.closure_new=(n,s,o)=>{let i=s==null&&!(o&2)?(...a)=>n(...a):(...a)=>n(s,...a);return o&1?(...a)=>!!i(...a):i});let t=(n,...s)=>n(...s);for(let n of e.calls??[])r[n]=t;return r}var Oe={U8:"Uint8Array",I8:"Int8Array",U16:"Uint16Array",I16:"Int16Array",I32:"Int32Array",U32:"Uint32Array",I64:"BigInt64Array",U64:"BigUint64Array",F32:"Float32Array",F64:"Float64Array"};function te(e,r={}){for(let{name:n,kind:s,host:o,data:i}of e??[]){if(!o)continue;let a=Math.max(1,Math.ceil((i?i.length*3/4:0)/65536)),l=new WebAssembly.Memory({initial:a,maximum:65535}),d=globalThis[Oe[s]],c=d.BYTES_PER_ELEMENT,u=f=>{let m=Math.ceil(f/65536)-l.buffer.byteLength/65536;m>0&&l.grow(m)};r[`mem_${n}`]=l,r[`mem_copy_in_${n}`]=f=>{if(typeof f=="string")return u(f.length*3),Math.floor(new TextEncoder().encodeInto(f,new Uint8Array(l.buffer)).written/c);let m=f instanceof ArrayBuffer?new Uint8Array(f):new Uint8Array(f.buffer,f.byteOffset,f.byteLength);return u(m.byteLength),new Uint8Array(l.buffer).set(m),Math.floor(m.byteLength/c)},r[`mem_view_${n}`]=(f,m)=>new d(l.buffer,f*c,m-f)}return r}function re(e={}){return e.js_tag=WebAssembly.JSTag,e}function ie(e,r){let t=r?.asyncExports??[];if(t.length===0)return e.exports;let n={...e.exports};for(let s of t)typeof n[s]=="function"&&(n[s]=WebAssembly.promising(n[s]));return n}var Q=/^\s*import\s[^;]*;/;function We(e){let r=[],t=e;for(let n=t.match(Q);n;n=t.match(Q))r.push(n[0].trim()),t=t.slice(n[0].length);return{imports:r,expr:t.trim()}}function D(e,r=null){let t=new Set,n=[];for(let o of Object.values(e??{}))for(let[i,a]of Object.entries(o??{})){if(r&&!r.has(i))continue;let{imports:l,expr:d}=We(a);for(let c of l)t.add(c);n.push(`export const ${i} = (
${d}
);`)}return n.length===0?"":`${t.size?`${[...t].join(`
`)}

`:""}${n.join(`

`)}
`}function se(e,r){let t={};for(let[n,s]of Object.entries(e??{})){t[n]={};for(let o of Object.keys(s??{})){if(!(o in r))continue;let i=r[o];t[n][o]=typeof i=="function"?i:()=>i}}return t}function ae(e){let r={};for(let[t,n]of Object.entries(e??{})){r[t]={};for(let[s,o]of Object.entries(n??{})){let i=new Function(`return (${o});`)();r[t][s]=typeof i=="function"?i:()=>i}}return r}var z={PARSE_ERROR:"parse-error",COMPRESSED_SOURCE:"compressed-source",UNKNOWN_ISLAND:"unknown-island",IMPORT_CYCLE:"import-cycle",UNKNOWN_IMPORT:"unknown-import",ENTRY_SURFACE_CONFLICT:"entry-surface-conflict",MODULE_VARIANCE:"module-variance",INVALID_MODULE_ARITY:"invalid-module-arity",DUPLICATE_DECLARATION:"duplicate-declaration",NON_DEFAULTABLE_TYPE:"non-defaultable-type",INVALID_NULLABLE_TYPE:"invalid-nullable-type",INTEGER_LITERAL_OUT_OF_RANGE:"integer-literal-out-of-range",INVALID_ESCAPE:"invalid-escape",UNKNOWN_TYPE:"unknown-type",UNKNOWN_VARIABLE:"unknown-variable",UNKNOWN_FIELD:"unknown-field",UNKNOWN_METHOD:"unknown-method",UNKNOWN_OPERATOR:"unknown-operator",NOT_CALLABLE:"not-callable",INVALID_AWAIT:"invalid-await",WRONG_ARITY:"wrong-arity",TYPE_MISMATCH:"type-mismatch",INVALID_ASSIGNMENT_TARGET:"invalid-assignment-target",INVALID_BREAK:"invalid-break",INVALID_GLOBAL_INITIALIZER:"invalid-global-initializer",INVALID_FOR_SOURCE:"invalid-for-source",ASSIGNMENT_TO_IMMUTABLE:"assignment-to-immutable",NULLABLE_ACCESS:"nullable-access",MISSING_FIELD:"missing-field",DUPLICATE_FIELD:"duplicate-field",RECURSIVE_TYPE:"recursive-type",NON_EXHAUSTIVE_MATCH:"non-exhaustive-match",IMPLICIT_STRUCT_INIT:"implicit-struct-init",REWRITE_INVARIANT:"rewrite-invariant",INVALID_DSL_USAGE:"invalid-dsl-usage",INVALID_ITERATOR_USAGE:"invalid-iterator-usage"};var Be=/(?<=\b(?:if\b[^{};]*|else\s*))\{[^{};]*;?\s*\}/g;function le(e,r){let t=[],n=0,s=!1;for(let[o,i]of e.split(`
`).entries()){let a="",l=!1;if(!i.trimStart().startsWith("\\\\"))for(let c=0;c<i.length;c++){let u=i.slice(c,c+2);if(s)u==="*/"&&(s=!1,c++);else if(l)i[c]==='"'&&(l=!1);else{if(u==="//")break;u==="/*"?(s=!0,c++):i[c]==='"'?l=!0:a+=i[c]}}let d=(a.replace(Be," ").match(/[{};]/g)??[]).length;if(i.length>160&&a.trim().length>100&&d>=5){let c=i.search(/\S/)+1;t.push({kind:z.COMPRESSED_SOURCE,severity:"warning",message:"This line packs multiple statements or blocks together. Put statements and block contents on separate, indented lines; keep source readable and minify build output instead.",primary:{file:r,row:o+1,col:c,endRow:o+1,endCol:i.length+1,start:n+c-1,end:n+i.length},related:[],notes:[],fixes:[]})}n+=i.length+1}return t}function Ue(e){return e.replace(/"[^"\n]*"|\/\/[^\n]*|\\\\[^\n]*/g,r=>r[0]==='"'?`"${" ".repeat(r.length-2)}"`:" ".repeat(r.length))}function oe(e,r){let t=e.slice(0,r).split(`
`);return{row:t.length,col:t.at(-1).length+1}}function fe(e){let r=new Set,t=[];for(let[n,s]of e){let o=Ue(s);for(let i of o.matchAll(/@island\s+"/g)){let a=i.index+i[0].length;r.add(s.slice(a,s.indexOf('"',a)))}if(!/^(std|node|npm):/.test(n))for(let i of o.matchAll(/\bwutu\s*\.\s*invalidate\s*\(\s*"/g)){let a=i.index+i[0].length-1,l=s.indexOf('"',a+1)+1;t.push({file:n,source:s,start:a,end:l,name:s.slice(a+1,l-1)})}}return t.filter(n=>!r.has(n.name)).map(({file:n,source:s,start:o,end:i,name:a})=>{let l=oe(s,o),d=oe(s,i),c=[...r].sort();return{kind:z.UNKNOWN_ISLAND,severity:"warning",message:`No @island named "${a}" exists, so this invalidate refreshes nothing.${c.length?` Known islands: ${c.map(u=>`"${u}"`).join(", ")}.`:""}`,primary:{file:n,row:l.row,col:l.col,endRow:d.row,endCol:d.col,start:o,end:i},related:[],notes:[],fixes:[]}})}var O={entry:0,import:1,prelude:2},q={normal:0,test:1,comptime:2},J={none:0,size:1,speed:2},V={small:{optimize:"size",safe:!0},fast:{optimize:"speed",safe:!0},smallUnsafe:{optimize:"size",safe:!1},fastUnsafe:{optimize:"speed",safe:!1},debug:{optimize:"none",safe:!0}},Ce=Object.freeze({builtins:["js-string"],importedStringConstants:"'"}),pe=new TextDecoder,U=new TextEncoder,F=(e,r,t)=>pe.decode(new Uint8Array(e.buffer,r,t-r));async function $e(e,r={}){return(await H(e,r)).exports}async function je(e,r,t){let n=t.mode?V[t.mode]:null;if(t.mode&&!n)throw new Error(`no build mode ${t.mode}: ${Object.keys(V).join(", ")}`);let{target:s="normal",optimize:o="size",debugNames:i=!1,safe:a=!1}={...t,...n};e.set_optimize(J[o]??J.size),e.set_safe(a?1:0),e.set_debug_names(i?1:0);let l=await K(e,r,t),d=await we(e,q[s]??q.normal,t),c=ve(e,l).concat(Ye(l));return d<0?{wasm:null,spec:null,diagnostics:c,files:l}:{...Y(e,d),diagnostics:c,files:l,tests:s==="test"?De(e):[]}}function De(e){let r=[];for(let t=0;t<e.test_count();t++)r.push({export:`__test_${t}`,name:JSON.parse(F(e.src,e.test_name_start(t),e.test_name_end(t)))});return r}async function K(e,r,t,n=new Map){let{resolvePath:s=xe,stdlib:o}=t,i=async u=>(n.has(u)||n.set(u,await t.readFile(u)),n.get(u)),a=Le(e,o),l=[...a.files],d=new Map(a.byKey),c=[];B(e,l,d,r,await i(r),O.entry);for(let u=0;u<e.import_count();u++){let f=l[e.import_from(u)],m=F(e.src,e.import_path_start(u),e.import_path_end(u)),v=he.test(m);if(/^"?(npm|node):/.test(m)||v&&typeof o.get(m)=="function"){e.import_foreign(u),c.push({i:u,raw:m,from:f.key,name:F(e.src,e.import_name_start(u),e.import_name_end(u))});continue}let b=v?m:s(f.key,JSON.parse(m)),g=d.get(b);if(g===void 0){let I=f.role===O.prelude?O.prelude:O.import;if(v){let T=o.get(b);if(typeof T!="string")continue;g=B(e,l,d,b,T,I)}else{let T;try{T=await i(b)}catch{let E=U.encode(b);new Uint8Array(e.src.buffer).set(E,e.import_missing(u,E.length));break}g=B(e,l,d,b,T,I)}}e.import_bind(u,g)}return await Ve(e,c,t)?(l.diagnostics=e.resolve(),await Ke(e,r,t),await qe(e),l):K(e,r,t,n)}async function qe(e){let r=e.wat_count();if(r===0)return;let{assembleWat:t}=await import("./assemble-RU7P7L2O.js"),n=i=>e.node_kind_name(new Uint8Array(e.node_kind.buffer)[i]),s=i=>{let a=new Int32Array(e.node_child.buffer),l=new Int32Array(e.node_next.buffer),d=[];for(let c=a[i];c>=0;c=l[c])d.push(c);return d},o=i=>{let a=new Int32Array(e.node_first.buffer)[i],l=new Int32Array(e.node_last.buffer)[i];return F(e.src,new Int32Array(e.tok_start.buffer)[a],new Int32Array(e.tok_end.buffer)[l-1])};for(let i=0;i<r;i++){let a=s(e.wat_function(i)),l=a.filter(m=>n(m)==="param_list").flatMap(s).map(m=>{let[v,b]=[s(m)[0],s(m).at(-1)];return{name:o(v),type:o(b)}}),d=a.find(m=>n(m)==="return_type"),c=n(s(d)[0])==="void_type"?"void":o(d),u=a.some(m=>n(m)==="self_param")||n(s(d)[0])==="yield_type",f=t({params:l,result:c,method:u,text:F(e.src,e.wat_text_start(i),e.wat_text_end(i))});if(f.code){let m=e.wat_set(i,f.code.length);new Uint8Array(e.wat_bytes.buffer).set(f.code,m)}else{let{message:m,start:v,end:b}=f.error,g=U.encode(m),I=e.wat_fail(i,v??-1,b??-1,g.length);new Uint8Array(e.src.buffer).set(g,I)}}}var he=/^[a-z][a-zA-Z0-9_]*:[A-Za-z][a-zA-Z0-9_]*$/;function B(e,r,t,n,s,o){let i=U.encode(s),a=e.file_add(i.length,o);return n.startsWith("std:")&&e.file_mark_std?.(a),new Uint8Array(e.src.buffer).set(i,e.file_offset(a)),r.push({key:n,role:o,text:s,offset:e.file_offset(a),bytes:i}),t.set(n,a),e.file_parse(a),a}var de=new WeakMap;function ye(e){let r=de.get(e);if(!r){let t=e.map(i=>U.encode(JSON.stringify(i))),n=new Int32Array(t.length),s=new Uint8Array(t.reduce((i,a)=>i+a.length+1,1)),o=0;s[o++]=91,t.forEach((i,a)=>{a>0&&(s[o++]=44),n[a]=o,s.set(i,o),o+=i.length}),s[o++]=93,r={bytes:s.subarray(0,o),offsets:n},de.set(e,r)}return r}var ce=new WeakMap;function be(e){let r=ce.get(e);return r||ce.set(e,r={docs:new Map,views:new Map,wanted:new Set,prelude:null,rebuild:!1}),r}function Le(e,r){let t=be(e);if(!t.rebuild&&t.prelude?.files.every(n=>r.get(n.key)===n.text))return e.reset_keep(),t.prelude;e.reset(),t.docs.clear(),t.views.clear();for(let n of t.wanted){let s=Je(e,n,Ge(e,n,t.docs));t.views.set(n,e.abi_resident_view(s.doc,s.at))}return t.prelude=Pe(e,r),e.seal(),t.rebuild=!1,t.prelude}function Pe(e,r){let t=[],n=new Map,s=r.get("std:Prelude");if(typeof s!="string")return{files:t,byKey:n};B(e,t,n,"std:Prelude",s,O.prelude);for(let o=0;o<e.import_count();o++){let i=F(e.src,e.import_path_start(o),e.import_path_end(o)),a=r.get(i);!he.test(i)||typeof a!="string"||e.import_bind(o,n.get(i)??B(e,t,n,i,a,O.prelude))}return{files:t,byKey:n}}function ge(e,r){let t=e.abi_room(r.length);return new Uint8Array(e.src.buffer).set(r,t),t}var ue=new WeakMap;function ze(e){let r=ue.get(e);if(!r){let{prefix:t,moduleSpecifier:n,exports:s,names:o,mutableGlobals:i}=e;r={document:ye(e.types),view:U.encode(JSON.stringify({prefix:t,moduleSpecifier:n,exports:s,names:o,mutableGlobals:i}))},ue.set(e,r)}return r}function Ge(e,r,t){if(!t.has(r.document)){let{bytes:n,offsets:s}=r.document,o=ge(e,n);e.abi_offsets_room(s.length),new Int32Array(e.abi_offsets.buffer,0,s.length).set(s),t.set(r.document,e.abi_doc_at(o,s.length))}return t.get(r.document)}function Je(e,r,t){return{doc:t,at:ge(e,r.view)}}async function Ve(e,r,{stdlib:t,resolvePackage:n}){let s=be(e),o=[],i=!1;for(let{i:a,raw:l,from:d,name:c}of r){let u;try{let f=/^"?(npm|node):/.test(l)?await n(JSON.parse(l),{prefix:c,from:d}):await t.get(l)();u=f.document?f:ze(f.abi??f)}catch{continue}s.views.has(u)||(s.wanted.add(u),s.rebuild=!0,i=!0),o.push([a,u])}if(i)return!1;for(let[a,l]of o)e.abi_bind(a,s.views.get(l));return!0}async function Ke(e,r,{resolvePath:t=xe,readBinaryFile:n}){for(let s=0;s<e.embed_files();s++){let o=F(e.src,e.embed_path_start(s),e.embed_path_end(s)),i;try{i=await n(t(r,o))}catch{e.embed_fail(s);continue}let a=e.embed_set(s,i.length);new Uint8Array(e.embed_bytes.buffer).set(i,a)}}async function we(e,r,t={}){let n=e.comptime_mems();if(n>0){let s=e.compile_program(q.comptime);if(s<0)return-1;let{wasm:o,spec:i}=Y(e,s),{exports:a}=await H(o,i,t);for(let l=0;l<n;l++){let d=e.comptime_name(l),c=a[`__comptime_run_${d}`](),u=new Uint8Array(a[`__comptime_${d}`].buffer,0,c*e.comptime_value_size(l)).slice(),f=e.comptime_set(l,c);new Uint8Array(e.comptime_bytes.buffer).set(u,f)}}return e.compile_program(r)}function Y(e,r){let t=new Uint8Array(e.out.buffer,0,r).slice(),n=e.host_json_size(),s=n?JSON.parse(F(e.host_json,0,n)):{};return{wasm:t,spec:s}}function ve(e,r){let t=[];for(let n=0;n<e.diagnostic_count();n++){let s=e.diagnostic_file(n),o=s>=0?r[s]:null,i={kind:e.diagnostic_kind(n),message:e.diagnostic_message(n),severity:"error",file:o?.key??null};if(o&&Object.assign(i,G(o,e.diagnostic_start(n),e.diagnostic_end(n))),e.diagnostic_code){i.code=e.diagnostic_code(n).replace(/(?<=[a-z0-9])(?=[A-Z])/g,"-").toLowerCase();for(let a=0;a<e.diagnostic_extras(n);a++){let l=He[e.diagnostic_extra_kind(n,a)],d=e.diagnostic_extra_text(n,a);if(l==="note")(i.notes??=[]).push(d);else if(l==="label"){i.label=d;let c=e.diagnostic_extra_start(n,a),u=e.diagnostic_extra_end(n,a);o&&(c!==e.diagnostic_start(n)||u!==e.diagnostic_end(n))&&(i.focus=G(o,c,u))}else{let c=r[e.diagnostic_extra_file(n,a)];if(!c)continue;let u={file:c.key,...G(c,e.diagnostic_extra_start(n,a),e.diagnostic_extra_end(n,a))};l==="fix"?i.fix={...u,text:d,label:e.diagnostic_extra_label(n,a)}:(i.related??=[]).push({...u,role:l,label:d})}}}t.push(i)}return t}function Ye(e){return[...e.filter(n=>!/^(std|node|npm):/.test(n.key)).flatMap(n=>le(n.text,n.key)),...fe(e.map(n=>[n.key,n.text]))].map(({kind:n,message:s,primary:o})=>({kind:n,message:s,severity:"warning",file:o.file,start:o.start,end:o.end,line:o.row,column:o.col}))}var He=["label","expected","found","related","note","fix"];function G(e,r,t){let n=me(e,r),s=me(e,t),o=e.text.slice(0,n);return{start:n,end:s,line:o.split(`
`).length,column:n-o.lastIndexOf(`
`)}}function me(e,r){return pe.decode(e.bytes.subarray(0,Math.max(0,r-e.offset))).length}async function H(e,r={},{loadGlue:t=null}={}){let n=await WebAssembly.compile(e,Ce),s=r.es??{},o=D(s),i=o?t?se(s,await t(o)):ae(s):{};r.closures&&(i.utu=ne(r.closures,i.utu??{})),r.mems&&(i.utu=te(r.mems,i.utu??{})),r.promises&&(i.utu=X(r.promises,i.utu??{}),i.utu=ee(r.promises,i.utu)),WebAssembly.Module.imports(n).some(l=>l.module==="utu"&&l.name==="js_tag")&&(i.utu=re(i.utu??{}));let a=await WebAssembly.instantiate(n,i);return{module:n,instance:a,exports:ie(a,r.promises)}}function xe(e,r){if(/^[a-z]+:\/\//i.test(e))return new URL(r,e).href;let t=e.split("/").slice(0,-1);for(let n of r.split("/"))n===".."?t.pop():n!=="."&&t.push(n);return t.join("/")}var Ze=/[0-9A-Za-z!#$%&'*+\-./:<=>?@\\^_`|~]/,Qe=new Set(["export","mod","struct","tag","enum","proto","fn","type","distinct","let","const","mem","vec","using"]);function Xe(e,r){let t=(p,y)=>new y(p.buffer),n=t(e.node_first,Int32Array),s=t(e.node_last,Int32Array),o=t(e.tok_start,Int32Array),i=t(e.tok_end,Int32Array),a=t(e.tok_kind,Uint8Array),l=t(e.node_decl,Int32Array),d=t(e.decl_node,Int32Array),c=t(e.decl_owner,Int32Array),u=e.node_count(),f=new Map,m=p=>{for(let y=r.length-1;y>=0;y--)if(r[y].offset<=p)return p<r[y].offset+r[y].bytes.length?r[y]:null;return null},v=(p,y)=>{let h=f.get(p);if(!h){h=new Int32Array(p.bytes.length+1);let w=0;for(let k=0;k<p.bytes.length;){let S=p.bytes[k],A=S<128?1:S<224?2:S<240?3:4;for(let N=0;N<A;N++)h[k+N]=w;k+=A,w+=A===4?2:1}h[p.bytes.length]=w,f.set(p,h)}return h[y-p.offset]},b=p=>{let y=o[n[p]],h=m(y);return h?{file:h.key,start:v(h,y),end:v(h,i[s[p]-1])}:null},g=null,I=()=>{if(g)return g;g=new Int32Array(e.decl_count()).fill(-1);for(let p=0;p<u;p++){let y=l[p];if(y<0||y>=g.length||!T(p)||d[y]<0)continue;let h=o[n[p]];if(h<o[n[d[y]]]||h>=i[s[d[y]]-1])continue;let w=g[y];(w<0||h<o[n[w]])&&(g[y]=p)}return g},T=p=>l[p]>=0&&n[p]<s[p]&&s[p]-n[p]===1,E=null,L=()=>{if(E)return E;E=new Map;let p=new Uint8Array(e.src.buffer);for(let y=0,h=e.wat_count?.()??0;y<h;y++){let w=e.wat_function(y),k=-1;for(let x=0,R=e.decl_count();x<R&&k<0;x++)d[x]===w&&(k=x);let S=new Map;for(let x=0,R=e.decl_count();x<R;x++){if(c[x]!==k||e.decl_kind_name(x)!=="Param")continue;let M=b(I()[x]>=0?I()[x]:d[x]);M&&S.set(r.find(W=>W.key===M.file)?.text.slice(M.start,M.end),x)}let A=e.wat_text_start(y),N=e.wat_text_end(y),j=m(A);if(!(!j||!S.size))for(let x=A;x<N;x++){let R=p[x];if(R===59&&p[x+1]===59){for(;x<N&&p[x]!==10;)x++;continue}if(R===40&&p[x+1]===59){let P=0;for(;x<N;x++)if(p[x]===40&&p[x+1]===59)P++,x++;else if(p[x]===59&&p[x+1]===41&&(P--,x++,!P))break;continue}if(R!==36)continue;let M=x+1;for(;M<N&&Ze.test(String.fromCharCode(p[M]));)M++;let W=S.get(new TextDecoder().decode(p.subarray(x+1,M)));W!==void 0&&(E.has(W)||E.set(W,[]),E.get(W).push({file:j.key,start:v(j,x+1),end:v(j,M)})),x=M-1}}return E},Fe=new TextDecoder,Re=p=>{for(let y=n[p];y<s[p];y++){if(a[y]===8)continue;let h=m(o[y]);if(!h)return null;let w=Fe.decode(h.bytes.subarray(o[y]-h.offset,i[y]-h.offset));if(!Qe.has(w))return w!=="&"&&!/^[A-Za-z_]\w*$/.test(w)?null:{file:h.key,start:v(h,o[y]),end:v(h,i[y])}}return null};return{at:b,declarationAt(p,y){for(let h=0;h<u;h++){if(!T(h))continue;let w=b(h);if(w&&w.file===p&&w.start<=y&&y<=w.end)return l[h]}for(let[h,w]of L())if(w.some(k=>k.file===p&&k.start-1<=y&&y<=k.end))return h;return-1},definition(p){let y=d[p];if(y<0)return null;let h=I()[p];return h>=0?b(h):Re(y)??b(y)},references(p,{includeDeclaration:y=!0}={}){let h=this.definition(p),w=[];for(let k=0;k<u;k++){if(l[k]!==p||!T(k))continue;let S=b(k);if(!S)continue;let A=h&&S.file===h.file&&S.start===h.start;A&&!y||(A?w.unshift(S):w.push(S))}return[...w,...L().get(p)??[]]},span(p){return d[p]>=0?b(d[p]):null},kind(p){return e.decl_kind_name(p)},owner(p){return c[p]},type(p){return e.decl_checked_type(p)},typeDeclaration(p){return e.decl_checked_type_decl(p)},declarations(p=null){let y=[];for(let h=0,w=e.decl_count();h<w;h++){if(d[h]<0)continue;let k=b(d[h]);k&&(p==null||k.file===p)&&y.push({decl:h,kind:e.decl_kind_name(h),owner:c[h],span:k})}return y},names(p){let y=[];for(let h=0;h<u;h++){if(!T(h))continue;let w=b(h);w&&w.file===p&&y.push({decl:l[h],at:w})}for(let[h,w]of L())for(let k of w)k.file===p&&y.push({decl:h,at:k});return y.sort((h,w)=>h.at.start-w.at.start),y.filter((h,w)=>w===0||h.at.start!==y[w-1].at.start)},tokenAt(p,y){let h=r.findIndex(w=>w.key===p);if(h<0)return null;for(let w=e.file_first_token(h),k=e.file_end_token(h);w<k;w++){let S=v(r[h],o[w]);if(S>=y)return null;let A=v(r[h],i[w]);if(y<A||y===A&&a[w]===8)return{kind:a[w],start:S,end:A}}return null},text(p){let y=r.find(h=>h.key===p.file);return y?y.text.slice(p.start,p.end):""}}}function en(e,r){let t=new Map,n,s=a=>(t.has(a)||t.set(a,(async()=>{let[l,d]=await Promise.all([r(`${a}.types.json`),r(`${a}.offsets`)]);return{bytes:l,offsets:nn(d)}})()),t.get(a)),o=new Map(e),i=new Map;for(let a of["std:Browser","std:JS","std:Web","std:Worker"])typeof e.get(a)=="function"&&o.set(a,()=>(i.has(a)||i.set(a,(async()=>{n??=JSON.parse(new TextDecoder().decode(await r("catalog.json")));let{document:l,view:d}=n[a],[c,u]=await Promise.all([s(l),r(`${d}.view.json`)]);return{document:c,view:u}})()),i.get(a)));return o}function nn(e){let r=new DataView(e.buffer,e.byteOffset,e.byteLength),t=new Int32Array(e.byteLength/4);for(let n=0;n<t.length;n++)t[n]=r.getInt32(n*4,!0);return t}function tn(e){let r=0;for(let t of e){let n=t.codePointAt(0);if(t==="	")r+=4;else{if(n>=768&&n<=879||n>=8203&&n<=8207||n>=65024&&n<=65039)continue;n>=4352&&n<=4447||n>=11904&&n<=42191||n>=44032&&n<=55203||n>=63744&&n<=64255||n>=65072&&n<=65103||n>=65280&&n<=65376||n>=65504&&n<=65510||n>=127744&&n<=128591||n>=129280&&n<=129535||n>=131072&&n<=262141?r+=2:r+=1}}return r}var _e={dark:{bg:[18,20,26],fg:[215,218,224],dim:[118,124,138],rail:[62,67,80],error:[255,107,107],warning:[245,185,66],trap:[199,146,234],expected:[108,182,255],found:[240,166,74],related:[154,163,178],add:[95,211,141],del:[255,123,123],keyword:[179,157,243],string:[158,206,106],number:[232,169,106],type:[125,207,255],function:[130,170,255],comment:[100,108,122],dsl:[158,206,106]},light:{bg:[253,252,249],fg:[43,46,54],dim:[128,133,144],rail:[200,196,186],error:[214,58,58],warning:[183,121,31],trap:[142,68,173],expected:[31,111,209],found:[184,98,11],related:[107,114,128],add:[31,138,76],del:[192,57,43],keyword:[124,77,204],string:[77,124,15],number:[180,83,9],type:[14,116,144],function:[37,99,235],comment:[156,163,175],dsl:[77,124,15]}};function rn(e=globalThis.process?.env??{}){if(e.UTU_THEME==="light"||e.UTU_THEME==="dark")return e.UTU_THEME;let r=Number(e.COLORFGBG?.split(";").pop());return r===7||r===15?"light":"dark"}function sn(e=globalThis.process?.env??{}){return/truecolor|24bit/i.test(e.COLORTERM??"")||["iTerm.app","WezTerm","vscode","ghostty","kitty"].includes(e.TERM_PROGRAM)}function an([e,r,t]){let n=u=>u<48?0:u<115?1:Math.min(5,Math.floor((u-35)/40)),s=16+36*n(e)+6*n(r)+n(t),o=u=>u===0?0:55+u*40,i=(o(n(e))-e)**2+(o(n(r))-r)**2+(o(n(t))-t)**2,a=Math.round(((e+r+t)/3-8)/10),l=232+Math.max(0,Math.min(23,a)),d=8+10*(l-232);return(d-e)**2+(d-r)**2+(d-t)**2<i?l:s}function on({color:e=!1,theme:r=rn(),truecolor:t=sn()}={}){let n=_e[r]??_e.dark,s=(a,l)=>t?`\x1B[${a};2;${l.join(";")}m`:`\x1B[${a};5;${an(l)}m`,o=(a,l)=>a.map((d,c)=>Math.round(n.bg[c]+(d-n.bg[c])*l)),i=!!e;return{on:i,palette:n,fg:a=>i?s(38,a):"",bg:a=>i?s(48,a):"",tint:(a,l)=>i?s(48,o(a,l)):"",bold:i?"\x1B[1m":"",italic:i?"\x1B[3m":"",strike:i?"\x1B[9m":"",reset:i?"\x1B[0m":"",paint(a,l){return i?`${s(38,a)}${l}\x1B[0m`:l}}}function ln(e,r,t,n){let s=r.toUpperCase(),o=e.palette[r]??e.palette.error,a=[`${e.on?`${e.bg(o)}${e.fg(e.palette.bg)}${e.bold} ${s} ${e.reset}`:` ${s} `} ${e.bold}${t}${e.reset}`];return n&&a.push(`${" ".repeat(s.length+3)}${e.paint(e.palette.dim,n)}`),a}function fn(e,r){return(r??[]).map(t=>`  ${e.paint(e.palette.dim,"note")}  ${t}`)}var dn={primary:.32,expected:.24,found:.24,related:.2};function cn(e,r,{color:t=!1,relative:n=a=>a,highlight:s=null,theme:o,truecolor:i}={}){let a=on({color:t,theme:o,truecolor:i});return e.map(l=>un(l,r,a,n,s)).join(`

`)}function un(e,r,t,n,s){let o=e.severity??"error",i=t.palette[o]??t.palette.error,a=e.code??e.kind??"",l=e.focus??e,d=e.file!=null?`${n(e.file)}${l.line!=null?`:${l.line}:${l.column}`:""}`:"",c=ln(t,o,e.message,[a,d].filter(Boolean).join(" \xB7 ")),u=[];e.file!=null&&e.start!=null&&r.get(e.file)!=null&&u.push({file:e.file,start:e.focus?.start??e.start,end:e.focus?.end??e.end,role:"primary",label:e.label});for(let g of e.related??[])r.get(g.file)!=null&&u.push({file:g.file,start:g.start,end:g.end,role:g.role,label:g.label});let m=[...new Set(u.map(g=>g.file))].map(g=>mn(r.get(g),g,u.filter(I=>I.file===g),e.file===g)),v=Math.max(2,...m.flatMap(g=>g.rows.filter(I=>I.line!=null).map(I=>String(I.line+1).length))),b=g=>`${t.paint(t.palette.dim,String(g??"").padStart(v))} ${t.paint(t.palette.rail,"\u2502")} `;for(let g of m){c.push(""),g.file!==e.file&&c.push(`${" ".repeat(v)} ${t.paint(t.palette.rail,"\u256D\u2500")} ${t.paint(t.palette.dim,n(g.file))}`);for(let I of g.rows){if(I.gap){c.push(`${" ".repeat(v)} ${t.paint(t.palette.rail,"\u2506")}`);continue}c.push(b(I.line+1)+pn(I,g,t,i,s));for(let T of hn(I,t,i))c.push(b()+T)}}return e.notes?.length&&c.push("",...fn(t,e.notes)),e.fix&&r.get(e.fix.file??e.file)!=null&&c.push("",...yn(e.fix,r.get(e.fix.file??e.file),t,b,v)),c.join(`
`)}function mn(e,r,t,n){let s=[0];for(let f=e.indexOf(`
`);f>=0;f=e.indexOf(`
`,f+1))s.push(f+1);let o=f=>{let m=0,v=s.length-1;for(;m<v;){let b=m+v+1>>1;s[b]<=f?m=b:v=b-1}return m},i=f=>e.slice(s[f],(s[f+1]??e.length+1)-1).replace(/\r$/,""),a=new Set;for(let f of t){f.first=o(f.start),f.last=Math.max(f.first,o(Math.max(f.start,f.end-1)));for(let m=f.first;m<=f.last;m++)(f.last-f.first+1<=6||m<f.first+2||m>f.last-2)&&a.add(m)}let l=t.find(f=>f.role==="primary"),d=l&&n&&l.first>0&&!a.has(l.first-1)&&i(l.first-1).trim()?l.first-1:-1;d>=0&&a.add(d);let c=[],u=null;for(let f of[...a].sort((m,v)=>m-v)){u!=null&&f>u+1&&c.push({gap:!0}),u=f;let m=i(f),v=t.filter(b=>b.first<=f&&f<=b.last).map(b=>{let g=f===b.first?b.start-s[f]:m.length-m.trimStart().length,I=f===b.last?Math.min(m.length,Math.max(g+1,b.end-s[f])):m.length;return{mark:b,from:g,to:Math.max(I,g+(m.length>g?1:0)),ends:f===b.last}});c.push({line:f,raw:m,offset:s[f],marks:v,context:f===d})}return{file:r,rows:c}}function pn(e,r,t,n,s){let o=e.raw,i=f=>f.replace(/\t/g,"    ");if(!t.on)return i(o);if(e.context)return t.paint(t.palette.dim,i(o));let a=s?s(r.file,e.offset,e.offset+o.length):[],l=new Array(o.length).fill(null);for(let{mark:f,from:m,to:v}of e.marks)for(let b=m;b<v&&b<o.length;b++)l[b]=f.role;let d=new Array(o.length).fill(null);for(let f of a)for(let m=Math.max(0,f.start-e.offset);m<Math.min(o.length,f.end-e.offset);m++)d[m]=f.class;let c="",u=0;for(;u<o.length;){let f=u+1;for(;f<o.length&&l[f]===l[u]&&d[f]===d[u];)f++;let m=l[u],v=d[u],b=t.palette[v]??t.palette.fg,g=(m?t.tint(m==="primary"?n:t.palette[m],dn[m]):"")+(m==="primary"?t.bold:"")+(v==="comment"||v==="parameter"?t.italic:"")+t.fg(v==="comment"?t.palette.comment:b);c+=`${g}${i(o.slice(u,f))}${t.reset}`,u=f}return c}function hn(e,r,t){let n=e.marks.filter(l=>l.ends).sort((l,d)=>l.from-d.from);if(!n.length)return[];let s=l=>tn(e.raw.slice(0,l)),o=l=>l.mark.role==="primary"?t:r.palette[l.mark.role],i=[];if(!r.on){let l="",d=0;for(let c of n){let u=s(c.from),f=Math.max(u+1,s(c.to));u<d||(l+=" ".repeat(u-d)+(c.mark.role==="primary"?"\u2501":"\u2500").repeat(f-u),d=f)}i.push(l)}let a=n.filter(l=>l.mark.label);for(let l=a.length-1;l>=0;l--){let d="",c=0;for(let f=0;f<l;f++){let m=s(a[f].from);d+=" ".repeat(Math.max(0,m-c))+r.paint(o(a[f]),"\u2502"),c=m+1}let u=s(a[l].from);d+=" ".repeat(Math.max(0,u-c))+r.paint(o(a[l]),"\u2570\u2500")+" "+a[l].mark.label,i.push(d)}return i}function yn(e,r,t,n){let s=r.lastIndexOf(`
`,e.start-1)+1,o=(()=>{let f=r.indexOf(`
`,e.end);return f<0?r.length:f})(),i=r.slice(s,o),a=r.slice(s,e.start)+e.text+r.slice(e.end,o),l=r.slice(0,s).split(`
`).length,d=[`  ${t.paint(t.palette.add,`${t.bold}fix`)}   ${e.label??""}`];return t.on?(bn(i,a).map(f=>f.k==="="?t.paint(t.palette.fg,f.t):f.k==="+"?`${t.tint(t.palette.add,.28)}${t.fg(t.palette.add)}${f.t}${t.reset}`:`${t.fg(t.palette.del)}${t.strike}${f.t}${t.reset}`).join("").split(`
`).forEach((f,m)=>d.push(n(l+m)+f)),d):(a.split(`
`).forEach((f,m)=>d.push(n(l+m)+f)),d)}function bn(e,r){let t=f=>f.match(/[A-Za-z0-9_]+|\s+|./gs)??[],n=t(e),s=t(r),o=n.length,i=s.length,a=Array.from({length:o+1},()=>new Uint16Array(i+1));for(let f=o-1;f>=0;f--)for(let m=i-1;m>=0;m--)a[f][m]=n[f]===s[m]?a[f+1][m+1]+1:Math.max(a[f+1][m],a[f][m+1]);let l=[],d=(f,m)=>{let v=l[l.length-1];v?.k===f?v.t+=m:l.push({k:f,t:m})},c=0,u=0;for(;c<o&&u<i;)n[c]===s[u]?(d("=",n[c]),c++,u++):a[c+1][u]>=a[c][u+1]?d("-",n[c++]):d("+",s[u++]);for(;c<o;)d("-",n[c++]);for(;u<i;)d("+",s[u++]);return l}function gn(e){return D(e.es??{})}function wn(e,r,{runtime:t,glue:n,wasm:s,streaming:o=!1}){let i=new Set(WebAssembly.Module.imports(new WebAssembly.Module(r,ke)).map(m=>`${m.module}.${m.name}`)),a=[],l=[],d=[],c=e.es??{},u=Object.fromEntries(Object.entries(c).map(([m,v])=>[m,Object.fromEntries(Object.keys(v).map(b=>[b,""]))]));n&&Object.values(u).some(m=>Object.keys(m).length)?(a.push("importObjectFromGlue"),l.push(`import * as glue from ${JSON.stringify(n)};`),d.push(`const imports = importObjectFromGlue(${JSON.stringify(u)}, glue);`)):d.push("const imports = {};"),e.closures&&(a.push("closureImports"),d.push(`imports.utu = closureImports(${JSON.stringify(e.closures)}, imports.utu);`)),e.mems&&(a.push("memoryImports"),d.push(`imports.utu = memoryImports(${JSON.stringify(e.mems)}, imports.utu);`)),e.promises&&(a.push("promiseImports","awaitImports","promisifyExports"),d.push(`imports.utu = awaitImports(${JSON.stringify(e.promises)}, promiseImports(${JSON.stringify(e.promises)}, imports.utu));`)),i.has("utu.js_tag")&&(a.push("exceptionImports"),d.push("imports.utu = exceptionImports(imports.utu);")),a.length&&l.unshift(`import { ${a.join(", ")} } from ${JSON.stringify(t)};`);let f=o?"compileStreaming":"compile";return d.push(`const module = await WebAssembly.${f}(${s}, ${JSON.stringify(ke)});`),d.push("export const instance = await WebAssembly.instantiate(module, imports);"),d.push(e.promises?`export const exports = promisifyExports(instance, ${JSON.stringify(e.promises)});`:"export const exports = instance.exports;"),[...l,...d].join(`
`)+`
`}var ke={builtins:["js-string"],importedStringConstants:"'"};var Ie=()=>import("./browser-catalog.generated-2OMWPVRO.js");async function Se(e,r,t){let n=e[`${r}_JSON`];if(n===void 0){let o=Uint8Array.from(atob(e[`${r}_GZIP`]),a=>a.charCodeAt(0)),i=new Blob([o]).stream().pipeThrough(new DecompressionStream("gzip"));n=await new Response(i).text()}let s=JSON.parse(n);if(s.version!==1)throw new Error(`Unsupported ${t} declaration ABI version`);return s}function C(e){let r;return()=>r??=e().catch(t=>{throw r=void 0,t})}var Z=C(async()=>Se(await Ie(),"BROWSER_ABI","browser")),vn=C(async()=>Se(await Ie(),"WORKER_ABI","worker"));function Ae(e,r,t){let n=s=>Object.fromEntries(Object.entries(s).filter(([o])=>t(o)));return{source:`mod ${e} {}`,abi:{...r,prefix:e,exports:n(r.exports),names:n(r.names),mutableGlobals:r.mutableGlobals.filter(t)}}}async function Te(){return{source:"mod Browser {}",abi:await Z()}}var Me=C(async()=>{let e=await Z(),r=new Set(e.ecmascript??[]);return Ae("JS",e,t=>r.has(t))}),xn=["AbortController","AbortSignal","Blob","ByteLengthQueuingStrategy","CompressionStream","CountQueuingStrategy","Crypto","CryptoKey","CustomEvent","DOMException","DecompressionStream","Event","EventTarget","File","FormData","Headers","MessageChannel","MessageEvent","MessagePort","ReadableByteStreamController","ReadableStream","ReadableStreamBYOBReader","ReadableStreamBYOBRequest","ReadableStreamDefaultController","ReadableStreamDefaultReader","Request","RequestInit","Response","ResponseInit","SubtleCrypto","TextDecoder","TextDecoderStream","TextEncoder","TextEncoderStream","TransformStream","TransformStreamDefaultController","URL","URLSearchParams","WebAssembly","WritableStream","WritableStreamDefaultController","WritableStreamDefaultWriter","atob","btoa","clearInterval","clearTimeout","console","crypto","fetch","navigator","performance","queueMicrotask","reportError","setInterval","setTimeout","structuredClone"],Ee=C(async()=>{let e=new Set(xn);return Ae("Web",await Z(),r=>e.has(r))}),Ne=C(async()=>({source:"mod Worker {}",abi:await vn()}));var _="ir-wasm-",$=new Map([["std:Array",`// std/Array.utu \u2014 Array[T1]
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
`.replaceAll("@@IR_WASM@@",_)],["std:Bool",`// std/Bool.utu \u2014 Bool scalar type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:Buffer",`// Geometrically growing native buffer, including non-defaultable element types.
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
            let i = 0;
            while (i < self.length) {
                grown[i] = self.values[i];
                i += 1;
            };
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
`.replaceAll("@@IR_WASM@@",_)],["std:Console",`//! The host's console: \`using console from std:Console;\`, then
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
`.replaceAll("@@IR_WASM@@",_)],["std:Externref",`// std/Externref.utu \u2014 Externref opaque external reference type module
// & maps to the WebAssembly Externref type: an opaque, garbage-collected
// reference to a host (JavaScript) object.
// Externrefs ARE nullable: ?Externref is valid.
//
// No arithmetic or comparison operators \u2014 externrefs are fully opaque.
// Host operations are accessed via @ir DSL or imported JS functions.

mod Externref {
    type & = @ir/\\ <@@IR_WASM@@ref type-repr="wasm-externref"/> \\/
}
`.replaceAll("@@IR_WASM@@",_)],["std:F32",`// std/F32.utu \u2014 F32 scalar type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:F64",`// std/F64.utu \u2014 F64 scalar type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:Found",`// Optional iterator result: null means empty; a present wrapper holds any T,
// including non-nullable scalar types. Use \`promote\` or \`orelse\` to unwrap.
mod Found[T] {
    struct &:
        | value: T
    fn &.new(value: T) & {
        &{ value: value };
    }
}
`.replaceAll("@@IR_WASM@@",_)],["std:Group",`mod Group[K, T] {
    struct &:
        | key: K
        | values: Array[T]
    fn &.new(key: K) & {
        &{ key: key, values: [] };
    }
}
`.replaceAll("@@IR_WASM@@",_)],["std:I31",`// std/I31.utu \u2014 I31 WasmGC reference type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:I32",`// std/I32.utu \u2014 I32 scalar type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:I64",`// std/I64.utu \u2014 I64 scalar type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:IntMap",`// std/IntMap.utu \u2014 I32 keys to I32 values, open addressing.
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
`.replaceAll("@@IR_WASM@@",_)],["std:Interner",`// std/Interner.utu \u2014 byte strings to dense I32 ids: 0, 1, 2, \u2026 in first-seen order.
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
`.replaceAll("@@IR_WASM@@",_)],["std:List",`mod List[T] {
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
`.replaceAll("@@IR_WASM@@",_)],["std:LiteralDefaults",`// std/LiteralDefaults.utu \u2014 default static type for each literal syntax kind
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
`.replaceAll("@@IR_WASM@@",_)],["std:M128",`// std/M128.utu \u2014 M128 bitmask type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:M32",`// std/M32.utu \u2014 M32 bitmask type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:M64",`// std/M64.utu \u2014 M64 bitmask type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:NumberField",`// Keep the user's draft, including empty/invalid text, separate from a number.
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
`.replaceAll("@@IR_WASM@@",_)],["std:PersistentSegmentTree",`// Immutable versions of an ordered monoid index. Point updates share untouched
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
`.replaceAll("@@IR_WASM@@",_)],["std:Prelude",`// std/prelude.utu \u2014 automatically injected into every compilation
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
using wutu from std:Wutu;
`.replaceAll("@@IR_WASM@@",_)],["std:Promise",`// std/Promise.utu \u2014 Promise[T]
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
`.replaceAll("@@IR_WASM@@",_)],["std:Random",`//! Seeded random numbers: \`using Random from std:Random;\`.
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
`.replaceAll("@@IR_WASM@@",_)],["std:SegmentTree",`// An ordered monoid index. combine must be associative and identity neutral.
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
`.replaceAll("@@IR_WASM@@",_)],["std:Spatial",`using Buffer from std:Buffer;

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
`.replaceAll("@@IR_WASM@@",_)],["std:Str",`// std/Str.utu \u2014 Str string reference type module
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

mod Str {
    type & = @ir/\\ <@@IR_WASM@@ref type-repr="wasm-stringref"/> \\/

    // Concatenation via the + operator.
    fn &:add |a, b| & { @ir/\\ <ir-string-concat><ir-ident name="a"/><ir-ident name="b"/></ir-string-concat> \\/; }

    // Equality \u2014 structural (content) comparison.
    fn &:eq |a, b| Bool { @ir/\\ <ir-string-eq><ir-ident name="a"/><ir-ident name="b"/></ir-string-eq> \\/; }
    fn &:ne |a, b| Bool { @ir/\\ <ir-string-ne><ir-ident name="a"/><ir-ident name="b"/></ir-string-ne> \\/; }

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
`.replaceAll("@@IR_WASM@@",_)],["std:StrMap",`//! Str keys to values of any type: \`using StrMap from std:StrMap;\`.
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
`.replaceAll("@@IR_WASM@@",_)],["std:Stream",`//! \`Stream[T]\`: a JavaScript async iterable, held as an externref. An async
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
`.replaceAll("@@IR_WASM@@",_)],["std:Time",`//! Clocks: \`using time from std:Time;\`, then \`time.now()\`. Each function ships only when used.

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
`.replaceAll("@@IR_WASM@@",_)],["std:U32",`// std/U32.utu \u2014 U32 scalar type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:U64",`// std/U64.utu \u2014 U64 scalar type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:V128",`// std/V128.utu \u2014 V128 SIMD vector type module
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
`.replaceAll("@@IR_WASM@@",_)],["std:Wutu",`// Generated from src/runtime/wutu.js by the build. No runtime ships unless used.
mod wutu {
    fn init() void {
        let install: fun() void = @es/\\ () => { globalThis.__utuWutu ??= (function createWutuRuntime() {
  const metadata = new WeakMap();   // element -> { attrs, view }
  const listeners = new WeakMap();  // element -> Map(event -> record)
  const views = new Set();          // WeakRef<view> for every mounted root
  const scopes = new Map();         // island name -> WeakRef<view>
  const dirty = new Set();
  const afterRender = [];
  const installedStyles = new Set();
  const mounted = new WeakSet();    // elements whose \`on mount\` has run
  const lazies = new Map();         // lazy call (path, name, arguments) -> its placeholder
  let memoNode = null;              // the element memoHit() found
  /** Where a reused hole is: its call key and the keys around it. */
  const memoPlace = () => keys.map(k => k.value).join('|');
  let loading = 0;                  // chunks loading
  const identities = new WeakMap(); // element -> its identity (its data-wutu attribute)
  const prototypes = new Map();     // description -> [element, its attribute names]
  let frames = [], active = null, keys = [], scheduled = false, generation = 0;

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

  function style(sheet) {
    const css = layered(sheet);
    if (installedStyles.has(css)) return;
    installedStyles.add(css);
    // Prerendered pages already contain their sheets.
    if ([...document.querySelectorAll('style')].some(node => node.textContent === css)) return;
    const node = document.createElement('style');
    node.textContent = css;
    document.head.append(node);
  }

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
    // A root reuses its own previous element, or adopts prerendered markup.
    if (!parent) node = active?.root ?? document.querySelector(\`[data-wutu-root="\${site}"][data-wutu-prerender]\`);
    // (Only an element this runtime has not seen can be prerendered.)
    if (node && !identities.has(node)) {
      node.removeAttribute('data-wutu-prerender');
      if (node.hasAttribute('data-wutu-pending')) {
        node.disabled = false;
        node.removeAttribute('data-wutu-pending');
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
   * shell, which no render sets. (\`old\` is the live child list: they move only
   * when this frame leaves.)
   */
  function open(node, kept) {
    // An element first seen (made, or prerendered) has had no render set its
    // attributes: those it has now, but its shell's, are what a render may drop.
    const meta = metadata.get(node);
    const before = meta ? null : new Set([...node.attributes].map(a => a.name)
      .filter(name => !name.startsWith('data-wutu') && !kept.includes(name)));
    frames.push({ node, meta, before, old: node.childNodes, used: new Set(), wanted: [], attrs: null, byKey: null, keyed: null });
    return node;
  }

  function enter(tag, svg, site, key) {
    return open(claim(site, key, tag, () =>
      svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag)), []);
  }

  /** The element a description makes (cloned from then on), and its attribute names. */
  function prototype(description, svg) {
    let entry = prototypes.get(description);
    if (!entry) prototypes.set(description, entry = prototypeOf(JSON.parse(description), svg));
    return entry;
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

  /** Enter an element made from its shell: its tag and static attributes. */
  function shell(description, svg, site) {
    const [element, names] = prototype(description, svg);
    return open(claim(site, '', element.localName, () => element.cloneNode(false)), names);
  }

  /** A subtree with nothing dynamic in it: made from its description, then kept as it is. */
  function still(description, svg, site) {
    const [element] = prototype(description, svg);
    return claim(site, '', element.localName, () => element.cloneNode(true));
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
      metadata.set(node, { ...metadata.get(node), attrs });
      return node;
    }
    // The attributes a render set last time and not this time go.
    const meta = frame.meta;
    for (const name of meta ? meta.attrs : frame.before) if (!attrs.has(name)) node.removeAttribute(name);
    if (meta) meta.attrs = attrs;
    else metadata.set(node, { attrs });
    place(node, frame.wanted);
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
          run.nodes[op[1]] = open(claim(\`v\${run.h}:\${op[1]}\`, '', element.localName, () => element.cloneNode(false)), names);
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
      case 'y': node.style.setProperty(op[1], value); break;
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
    const view = { render: factory, root: null, scope, dirty: false, cleanups: [], cleanupCallbacks: [], effects: new Map() };
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
      for (const callback of [...view.cleanups.splice(0), ...view.cleanupCallbacks.splice(0)]) callback();
      if (view.scope) scopes.delete(view.scope);
    }
    for (const child of node.children ?? []) dispose(child);
  }

  // (Where there is a window: a DOM without one, in tests, has no routes.)
  globalThis.addEventListener?.('hashchange', refresh);
  globalThis.addEventListener?.('popstate', refresh);

  const api = {
    enter, shell, still, append, attr, listen, leave, mount, refresh, invalidate, style,
    put, begin, slot, arm, item, end, node, done,
    storageError: '',
    notify() {
      for (const ref of views) {
        const view = ref.deref();
        if (view?.root.isConnected) schedule(view);
      }
    },
    /** A timer owned by the rendering view: started once per key, cleared on removal. */
    interval(key, milliseconds, callback) {
      const view = active;
      if (!view || view.effects.has(key)) return;
      const timer = setInterval(() => { callback(); autoSave(); schedule(view); }, Math.max(16, milliseconds));
      view.effects.set(key, timer);
      view.cleanups.push(() => clearInterval(timer));
    },
    /**
     * A lazy module's function (\`using m lazy from "\u2026"\`), called with \`args\`:
     * its placeholder, which the element the function makes fills once the
     * module's chunk has loaded (a prerendered placeholder keeps its markup
     * until then). One placeholder per path, name, and arguments. While chunks
     * load, <html> has data-wutu-loading (a prerenderer waits for it to go).
     */
    lazyCall(path, name, args) {
      const key = path + '|' + name + '|' + args.map(arg => arg !== null && typeof arg === 'object' ? '#' : String(arg)).join('\\u001f');
      let node = lazies.get(key);
      if (node) return node;
      node = [...document.querySelectorAll('[data-wutu-lazy]')].find(n => n.getAttribute('data-wutu-lazy') === key) ?? document.createElement('div');
      node.setAttribute('data-wutu-lazy', key);
      lazies.set(key, node);
      const url = globalThis.__wutuChunks?.[path];
      if (!url) {
        console.error('Wutu: no chunk was built for ' + path);
        return node;
      }
      loading++;
      document.documentElement.setAttribute('data-wutu-loading', '');
      import(url).then(chunk => node.replaceChildren(chunk.exports[name](...args))).catch(error => console.error(error)).finally(() => {
        if (--loading === 0) document.documentElement.removeAttribute('data-wutu-loading');
      });
      return node;
    },
    /**
     * A hole that calls a function (\`= f(a, b);\`) with a key the compiler
     * made from its arguments: if the call at this place in this view made
     * its element last time with the same key, it is put back without the
     * call. ("" is never reused.)
     */
    memoHit(key) {
      if (!key || !active) return false;
      const entry = active.memo?.get(memoPlace());
      if (entry?.key !== key || !entry.node?.isConnected) return false;
      memoNode = entry.node;
      return true;
    },
    memoLast() { return memoNode; },
    memoKeep(key, node) { if (key && active) (active.memo ??= new Map()).set(memoPlace(), { key, node }); },
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
    try { last = localStorage.getItem(key); } catch { /* unavailable storage reads as empty */ }
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

  addEventListener('pagehide', flush);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('storage', event => {
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
`.replaceAll("@@IR_WASM@@",_)]]);$.set("std:Browser",Te);$.set("std:JS",Me);$.set("std:Web",Ee);$.set("std:Worker",Ne);export{V as MODES,J as OPTIMIZE,$ as PLATFORM_SOURCES,O as ROLE,q as TARGET,Y as builtModule,en as catalogStdlib,je as compile,we as compileProgram,cn as formatDiagnostics,gn as glueSource,H as instantiate,$e as loadCompiler,K as loadProgram,wn as loaderSource,Xe as programIndex,ve as readDiagnostics};
