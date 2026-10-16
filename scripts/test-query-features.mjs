import fs from 'node:fs/promises';
import path from 'node:path';
import { compileAndInstantiate, makeCompiler, assertEq } from './test-harness.mjs';
const ROOT=path.resolve('.');
const assertNoErrors=doc=>{const errors=[...doc.querySelectorAll('[data-error]')];if(errors.length)throw Error(errors.map(n=>(n.dataset.errorMessage??n.dataset.error)+' at '+n.dataset.row+':'+n.dataset.col).join('\n'));};
for (const file of ['iterators', 'indexes']) {
 const {instance}=await compileAndInstantiate({ROOT,makeCompiler,assertNoErrors,name:`query-${file}.utu`,source:await fs.readFile(`examples/queries/${file}.utu`,'utf8')});
 assertEq(instance.exports.main(),1,file);
 console.log(`${file}: passed`);
}

// Deterministic brute-force oracle: spatial query boundaries, duplicates, and ties.
const points = Array.from({length:31},(_,i)=>({x:(i*17%13)-6,y:(i*7%11)-5,id:i}));
const literal='['+points.map(p=>`Spatial.point(${p.x}.0, ${p.y}.0, ${p.id})`).join(',')+']';
const {instance: spatial}=await compileAndInstantiate({ROOT,makeCompiler,assertNoErrors,name:'spatial-oracle.utu',source:`
using Spatial from std:Spatial;
fn tree() Spatial { Spatial.new(${literal}); }
fn mask(ids: Array[I32]) I64 { ids fold(0.to_i64()) |acc, id| { acc + (1.to_i64() << id.to_i64()); }; }
export lib {
 fn box(a: F64,b: F64,c: F64,d: F64) I64 { mask(tree().within(a,b,c,d)); }
 fn below(a: F64,b: F64,c: F64) I64 { mask(tree().below(a,b,c)); }
 fn radius(x: F64,y: F64,r: F64) I64 { mask(tree().radius(x,y,r)); }
 fn nearest(x: F64,y: F64) I32 { (tree().nearest(x,y) orelse fatal).value; }
 fn empty() I32 { let points: Array[Spatial.Point]=[]; let t=Spatial.new(points); t.within(-1.0,1.0,-1.0,1.0).len(); }
}
`});
const mask=ps=>ps.reduce((a,p)=>a+(1n<<BigInt(p.id)),0n);
for(let i=0;i<80;i++){
 const x=i*7%19-9,y=i*11%17-8,r=i%6;
 assertEq(spatial.exports.box(x,x+r,y,y+r),mask(points.filter(p=>p.x>=x&&p.x<=x+r&&p.y>=y&&p.y<=y+r)),'rectangle oracle');
 assertEq(spatial.exports.below(x,x+r,y),mask(points.filter(p=>p.x>=x&&p.x<=x+r&&p.y<=y)),'PST oracle');
 assertEq(spatial.exports.radius(x,y,r),mask(points.filter(p=>(p.x-x)**2+(p.y-y)**2<=r*r)),'radius oracle');
 const sorted=[...points].sort((a,b)=>((a.x-x)**2+(a.y-y)**2)-((b.x-x)**2+(b.y-y)**2)||a.id-b.id);
 assertEq(spatial.exports.nearest(x,y),sorted[0].id,'nearest oracle');
}
assertEq(spatial.exports.empty(),0);
console.log('320 spatial queries match brute-force results');

const {instance: ranges}=await compileAndInstantiate({ROOT,makeCompiler,assertNoErrors,name:'range-oracle.utu',source:`
using SegmentTree from std:SegmentTree;
using PersistentSegmentTree from std:PersistentSegmentTree;
fn add(a: I32,b: I32) I32 {a+b;}
fn join(a: Str,b: Str) Str {a+b;}
export lib {
 fn query(lo: I32,hi: I32,index: I32,value: I32) I32 {
  let t=SegmentTree[I32].new([2,7,1,8,2,8,1,8],0,add); t.set(index,value,add); t.query(lo,hi,add);
 }
 fn persistent(lo: I32,hi: I32,index: I32,value: I32) I32 {
  let t=PersistentSegmentTree[I32].new([2,7,1,8,2,8,1,8],0,add);
  let other=t.set(index,value,add); assert t.query(0,8,add)==37; other.query(lo,hi,add);
 }
 fn order() Str {let t=SegmentTree[Str].new(["a","b","c","d","e"],"",join); t.query(1,5,join);}
 fn empty() I32 {let a:Array[I32]=[];let t=SegmentTree[I32].new(a,0,add);t.query(0,0,add);}
}
`});
for(let lo=0;lo<=8;lo++)for(let hi=lo;hi<=8;hi++)for(let index=0;index<8;index++){
 const values=[2,7,1,8,2,8,1,8];values[index]=-3;
 const expected=values.slice(lo,hi).reduce((a,b)=>a+b,0);
 assertEq(ranges.exports.query(lo,hi,index,-3),expected);
 assertEq(ranges.exports.persistent(lo,hi,index,-3),expected);
}
assertEq(ranges.exports.order(),'bcde','noncommutative monoid retains order');
assertEq(ranges.exports.empty(),0);
console.log('720 mutable/persistent range queries match brute-force results');

