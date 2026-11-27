// Wutu parser, formatter, expansion, diagnostics, and @stored regressions.
import { parseHTML } from 'linkedom/worker';
import { compileAndInstantiateSelfhost, selfhostDiagnostics, withTempUtu } from './test-harness.mjs';
import { loadNodeTools } from '../src/selfhost/node.js';
import * as tooling from '../src/wutu/wutu-tooling.js';
import { WutuSyntaxError } from '../src/wutu/wutu-tooling.js';

// The compiler's template parser and the formatter, from dist/utu-tools.wasm.
const tools = await loadNodeTools();
const parseWutu = text => tooling.wutuTree(tools, text);
const formatWutuBody = text => tooling.formatWutuBody(tools, text);
const formatWutuSource = source => tooling.formatWutuSource(tools, source);
const wutuIslands = source => tooling.wutuIslands(tools, source);
/** An element's items of one kind (class attribute event bind css style). */
const items = (node, kind) => node.items.filter(item => item.kind === kind);

const BROWSER = 'using Browser from std:Browser;\n';

/** Run `body` with a linkedom document installed as the browser globals. */
async function withDom(body) {
  const window = parseHTML('<html><head></head><body></body></html>');
  const saved = {};
  const globals = {
    document: window.document,
    Event: window.Event,
    MouseEvent: window.Event,
    addEventListener: () => {},
    __wutuStyles: undefined, // (a fresh document has no sheets)
  };
  for (const [name, value] of Object.entries(globals)) {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    globalThis[name] = value;
  }
  const previousRuntime = globalThis.__utuWutu;
  delete globalThis.__utuWutu;
  try {
    return await body(window.document);
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    if (previousRuntime) globalThis.__utuWutu = previousRuntime;
    else delete globalThis.__utuWutu;
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function syntaxError(text) {
  try {
    parseWutu(text);
  } catch (error) {
    if (!(error instanceof WutuSyntaxError)) throw error;
    return { message: error.message, at: text.slice(error.wutuOffset) };
  }
  throw new Error(`expected a Wutu syntax error for ${JSON.stringify(text)}`);
}

/** Diagnostics for a program, whether thrown during expansion or left in the IR. */
async function diagnose(compiler, ROOT, source) {
  return withTempUtu(ROOT, 'wutu_diagnostics.utu', source, async (file) => {
    let diagnostics;
    try {
      diagnostics = (await compiler.analyzeFile(file)).artifacts.diagnostics;
    } catch (error) {
      diagnostics = error.artifacts?.diagnostics ?? [error.diagnostic];
    }
    return diagnostics.map(d => ({ ...d, text: d.primary?.start == null ? null : source.slice(d.primary.start, d.primary.end) }));
  });
}

export function registerWutuTests({ test, assert, assertEq, assertThrows, assertNoErrors, makeCompiler }) {
  test('wutu CSS blocks: computed properties and custom properties update in place', async ({ ROOT }) => {
    await withDom(async document => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_css_blocks.utu', source: `${BROWSER}
        struct State:
            | percent: I32
        let state: State = State { percent: 20 }
        wn page() {
          @reactive
          div {
            display: block
            width: {
              // A comment's } is not the end of the block.
              let value = state.percent.str()
              value + "%"
            }
            background-color: {
              if state.percent >= 80 { "seagreen" } else { "tomato" }
            }
            --level: { state.percent.str() }
            --braces: { "{literal}" }
            height: { "10px" }
            span { "content" }
          }
        }
        lib {
          fn render() Externref => page()
          fn update() Void { state.percent = 90; wutu.refresh() }
        }
      `});
      const root = instance.exports.render(); document.body.append(root);
      assertEq(root.style.getPropertyValue('width'), '20%');
      assertEq(root.style.getPropertyValue('background-color'), 'tomato');
      assertEq(root.style.getPropertyValue('--level'), '20');
      assertEq(root.style.getPropertyValue('--braces'), '{literal}');
      assertEq(root.style.getPropertyValue('height'), '10px');
      const child = root.firstChild;
      instance.exports.update();
      assertEq(root.style.getPropertyValue('width'), '90%');
      assertEq(root.style.getPropertyValue('background-color'), 'seagreen');
      assertEq(root.style.getPropertyValue('--level'), '90');
      assert(root.firstChild === child);
    });
  });

  test('wutu CSS blocks: formatting and source spans preserve Utu blocks', () => {
    const source = `div {
      width: {
        // } remains a comment
        let width = if full { "100%" } else { "50%" }
        width
      }
      --token: { "{value}" }
      height: { "10px" }
      color: red
    }`;
    const tree = parseWutu(source);
    assertEq(items(tree.root, 'style').length, 3);
    for (const style of items(tree.root, 'style')) assertEq(source.slice(style.from, style.to), style.b);
    const formatted = formatWutuBody(source);
    assertEq(formatWutuBody(formatted), formatted);
    assert(formatted.includes('width: {'));
    assert(formatted.includes('// } remains a comment'));
    assertEq(items(parseWutu(formatted).root, 'style').length, 3);
    assert(syntaxError('div { width: { "1px"').message.includes('unterminated computed CSS value'));
    assert(syntaxError('div { width: = "10px" }').message.includes('prop: { expr }'));
  });

  test('wutu CSS blocks: diagnostics point at the Utu value', async ({ compiler, ROOT }) => {
    const source = `wn page() { div { width: { missing } } }\nmain { wutu.page(page()) }`;
    const diagnostics = await diagnose(compiler, ROOT, source);
    assert(diagnostics.some(d => d.kind === 'unknown-variable' && d.text === 'missing'), JSON.stringify(diagnostics));
    const wrong = await selfhostDiagnostics({ ROOT, source: `wn page() { div { width: { 3 } } }\nmain { wutu.page(page()) }` });
    assert(wrong.some(d => d.severity === 'error' && d.message.includes('Str')), JSON.stringify(wrong));
  });

  test('wutu pipes: lists and arbitrary Utu blocks render and update', async ({ ROOT }) => {
    await withDom(async document => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_pipes.utu', source: `
        struct State:
            | count: I32
        let state: State = State { count: 1 }
        struct Label[Component]:
            | text: Str
        wn Component[Label].render |label| () { span { | label.text }; b { | state.count } }
        let labels: Array[Component] = [Label { text: "a" }, Label { text: "b" }]
        wn pair() { i { "first" }; i { "second" } }
        wn page() {
          @reactive
          main {
            width: { state.count.str() + "px" }
            | labels
            |> {
              let local: Array[Component] = if state.count == 1 { labels } else { [] }
              local
            }
            |> labels map |label| { label } collect(Component)
            |> pair()
            | "end"
          }
        }
        lib {
          fn render() Externref => page()
          fn update() Void { state.count = 2; wutu.refresh() }
        }
      `});
      document.body.append(instance.exports.render());
      const root = document.querySelector('main'), first = root.querySelector('span');
      assertEq(root.textContent, 'a1b1a1b1a1b1firstsecondend');
      assertEq(root.style.getPropertyValue('width'), '1px');
      instance.exports.update();
      assertEq(root.textContent, 'a2b2a2b2firstsecondend');
      assertEq(root.style.getPropertyValue('width'), '2px');
      assert(root.querySelector('span') === first);
    });
  });

  test('wutu pipes: formatter preserves sigils and adjacent statement boundaries', () => {
    const source = `div {
      title = title
      | labels
      |> if show { labels } else { [] }
      |> { let x = labels; x }
      |> labels map |label| { label } collect(Component)
      | count
      | more
    }`;
    const tree = parseWutu(source);
    assertEq(tree.root.children.map(n => n.sigil).join(','), '|,|>,|>,|>,|,|');
    const formatted = formatWutuBody(source);
    assertEq(formatWutuBody(formatted), formatted);
    assertEq(parseWutu(formatted).root.children.length, 6);
    for (const node of tree.root.children) assertEq(source.slice(node.from, node.to), node.text);
  });

  test('wutu pipes: errors point at authored Utu expressions', async ({ compiler, ROOT }) => {
    for (const sigil of ['|', '|>']) {
      const source = `wn page() { main { ${sigil} missing } }\nmain { wutu.page(page()) }`;
      const diagnostics = await diagnose(compiler, ROOT, source);
      assert(diagnostics.some(d => d.kind === 'unknown-variable' && d.text === 'missing'), JSON.stringify(diagnostics));
    }
  });

  test('wutu fragments: sibling wn roots, component arrays, nested lists and SVG', async ({ ROOT }) => {
    await withDom(async document => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_fragments.utu', source: `
        struct Pair[Component]:
            | label: Str
        wn Component[Pair].render |pair| () {
          dt { | pair.label }
          dd { |> pair.label + " value" }
        }
        wn shapes() {
          circle { r = "2" }
          rect { width = "3" }
        }
        wn empty() {}
        wn page() {
          @reactive
          main {
            dl { |> [Pair { label: "a" }, Pair { label: "b" }] }
            section { |> [["x", "y"], ["z"]] }
            svg { |> shapes() }
            |> empty()
          }
        }
        lib { fn render() Externref => page() }
      `});
      const root = instance.exports.render(); document.body.append(root);
      assertEq(root.querySelector('dl').textContent, 'aa valuebb value');
      assertEq(root.querySelector('section').textContent, 'xyz');
      assertEq(root.querySelectorAll('dt').length, 2);
      const first = root.querySelector('dt');
      globalThis.__utuWutu.refresh();
      assert(root.querySelector('dt') === first, 'list entries retain their DOM');
      assertEq(root.querySelector('circle').namespaceURI, 'http://www.w3.org/2000/svg');
    });
  });

  test('wutu lets: a wn body\'s let statements, evaluated each render', async ({ ROOT }) => {
    await withDom(async document => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_lets.utu', source: `
        struct State:
            | n: I32
        let state: State = State { n: 1 }
        wn badge(text: Str) {
          let up = text.to_upper()
          let twice: Str = up + up
          strong { | twice }
        }
        wn page() {
          @reactive
          let label = "n" + state.n.str()
          main {
            |> badge(label)
            span { | label }
          }
        }
        lib {
          fn render() Externref => page()
          fn bump() Void { state.n += 1 }
        }
      `});
      const root = instance.exports.render(); document.body.append(root);
      assertEq(root.querySelector('strong').textContent, 'N1N1');
      assertEq(root.querySelector('span').textContent, 'n1');
      instance.exports.bump();
      globalThis.__utuWutu.refresh();
      assertEq(root.querySelector('span').textContent, 'n2');
      assertEq(root.querySelector('strong').textContent, 'N2N2');
    });
  });

  test('wutu fragments: reactive empty roots grow, reorder and shrink without wrappers', async ({ ROOT }) => {
    await withDom(async document => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_fragment_updates.utu', source: `${BROWSER}
        struct State:
            | items: Array[I32]
        wn rows(state: State) {
          @reactive
          for state.items |item| key item {
            input { .value = item.str() }
            span { | item }
          }
        }
        lib {
          fn state() State => State { items: [] }
          fn render(state: State) Externref => rows(state)
          fn set(state: State, mode: I32) Void {
            state.items = if mode == 1 { [1, 2] } else if mode == 2 { [2, 1, 3] } else { [] }
            wutu.refresh()
          }
        }
      `});
      const state = instance.exports.state();
      const before = document.createElement('b'), after = document.createElement('b');
      document.body.append(before, instance.exports.render(state), after);
      instance.exports.set(state, 1);
      const inputs = [...document.querySelectorAll('input')];
      assertEq(inputs.length, 2);
      instance.exports.set(state, 2);
      const moved = [...document.querySelectorAll('input')];
      assert(moved[0] === inputs[1] && moved[1] === inputs[0], 'keyed roots move in place');
      assertEq(document.body.textContent, '213');
      instance.exports.set(state, 0);
      assertEq(document.querySelectorAll('input').length, 0);
      assert(document.body.firstChild === before && document.body.lastChild === after, 'range preserves adjacent content');
      instance.exports.set(state, 1);
      assertEq(document.querySelectorAll('span').length, 2);
    });
  });

  test('wutu fragments: protocol arrays and conditional roots update under a parent', async ({ ROOT }) => {
    await withDom(async document => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_fragment_protocol.utu', source: `${BROWSER}
        struct State:
            | visible: Bool
        struct Item[Component]:
            | state: State
        wn Component[Item].render |item| () {
          if item.state.visible { p { "first" }; p { "second" } }
        }
        wn page(items: Array[Component]) { main { | items } }
        lib {
          fn state() State => State { visible: false }
          fn render(state: State) Browser.HTMLElement {
            let items: Array[Component] = [Item { state: state }, Item { state: state }]
            return @wutu/\\ @reactive; section { |> page(items) } \\/
          }
          fn toggle(state: State) Void { state.visible = not state.visible; wutu.refresh() }
        }
      `});
      const state = instance.exports.state(); document.body.append(instance.exports.render(state));
      assertEq(document.querySelectorAll('p').length, 0);
      instance.exports.toggle(state);
      assertEq(document.querySelectorAll('p').length, 4);
      instance.exports.toggle(state);
      assertEq(document.querySelectorAll('p').length, 0);
    });
  });

  test('wutu fragments: component list factories do not memoize mutable render state', async ({ ROOT }) => {
    await withDom(async document => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_fragment_list_memo.utu', source: `${BROWSER}
        struct State:
            | count: I32
        let state: State = State { count: 1 }
        struct Item[Component]:
            | label: Str
        wn Component[Item].render |item| () { span { | item.label }; b { | state.count } }
        fn items() Array[Item] => [Item { label: "count" }]
        wn page() { @reactive; main { |> items() } }
        lib {
          fn render() Externref => page()
          fn update() Void { state.count = 2; wutu.refresh() }
        }
      `});
      document.body.append(instance.exports.render());
      assertEq(document.body.textContent, 'count1');
      const node = document.querySelector('b');
      instance.exports.update();
      assertEq(document.body.textContent, 'count2');
      assert(document.querySelector('b') === node);
    });
  });

  test('wutu fragments: formatter preserves siblings, empty bodies and top-level control flow', () => {
    for (const body of ['', 'dt { "name" }; dd { "value" }', 'if show { p { "yes" } }', 'for items |item| { | item }', '"text"; | value']) {
      const formatted = formatWutuBody(body);
      assertEq(formatWutuBody(formatted), formatted);
      assertEq(parseWutu(formatted).root.kind, 'fragment');
    }
  });

  test('wutu parser: else-if chains, block comments, and flexible alias spacing', () => {
    const tree = parseWutu(`div {
      // a line comment
      /* a CSS-style comment */
      if a { "a"; } else if b { "b"; } else if c { "c"; } else { "d"; }
      p as\tlabel { "x"; }
    }`);
    const [chain, label] = tree.root.children;
    assertEq(chain.kind, 'if');
    assertEq(chain.otherwise.length, 1);
    assert(chain.otherwise[0].elseIf, 'else if is a nested conditional');
    assertEq(chain.otherwise[0].otherwise[0].text, 'c');
    assertEq(chain.otherwise[0].otherwise[0].otherwise[0].text, '"d"');
    assertEq(label.binding, 'label');
    // Parentheses hide a pipeline's captures; the loop continues the pipeline.
    // Around a finished pipeline (sort) or a range they stay.
    const loops = parseWutu('ul { for (xs filter |x| { x.ok; }) |x| key x.id { li { "a"; } } for (xs sort(I32) |a, b| { a < b; }) |x| { li { "b"; } } for (0..<n) |i| { li { "c"; } } }').root.children;
    assertEq(loops.map(loop => loop.text).join(' / '), 'xs filter |x| { x.ok; } / (xs sort(I32) |a, b| { a < b; }) / (0..<n)');
    assertEq(loops[0].key, 'x.id');
  });

  test('wutu parser: errors explain the fix and point at the offending token', () => {
    const cases = [
      ['div { p { hreff = "/"; } }', 'unknown attribute hreff', 'hreff'],
      ['div { p { "x" "y" } }', 'expected a line break or ;', ' "y" } }'],
      ['div { title = "Hi" name }', 'expected a line break or ;', ' name }'],
      ['button { @click = $[go]; }', 'events are written on click = handler', '@click'],
      ['div { foo { } }', "unknown element 'foo'", 'foo'],
      ['@island view; div { }', 'quoted island name', 'view'],
      ['div {\n p { "x";\n', "unterminated element 'p'", 'p {'],
      ['div { p { onclick = f; } }', 'events are written on click', 'onclick'],
      ['p { $[x]; }', 'no longer writes $[', '$[x]'],
      ['p { # note\n "x"; }', 'comments are written //', '# note'],
      ['iframe { srcdoc = html; }', 'srcdoc is HTML', 'srcdoc'],
      ['iframe { .srcdoc = html; }', 'srcdoc is HTML', 'srcdoc'],
      ['x-note { oNclick = f; }', 'events are written on click', 'oNclick'],
      ['div { .ONCLICK = f; }', 'events are written on CLICK', 'ONCLICK'],
      ['div { script { src = u; } }', "a script's attributes are code", 'src'],
      ['div { script { | code; } }', "a script's text is code", '| code'],
      ['div { script { if a { "x"; } } }', "a script's text is code", 'if a'],
      ['div { style { | css; } }', "a style's text is unescaped in HTML", '| css'],
      ['div { noscript { if a { "x"; } } }', "a noscript's text is unescaped", 'if a'],
      ['div { iframe { | v; } }', "an iframe's text is unescaped", '| v'],
      ['div { = x; }', 'child expressions use | value or |> expr, not = expr', '= x'],
      ['div { width: = "10px"; }', 'computed CSS values use prop: { expr }, not prop: = expr', '= "10px"'],
      ['div { style { .textContent = v; } }', "a style's text is unescaped", 'textContent'],
      ['div { a { .protocol = p; } }', '.protocol from a value', 'protocol'],
      ['div { base { href = u; } }', "a base's href moves every relative URL", 'href'],
      ['div { base { .href = u; } }', "a base's href moves every relative URL", 'href'],
      ['x-note { oNmouseover = f; }', 'events are written on mouseover', 'oNmouseover'],
      ['x-note { ononline = f; }', 'events are written on online', 'ononline'],
    ];
    for (const [text, message, at] of cases) {
      const error = syntaxError(text);
      assert(error.message.includes(message), `${text}: ${error.message}`);
      assert(error.at.startsWith(at), `${text}: error at ${JSON.stringify(error.at.slice(0, 12))}, expected ${JSON.stringify(at)}`);
    }
    // Not handlers: `on` and no event's name; written values; elements inside raw text.
    parseWutu('x-note { one = a; online = b; only; onfoo = c; .only = d; } ');
    parseWutu('div { style { "p { color: red; }"; } noscript { p { title = v; | v; } } a { href = u; .protocol = "https:"; } }');
    parseWutu('div { base { href = "/"; } }');
  });

  test('wutu parser: element CSS keeps authored and compiled forms separately', () => {
    const { root } = parseWutu('div { color: red; :hover { color: blue; } @ .x { margin: 0; } @ { padding: 0; } }');
    assertEq(items(root, 'css').map(rule => rule.b).join(' '), 'color:red; :hover{ color: blue; } @ .x{ margin: 0; } @{ padding: 0; }');
    assertEq(items(root, 'css').map(rule => rule.c).join(' '), 'color:red; &:hover{ color: blue; } .x{ margin: 0; } &, & *{ padding: 0; }');
  });

  test('wutu formatter: authored selectors, else-if, and unbalanced slots survive formatting', () => {
    const source = 'div { @ .x > p { color: red; } :hover { color: blue; } if a { "a"; } else if b { "b"; } else { "c"; } on click |e| { f(e); } }';
    const formatted = formatWutuBody(source);
    assert(formatted.includes('@ .x > p {'), formatted);
    assert(formatted.includes(':hover {') && !formatted.includes('&:hover'), formatted);
    assert(formatted.includes('} else if b {'), formatted);
    assert(formatted.includes('on click |e| {') && !formatted.includes('};'), formatted);
    assertEq(formatWutuBody(formatted), formatted, 'formatting is idempotent');
    const reparsed = parseWutu(formatted);
    assert(reparsed.root.children[0].otherwise[0].elseIf, 'else-if survives a round trip');
  });

  test('wutu formatter: a body\'s let statements stay, each on its line', () => {
    const formatted = formatWutuBody('@reactive; let up = text.to_upper(); let n: I32 = up.len(); div { | up; | n }');
    assertEq(formatted, '\n@reactive\nlet up = text.to_upper()\nlet n: I32 = up.len()\ndiv { | up; | n }\n');
    assertEq(formatWutuBody(formatted), formatted, 'formatting is idempotent');
    assertEq(parseWutu(formatted).lets.map(l => l.head).join(','), 'up,n: I32');
  });

  test('wutu formatter: nested DSL payloads are restored byte-for-byte', () => {
    // More than ten payloads, and payloads containing replacement patterns.
    const payloads = Array.from({ length: 12 }, (_, i) => `@utu/\\ "$&${i}$'" \\/`);
    const body = `div { ${payloads.map(p => `|> ${p};`).join(' ')} }`;
    const formatted = formatWutuBody(body);
    for (const payload of payloads) assert(formatted.includes(payload), `missing ${payload}`);
    assertEq(formatWutuBody(formatted), formatted);
  });

  test('wutu formatter: islands skip comments and strings; source formatting is idempotent', () => {
    const source = '// @wutu/\\ fake \\/\nlet s = "@wutu/\\ fake \\/";\nlet n = @wutu/\\ div { if x { "y"; } else if z { "w"; } } \\/;\n';
    assertEq(wutuIslands(source).length, 1);
    const once = formatWutuSource(source);
    assertEq(formatWutuSource(once), once);
    assert(once.startsWith('// @wutu/\\ fake \\/\nlet s = "@wutu/\\ fake \\/";'), 'text outside islands is untouched');
  });

  test('wutu: else-if chains render the first matching branch, statically and reactively', async ({ ROOT }) => {
    for (const reactive of [false, true]) {
      await withDom(async (document) => {
        const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: `wutu_else_if_${reactive}.utu`, source: `${BROWSER}
          fn view(n: I32) Browser.HTMLElement {
            return @wutu/\\ ${reactive ? '@reactive;' : ''}
            p {
              if n == 1 { "one"; } else if n == 2 { "two"; } else if n == 3 { b { "three"; } } else { "many"; }
            }
            \\/;
          }
          lib {
            fn render(n: I32) Browser.HTMLElement { return view(n); }
          }
        `});
        const text = n => {
          const node = instance.exports.render(n);
          document.body.append(node);
          return node.textContent;
        };
        assertEq([1, 2, 3, 4].map(text).join(','), 'one,two,three,many', `reactive=${reactive}`);
      });
    }
  });

  test('wutu: data takes a value attribute and is an HTMLDataElement', async ({ ROOT }) => {
    // (linkedom has no HTMLDataElement, so `.value` is only checked.)
    const typed = await selfhostDiagnostics({ ROOT, source: `${BROWSER}
      lib { fn run(x: Str) Browser.HTMLElement {
        return @wutu/\\ data as d { .value = x; on click { d.value = d.value + "?"; } } \\/;
      } }
    `});
    assertEq(typed.filter(d => d.severity !== 'warning').map(d => d.message).join('; '), '');
    await withDom(async (document) => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_data_value.utu', source: `${BROWSER}
        lib { fn run(x: Str) Browser.HTMLElement { return @wutu/\\ div { data { value = x; "a"; } } \\/; } }
      `});
      const root = instance.exports.run('12');
      assertEq(root.querySelector('data').getAttribute('value'), '12');
    });
  });

  test('wutu: CSS declarations with { expr } values apply at render time, statically and reactively', async ({ ROOT }) => {
    for (const reactive of [false, true]) {
      await withDom(async (document) => {
        const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: `wutu_dynamic_style_${reactive}.utu`, source: `${BROWSER}
          struct Gauge:
              | pct: I32
          fn view(g: Gauge) Browser.HTMLElement {
            return @wutu/\\ ${reactive ? '@reactive;' : ''}
            div {
              display: block;
              width: { g.pct.str() + "%" };
              --level: { g.pct.str() };
              span { "gauge"; }
            }
            \\/;
          }
          lib {
            fn make(pct: I32) Gauge { return Gauge { pct: pct }; }
            fn render(g: Gauge) Browser.HTMLElement { return view(g); }
            fn set(g: Gauge, pct: I32) Void { g.pct = pct; wutu.refresh(); }
          }
        `});
        const gauge = instance.exports.make(40);
        const node = instance.exports.render(gauge);
        document.body.append(node);
        assertEq(node.style.getPropertyValue('width'), '40%', `reactive=${reactive}`);
        assertEq(node.style.getPropertyValue('--level'), '40');
        assert(node.getAttribute('class')?.length > 0, 'static declarations still compile to a class');
        if (reactive) {
          instance.exports.set(gauge, 75);
          await settle();
          assertEq(node.style.getPropertyValue('width'), '75%', 'refresh updates the computed value');
        }
      });
    }
  });

  test('wutu: @style installs in static projects and preserves source order', async ({ ROOT }) => {
    await withDom(async (document) => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_static_style.utu', source: `${BROWSER}
        fn first() Str { return "p{color:red}"; }
        fn second() Str { return "p{color:blue}"; }
        lib { fn run() Browser.HTMLElement {
          return @wutu/\\
          @style first();
          @style second();
          div { /* comment */ background: url(https://example.com/a.png); "x"; }
          \\/;
        } }
      `});
      instance.exports.run();
      instance.exports.run();
      const sheets = [...document.querySelectorAll('style')].map(node => node.textContent);
      // A shared sheet joins the wutu.document layer, below element styles.
      const red = '@layer wutu.document{p{color:red}}', blue = '@layer wutu.document{p{color:blue}}';
      assertEq(sheets.filter(text => text === red).length, 1, 'each sheet installs once');
      assert(sheets.indexOf(red) < sheets.indexOf(blue), `sheets out of order: ${sheets.join(' | ')}`);
      assert(sheets.some(text => text.includes('url(https://example.com/a.png)')), 'URLs keep their slashes');
    });
  });

  test('wutu: CSS ships without comments or spare white space, strings as written', async ({ ROOT }) => {
    await withDom(async (document) => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_css_minify.utu', source: `${BROWSER}
        lib { fn run() Browser.HTMLElement {
          return @wutu/\\
          @document {
            /* a comment */
            @import url("a b.css") layer(base);
            nav :hover , a::after { content: "  /* kept */  "; width: calc(1px + 2px); }
            @media (min-width: 40rem) { body { margin: 0 auto; } }
          }
          div { /* scoped */ color: red; "x"; }
          \\/;
        } }
      `});
      document.body.append(instance.exports.run());
      const css = [...document.querySelectorAll('style')].map(node => node.textContent).join('');
      assert(!css.includes('a comment') && !css.includes('scoped'), `comments kept: ${css}`);
      assert(css.includes('@import url("a b.css") layer(base);'), css);
      assert(css.includes('nav :hover,a::after{content:"  /* kept */  ";width:calc(1px + 2px);}'), css);
      assert(css.includes('@media (min-width:40rem){body{margin:0 auto;}}'), css);
      assert(!/\s{2}|\n/.test(css.replaceAll('"  /* kept */  "', '')), `spare white space: ${JSON.stringify(css)}`);
    });
  });

  test('wutu: reactive bindings, keyed reordering, and events update the view', async ({ ROOT }) => {
    await withDom(async (document) => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_reactive.utu', source: `${BROWSER}
        struct Item:
            | id: Str
        struct State:
            | text: Str
            | items: Array[Item]
        lib { fn run() Browser.HTMLElement {
          let state = State { text: "start", items: [Item { id: "a" }, Item { id: "b" }] };
          return @wutu/\\
          @reactive;
          main {
            input { bind:value = state.text; }
            p { | state.text; }
            ul {
              for state.items |item| key item.id {
                li { | item.id; }
              }
            }
            button {
              on click {
                state.items = [state.items[1], state.items[0]];
              }
            }
          }
          \\/;
        } }
      `});
      const root = instance.exports.run();
      document.body.append(root);
      const input = root.querySelector('input');
      assertEq(input.value, 'start');
      input.value = 'typed';
      input.dispatchEvent(new globalThis.Event('input'));
      await settle();
      assertEq(root.querySelector('p').textContent, 'typed');
      const [a, b] = root.querySelectorAll('li');
      root.querySelector('button').dispatchEvent(new globalThis.Event('click'));
      await settle();
      const reordered = [...root.querySelectorAll('li')];
      assertEq(reordered.map(li => li.textContent).join(''), 'ba');
      assert(reordered[0] === b && reordered[1] === a, 'keyed items keep their DOM identity');
    });
  });

  test('wutu: a handler that awaits redraws when its promise settles', async ({ ROOT }) => {
    await withDom(async (document) => {
      globalThis.__wutuGate = [];
      try {
        const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_await_handler.utu', source: `${BROWSER}
          let load: fun(I32) Promise[I32] = @es/\\ (n) => new Promise((r, no) => globalThis.__wutuGate.push(ok => ok ? r(n) : no(new Error('no')))) \\/
          struct State:
              | n: I32
              | text: Str
          lib { fn run() Browser.HTMLElement {
            let state = State { n: 0, text: "" }
            return @wutu/\\
            @reactive;
            main {
              p { | state.n.str(); }
              span { | state.text; }
              button { on click { state.n = await load(state.n + 1) } }
              form { on submit = cl(e) { state.text = "wait"; state.n = await load(10); state.text = "half"; state.n = await load(20); state.text = "done" } }
              i { on mount { state.text = "mount " + (await load(5)).str() } }
            }
            \\/
          } }
        `});
        const root = instance.exports.run();
        document.body.append(root);
        const open = async ok => { globalThis.__wutuGate.shift()(ok); await settle(); };
        await settle();
        await open(true);
        assertEq(root.querySelector('span').textContent, 'mount 5');
        root.querySelector('button').dispatchEvent(new globalThis.Event('click'));
        await settle();
        assertEq(root.querySelector('p').textContent, '0');
        await open(true);
        assertEq(root.querySelector('p').textContent, '1');
        root.querySelector('form').dispatchEvent(new globalThis.Event('submit'));
        await settle();
        assertEq(root.querySelector('span').textContent, 'wait');
        await open(true);
        // A rejection redraws too, then reports the error.
        const errors = [];
        const timeout = globalThis.setTimeout;
        globalThis.setTimeout = (f, ms) => timeout(() => { try { f(); } catch (e) { errors.push(e); } }, ms);
        try {
          await open(false);
          await settle();
        } finally { globalThis.setTimeout = timeout; }
        assertEq(root.querySelector('p').textContent, '10');
        assertEq(root.querySelector('span').textContent, 'half');
        assert(errors.length === 1, `the rejection is reported once: ${errors}`);
      } finally { delete globalThis.__wutuGate; }
    });
  });

  test('wutu: a float prop changing from negative zero redraws its component', async ({ ROOT }) => {
    await withDom(async document => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_signed_zero.utu', source: `${BROWSER}
        struct State:
            | x: F64
        fn sign(x: F64) Browser.HTMLElement { return @wutu/\\ span { |> (1.0 / x).str(); } \\/; }
        lib {
            fn main() Browser.HTMLElement {
                let state = State { x: -0.0 };
                return @wutu/\\ @reactive; main { |> sign(state.x); button { on click { state.x = 0.0; } } } \\/;
            }
        }
      ` });
      const root = instance.exports.main();
      document.body.append(root);
      assertEq(root.querySelector('span').textContent, '-Infinity');
      root.querySelector('button').dispatchEvent(new globalThis.Event('click'));
      await settle();
      assertEq(root.querySelector('span').textContent, 'Infinity');
    });
  });

  test('wutu: a component passed to a component lands inside it, and stays there on re-render', async ({ ROOT }) => {
    await withDom(async (document) => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_nested_call.utu', source: `${BROWSER}
        struct State:
            | n: I32
            | words: Array[Str]
        fn card(body: Browser.HTMLElement) Browser.HTMLElement { return @wutu/\\ figure { header { "Title"; } | body; } \\/; }
        fn tag(word: Str) Browser.HTMLElement { return @wutu/\\ em { | word; } \\/; }
        fn badge(n: I32) Browser.HTMLElement { return card(tag(n.str())); }
        fn plain() Browser.HTMLElement { return @wutu/\\ main { |> card(tag("hello")); } \\/; }
        fn view() Browser.HTMLElement {
          let state = State { n: 1, words: ["a", "b"] };
          return @wutu/\\
          @reactive;
          main {
            section#one { |> card(tag("hello")); }
            section#loop { for state.words |w| { |> card(tag(w)); } }
            section#keyed { for state.words |w| key w { |> card(tag(w)); } }
            section#memo { |> badge(state.n); }
            section#still { |> badge(5); }
            button { on click { state.n += 1; state.words = [state.words[1], state.words[0], "c"]; } }
          }
          \\/;
        }
        lib {
            fn once() Browser.HTMLElement { return plain(); }
            fn reactive() Browser.HTMLElement { return view(); }
        }
      `});
      const strip = html => html.replace(/ data-wutu(-root)?="[^"]*"/g, '');
      const fig = word => `<figure><header>Title</header><em>${word}</em></figure>`;
      assertEq(strip(instance.exports.once().outerHTML), `<main>${fig('hello')}</main>`);
      const root = instance.exports.reactive();
      document.body.append(root);
      const html = s => strip(root.querySelector(s).innerHTML);
      assertEq(html('#one'), fig('hello'));
      assertEq(html('#loop'), fig('a') + fig('b'));
      assertEq(html('#keyed'), fig('a') + fig('b'));
      assertEq(html('#memo'), fig('1'));
      assertEq(html('#still'), fig('5'));
      const still = root.querySelector('#still em');
      const one = root.querySelector('#one em'), [ka, kb] = root.querySelectorAll('#keyed em');
      root.querySelector('button').dispatchEvent(new globalThis.Event('click'));
      await settle();
      assertEq(html('#one'), fig('hello'));
      assertEq(html('#loop'), fig('b') + fig('a') + fig('c'));
      assertEq(html('#keyed'), fig('b') + fig('a') + fig('c'));
      assertEq(html('#memo'), fig('2'));
      assertEq(html('#still'), fig('5'));
      assert(root.querySelector('#still em') === still, 'a reused call keeps its inner component');
      assert(root.querySelector('#one em') === one, 'the inner component keeps its element');
      const keyed = root.querySelectorAll('#keyed em');
      assert(keyed[0] === kb && keyed[1] === ka, 'keyed inner components move with their keys');
      root.querySelector('button').dispatchEvent(new globalThis.Event('click'));
      await settle();
      assertEq(html('#loop'), fig('a') + fig('b') + fig('c'));
      assertEq(html('#still'), fig('5'));
      assertEq(root.querySelectorAll('em').length, 1 + 3 + 3 + 1 + 1);
    });
  });

  test('wutu diagnostics: template errors point at the attribute, alias, binding, or interpolation', async ({ ROOT }) => {
    const cases = [
      [`${BROWSER}lib { fn run() Browser.HTMLElement { return @wutu/\\ div { p { hreff = "/"; } } \\/; } }`, 'invalid-dsl-usage', 'h'],
      [`${BROWSER}lib { fn run() Browser.HTMLElement { return @wutu/\\ div { p as x { "a"; } p as x { "b"; } button { on click = cl(e) Void { x.focus(); }; } } \\/; } }`, 'invalid-dsl-usage', 'x'],
      [`${BROWSER}lib { fn run() Browser.HTMLElement { return @wutu/\\ div { |> 1 +; } \\/; } }`, 'invalid-dsl-usage', '1'],
      // A typed event without Browser says so there.
      ['wn panel() { button { on click |e| { let x = e.clientX; } } }\nhtml { body { |> panel(); } }', 'invalid-dsl-usage', 'o'],
    ];
    for (const [source, kind, text] of cases) {
      const diagnostics = await selfhostDiagnostics({ ROOT, source });
      const match = diagnostics.find(d => d.kind === kind);
      assert(match, `${source}: expected ${kind}, got ${diagnostics.map(d => d.kind).join(', ')}`);
      assertEq(match.text, text, `${match.message}`);
    }
  });

  test('wutu diagnostics: type errors in values point at the value, not the template', async ({ ROOT }) => {
    const source = `${BROWSER}struct S:
    | n: I32
lib { fn run() Browser.HTMLElement {
    let s = S { n: 1 };
    return @wutu/\\
    @reactive;
    div {
        title = 42;
        p { | 7; }
        button { on click = 42; }
        input { bind:value = s.n; }
        if s.n { "x"; }
    }
    \\/;
} }`;
    const diagnostics = (await selfhostDiagnostics({ ROOT, source })).filter(d => d.kind === 'type-mismatch');
    const texts = diagnostics.map(d => d.text);
    // (A binding reports once, at the bind statement.)
    assert(diagnostics.length >= 4, texts.join(' | '));
    assert(texts.every(text => !text.includes('@wutu')), `no diagnostic covers the whole template: ${texts.join(' | ')}`);
    // (`= 7;` is text: a number shows as its str.)
    for (const expected of ['42', 's.n']) assert(texts.includes(expected), `expected a diagnostic at ${expected}: ${texts.join(' | ')}`);
    assert(!texts.includes('7'), 'a number in a text hole is text');
    assert(texts.some(text => text.startsWith('bind:value')), 'bind sync errors point at the bind statement');
  });

  test('wutu diagnostics: misspelled island names warn without blocking compilation', async ({ ROOT }) => {
    const program = (name) => `${BROWSER}lib { fn run() Browser.HTMLElement {
    // wutu.invalidate("commented-out") is ignored
    wutu.invalidate("${name}");
    return @wutu/\\ @island "board"; div { "x"; } \\/;
} }`;
    const warned = (await selfhostDiagnostics({ ROOT, source: program('bored') })).filter(d => d.kind === 'unknown-island');
    assertEq(warned.length, 1);
    assertEq(warned[0].severity, 'warning');
    assertEq(warned[0].text, '"bored"');
    assert(warned[0].message.includes('"board"'), 'the message lists known islands');
    const clean = await selfhostDiagnostics({ ROOT, source: program('board') });
    assertEq(clean.filter(d => d.kind === 'unknown-island' || d.severity === 'error').length, 0);
  });

  test('@stored: non-struct state, bad types, and unknown validators are located precisely', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const cases = [
      [`${BROWSER}main { let s = @stored/\\ Str "k" "x" \\/; }`, 'invalid-dsl-usage', 'Str', 'must be a struct'],
      [`${BROWSER}struct S:
    | n: I64
main { let s = @stored/\\ S "k" S { n: 1 } \\/; }`, 'invalid-dsl-usage', 'S', 'Unsupported stored type I64'],
      [`${BROWSER}struct S:
    | n: I32
main { let s = @stored/\\ S "k" validate nope S { n: 1 } \\/; }`, 'unknown-variable', 'nope', ''],
      [`${BROWSER}struct S:
    | n: I32
main { let s = @stored/\\ S "k" S { n: missing } \\/; }`, 'unknown-variable', 'missing', ''],
    ];
    for (const [source, kind, text, message] of cases) {
      const diagnostics = await diagnose(compiler, ROOT, source);
      const match = diagnostics.find(d => d.kind === kind && d.text === text);
      assert(match, `${source}: expected ${kind} at ${text}, got ${diagnostics.map(d => `${d.kind}@${d.text}`).join(', ')}`);
      assert(match.message.includes(message), match.message);
    }
  });

  test('wutu parser: mutated templates fail only with located syntax errors', () => {
    const template = `@document { :root { --ink: #222; } }
      main.app as app {
        display: grid;
        :hover { color: blue; }
        @media (width < 40rem) { gap: 0; }
        h1 { "Title"; | subtitle; }
        if ready { p { "ready"; } } else if failed { p { "failed"; } } else { p { "wait"; } }
        for items |item, i| key item.id { li { data-id = item.id; | item.name; } }
        input { type = "text"; bind:value = state.text; .disabled = locked; }
        button { aria-label = "Go"; on click { go(app); } on focus = cl(e) Void { log("[x]"); }; }
      }`;
    let seed = 1;
    const random = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const tokens = [...template.matchAll(/\w+|[^\s\w]/g)];
    for (let k = 0; k < 3000; k++) {
      const token = tokens[random(tokens.length)];
      const replacement = [ '', tokens[random(tokens.length)][0], token[0] + token[0] ][random(3)];
      const mutated = template.slice(0, token.index) + replacement + template.slice(token.index + token[0].length);
      try {
        parseWutu(mutated);
        const formatted = formatWutuBody(mutated);
        if (formatted !== mutated) {
          parseWutu(formatted);
          assertEq(formatWutuBody(formatted), formatted, 'formatter idempotence');
        }
      } catch (error) {
        if (error instanceof WutuSyntaxError) {
          assert(error.wutuOffset >= 0 && error.wutuOffset <= mutated.length, 'offset within template');
          continue;
        }
        throw new Error(`${error.message} for mutation ${k}: ${mutated}`);
      }
    }
  });

  test('wutu: a URL set from a value takes no javascript:, vbscript: or non-media data:, on first render and update, in every mode', async ({ ROOT }) => {
    const { MODES } = await import('../src/selfhost/compiler.js');
    const source = `${BROWSER}
      struct St:
          | u: Str
      fn view(st: St) Browser.HTMLElement {
          return @wutu/\\
          @reactive;
          main {
              input { type = "text"; bind:value = st.u; }
              a#attr { href = st.u; "link"; }
              a#prop { .href = st.u; "link"; }
              form { action = st.u; button { formaction = st.u; "go"; } }
              iframe { src = st.u; }
              img { src = st.u; }
              a#lit { href = "javascript:void 0"; "kept"; }
              svg { a { href = st.u; } use { href = st.u; } use#x { xlink:href = st.u; } }
              p#money { |> wutu.money(-123) + " " + wutu.money(-1) + " " + wutu.money(123456) + " " + wutu.money(0); }
          }
          \\/;
      }
      lib { fn run() Browser.HTMLElement { return view(St { u: "/safe" }); } }
    `;
    const BAD = ['javascript:window.__pwned=1', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)',
      '\u0001javascript:alert(1)', 'jav\nascript:x', 'vbscript:msgbox', 'data:text/html,<script>alert(1)</script>'];
    for (const mode of Object.keys(MODES)) {
      await withDom(async (document) => {
        const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: `wutu_url_${mode}.utu`, source, mode });
        const root = instance.exports.run();
        document.body.append(root);
        const $ = s => root.querySelector(s);
        const urls = () => [$('#attr').getAttribute('href'), $('#prop').getAttribute('href'), $('form').getAttribute('action'),
          $('button').getAttribute('formaction'), $('iframe').getAttribute('src'), $('img').getAttribute('src'),
          $('svg a').getAttribute('href'), $('use').getAttribute('href'), $('#x').getAttribute('xlink:href')];
        assertEq(urls().join(' '), Array(9).fill('/safe').join(' '), `${mode}: first render`);
        assertEq($('#lit').getAttribute('href'), 'javascript:void 0', `${mode}: a written literal stays`);
        const type = async (text) => {
          $('input').value = text;
          $('input').dispatchEvent(new globalThis.Event('input'));
          await settle();
        };
        for (const bad of BAD) {
          await type(bad);
          assertEq(urls().join(' '), Array(9).fill(null).join(' '), `${mode}: ${JSON.stringify(bad)} dropped`);
          await type('/back');
          assertEq(urls().join(' '), Array(9).fill('/back').join(' '), `${mode}: a safe URL after ${JSON.stringify(bad)}`);
        }
        // A media data: URL passes; an SVG one only into an image.
        await type('data:image/png;base64,AAAA');
        assertEq($('#attr').getAttribute('href'), 'data:image/png;base64,AAAA', `${mode}: data:image/png`);
        await type('data:image/svg+xml,<svg onload=alert(1)>');
        assertEq($('img').getAttribute('src'), 'data:image/svg+xml,<svg onload=alert(1)>', `${mode}: svg data in img`);
        assertEq($('iframe').getAttribute('src'), null, `${mode}: svg data in iframe`);
        assertEq($('#money').textContent, '-$1.23 -$0.01 $1234.56 $0.00', `${mode}: money's sign goes before the $`);
      });
    }
  });

  test('wutu: a srcdoc from a value is an error (it is HTML); a written one stays', async ({ ROOT }) => {
    for (const item of ['srcdoc = h;', '.srcdoc = h;']) {
      const source = `${BROWSER}lib { fn run() Browser.HTMLElement { let h = "<b>x</b>"; return @wutu/\\ iframe { ${item} } \\/; } }`;
      const diagnostics = await selfhostDiagnostics({ ROOT, source });
      const match = diagnostics.find(d => d.severity === 'error' && d.message.includes('srcdoc is HTML'));
      assert(match, `${item}: ${diagnostics.map(d => d.message).join('; ')}`);
      assertEq(source.slice(match.start, match.start + 6), 'srcdoc', `${item}: located at the name`);
    }
    const written = await selfhostDiagnostics({ ROOT, source: `${BROWSER}lib { fn run() Browser.HTMLElement { return @wutu/\\ iframe { srcdoc = "<b>x</b>"; } \\/; } }` });
    assertEq(written.filter(d => d.severity === 'error').length, 0);
  });

  test('wutu: an on… attribute in any case, and a script\'s value src or text, are errors; a written script stays', async ({ ROOT }) => {
    for (const [item, message, at] of [['x-note { oNclick = h; }', 'events are written on click', 'oNclick'], ['div { ONCLICK = h; }', 'expected an HTML tag', 'ONCLICK'],
      ['p { OnMouseOver = h; }', 'expected an HTML tag', 'OnMouseOver'], ['x-note { .oNmouseover = h; }', 'events are written on mouseover', 'oNmouseover'],
      ['script { src = h; }', "a script's attributes are code", 'src'], ['script { .src = h; }', "a script's attributes are code", 'src'],
      ['script { | h; }', "a script's text is code", '| h'], ['script { for ([h]) |x| { "a"; } }', "a script's text is code", 'for']]) {
      const source = `${BROWSER}lib { fn run() Browser.HTMLElement { let h = "alert(1)"; return @wutu/\\ div { ${item} } \\/; } }`;
      const diagnostics = await selfhostDiagnostics({ ROOT, source });
      const match = diagnostics.find(d => d.severity === 'error' && d.message.includes(message));
      assert(match, `${item}: ${diagnostics.map(d => d.message).join('; ')}`);
      assertEq(source.slice(match.start, match.start + at.length), at, `${item}: located`);
    }
    const written = await selfhostDiagnostics({ ROOT, source: `${BROWSER}lib { fn run() Browser.HTMLElement { return @wutu/\\ div { script { src = "/a.js"; type = "module"; "let a = 1;"; } } \\/; } }` });
    assertEq(written.filter(d => d.severity === 'error').map(d => d.message).join('; '), '');
  });

  test('wutu: raw text, .protocol and a base\'s href from a value are errors; on… names that are no event are attributes', async ({ ROOT }) => {
    for (const [item, message, at] of [['style { | h; }', "a style's text is unescaped in HTML", '| h'], ['noscript { | h; }', "a noscript's text is unescaped", '| h'],
      ['iframe { if true { | h; } }', "an iframe's text is unescaped", 'if true'], ['noscript { .textContent = h; }', "a noscript's text is unescaped", 'textContent'],
      ['a { href = "mailto:x"; .protocol = h; }', '.protocol from a value', 'protocol'], ['base { href = h; }', "a base's href moves every relative URL", 'href'],
      ['x-note { onClick = h; }', 'events are written on Click', 'onClick'], ['x-note { .ONLOAD = h; }', 'events are written on LOAD', 'ONLOAD']]) {
      const source = `${BROWSER}lib { fn run() Browser.HTMLElement { let h = "</style><img src=x onerror=alert(1)>"; return @wutu/\\ div { ${item} } \\/; } }`;
      const diagnostics = await selfhostDiagnostics({ ROOT, source });
      const match = diagnostics.find(d => d.severity === 'error' && d.message.includes(message));
      assert(match, `${item}: ${diagnostics.map(d => d.message).join('; ')}`);
      assertEq(source.slice(match.start, match.start + at.length), at, `${item}: located`);
    }
    const fine = await selfhostDiagnostics({ ROOT, source: `${BROWSER}lib { fn run() Browser.HTMLElement { let h = "x"; return @wutu/\\ div { x-note { one = h; online = h; only; onfoo = h; } style { "p { color: red; }"; } noscript { p { title = h; | h; } } base { href = "/"; } a { href = h; .protocol = "https:"; } } \\/; } }` });
    assertEq(fine.filter(d => d.severity === 'error').map(d => d.message).join('; '), '');
    await withDom(async () => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_on_names.utu', mode: 'debug',
        source: `${BROWSER}lib { fn run() Browser.HTMLElement { let h = "x"; return @wutu/\\ x-note { one = h; online = h; onfoo = h; } \\/; } }` });
      const root = instance.exports.run();
      assertEq(['one', 'online', 'onfoo'].map(n => root.getAttribute(n)).join(' '), 'x x x', 'set at run time');
    });
  });

  test('wutu: ping, srcset and a meta\'s content from a value drop javascript: anywhere in them', async ({ ROOT }) => {
    const source = `${BROWSER}
      fn view(u: Str) Browser.HTMLElement {
          return @wutu/\\
          div {
              a { ping = u; "p"; }
              img { srcset = u; }
              link { imagesrcset = u; }
              meta { http-equiv = "refresh"; content = u; }
              x-box { ping = u; srcset = u; }
          }
          \\/;
      }
      lib { fn render(u: Str) Browser.HTMLElement { return view(u); } }
    `;
    const { MODES } = await import('../src/selfhost/compiler.js');
    for (const mode of Object.keys(MODES)) {
      await withDom(async (document) => {
        const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: `wutu_lists_${mode}.utu`, source, mode });
        const got = (u) => {
          const root = instance.exports.render(u);
          return ['a ping', 'img srcset', 'link imagesrcset', 'meta content', 'x-box ping', 'x-box srcset']
            .map(s => { const [tag, name] = s.split(' '); return root.querySelector(tag).getAttribute(name); });
        };
        for (const bad of ['javascript:alert(1)', 'a.png 1x, javascript:alert(1) 2x', 'a.png 1x,JaVaScRiPt:alert(1)', 'https://ok/a \u0001vbscript:x', ' JaVa\tScript:alert(4)'])
          assertEq(got(bad).slice(0, 3).concat(got(bad).slice(4)).join(' '), Array(5).fill(null).join(' '), `${mode}: ${JSON.stringify(bad)} dropped`);
        for (const bad of ['0; url=javascript:alert(1)', "0;URL='java\nscript:alert(1)'", '0;javascript:alert(1)', '0; url=data:text/html,x'])
          assertEq(got(bad)[3], null, `${mode}: meta content ${JSON.stringify(bad)} dropped`);
        assertEq(got('a.png 1x, b.png 2x').join('|'), Array(6).fill('a.png 1x, b.png 2x').join('|'), `${mode}: safe lists stay`);
        assertEq(got('5; url=https://ok.example/')[3], '5; url=https://ok.example/', `${mode}: a safe refresh stays`);
      });
    }
  });

  test('wutu: a root SVG-only tag is SVG; object takes data, checked as a URL; on changed is a custom event', async ({ ROOT }) => {
    const source = `${BROWSER}
      fn dot(k: I32) Browser.SVGElement { return @wutu/\\ circle.dot { r = k.str(); } \\/; }
      fn grp() Browser.SVGElement { return @wutu/\\ g { rect { width = "2"; } } \\/; }
      fn link() Browser.HTMLElement { return @wutu/\\ a { href = "/x"; "x"; } \\/; }
      fn obj(u: Str) Browser.HTMLElement { return @wutu/\\ object#ob { data = u; } \\/; }
      fn custom() Browser.HTMLElement {
          return @wutu/\\ div { on changed { } on resized { } on closed { } on scrolled { } on paused { } on toggled { } on selected { } } \\/;
      }
      lib {
          fn d() Browser.SVGElement { return dot(3); }
          fn g() Browser.SVGElement { return grp(); }
          fn a() Browser.HTMLElement { return link(); }
          fn o(u: Str) Browser.HTMLElement { return obj(u); }
          fn c() Browser.HTMLElement { return custom(); }
      }
    `;
    await withDom(async () => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_root_svg.utu', source, mode: 'debug' });
      const x = instance.exports, SVG = 'http://www.w3.org/2000/svg';
      assertEq([x.d(), x.g(), x.g().firstChild, x.a()].map(n => n.localName + ':' + (n.namespaceURI === SVG)).join(' '), 'circle:true g:true rect:true a:false');
      assertEq(x.d().getAttribute('r'), '3');
      assertEq(x.o('/a.svg').getAttribute('data'), '/a.svg');
      assertEq(x.o('javascript:alert(1)').getAttribute('data'), null);
      assertEq(x.o('data:text/html,x').getAttribute('data'), null);
      x.c();
    });
    const typo = await selfhostDiagnostics({ ROOT, source: `${BROWSER}lib { fn run() Browser.HTMLElement { return @wutu/\\ div { on clik { } } \\/; } }` });
    assert(typo.some(d => d.severity === 'error' && d.message.includes('unknown event clik; did you mean click?')), typo.map(d => d.message).join('; '));
  });

  test('wutu parser: CSS comments and custom blocks, SVG names, case and near-names pass; missing ; and typos fail (both parsers)', async ({ ROOT }) => {
    const ok = `section {
      margin: 1px /* a; */ 2px;
      padding: 1px /* note
        color: red */ 2px;
      --cfg: { "one" };
      --deep: {
        let value = "two";
        value
      };
      COLOR: red;
      marker-side: match-self;
      column-wrap: wrap;
      grid-template-areas: "a"
        "b";
      on unmount { }
      on changed { }
      object { typemustmatch; data = "/a.svg"; }
      svg { filter { feGaussianBlur { stdDeviation = "2"; } } image { href = "/a.png"; } text { font-size = "3"; text-anchor = "middle"; }
        animate { attributeName = "x"; dur = "1s"; values = "0;1"; repeatCount = "indefinite"; } textPath { } switch { } set { }
        foreignObject { div { } } }
      "x";
    }`;
    parseWutu(ok);
    const okDiagnostics = await selfhostDiagnostics({ ROOT, source: `${BROWSER}lib { fn run() Browser.HTMLElement { return @wutu/\\ ${ok} \\/; } }` });
    assertEq(okDiagnostics.filter(d => d.severity === 'error').map(d => d.message).join('; '), '');
    const bad = [
      ['div { color: red margin: 0 }', 'two CSS declarations on one line need ; between them'],
      ['div { "a" "b" }', 'expected a line break or ; after Wutu statement'],
      ['div { color: red {', 'expected a line break or ; after a CSS declaration'],
      ['div { widht: 1px; }', 'invalid CSS property widht; did you mean width?'],
      ['div { marign: 0; }', 'invalid CSS property marign; did you mean margin?'],
      ['div { on chnage { } }', 'unknown event chnage; did you mean change?'],
      ['div { on scrol { } }', 'unknown event scrol; did you mean scroll?'],
      ['div { svg { rect { onclick = f; } } }', 'events are written on click'],
      ['div { @import "a.css"; }', 'unknown directive @import'],
      ['div { foo { } }', "unknown element 'foo'"],
      ['div { = x }', 'child expressions use | value or |> expr, not = expr'],
      ['div { width: = "10px" }', 'computed CSS values use prop: { expr }, not prop: = expr'],
    ];
    for (const [text, message] of bad) {
      assert(syntaxError(text).message.includes(message), `js ${text}: ${syntaxError(text).message}`);
      const diagnostics = await selfhostDiagnostics({ ROOT, source: `${BROWSER}lib { fn run() Browser.HTMLElement { let f = 1; return @wutu/\\ ${text} \\/; } }` });
      assert(diagnostics.some(d => d.severity === 'error' && d.message.includes(message)), `selfhost ${text}: ${diagnostics.map(d => d.message).join('; ')}`);
    }
  });

  test('wutu parser: legacy surface still parses', () => {
    assertThrows(() => parseWutu('div { aria-hidden = "true" aspect-ratio: 0.68; }'), 'expected a line break or ;');
    const tree = parseWutu('section.a#b { data-x = x; hidden; svg { viewBox = "0 0 1 1"; } my-widget { anything = "ok"; } }');
    assertEq(items(tree.root, 'attribute').find(a => a.a === 'id').b, '"b"');
    assertEq(tree.root.children.length, 2);
  });

  test('wutu parser: xlink:href, xml:lang and xmlns:xlink are attributes, not CSS declarations', () => {
    const { root } = parseWutu('svg { xmlns:xlink = "http://www.w3.org/1999/xlink"; xml:lang = "en"; color: red; use { xlink:href = u; } }');
    assertEq(items(root, 'attribute').map(a => a.a).join(' '), 'xmlns:xlink xml:lang');
    assertEq(items(root, 'css').map(rule => rule.c).join(' '), 'color:red;');
    const use = root.children[0];
    const [href] = items(use, 'attribute');
    assertEq(`${href.a} ${href.b} ${(href.flags & 2) !== 0}`, 'xlink:href u true');
    assertThrows(() => parseWutu('div { xlink:href = u; }'), 'unknown attribute xlink:href on div');
  });

  test('wutu ergonomics: match/if distribution, ?T, native match, and no using Browser', async ({ ROOT }) => {
    // Native match parser + formatter round-trip
    const matchTemplate = `main {
      match page {
        Pages.home => { | home }
        Pages.about => { |> about() }
        Pages.contact => { p { "Contact" } }
        ~> { "Coming soon" }
      }
    }`;
    const formatted = formatWutuBody(matchTemplate);
    assertEq(formatWutuBody(formatted), formatted);
    assertEq(parseWutu(formatted).root.children[0].kind, 'match');
    assertEq(parseWutu(formatted).root.children[0].children.length, 4);

    // Compile and run BOTH |> match distribution and native Wutu match without using Browser
    await withDom(async document => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_ergonomics.utu', source: `
        enum(U8) Pages:
            | home
            | about
            | contact
            | soon

        struct State:
            | page: Pages
            | count: I32
            | note: ?Str
            | badge: ?Badge

        struct Badge[C]:
            | label: Str

        wn C[Badge].render |b| () {
            em { | b.label }
        }

        struct Home[C]:
            | title: Str

        wn C[Home].render |h| () {
            section {
                h1 { | h.title }
                div#cnt { | state.count }
            }
        }

        let state: State = State { page: Pages.home, count: 0, note: "hi", badge: Badge { label: "new" } }
        let home: Home = Home { title: "Home" }

        wn about() {
            h2 { "About" }
            p { "Two siblings" }
        }

        wn contact() {
            p { "Contact" }
        }

        wn view_expr() {
            @reactive
            main {
                section#a {
                    |> match state.page {
                        Pages.home => home,
                        Pages.about => about(),
                        Pages.contact => contact(),
                        Pages.soon => "Coming soon",
                    }
                }
                section#b {
                    match state.page {
                        Pages.home => { | home }
                        Pages.about => { |> about() }
                        Pages.contact => { p { "Contact" } }
                        Pages.soon => { "Coming soon" }
                    }
                }
                section#c {
                    |> if state.count == 0 { home } else { state.count }
                }
                section#opt {
                    | state.note
                    | state.badge
                }
                button#inc { on click { state.count += 1 } }
            }
        }

        lib {
            fn render() Externref => view_expr()
            fn set_page(p: I32) Void {
                state.page = Pages(p)
                wutu.refresh()
            }
            fn clear_opt() Void {
                state.note = null
                state.badge = null
                state.count = 5
                wutu.refresh()
            }
        }
      `});
      const root = instance.exports.render();
      document.body.append(root);
      assertEq(root.querySelector('#a h1').textContent, 'Home');
      assertEq(root.querySelector('#b h1').textContent, 'Home');
      assertEq(root.querySelector('#c h1').textContent, 'Home');
      assertEq(root.querySelector('#opt').textContent, 'hinew');

      instance.exports.set_page(1);
      assertEq(root.querySelector('#a h2').textContent, 'About');
      assertEq(root.querySelector('#a p').textContent, 'Two siblings');
      assertEq(root.querySelector('#b h2').textContent, 'About');
      assertEq(root.querySelector('#b p').textContent, 'Two siblings');

      instance.exports.set_page(2);
      assertEq(root.querySelector('#a p').textContent, 'Contact');
      assertEq(root.querySelector('#b p').textContent, 'Contact');

      instance.exports.set_page(3);
      assertEq(root.querySelector('#a').textContent, 'Coming soon');
      assertEq(root.querySelector('#b').textContent, 'Coming soon');

      instance.exports.clear_opt();
      assertEq(root.querySelector('#c').textContent, '5');
      assertEq(root.querySelector('#opt').textContent, '');
    });
  });
}
