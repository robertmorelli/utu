// Wutu parser, formatter, expansion, diagnostics, and @stored regressions.
import { parseHTML } from 'linkedom/worker';
import { compileAndInstantiateSelfhost, selfhostDiagnostics, withTempUtu } from './test-harness.mjs';
import { parseWutu, WutuSyntaxError } from '../src/compiler/wutu-parse.js';
import { formatWutuBody, formatWutuSource, wutuIslands } from '../src/compiler/wutu-tooling.js';

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
    assertEq(chain.otherwise[0].otherwise[0].condition, 'c');
    assertEq(chain.otherwise[0].otherwise[0].otherwise[0].expr, '"d"');
    assertEq(label.binding, 'label');
    // Parentheses hide a pipeline's captures; the loop continues the pipeline.
    // Around a finished pipeline (sort) or a range they stay.
    const loops = parseWutu('ul { for (xs filter |x| { x.ok; }) |x| key x.id { li { "a"; } } for (xs sort(I32) |a, b| { a < b; }) |x| { li { "b"; } } for (0..<n) |i| { li { "c"; } } }').root.children;
    assertEq(loops.map(loop => loop.iterable).join(' / '), 'xs filter |x| { x.ok; } / (xs sort(I32) |a, b| { a < b; }) / (0..<n)');
    assertEq(loops[0].key, 'x.id');
  });

  test('wutu parser: errors explain the fix and point at the offending token', () => {
    const cases = [
      ['div { p { hreff = "/"; } }', 'unknown attribute hreff', 'hreff'],
      ['div { p { "x" } }', 'expected ;', ' } }'],
      ['div { title = "Hi " + name }', 'expected ;', '}'],
      ['button { @click = $[go]; }', 'events are written on click = handler', '@click'],
      ['div { foo { } }', "unknown element 'foo'", 'foo'],
      ['@island view; div { }', 'quoted island name', 'view'],
      ['div {\n p { "x";\n', "unterminated element 'p'", 'p {'],
      ['div { p { onclick = f; } }', 'events are written on click', 'onclick'],
      ['p { $[x]; }', 'no longer writes $[', '$[x]'],
      ['p { # note\n "x"; }', 'comments are written //', '# note'],
      ['iframe { srcdoc = html; }', 'srcdoc is HTML', 'srcdoc'],
      ['iframe { .srcdoc = html; }', 'srcdoc is HTML', 'srcdoc'],
    ];
    for (const [text, message, at] of cases) {
      const error = syntaxError(text);
      assert(error.message.includes(message), `${text}: ${error.message}`);
      assert(error.at.startsWith(at), `${text}: error at ${JSON.stringify(error.at.slice(0, 12))}, expected ${JSON.stringify(at)}`);
    }
  });

  test('wutu parser: element CSS keeps authored and compiled forms separately', () => {
    const { root } = parseWutu('div { color: red; :hover { color: blue; } @ .x { margin: 0; } @ { padding: 0; } }');
    assertEq(root.css.map(rule => rule.source).join(' '), 'color: red; :hover{ color: blue; } @ .x{ margin: 0; } @{ padding: 0; }');
    assertEq(root.css.map(rule => rule.css).join(' '), 'color:red; &:hover{ color: blue; } .x{ margin: 0; } &, & *{ padding: 0; }');
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

  test('wutu formatter: nested DSL payloads are restored byte-for-byte', () => {
    // More than ten payloads, and payloads containing replacement patterns.
    const payloads = Array.from({ length: 12 }, (_, i) => `@utu/\\ "$&${i}$'" \\/`);
    const body = `div { ${payloads.map(p => `= ${p};`).join(' ')} }`;
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
            @wutu/\\ ${reactive ? '@reactive;' : ''}
            p {
              if n == 1 { "one"; } else if n == 2 { "two"; } else if n == 3 { b { "three"; } } else { "many"; }
            }
            \\/;
          }
          export lib {
            fn render(n: I32) Browser.HTMLElement { view(n); }
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

  test('wutu: CSS declarations with = values apply at render time, statically and reactively', async ({ ROOT }) => {
    for (const reactive of [false, true]) {
      await withDom(async (document) => {
        const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: `wutu_dynamic_style_${reactive}.utu`, source: `${BROWSER}
          struct Gauge:
              | pct: I32
          fn view(g: Gauge) Browser.HTMLElement {
            @wutu/\\ ${reactive ? '@reactive;' : ''}
            div {
              display: block;
              width: = g.pct.to_str() + "%";
              --level: = g.pct.to_str();
              span { "gauge"; }
            }
            \\/;
          }
          export lib {
            fn make(pct: I32) Gauge { Gauge { pct: pct }; }
            fn render(g: Gauge) Browser.HTMLElement { view(g); }
            fn set(g: Gauge, pct: I32) void { g.pct = pct; wutu.refresh(); }
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
        fn first() Str { "p{color:red}"; }
        fn second() Str { "p{color:blue}"; }
        export main() Browser.HTMLElement {
          @wutu/\\
          @style first();
          @style second();
          div { /* comment */ background: url(https://example.com/a.png); "x"; }
          \\/;
        }
      `});
      instance.exports.main();
      instance.exports.main();
      const sheets = [...document.querySelectorAll('style')].map(node => node.textContent);
      // A shared sheet joins the wutu.document layer, below element styles.
      const red = '@layer wutu.document{p{color:red}}', blue = '@layer wutu.document{p{color:blue}}';
      assertEq(sheets.filter(text => text === red).length, 1, 'each sheet installs once');
      assert(sheets.indexOf(red) < sheets.indexOf(blue), `sheets out of order: ${sheets.join(' | ')}`);
      assert(sheets.some(text => text.includes('url(https://example.com/a.png)')), 'URLs keep their slashes');
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
        export main() Browser.HTMLElement {
          let state = State { text: "start", items: [Item { id: "a" }, Item { id: "b" }] };
          @wutu/\\
          @reactive;
          main {
            input { bind:value = state.text; }
            p { = state.text; }
            ul {
              for state.items |item| key item.id {
                li { = item.id; }
              }
            }
            button {
              on click {
                state.items = [state.items[1], state.items[0]];
              }
            }
          }
          \\/;
        }
      `});
      const root = instance.exports.main();
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

  test('wutu: a component passed to a component lands inside it, and stays there on re-render', async ({ ROOT }) => {
    await withDom(async (document) => {
      const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: 'wutu_nested_call.utu', source: `${BROWSER}
        struct State:
            | n: I32
            | words: Array[Str]
        fn card(body: Browser.HTMLElement) Browser.HTMLElement { @wutu/\\ figure { header { "Title"; } = body; } \\/; }
        fn tag(word: Str) Browser.HTMLElement { @wutu/\\ em { = word; } \\/; }
        fn badge(n: I32) Browser.HTMLElement { card(tag(n.to_str())); }
        fn plain() Browser.HTMLElement { @wutu/\\ main { = card(tag("hello")); } \\/; }
        fn view() Browser.HTMLElement {
          let state = State { n: 1, words: ["a", "b"] };
          @wutu/\\
          @reactive;
          main {
            section#one { = card(tag("hello")); }
            section#loop { for state.words |w| { = card(tag(w)); } }
            section#keyed { for state.words |w| key w { = card(tag(w)); } }
            section#memo { = badge(state.n); }
            section#still { = badge(5); }
            button { on click { state.n += 1; state.words = [state.words[1], state.words[0], "c"]; } }
          }
          \\/;
        }
        export lib {
            fn once() Browser.HTMLElement { plain(); }
            fn reactive() Browser.HTMLElement { view(); }
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
      [`${BROWSER}export main() Browser.HTMLElement { @wutu/\\ div { p { hreff = "/"; } } \\/; }`, 'invalid-dsl-usage', 'h'],
      [`${BROWSER}export main() Browser.HTMLElement { @wutu/\\ div { p as x { "a"; } p as x { "b"; } button { on click = cl(e) void { x.focus(); }; } } \\/; }`, 'invalid-dsl-usage', 'x'],
      [`${BROWSER}export main() Browser.HTMLElement { @wutu/\\ div { = 1 +; } \\/; }`, 'invalid-dsl-usage', '1'],
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
export main() Browser.HTMLElement {
    let s = S { n: 1 };
    @wutu/\\
    @reactive;
    div {
        title = 42;
        p { = 7; }
        button { on click = 42; }
        input { bind:value = s.n; }
        if s.n { "x"; }
    }
    \\/;
}`;
    const diagnostics = (await selfhostDiagnostics({ ROOT, source })).filter(d => d.kind === 'type-mismatch');
    const texts = diagnostics.map(d => d.text);
    assert(diagnostics.length >= 5, texts.join(' | '));
    assert(texts.every(text => !text.includes('@wutu')), `no diagnostic covers the whole template: ${texts.join(' | ')}`);
    // (`= 7;` is text: a number shows as its to_str.)
    for (const expected of ['42', 's.n']) assert(texts.includes(expected), `expected a diagnostic at ${expected}: ${texts.join(' | ')}`);
    assert(!texts.includes('7'), 'a number in a text hole is text');
    assert(texts.some(text => text.startsWith('bind:value')), 'bind sync errors point at the bind statement');
  });

  test('wutu diagnostics: misspelled island names warn without blocking compilation', async ({ ROOT }) => {
    const program = (name) => `${BROWSER}export main() Browser.HTMLElement {
    // wutu.invalidate("commented-out") is ignored
    wutu.invalidate("${name}");
    @wutu/\\ @island "board"; div { "x"; } \\/;
}`;
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
      [`${BROWSER}export main() void { let s = @stored/\\ Str "k" "x" \\/; }`, 'invalid-dsl-usage', 'Str', 'must be a struct'],
      [`${BROWSER}struct S:\n    | n: I64\nexport main() void { let s = @stored/\\ S "k" S { n: 1 } \\/; }`, 'invalid-dsl-usage', 'S', 'Unsupported stored type I64'],
      [`${BROWSER}struct S:\n    | n: I32\nexport main() void { let s = @stored/\\ S "k" validate nope S { n: 1 } \\/; }`, 'unknown-variable', 'nope', ''],
      [`${BROWSER}struct S:\n    | n: I32\nexport main() void { let s = @stored/\\ S "k" S { n: missing } \\/; }`, 'unknown-variable', 'missing', ''],
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
        h1 { "Title"; = subtitle; }
        if ready { p { "ready"; } } else if failed { p { "failed"; } } else { p { "wait"; } }
        for items |item, i| key item.id { li { data-id = item.id; = item.name; } }
        input { type = "text"; bind:value = state.text; .disabled = locked; }
        button { aria-label = "Go"; on click { go(app); } on focus = cl(e) void { log("[x]"); }; }
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
          @wutu/\\
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
              p#money { = wutu.money(-123) + " " + wutu.money(-1) + " " + wutu.money(123456) + " " + wutu.money(0); }
          }
          \\/;
      }
      export main() Browser.HTMLElement { view(St { u: "/safe" }); }
    `;
    const BAD = ['javascript:window.__pwned=1', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)',
      '\u0001javascript:alert(1)', 'jav\nascript:x', 'vbscript:msgbox', 'data:text/html,<script>alert(1)</script>'];
    for (const mode of Object.keys(MODES)) {
      await withDom(async (document) => {
        const { instance } = await compileAndInstantiateSelfhost({ ROOT, name: `wutu_url_${mode}.utu`, source, mode });
        const root = instance.exports.main();
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
      const source = `${BROWSER}export main() Browser.HTMLElement { let h = "<b>x</b>"; @wutu/\\ iframe { ${item} } \\/; }`;
      const diagnostics = await selfhostDiagnostics({ ROOT, source });
      const match = diagnostics.find(d => d.severity === 'error' && d.message.includes('srcdoc is HTML'));
      assert(match, `${item}: ${diagnostics.map(d => d.message).join('; ')}`);
      assertEq(source.slice(match.start, match.start + 6), 'srcdoc', `${item}: located at the name`);
    }
    const written = await selfhostDiagnostics({ ROOT, source: `${BROWSER}export main() Browser.HTMLElement { @wutu/\\ iframe { srcdoc = "<b>x</b>"; } \\/; }` });
    assertEq(written.filter(d => d.severity === 'error').length, 0);
  });

  test('wutu parser: legacy surface still parses', () => {
    assertThrows(() => parseWutu('div { aria-hidden = "true" aspect-ratio: 0.68; }'), 'expected ;');
    const tree = parseWutu('section.a#b { data-x = x; hidden; svg { viewBox = "0 0 1 1"; } my-widget { anything = "ok"; } }');
    assertEq(tree.root.attrs.find(a => a.name === 'id').value, '"b"');
    assertEq(tree.root.children.length, 2);
  });

  test('wutu parser: xlink:href, xml:lang and xmlns:xlink are attributes, not CSS declarations', () => {
    const { root } = parseWutu('svg { xmlns:xlink = "http://www.w3.org/1999/xlink"; xml:lang = "en"; color: red; use { xlink:href = u; } }');
    assertEq(root.attrs.map(a => a.name).join(' '), 'xmlns:xlink xml:lang');
    assertEq(root.css.map(rule => rule.css).join(' '), 'color:red;');
    const use = root.children[0];
    assertEq(`${use.attrs[0].name} ${use.attrs[0].value} ${use.attrs[0].dynamic}`, 'xlink:href u true');
    assertThrows(() => parseWutu('div { xlink:href = u; }'), 'unknown attribute xlink:href on div');
  });
}
