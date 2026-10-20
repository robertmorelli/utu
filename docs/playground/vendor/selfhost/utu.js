function X(e,t={}){for(let r of e?.ops??[])r==="promise_then"&&(t.promise_then=(n,a)=>{n.then(a)}),r==="promise_catch"&&(t.promise_catch=(n,a)=>{n.catch(a)});return t}function ee(e,t={}){for(let r of e?.awaits??[]){if(typeof WebAssembly.Suspending!="function")throw new Error("utu: `await` needs JS Promise Integration (WebAssembly.Suspending), which this host does not provide \u2014 use `.then` instead, or run on a JSPI-capable host (Chrome 126+, Node 23+, Bun)");t[`await_${r}`]=new WebAssembly.Suspending(async n=>await n)}return t}function ne(e,t={}){if(!e)return t;e.new&&(t.closure_new=(n,a,o)=>{let i=a==null&&!(o&2)?(...s)=>n(...s):(...s)=>n(a,...s);return o&1?(...s)=>!!i(...s):i});let r=(n,...a)=>n(...a);for(let n of e.calls??[])t[n]=r;return t}var Oe={U8:"Uint8Array",I8:"Int8Array",U16:"Uint16Array",I16:"Int16Array",I32:"Int32Array",U32:"Uint32Array",I64:"BigInt64Array",U64:"BigUint64Array",F32:"Float32Array",F64:"Float64Array"};function te(e,t={}){for(let{name:n,kind:a,host:o,data:i}of e??[]){if(!o)continue;let s=Math.max(1,Math.ceil((i?i.length*3/4:0)/65536)),f=new WebAssembly.Memory({initial:s,maximum:65535}),u=globalThis[Oe[a]],h=u.BYTES_PER_ELEMENT,m=b=>{let p=Math.ceil(b/65536)-f.buffer.byteLength/65536;p>0&&f.grow(p)};t[`mem_${n}`]=f,t[`mem_copy_in_${n}`]=b=>{if(typeof b=="string")return m(b.length*3),Math.floor(new TextEncoder().encodeInto(b,new Uint8Array(f.buffer)).written/h);let p=b instanceof ArrayBuffer?new Uint8Array(b):new Uint8Array(b.buffer,b.byteOffset,b.byteLength);return m(p.byteLength),new Uint8Array(f.buffer).set(p),Math.floor(p.byteLength/h)},t[`mem_view_${n}`]=(b,p)=>new u(f.buffer,b*h,p-b)}return t}function re(e={}){return e.js_tag=WebAssembly.JSTag,e}function ie(e,t){let r=t?.asyncExports??[];if(r.length===0)return e.exports;let n={...e.exports};for(let a of r)typeof n[a]=="function"&&(n[a]=WebAssembly.promising(n[a]));return n}var Q=/^\s*import\s[^;]*;/;function We(e){let t=[],r=e;for(let n=r.match(Q);n;n=r.match(Q))t.push(n[0].trim()),r=r.slice(n[0].length);return{imports:t,expr:r.trim()}}function L(e,t=null){let r=new Set,n=[];for(let o of Object.values(e??{}))for(let[i,s]of Object.entries(o??{})){if(t&&!t.has(i))continue;let{imports:f,expr:u}=We(s);for(let h of f)r.add(h);n.push(`export const ${i} = (
${u}
);`)}return n.length===0?"":`${r.size?`${[...r].join(`
`)}

`:""}${n.join(`

`)}
`}function ae(e,t){let r={};for(let[n,a]of Object.entries(e??{})){r[n]={};for(let o of Object.keys(a??{})){if(!(o in t))continue;let i=t[o];r[n][o]=typeof i=="function"?i:()=>i}}return r}function se(e){let t={};for(let[r,n]of Object.entries(e??{})){t[r]={};for(let[a,o]of Object.entries(n??{})){let i=new Function(`return (${o});`)();t[r][a]=typeof i=="function"?i:()=>i}}return t}var J={PARSE_ERROR:"parse-error",COMPRESSED_SOURCE:"compressed-source",UNKNOWN_ISLAND:"unknown-island",IMPORT_CYCLE:"import-cycle",UNKNOWN_IMPORT:"unknown-import",ENTRY_SURFACE_CONFLICT:"entry-surface-conflict",MODULE_VARIANCE:"module-variance",INVALID_MODULE_ARITY:"invalid-module-arity",DUPLICATE_DECLARATION:"duplicate-declaration",NON_DEFAULTABLE_TYPE:"non-defaultable-type",INVALID_NULLABLE_TYPE:"invalid-nullable-type",INTEGER_LITERAL_OUT_OF_RANGE:"integer-literal-out-of-range",INVALID_ESCAPE:"invalid-escape",UNKNOWN_TYPE:"unknown-type",UNKNOWN_VARIABLE:"unknown-variable",UNKNOWN_FIELD:"unknown-field",UNKNOWN_METHOD:"unknown-method",UNKNOWN_OPERATOR:"unknown-operator",NOT_CALLABLE:"not-callable",INVALID_AWAIT:"invalid-await",WRONG_ARITY:"wrong-arity",TYPE_MISMATCH:"type-mismatch",INVALID_ASSIGNMENT_TARGET:"invalid-assignment-target",INVALID_BREAK:"invalid-break",INVALID_GLOBAL_INITIALIZER:"invalid-global-initializer",INVALID_FOR_SOURCE:"invalid-for-source",ASSIGNMENT_TO_IMMUTABLE:"assignment-to-immutable",NULLABLE_ACCESS:"nullable-access",MISSING_FIELD:"missing-field",DUPLICATE_FIELD:"duplicate-field",RECURSIVE_TYPE:"recursive-type",NON_EXHAUSTIVE_MATCH:"non-exhaustive-match",IMPLICIT_STRUCT_INIT:"implicit-struct-init",REWRITE_INVARIANT:"rewrite-invariant",INVALID_DSL_USAGE:"invalid-dsl-usage",INVALID_ITERATOR_USAGE:"invalid-iterator-usage"};var Be=/(?<=\b(?:if\b[^{};]*|else\s*))\{[^{};]*;?\s*\}/g;function le(e,t){let r=[],n=0,a=!1;for(let[o,i]of e.split(`
`).entries()){let s="",f=!1;if(!i.trimStart().startsWith("\\\\"))for(let h=0;h<i.length;h++){let m=i.slice(h,h+2);if(a)m==="*/"&&(a=!1,h++);else if(f)i[h]==='"'&&(f=!1);else{if(m==="//")break;m==="/*"?(a=!0,h++):i[h]==='"'?f=!0:s+=i[h]}}let u=(s.replace(Be," ").match(/[{};]/g)??[]).length;if(i.length>160&&s.trim().length>100&&u>=5){let h=i.search(/\S/)+1;r.push({kind:J.COMPRESSED_SOURCE,severity:"warning",message:"This line packs multiple statements or blocks together. Put statements and block contents on separate, indented lines; keep source readable and minify build output instead.",primary:{file:t,row:o+1,col:h,endRow:o+1,endCol:i.length+1,start:n+h-1,end:n+i.length},related:[],notes:[],fixes:[]})}n+=i.length+1}return r}function Ce(e){return e.replace(/"[^"\n]*"|\/\/[^\n]*|\\\\[^\n]*/g,t=>t[0]==='"'?`"${" ".repeat(t.length-2)}"`:" ".repeat(t.length))}function oe(e,t){let r=e.slice(0,t).split(`
`);return{row:r.length,col:r.at(-1).length+1}}function fe(e){let t=new Set,r=[];for(let[n,a]of e){let o=Ce(a);for(let i of o.matchAll(/@island\s+"/g)){let s=i.index+i[0].length;t.add(a.slice(s,a.indexOf('"',s)))}if(!/^(std|node|npm):/.test(n))for(let i of o.matchAll(/\bwutu\s*\.\s*invalidate\s*\(\s*"/g)){let s=i.index+i[0].length-1,f=a.indexOf('"',s+1)+1;r.push({file:n,source:a,start:s,end:f,name:a.slice(s+1,f-1)})}}return r.filter(n=>!t.has(n.name)).map(({file:n,source:a,start:o,end:i,name:s})=>{let f=oe(a,o),u=oe(a,i),h=[...t].sort();return{kind:J.UNKNOWN_ISLAND,severity:"warning",message:`No @island named "${s}" exists, so this invalidate refreshes nothing.${h.length?` Known islands: ${h.map(m=>`"${m}"`).join(", ")}.`:""}`,primary:{file:n,row:f.row,col:f.col,endRow:u.row,endCol:u.col,start:o,end:i},related:[],notes:[],fixes:[]}})}var C={entry:0,import:1,prelude:2},z={normal:0,test:1,comptime:2},V={none:0,size:1,speed:2},Ue=Object.freeze({builtins:["js-string"],importedStringConstants:"'"}),pe=new TextDecoder,q=new TextEncoder,W=(e,t,r)=>pe.decode(new Uint8Array(e.buffer,t,r-t));async function De(e,t={}){return(await H(e,t)).exports}async function qe(e,t,r){let{target:n="normal",optimize:a="size",debugNames:o=!1,safe:i=!1}=r;e.set_optimize(V[a]??V.size),e.set_safe(i?1:0),e.set_debug_names(o?1:0);let s=await K(e,t,r),f=await we(e,z[n]??z.normal,r),u=ve(e,s).concat(Ye(s));return f<0?{wasm:null,spec:null,diagnostics:u,files:s}:{...Y(e,f),diagnostics:u,files:s,tests:n==="test"?je(e):[]}}function je(e){let t=[];for(let r=0;r<e.test_count();r++)t.push({export:`__test_${r}`,name:JSON.parse(W(e.src,e.test_name_start(r),e.test_name_end(r)))});return t}async function K(e,t,r,n=new Map){let{resolvePath:a=xe,stdlib:o}=r,i=async m=>(n.has(m)||n.set(m,await r.readFile(m)),n.get(m)),s=$e(e,o),f=[...s.files],u=new Map(s.byKey),h=[];D(e,f,u,t,await i(t),C.entry);for(let m=0;m<e.import_count();m++){let b=f[e.import_from(m)],p=W(e.src,e.import_path_start(m),e.import_path_end(m)),k=he.test(p);if(/^"?(npm|node):/.test(p)||k&&typeof o.get(p)=="function"){e.import_foreign(m),h.push({i:m,raw:p,from:b.key,name:W(e.src,e.import_name_start(m),e.import_name_end(m))});continue}let _=k?p:a(b.key,JSON.parse(p)),I=u.get(_);if(I===void 0){let E=b.role===C.prelude?C.prelude:C.import;if(k){let T=o.get(_);if(typeof T!="string")continue;I=D(e,f,u,_,T,E)}else{let T;try{T=await i(_)}catch{let M=q.encode(_);new Uint8Array(e.src.buffer).set(M,e.import_missing(m,M.length));break}I=D(e,f,u,_,T,E)}}e.import_bind(m,I)}return await Ve(e,h,r)?(f.diagnostics=e.resolve(),await Ke(e,t,r),await Pe(e),f):K(e,t,r,n)}async function Pe(e){let t=e.wat_count();if(t===0)return;let{assembleWat:r}=await import("./assemble-RU7P7L2O.js"),n=i=>e.node_kind_name(new Uint8Array(e.node_kind.buffer)[i]),a=i=>{let s=new Int32Array(e.node_child.buffer),f=new Int32Array(e.node_next.buffer),u=[];for(let h=s[i];h>=0;h=f[h])u.push(h);return u},o=i=>{let s=new Int32Array(e.node_first.buffer)[i],f=new Int32Array(e.node_last.buffer)[i];return W(e.src,new Int32Array(e.tok_start.buffer)[s],new Int32Array(e.tok_end.buffer)[f-1])};for(let i=0;i<t;i++){let s=a(e.wat_function(i)),f=s.filter(p=>n(p)==="param_list").flatMap(a).map(p=>{let[k,_]=[a(p)[0],a(p).at(-1)];return{name:o(k),type:o(_)}}),u=s.find(p=>n(p)==="return_type"),h=n(a(u)[0])==="void_type"?"void":o(u),m=s.some(p=>n(p)==="self_param")||n(a(u)[0])==="yield_type",b=r({params:f,result:h,method:m,text:W(e.src,e.wat_text_start(i),e.wat_text_end(i))});if(b.code){let p=e.wat_set(i,b.code.length);new Uint8Array(e.wat_bytes.buffer).set(b.code,p)}else{let{message:p,start:k,end:_}=b.error,I=q.encode(p),E=e.wat_fail(i,k??-1,_??-1,I.length);new Uint8Array(e.src.buffer).set(I,E)}}}var he=/^[a-z][a-zA-Z0-9_]*:[A-Za-z][a-zA-Z0-9_]*$/;function D(e,t,r,n,a,o){let i=q.encode(a),s=e.file_add(i.length,o);return n.startsWith("std:")&&e.file_mark_std?.(s),new Uint8Array(e.src.buffer).set(i,e.file_offset(s)),t.push({key:n,role:o,text:a,offset:e.file_offset(s),bytes:i}),r.set(n,s),e.file_parse(s),s}var de=new WeakMap;function ye(e){let t=de.get(e);if(!t){let r=e.map(i=>q.encode(JSON.stringify(i))),n=new Int32Array(r.length),a=new Uint8Array(r.reduce((i,s)=>i+s.length+1,1)),o=0;a[o++]=91,r.forEach((i,s)=>{s>0&&(a[o++]=44),n[s]=o,a.set(i,o),o+=i.length}),a[o++]=93,t={bytes:a.subarray(0,o),offsets:n},de.set(e,t)}return t}var ce=new WeakMap;function be(e){let t=ce.get(e);return t||ce.set(e,t={docs:new Map,views:new Map,wanted:new Set,prelude:null,rebuild:!1}),t}function $e(e,t){let r=be(e);if(!r.rebuild&&r.prelude?.files.every(n=>t.get(n.key)===n.text))return e.reset_keep(),r.prelude;e.reset(),r.docs.clear(),r.views.clear();for(let n of r.wanted){let a=Je(e,n,Ge(e,n,r.docs));r.views.set(n,e.abi_resident_view(a.doc,a.at))}return r.prelude=Le(e,t),e.seal(),r.rebuild=!1,r.prelude}function Le(e,t){let r=[],n=new Map,a=t.get("std:Prelude");if(typeof a!="string")return{files:r,byKey:n};D(e,r,n,"std:Prelude",a,C.prelude);for(let o=0;o<e.import_count();o++){let i=W(e.src,e.import_path_start(o),e.import_path_end(o)),s=t.get(i);!he.test(i)||typeof s!="string"||e.import_bind(o,n.get(i)??D(e,r,n,i,s,C.prelude))}return{files:r,byKey:n}}function ge(e,t){let r=e.abi_room(t.length);return new Uint8Array(e.src.buffer).set(t,r),r}var ue=new WeakMap;function ze(e){let t=ue.get(e);if(!t){let{prefix:r,moduleSpecifier:n,exports:a,names:o,mutableGlobals:i}=e;t={document:ye(e.types),view:q.encode(JSON.stringify({prefix:r,moduleSpecifier:n,exports:a,names:o,mutableGlobals:i}))},ue.set(e,t)}return t}function Ge(e,t,r){if(!r.has(t.document)){let{bytes:n,offsets:a}=t.document,o=ge(e,n);e.abi_offsets_room(a.length),new Int32Array(e.abi_offsets.buffer,0,a.length).set(a),r.set(t.document,e.abi_doc_at(o,a.length))}return r.get(t.document)}function Je(e,t,r){return{doc:r,at:ge(e,t.view)}}async function Ve(e,t,{stdlib:r,resolvePackage:n}){let a=be(e),o=[],i=!1;for(let{i:s,raw:f,from:u,name:h}of t){let m;try{let b=/^"?(npm|node):/.test(f)?await n(JSON.parse(f),{prefix:h,from:u}):await r.get(f)();m=b.document?b:ze(b.abi??b)}catch{continue}a.views.has(m)||(a.wanted.add(m),a.rebuild=!0,i=!0),o.push([s,m])}if(i)return!1;for(let[s,f]of o)e.abi_bind(s,a.views.get(f));return!0}async function Ke(e,t,{resolvePath:r=xe,readBinaryFile:n}){for(let a=0;a<e.embed_files();a++){let o=W(e.src,e.embed_path_start(a),e.embed_path_end(a)),i;try{i=await n(r(t,o))}catch{e.embed_fail(a);continue}let s=e.embed_set(a,i.length);new Uint8Array(e.embed_bytes.buffer).set(i,s)}}async function we(e,t,r={}){let n=e.comptime_mems();if(n>0){let a=e.compile_program(z.comptime);if(a<0)return-1;let{wasm:o,spec:i}=Y(e,a),{exports:s}=await H(o,i,r);for(let f=0;f<n;f++){let u=e.comptime_name(f),h=s[`__comptime_run_${u}`](),m=new Uint8Array(s[`__comptime_${u}`].buffer,0,h*e.comptime_value_size(f)).slice(),b=e.comptime_set(f,h);new Uint8Array(e.comptime_bytes.buffer).set(m,b)}}return e.compile_program(t)}function Y(e,t){let r=new Uint8Array(e.out.buffer,0,t).slice(),n=e.host_json_size(),a=n?JSON.parse(W(e.host_json,0,n)):{};return{wasm:r,spec:a}}function ve(e,t){let r=[];for(let n=0;n<e.diagnostic_count();n++){let a=e.diagnostic_file(n),o=a>=0?t[a]:null,i={kind:e.diagnostic_kind(n),message:e.diagnostic_message(n),severity:"error",file:o?.key??null};if(o){let s=me(o,e.diagnostic_start(n)),f=me(o,e.diagnostic_end(n)),u=o.text.slice(0,s),h=u.split(`
`).length;Object.assign(i,{start:s,end:f,line:h,column:s-u.lastIndexOf(`
`)})}r.push(i)}return r}function Ye(e){return[...e.filter(n=>!/^(std|node|npm):/.test(n.key)).flatMap(n=>le(n.text,n.key)),...fe(e.map(n=>[n.key,n.text]))].map(({kind:n,message:a,primary:o})=>({kind:n,message:a,severity:"warning",file:o.file,start:o.start,end:o.end,line:o.row,column:o.col}))}function me(e,t){return pe.decode(e.bytes.subarray(0,Math.max(0,t-e.offset))).length}async function H(e,t={},{loadGlue:r=null}={}){let n=await WebAssembly.compile(e,Ue),a=t.es??{},o=L(a),i=o?r?ae(a,await r(o)):se(a):{};t.closures&&(i.utu=ne(t.closures,i.utu??{})),t.mems&&(i.utu=te(t.mems,i.utu??{})),t.promises&&(i.utu=X(t.promises,i.utu??{}),i.utu=ee(t.promises,i.utu)),WebAssembly.Module.imports(n).some(f=>f.module==="utu"&&f.name==="js_tag")&&(i.utu=re(i.utu??{}));let s=await WebAssembly.instantiate(n,i);return{module:n,instance:s,exports:ie(s,t.promises)}}function xe(e,t){if(/^[a-z]+:\/\//i.test(e))return new URL(t,e).href;let r=e.split("/").slice(0,-1);for(let n of t.split("/"))n===".."?r.pop():n!=="."&&r.push(n);return r.join("/")}var He=/[0-9A-Za-z!#$%&'*+\-./:<=>?@\\^_`|~]/,Ze=new Set(["export","mod","struct","tag","enum","proto","fn","type","distinct","let","const","mem","vec","using"]);function _e(e,t){let r=(l,d)=>new d(l.buffer),n=r(e.node_first,Int32Array),a=r(e.node_last,Int32Array),o=r(e.tok_start,Int32Array),i=r(e.tok_end,Int32Array),s=r(e.tok_kind,Uint8Array),f=r(e.node_decl,Int32Array),u=r(e.decl_node,Int32Array),h=r(e.decl_owner,Int32Array),m=e.node_count(),b=new Map,p=l=>{for(let d=t.length-1;d>=0;d--)if(t[d].offset<=l)return l<t[d].offset+t[d].bytes.length?t[d]:null;return null},k=(l,d)=>{let c=b.get(l);if(!c){c=new Int32Array(l.bytes.length+1);let y=0;for(let x=0;x<l.bytes.length;){let A=l.bytes[x],N=A<128?1:A<224?2:A<240?3:4;for(let O=0;O<N;O++)c[x+O]=y;x+=N,y+=N===4?2:1}c[l.bytes.length]=y,b.set(l,c)}return c[d-l.offset]},_=l=>{let d=o[n[l]],c=p(d);return c?{file:c.key,start:k(c,d),end:k(c,i[a[l]-1])}:null},I=null,E=()=>{if(I)return I;I=new Int32Array(e.decl_count()).fill(-1);for(let l=0;l<m;l++){let d=f[l];if(d<0||d>=I.length||!T(l)||u[d]<0)continue;let c=o[n[l]];if(c<o[n[u[d]]]||c>=i[a[u[d]]-1])continue;let y=I[d];(y<0||c<o[n[y]])&&(I[d]=l)}return I},T=l=>f[l]>=0&&n[l]<a[l]&&a[l]-n[l]===1,M=null,R=()=>{if(M)return M;M=new Map;let l=new Uint8Array(e.src.buffer);for(let d=0,c=e.wat_count?.()??0;d<c;d++){let y=e.wat_function(d),x=-1;for(let w=0,B=e.decl_count();w<B&&x<0;w++)u[w]===y&&(x=w);let A=new Map;for(let w=0,B=e.decl_count();w<B;w++){if(h[w]!==x||e.decl_kind_name(w)!=="Param")continue;let F=_(E()[w]>=0?E()[w]:u[w]);F&&A.set(t.find(U=>U.key===F.file)?.text.slice(F.start,F.end),w)}let N=e.wat_text_start(d),O=e.wat_text_end(d),$=p(N);if(!(!$||!A.size))for(let w=N;w<O;w++){let B=l[w];if(B===59&&l[w+1]===59){for(;w<O&&l[w]!==10;)w++;continue}if(B===40&&l[w+1]===59){let G=0;for(;w<O;w++)if(l[w]===40&&l[w+1]===59)G++,w++;else if(l[w]===59&&l[w+1]===41&&(G--,w++,!G))break;continue}if(B!==36)continue;let F=w+1;for(;F<O&&He.test(String.fromCharCode(l[F]));)F++;let U=A.get(new TextDecoder().decode(l.subarray(w+1,F)));U!==void 0&&(M.has(U)||M.set(U,[]),M.get(U).push({file:$.key,start:k($,w+1),end:k($,F)})),w=F-1}}return M},g=new TextDecoder,S=l=>{for(let d=n[l];d<a[l];d++){if(s[d]===8)continue;let c=p(o[d]);if(!c)return null;let y=g.decode(c.bytes.subarray(o[d]-c.offset,i[d]-c.offset));if(!Ze.has(y))return y!=="&"&&!/^[A-Za-z_]\w*$/.test(y)?null:{file:c.key,start:k(c,o[d]),end:k(c,i[d])}}return null};return{at:_,declarationAt(l,d){for(let c=0;c<m;c++){if(!T(c))continue;let y=_(c);if(y&&y.file===l&&y.start<=d&&d<=y.end)return f[c]}for(let[c,y]of R())if(y.some(x=>x.file===l&&x.start-1<=d&&d<=x.end))return c;return-1},definition(l){let d=u[l];if(d<0)return null;let c=E()[l];return c>=0?_(c):S(d)??_(d)},references(l,{includeDeclaration:d=!0}={}){let c=this.definition(l),y=[];for(let x=0;x<m;x++){if(f[x]!==l||!T(x))continue;let A=_(x);if(!A)continue;let N=c&&A.file===c.file&&A.start===c.start;N&&!d||(N?y.unshift(A):y.push(A))}return[...y,...R().get(l)??[]]},span(l){return u[l]>=0?_(u[l]):null},kind(l){return e.decl_kind_name(l)},owner(l){return h[l]},type(l){return e.decl_checked_type(l)},typeDeclaration(l){return e.decl_checked_type_decl(l)},declarations(l=null){let d=[];for(let c=0,y=e.decl_count();c<y;c++){if(u[c]<0)continue;let x=_(u[c]);x&&(l==null||x.file===l)&&d.push({decl:c,kind:e.decl_kind_name(c),owner:h[c],span:x})}return d},names(l){let d=[];for(let c=0;c<m;c++){if(!T(c))continue;let y=_(c);y&&y.file===l&&d.push({decl:f[c],at:y})}for(let[c,y]of R())for(let x of y)x.file===l&&d.push({decl:c,at:x});return d.sort((c,y)=>c.at.start-y.at.start),d.filter((c,y)=>y===0||c.at.start!==d[y-1].at.start)},tokenAt(l,d){let c=t.findIndex(y=>y.key===l);if(c<0)return null;for(let y=e.file_first_token(c),x=e.file_end_token(c);y<x;y++){let A=k(t[c],o[y]);if(A>=d)return null;let N=k(t[c],i[y]);if(d<N||d===N&&s[y]===8)return{kind:s[y],start:A,end:N}}return null},text(l){let d=t.find(c=>c.key===l.file);return d?d.text.slice(l.start,l.end):""}}}function Qe(e,t){let r=new Map,n,a=s=>(r.has(s)||r.set(s,(async()=>{let[f,u]=await Promise.all([t(`${s}.types.json`),t(`${s}.offsets`)]);return{bytes:f,offsets:Xe(u)}})()),r.get(s)),o=new Map(e),i=new Map;for(let s of["std:Browser","std:JS","std:Web","std:Worker"])typeof e.get(s)=="function"&&o.set(s,()=>(i.has(s)||i.set(s,(async()=>{n??=JSON.parse(new TextDecoder().decode(await t("catalog.json")));let{document:f,view:u}=n[s],[h,m]=await Promise.all([a(f),t(`${u}.view.json`)]);return{document:h,view:m}})()),i.get(s)));return o}function Xe(e){let t=new DataView(e.buffer,e.byteOffset,e.byteLength),r=new Int32Array(e.byteLength/4);for(let n=0;n<r.length;n++)r[n]=t.getInt32(n*4,!0);return r}var en={keyword:"35",string:"32",number:"33",comment:"2",type:"36",function:"34",constant:"33",field:"0",parameter:"3",variable:"0",dsl:"32"};function ke(e,t,r){let n="",a=0;for(let o of r){let i=Math.max(0,o.start-t),s=Math.min(e.length,o.end-t);if(s<=a)continue;n+=e.slice(a,Math.max(a,i));let f=en[o.class];n+=f==="0"?e.slice(Math.max(a,i),s):`\x1B[${f}m${e.slice(Math.max(a,i),s)}\x1B[0m`,a=s}return n+e.slice(a)}var nn=6;function Ie(e){let t=0;for(let r of e){let n=r.codePointAt(0);if(r==="	")t+=4;else{if(n>=768&&n<=879||n>=8203&&n<=8207||n>=65024&&n<=65039)continue;n>=4352&&n<=4447||n>=11904&&n<=42191||n>=44032&&n<=55203||n>=63744&&n<=64255||n>=65072&&n<=65103||n>=65280&&n<=65376||n>=65504&&n<=65510||n>=127744&&n<=128591||n>=129280&&n<=129535||n>=131072&&n<=262141?t+=2:t+=1}}return t}function tn(e,t,{color:r=!1,relative:n=o=>o,highlight:a=null}={}){let o=(i,s)=>r?`\x1B[${i}m${s}\x1B[0m`:s;return e.map(i=>{let s=i.severity??"error",f=o(s==="warning"?"1;33":"1;31",`${s}:`),u=i.file!=null?t.get(i.file):null;if(u==null||i.start==null)return`${i.file!=null?`${n(i.file)}: `:""}${f} ${o("1",i.message)}`;let h=`${o("1",`${n(i.file)}:${i.line}:${i.column}:`)} ${f} ${o("1",i.message)}`,m=[0];for(let g=u.indexOf(`
`);g>=0;g=u.indexOf(`
`,g+1))m.push(g+1);let b=g=>{let S=0,l=m.length-1;for(;S<l;){let d=S+l+1>>1;m[d]<=g?S=d:l=d-1}return S},p=i.line-1,k=Math.max(p,b(Math.max(i.start,i.end-1))),_=g=>u.slice(m[g],(m[g+1]??u.length+1)-1).replace(/\r$/,""),I=[];p>0&&_(p-1).trim()&&I.push({line:p-1,context:!0});for(let g=p;g<=k;g++){if(k-p+1>nn&&g===p+2){I.push({gap:!0}),g=k-2;continue}I.push({line:g})}let E=String(k+1).length,T=g=>g.replace(/\t/g,"    "),M=g=>o("2",`${g.padStart(E+1)} |`),R=[h];for(let g of I){if(g.gap){R.push(o("2",`${" ".repeat(E)}...`));continue}let S=_(g.line),l=T(r&&a?ke(S,m[g.line],a(i.file,m[g.line],m[g.line]+S.length)):S);if(R.push(`${M(String(g.line+1))} ${g.context&&r?`\x1B[2m${T(S)}\x1B[0m`:l}`),g.context)continue;let d=g.line===p?i.start-m[g.line]:S.length-S.trimStart().length,c=g.line===k?Math.min(S.length,Math.max(d+1,i.end-m[g.line])):S.length;if(c<=d&&g.line!==p)continue;let y=Ie(S.slice(0,d)),x=Math.max(1,Ie(S.slice(0,c))-y);R.push(`${M("")} ${" ".repeat(y)}${o("1;31","^".repeat(x))}`)}return R.join(`
`)}).join(`

`)}function rn(e){return L(e.es??{})}function an(e,t,{runtime:r,glue:n,wasm:a,streaming:o=!1}){let i=new Set(WebAssembly.Module.imports(new WebAssembly.Module(t,Se)).map(p=>`${p.module}.${p.name}`)),s=[],f=[],u=[],h=e.es??{},m=Object.fromEntries(Object.entries(h).map(([p,k])=>[p,Object.fromEntries(Object.keys(k).map(_=>[_,""]))]));n&&Object.values(m).some(p=>Object.keys(p).length)?(s.push("importObjectFromGlue"),f.push(`import * as glue from ${JSON.stringify(n)};`),u.push(`const imports = importObjectFromGlue(${JSON.stringify(m)}, glue);`)):u.push("const imports = {};"),e.closures&&(s.push("closureImports"),u.push(`imports.utu = closureImports(${JSON.stringify(e.closures)}, imports.utu);`)),e.mems&&(s.push("memoryImports"),u.push(`imports.utu = memoryImports(${JSON.stringify(e.mems)}, imports.utu);`)),e.promises&&(s.push("promiseImports","awaitImports","promisifyExports"),u.push(`imports.utu = awaitImports(${JSON.stringify(e.promises)}, promiseImports(${JSON.stringify(e.promises)}, imports.utu));`)),i.has("utu.js_tag")&&(s.push("exceptionImports"),u.push("imports.utu = exceptionImports(imports.utu);")),s.length&&f.unshift(`import { ${s.join(", ")} } from ${JSON.stringify(r)};`);let b=o?"compileStreaming":"compile";return u.push(`const module = await WebAssembly.${b}(${a}, ${JSON.stringify(Se)});`),u.push("export const instance = await WebAssembly.instantiate(module, imports);"),u.push(e.promises?`export const exports = promisifyExports(instance, ${JSON.stringify(e.promises)});`:"export const exports = instance.exports;"),[...f,...u].join(`
`)+`
`}var Se={builtins:["js-string"],importedStringConstants:"'"};var Ae=()=>import("./browser-catalog.generated-2OMWPVRO.js");async function Te(e,t,r){let n=e[`${t}_JSON`];if(n===void 0){let o=Uint8Array.from(atob(e[`${t}_GZIP`]),s=>s.charCodeAt(0)),i=new Blob([o]).stream().pipeThrough(new DecompressionStream("gzip"));n=await new Response(i).text()}let a=JSON.parse(n);if(a.version!==1)throw new Error(`Unsupported ${r} declaration ABI version`);return a}function j(e){let t;return()=>t??=e().catch(r=>{throw t=void 0,r})}var Z=j(async()=>Te(await Ae(),"BROWSER_ABI","browser")),sn=j(async()=>Te(await Ae(),"WORKER_ABI","worker"));function Me(e,t,r){let n=a=>Object.fromEntries(Object.entries(a).filter(([o])=>r(o)));return{source:`mod ${e} {}`,abi:{...t,prefix:e,exports:n(t.exports),names:n(t.names),mutableGlobals:t.mutableGlobals.filter(r)}}}async function Ne(){return{source:"mod Browser {}",abi:await Z()}}var Ee=j(async()=>{let e=await Z(),t=new Set(e.ecmascript??[]);return Me("JS",e,r=>t.has(r))}),on=["AbortController","AbortSignal","Blob","ByteLengthQueuingStrategy","CompressionStream","CountQueuingStrategy","Crypto","CryptoKey","CustomEvent","DOMException","DecompressionStream","Event","EventTarget","File","FormData","Headers","MessageChannel","MessageEvent","MessagePort","ReadableByteStreamController","ReadableStream","ReadableStreamBYOBReader","ReadableStreamBYOBRequest","ReadableStreamDefaultController","ReadableStreamDefaultReader","Request","RequestInit","Response","ResponseInit","SubtleCrypto","TextDecoder","TextDecoderStream","TextEncoder","TextEncoderStream","TransformStream","TransformStreamDefaultController","URL","URLSearchParams","WebAssembly","WritableStream","WritableStreamDefaultController","WritableStreamDefaultWriter","atob","btoa","clearInterval","clearTimeout","console","crypto","fetch","navigator","performance","queueMicrotask","reportError","setInterval","setTimeout","structuredClone"],Fe=j(async()=>{let e=new Set(on);return Me("Web",await Z(),t=>e.has(t))}),Re=j(async()=>({source:"mod Worker {}",abi:await sn()}));var v="ir-wasm-",P=new Map([["std:Array",`// std/Array.utu \u2014 Array[T1]
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
`.replaceAll("@@IR_WASM@@",v)],["std:Bool",`// std/Bool.utu \u2014 Bool scalar type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:Buffer",`// Geometrically growing native buffer, including non-defaultable element types.
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
`.replaceAll("@@IR_WASM@@",v)],["std:Console",`//! The host's console: \`using console from std:Console;\`, then
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
`.replaceAll("@@IR_WASM@@",v)],["std:Externref",`// std/Externref.utu \u2014 Externref opaque external reference type module
// & maps to the WebAssembly Externref type: an opaque, garbage-collected
// reference to a host (JavaScript) object.
// Externrefs ARE nullable: ?Externref is valid.
//
// No arithmetic or comparison operators \u2014 externrefs are fully opaque.
// Host operations are accessed via @ir DSL or imported JS functions.

mod Externref {
    type & = @ir/\\ <@@IR_WASM@@ref type-repr="wasm-externref"/> \\/
}
`.replaceAll("@@IR_WASM@@",v)],["std:F32",`// std/F32.utu \u2014 F32 scalar type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:F64",`// std/F64.utu \u2014 F64 scalar type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:Found",`// Optional iterator result: null means empty; a present wrapper holds any T,
// including non-nullable scalar types. Use \`promote\` or \`orelse\` to unwrap.
mod Found[T] {
    struct &:
        | value: T
    fn &.new(value: T) & {
        &{ value: value };
    }
}
`.replaceAll("@@IR_WASM@@",v)],["std:Group",`mod Group[K, T] {
    struct &:
        | key: K
        | values: Array[T]
    fn &.new(key: K) & {
        &{ key: key, values: [] };
    }
}
`.replaceAll("@@IR_WASM@@",v)],["std:I31",`// std/I31.utu \u2014 I31 WasmGC reference type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:I32",`// std/I32.utu \u2014 I32 scalar type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:I64",`// std/I64.utu \u2014 I64 scalar type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:IntMap",`// std/IntMap.utu \u2014 I32 keys to I32 values, open addressing.
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
`.replaceAll("@@IR_WASM@@",v)],["std:Interner",`// std/Interner.utu \u2014 byte strings to dense I32 ids: 0, 1, 2, \u2026 in first-seen order.
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
`.replaceAll("@@IR_WASM@@",v)],["std:List",`mod List[T] {
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
`.replaceAll("@@IR_WASM@@",v)],["std:LiteralDefaults",`// std/LiteralDefaults.utu \u2014 default static type for each literal syntax kind
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
`.replaceAll("@@IR_WASM@@",v)],["std:M128",`// std/M128.utu \u2014 M128 bitmask type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:M32",`// std/M32.utu \u2014 M32 bitmask type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:M64",`// std/M64.utu \u2014 M64 bitmask type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:NumberField",`// Keep the user's draft, including empty/invalid text, separate from a number.
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
`.replaceAll("@@IR_WASM@@",v)],["std:PersistentSegmentTree",`// Immutable versions of an ordered monoid index. Point updates share untouched
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
`.replaceAll("@@IR_WASM@@",v)],["std:Prelude",`// std/prelude.utu \u2014 automatically injected into every compilation
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
`.replaceAll("@@IR_WASM@@",v)],["std:Promise",`// std/Promise.utu \u2014 Promise[T]
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
`.replaceAll("@@IR_WASM@@",v)],["std:Random",`//! Seeded random numbers: \`using Random from std:Random;\`.
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
`.replaceAll("@@IR_WASM@@",v)],["std:SegmentTree",`// An ordered monoid index. combine must be associative and identity neutral.
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
`.replaceAll("@@IR_WASM@@",v)],["std:Spatial",`using Buffer from std:Buffer;

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
`.replaceAll("@@IR_WASM@@",v)],["std:Str",`// std/Str.utu \u2014 Str string reference type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:StrMap",`//! Str keys to values of any type: \`using StrMap from std:StrMap;\`.
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
`.replaceAll("@@IR_WASM@@",v)],["std:Stream",`//! \`Stream[T]\`: a JavaScript async iterable, held as an externref. An async
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
`.replaceAll("@@IR_WASM@@",v)],["std:Time",`//! Clocks: \`using time from std:Time;\`, then \`time.now()\`. Each function ships only when used.

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
`.replaceAll("@@IR_WASM@@",v)],["std:U32",`// std/U32.utu \u2014 U32 scalar type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:U64",`// std/U64.utu \u2014 U64 scalar type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:V128",`// std/V128.utu \u2014 V128 SIMD vector type module
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
`.replaceAll("@@IR_WASM@@",v)],["std:Wutu",`// Generated from src/runtime/wutu.js by the build. No runtime ships unless used.
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
`.replaceAll("@@IR_WASM@@",v)]]);P.set("std:Browser",Ne);P.set("std:JS",Ee);P.set("std:Web",Fe);P.set("std:Worker",Re);export{V as OPTIMIZE,P as PLATFORM_SOURCES,C as ROLE,z as TARGET,Y as builtModule,Qe as catalogStdlib,qe as compile,we as compileProgram,tn as formatDiagnostics,rn as glueSource,H as instantiate,De as loadCompiler,K as loadProgram,an as loaderSource,_e as programIndex,ve as readDiagnostics};
