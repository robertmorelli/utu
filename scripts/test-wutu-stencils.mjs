import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {cssProjection,stencilCss} from '../src/compiler/css-stencil.js';
import {dslEnd} from '../src/compiler/dsl-envelope.js';
import {formatUtuSource} from '../src/compiler/wutu-tooling.js';
const css=String.raw`@layer reset, theme;
@property --angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@future-rule unknown(foo) { --tokens: { a: b; }; }
@scope (.card) to (.stop) { :scope { color: color(display-p3 1 0 0); & > p { margin: calc(1px + 2em); } } }
@container style(--mode: dark) { a { content: "/* not a comment */"; } }
@supports selector(:has(*)) { [data-x="a;b"] { background: url("data:image/svg+xml,%3Csvg%3E"); } }
/* Unicode preserved: 🌱 */`;
assert.equal(stencilCss(css),css);
const prefix='mod styles {\n fn sheet() Str { @css/\\',suffix='\\/; }\n}';
const source=prefix+css+suffix,projected=cssProjection(source);
assert.equal(projected.length,source.length);
assert.equal(projected.slice(prefix.length,prefix.length+css.length),css);
assert.equal(projected.slice(0,prefix.length).replace(/\s/g,''),'');
for(let i=0;i<source.length;i++)if(source[i]==='\n')assert.equal(projected[i],'\n');
assert.equal(dslEnd('a @utu/\\ @wutu/\\ b \\/ \\/ c \\/',0),27);
assert.throws(()=>dslEnd('a @utu/\\ b \\/',0),/Unterminated/);
for(const round of ['one','two'])for(const name of await fs.readdir(`examples/wutu-round-${round}`)){
 if(name==='theme.utu')continue;
 const source=await fs.readFile(`examples/wutu-round-${round}/${name}/main.utu`,'utf8');
 const formatted=formatUtuSource(source);
 assert.equal(formatUtuSource(formatted),formatted,`${name} formatter idempotence`);
}
{
 // Blank lines between statements survive (one at most); `else` stays on its
 // closing brace's line; a `\"` in a string is not its end.
 const source='fn a() Str { "say \\"hi\\" {"; }\n\n\nfn b(x: Bool) I32 {\n    if x { 1; }\n    else { 2; };\n}\n';
 const formatted=formatUtuSource(source);
 assert.equal(formatted,'fn a() Str {\n    "say \\"hi\\" {";\n}\n\nfn b(x: Bool) I32 {\n    if x {\n        1;\n    } else {\n        2;\n    };\n}\n');
 assert.equal(formatUtuSource(formatted),formatted,'blank line idempotence');
}
console.log('CSS payload/offset preservation, balanced DSL envelopes, and ten-source formatter idempotence passed');
