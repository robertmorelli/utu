import { glueModuleSource, liveGlueFields } from '../src/runtime/host-imports.js';
import { parseHTML } from 'linkedom/worker';
import { emitText, emitBinary } from '../src/index.js';
import { compileAndInstantiate, withTempUtu } from './test-harness.mjs';
import { parseWutu } from '../src/compiler/wutu.js';

export function registerIteratorWutuTests({test,assert,assertEq,assertThrows,assertNoErrors,makeCompiler}) {
  test('iterators: fused stages, independent indexes, short circuit, and nested pipelines',async({ROOT})=>{
    const {instance,doc}=await compileAndInstantiate({ROOT,makeCompiler,assertNoErrors,name:'iterators.utu',source:`
      struct Counter: | value: I32
      export lib {
        fn fused() I32 { [1,2,3,4,5] map |x| { x*2; } filter |x| {x>4;} skip(1) take(2) fold(0) |a,x| {a+x;}; }
        fn indexes() U64 { let zero: U64 = 0; [4,5,6,7] filter |x| {x>5;} fold(zero) |a,x,i| {a+i;}; }
        fn once() I32 { let c = Counter {value:0}; [1,2,3,4] map |x| {c.value+=1;x;} any |x| {x==2;}; c.value; }
        fn zip_once() I32 { let c=Counter{value:0}; [1,2,3] map |x| {c.value+=1;x;} zip([10]) |a,b| {a+b;} count; c.value; }
        fn chain_after_take() I32 { [1,2,3] take(1) chain([10,20]) sum; }
        fn take_after_chain() I32 { [1,2,3] chain([10,20]) take(1) sum; }
        fn chain_mixed() I32 { [1,2,3] take(0) chain([10,20]) take(1) chain([30]) sum; }
        fn no_work() I32 { let c = Counter {value:0}; [1,2,3] map |x| {c.value+=1;x;} take(0) count; c.value; }
        fn while_stages() I32 { [1,2,3,2,1] skip_while |x| {x<3;} take_while |x| {x>1;} sum; }
        fn flattened() I32 { [[1,2],[3,4]] flat_map |xs| {xs;} sum; }
        fn zipped() I32 { [1,2,3] zip([10,20]) |a,b| {a+b;} sum; }
        fn chained() I32 { [1,2] map |x| {x*2;} chain([10,20]) chain([30]) filter |x| {x>2;} sum; }
        fn repeated() I32 { [1,2] repeat(3) sum; }
        fn nested() I32 { [1,2] map |x| {[x,x] sum;} sum; }
        fn every() Bool { [1,2,3] all |x| {x>0;}; }
        fn empty_all() Bool { [] all |x| {x>0;}; }
        fn empty_any() Bool { [] any |x| {x>0;}; }
        fn product_() I32 { [2,3,4] product; }
        fn count_() I32 { [1,2,3,4] count_where |x| {x%2==0;}; }
        fn first_() I32 { [1,2,3,2] first_index |x| {x==2;}; }
        fn last_() I32 { [1,2,3,2] last_index |x| {x==2;}; }
        fn absent() I32 { [] first_index |x| {true;}; }
      }
    `});
    for (const [name,value] of Object.entries({fused:18,indexes:1n,once:2,zip_once:1,chain_after_take:31,take_after_chain:1,chain_mixed:40,no_work:0,while_stages:5,flattened:10,zipped:33,chained:64,repeated:9,nested:6,every:1,empty_all:1,empty_any:0,product_:24,count_:2,first_:1,last_:3,absent:-1})) assertEq(instance.exports[name](),value,name);
    assert(!doc.querySelector('ir-iterator'),'all iterator syntax lowered');
    assert(!doc.querySelector('ir-closure'),'iterator bodies do not allocate closures');
  });
  test('iterators: canonical WAT has one fused loop and no intermediate arrays or indirect body calls',async({ROOT})=>{
    const {doc,instance}=await compileAndInstantiate({ROOT,makeCompiler,assertNoErrors,name:'iterator_wat.utu',source:`
      export main(n: I32) I32 { [n,n+1,n+2] map |x| {x*2;} filter |x| {x>3;} fold(0) |a,x| {a+x;}; }
    `});
    const wat=emitText(doc);
    assertEq((wat.match(/\(loop /g)??[]).length,1);
    assertEq((wat.match(/array\.new/g)??[]).length,1,'only the input literal allocates');
    assert(!wat.includes('call_indirect'));assert(!wat.includes('closure_new'));assert(wat.includes('i32.add'));
    assertEq(instance.exports.main(1),10);
  });
  test('iterators: generic module specializations infer their own element types',async({ROOT})=>{
    const {instance}=await compileAndInstantiate({ROOT,makeCompiler,assertNoErrors,name:'iterator_generics.utu',source:`
      mod Sum[T] { fn total(xs: Array[T]) T { xs sum; } }
      export main() F64 { let a: Array[I32] = [1,2]; let b: Array[F64] = [1.5,2.5]; Sum[I32].total(a).to_f64()+Sum[F64].total(b); }
    `});
    assertEq(instance.exports.main(),7);
  });
  test('iterators: collection growth, empty results, changed element types and non-defaultable structs',async({ROOT})=>{
    const {instance}=await compileAndInstantiate({ROOT,makeCompiler,assertNoErrors,name:'iterator_collect.utu',source:`
      struct Item: | value: I32
      export lib {
        fn growth() I32 { let a = [1,2,3,4,5] repeat(4) collect(I32); a.len()*100+a[19]; }
        fn empty() I32 { let a = [Item {value:1}] filter |x| {false;} collect(Item); a.len(); }
        fn structs() I32 { let a = [1,2,3] map |x| {Item {value:x};} collect(Item); a[2].value; }
        fn float_sum() F64 { [1.5,2.5] map |x| {x*2.0;} sum; }
        fn empty_product() F64 { let a: Array[F64] = []; a product; }
        fn wide_sum() I64 { let a: Array[I64] = [3,4]; a sum; }
        fn sorted() I32 { let a=[5,3,1,8,2,4] sort(I32) |a,b| {a<b;}; a[0]*100+a[5]; }
        fn floats() F64 { let a = [1,2] map |x| {x.to_f64()/2.0;} collect(F64); a[0]+a[1]; }
      }
    `});
    assertEq(instance.exports.growth(),2005);assertEq(instance.exports.empty(),0);assertEq(instance.exports.structs(),3);assertEq(instance.exports.floats(),1.5);
    assertEq(instance.exports.float_sum(),8);assertEq(instance.exports.empty_product(),1);assertEq(instance.exports.wide_sum(),7n);assertEq(instance.exports.sorted(),108);
  });
  test('wutu: DOM slots, conditionals, loops, SVG, properties, and typed event captures run',async({ROOT})=>{
    const previous = globalThis.document;
    const {document,Event} = parseHTML('<html><head></head><body></body></html>');
    globalThis.document = document;
    try {
      const {instance,doc}=await compileAndInstantiate({ROOT,makeCompiler,assertNoErrors,name:'wutu_dom.utu',source:`
        using Browser from std:Browser;
        fn unused() Browser.HTMLElement { @wutu/\\ div { color: magenta; "DEAD-COMPONENT"; } \\/; }
        export main() Browser.HTMLElement {
          @wutu/\\
          div.card {
            color: red;
            <class=$["extra"];
            <data-label=$["<b>safe</b>"];
            input { <.value=$["hello"]; <disabled=$["x" == "y"]; }
            svg { <viewBox="0 0 10 10"; circle { <cx="5"; <cy="5"; <r="4"; } }
            for $[[1,2]] |n| {
              button as button { <type="button"; $[n.to_f64().toString()]; @click=$[cl(e) void { button.textContent = (n*10).to_f64().toString(); }]; }
            }
            if $[true] { p { "present"; } } else { p { "absent"; } }
          }
          \\/;
        }
      `});
      const glue=glueModuleSource(JSON.parse(doc.body.firstChild.dataset.dslImportsJs ?? '{}'),await liveGlueFields(emitBinary(doc)));
      assert(!glue.includes('magenta'),'unreachable component styles are absent from shipped glue');
      const root=instance.exports.main();
      assert(root.classList.contains('extra'));assert(root.classList.contains('card'));
      assertEq(root.getAttribute('data-label'),'<b>safe</b>');assertEq(root.querySelectorAll('b').length,0);
      assertEq(root.querySelector('input').value,'hello');assert(!root.querySelector('input').hasAttribute('disabled'));
      assertEq(root.querySelector('svg').namespaceURI,'http://www.w3.org/2000/svg');
      assertEq(root.querySelector('circle').namespaceURI,'http://www.w3.org/2000/svg');
      const buttons=root.querySelectorAll('button');buttons[0].dispatchEvent(new Event('click'));buttons[1].dispatchEvent(new Event('click'));
      assertEq(buttons[0].textContent,'10');assertEq(buttons[1].textContent,'20');
      assertEq(root.querySelector('p').textContent,'present');assertEq(document.querySelectorAll('style').length,1);
      instance.exports.main();assertEq(document.querySelectorAll('style').length,1);
      assert(!document.head.textContent.includes('magenta'),'unreached component styles are not installed');
    } finally { globalThis.document = previous; }
  });
  test('codegen: local @es functions use unique imports and retain their callable types',async({ROOT})=>{
    const {instance}=await compileAndInstantiate({ROOT,makeCompiler,assertNoErrors,name:'local_es_functions.utu',source:`
      export lib {
        fn first() I32 { let f: fun(I32) I32 = @es/\\ x => x + 1 \\/; f(10); }
        fn second() I32 { let f: fun(I32) I32 = @es/\\ x => x + 2 \\/; f(10); }
      }
    `});
    assertEq(instance.exports.first(),11);assertEq(instance.exports.second(),12);
  });
  test('syntax diagnostics: invalid pipelines report their site, and Utu islands retain exact ranges',async({ROOT})=>{
    const compiler=await makeCompiler({ROOT,target:'analysis'});
    for (const [source,kind] of [
      ['export main() void { [1,2] map |x| {x;}; }','invalid-iterator-usage'],
      ['export main() I32 { [1] map |x,y,z| {x;} sum; }','invalid-iterator-usage'],
      ['using Browser from std:Browser; export main() void { @wutu/\\ canvas { <padding="10"; } \\/; }','invalid-dsl-usage'],
    ]) {
      await withTempUtu(ROOT,'invalid_new_syntax.utu',source,async file=>{
        let caught;try { await compiler.compileFile(file); } catch(error) { caught=error; }
        assertEq(caught?.diagnostic?.kind,kind);assert(caught?.diagnostic?.primary?.file.endsWith('invalid_new_syntax.utu'));
      });
    }
    await withTempUtu(ROOT,'wutu_missing_delimiter.utu','export main() void { @wutu/ div {} ; }',async file=>{
      const doc=await compiler.compileFile(file);
      assert(doc.querySelector('[data-error="parse-error"]'),'malformed DSL reports syntax error instead of crashing expansion');
    });
    const source='using Browser from std:Browser; export main() void { @wutu/\\ div { $[unknown_value]; } \\/; }';
    await withTempUtu(ROOT,'wutu_ranges.utu',source,async file=>{
      const doc=await compiler.compileFile(file);
      const problem=doc.querySelector('[data-error="unknown-variable"]');
      assert(problem,'expected an unknown variable diagnostic');
      assertEq(source.slice(Number(problem.dataset.start),Number(problem.dataset.end)),'unknown_value');
    });
  });
  test('wutu: parser separates attributes, events, CSS scopes, strings, and expressions',()=>{
    const parsed=parseWutu(`@document { :root { --ink: red; } } main.card { color: var(--ink); :hover {color:blue;} @media (width < 40rem) {display:grid;} @ & > * {margin:0;} h2 { "Hello"; $[items[0]]; } button { <type="button"; @click=$[cl(e) void { call("["); }]; "Go"; } }`);
    assertEq(parsed.root.tag,'main');assertEq(parsed.root.children.length,2);assertEq(parsed.root.children[0].children[1].expr,'items[0]');
    assertThrows(()=>parseWutu('canvas { <padding="10"; }'),'unknown attribute');
    assertThrows(()=>parseWutu('input { "bad"; }'),'cannot have children');
    assertThrows(()=>parseWutu('div { <onclick="bad"; }'),'use @event');
    assertThrows(()=>parseWutu('.card {}'),'expected an HTML tag');
    assertThrows(()=>parseWutu('p { $[x }'),'unterminated interpolation');
  });
}