const {instance: edge}=await compileAndInstantiate({ROOT,makeCompiler,assertNoErrors,name:'iterator-edges.utu',source:`
struct Item: | value: I32
struct Counter: | calls: I32
mod shadows {
 fn item() I32 {99;}
 fn score() I32 { [1,2,3] map |item| {item+1;} sum; }
}
export lib {
 fn check() I32 {
  let empty:Array[Item]=[];
  assert (empty group_by(Item,I32)|v|{v.value;}).len()==0;
  assert (empty distinct_by(Item,I32)|v|{v.value;}).len()==0;
  assert (empty partition(Item)|v|{true;})[0].len()==0;
  assert (empty batched(Item,2)).len()==0;
  assert (empty windows(Item,2)).len()==0;
  let absent=empty min_by(Item)|a,b|{a.value<b.value;};
  promote absent {|v|=>{fatal;},~>{},};
  let all=Array[I32].new(80,3);
  let groups=all group_by(I32,I32)|v|{v;};
  assert groups[0].values.len()==80;
  assert (groups[0].values sum)==240;
  let c=Counter{calls:0};
  let found=all first_where(I32)|v|{c.calls+=1;true;};
  assert c.calls==1;
  let reduced=all take(1) reduce(I32)|a,b|{c.calls+=1;a+b;};
  assert c.calls==1;
  assert (reduced orelse fatal).value==3;
  assert ([1,2] scan(0)|a,b|{a+b;} chain([10]) sum)==14;
  let distinct=[1,2,3,4] distinct_by(I32,I32)|v|{v%2;};
  assert distinct[0]==1 and distinct[1]==2;
  assert ([1,2] windows(I32,3)).len()==0;
  let parts=[1] partition(I32)|v|{false;};
  assert parts[0].len()==0 and parts[1].len()==1;
  let batch=([1] chain([2,3]) batched(I32,2));
  assert batch[0][1]==2 and batch[1][0]==3;
  let counter=Counter{calls:0};
  let index=Array[I32].new(1024,2) bisect |v|{counter.calls+=1;v<2;};
  assert index==0 and counter.calls<=11;
  assert (Array[I32].new(1024,2) bisect |v|{v<=2;})==1024;
  assert ([1,2,3] bisect |v,i|{i<2.to_u32().to_u64();})==2;
  let rows=[Item{value:4},Item{value:2},Item{value:2}];
  let max=(rows max_by(Item)|a,b|{a.value<b.value;}) orelse fatal;
  assert max.value.value==4;
  let strings=["red","blue","red"] group_by(Str,Str)|s|{s;};
  assert strings.len()==2 and strings[0].values.len()==2;
  assert shadows.score()==9;
  1;
 }
 fn invalid_batch() I32 {([1] batched(I32,0)).len();}
 fn invalid_window() I32 {([1] windows(I32,-1)).len();}
}
`});
assertEq(edge.exports.check(),1);
for(const name of ['invalid_batch','invalid_window']){
 let threw=false;try{edge.exports[name]();}catch{threw=true;}assertEq(threw,true,name);
}
console.log('Iterator empty inputs, growth, stage boundaries, short circuit, shadowing, and logarithmic bisect passed');

const { parseWutu }=await import('../src/compiler/wutu-parse.js');
for(const source of ['div { aria-hidden = "true" aspect-ratio: 0.68; }','input { disabled }','input { .value=x }','button { on click=handler }','p { "text" }','p { = text }','div { :hover {color:red} }', 'div { color:red } p { color:blue; }']) {
 let threw=false;try{parseWutu(source);}catch(e){threw=/semicolon|expected ;/.test(e.message);}assertEq(threw,true,source);
}
parseWutu('div { aria-hidden = "true"; aspect-ratio: 0.68; "text"; = label; }');
parseWutu('@document { p { color:red; /* a } is just a comment */ } } div {}');
console.log('All Wutu leaf statements require semicolons');

for (const run of [
 ()=>spatial.exports.nearest(NaN,0),
 ()=>spatial.exports.radius(0,0,-1),
 ()=>spatial.exports.below(2,1,0),
 ()=>spatial.exports.box(0,1,0,Infinity),
 ()=>ranges.exports.query(-1,2,0,3),
 ()=>ranges.exports.persistent(0,2,8,3),
]) {
 let threw=false;try{run();}catch{threw=true;}assertEq(threw,true,'invalid query must trap');
}
console.log('Invalid bounds and non-finite spatial coordinates are rejected');
