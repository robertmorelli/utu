# Wutu: markup and CSS in one expression

Wutu is a built-in Utu DSL. It constructs real DOM nodes through Utu's typed
browser bindings, the same TypeScript-declaration interface that lets Utu call
any typed npm package ([details](typescript-abi.md)). Import those bindings once:

```utu
using Browser from std:Browser;

fn greeting(name: Str) Browser.HTMLElement {
    @wutu/\
    section.greeting {
        display: grid;
        gap: 1rem;
        padding: 1.5rem;
        h2 { margin: 0; "Hello, "; $[name]; }
        a {
            href="/about";
            color: oklch(45% 0.12 150);
            :hover { text-decoration-thickness: 0.15em; }
            "About this garden";
        }
    }
    \/;
}

export main() void {
    Browser.document.body.append(greeting("friend"));
}
```

## Syntax

Every leaf statement requires a semicolon: attributes (including booleans), DOM
properties, events, text, interpolations, and CSS declarations. This includes
CSS declarations inside `@document`, selectors, and media blocks. Element,
selector, and `if`/`for` blocks are brace-delimited and do not take a terminator.
Missing semicolons are compile errors, not warnings or implicit separators.

```wutu
aria-hidden = "true";
aspect-ratio: 0.68;
```

Every element head starts with a tag. `button.primary#save { ... }` creates a
button; `.primary` alone never silently creates a div. Brace nesting replaces
Emmet's linear `>`, `+`, and `^` operators. A DSL expression has one root element
and returns that element, with its concrete browser type where available.

| Form | Meaning |
| --- | --- |
| `tag.class#id { ... }` | An HTML element; custom-element names are accepted |
| `tag as name { ... }` | Name the node within its template subtree |
| `property: value;` | CSS declaration attached to this element |
| `name = "value";` | HTML attribute (`=` where CSS has `:`) |
| `name = $[expression];` | Utu-valued attribute; ordinary attributes expect Str |
| `disabled;` / `disabled = $[condition];` | Boolean attribute presence |
| `.value = $[expression];` | Typed DOM **property** assignment |
| `"text";` | A text node |
| `$[expression];` | A Utu string or DOM node, including a component result |
| `@click=$[cl(event) void { ... }];` | A typed event listener |
| `# comment` | A comment line: `#` first on its line, then a space. At the end of a line, `/* ... */`. Any other `#` is text, so `color: #1f2535;` is a color |

Common attributes are checked per tag. `canvas { padding="10" }` is an error.
`aria-*`, `data-*`, and custom-element attributes are accepted. Property
assignments use the browser declaration graph, so type errors come from the
same compiler as ordinary Utu code. String event-handler attributes (`onclick`)
are rejected: use a closure. Interpolated strings become text, never HTML.
Written strings take Utu's escapes: `"say \"hi\"";`, `"\u2192";`, `"\\";`.
Use `.to_f64().toString()` to display a native integer through browser Number.

Classes from `class = $[classes];` are combined with authored shorthand and
compiler style classes. SVG trees use `createElementNS`; `foreignObject`
children switch back to HTML. SVG attributes such as `viewBox`, `d`, and
`stroke-width` keep their original spelling.

## Components, slots, lists, and conditions

Components are ordinary typed Utu functions. Pass data or DOM nodes as normal
parameters and insert returned nodes with `$[component(args)]`. There is no
separate component registry or wrapper element. A node supplied as a slot is
moved into the parent by the DOM's normal append semantics.

```utu
@wutu/\
section {
    for $[plants filter |plant| { not plant.watered; }] |plant, index| {
        $[plant_card(plant)];
    }
    if $[empty] {
        p { "Everything is watered."; }
    } else {
        p { "A little care goes a long way."; }
    }
}
\/;
```

Conditions chain with `else if $[...] { ... }`; the first matching branch renders.

`for` adds an `each` terminal to the iterator pipeline; no temporary array is
required. Its optional index is U64. Conditional branches and loops can contain
multiple elements, strings, or component slots. Aliases in a branch/iteration
stay inside that Utu scope. Event listeners are attached after sibling nodes
are created, so a callback can refer to a later sibling's alias.

## State and lifetime

A static Wutu expression runs once and returns a DOM element. Interpolations, `if`, and
`for` evaluate during construction. State is ordinary Utu data; there is no
hidden observer graph. For automatic updates, use `@reactive;` as documented below.
For a static template, change a named DOM node inside
an event callback, or render a component again and replace its previous node.
The greenhouse example demonstrates both, including mutable captured node
references, shared struct state, and persistence.

```utu
button as toggle {
    type="button"
    $[if plant.watered { "Watered ✓"; } else { "Water me"; }]
    @click=$[cl(event) void {
        plant.watered = not plant.watered;
        toggle.textContent = if plant.watered { "Watered ✓"; } else { "Water me"; };
    }]
}
```

Listeners are attached directly to nodes. There are no global subscriptions to
unsubscribe and no framework-owned cache keeping removed nodes alive. Normal
DOM event propagation, promises, and Utu closures remain available.

## CSS

Styles are native CSS. Element-local rules use normal pseudo-classes,
pseudo-elements, nesting, and conditional at-rules:

```css
button {
    padding: 0.75rem 1rem;
    :hover { opacity: 0.85; }
    :focus-visible { outline: 2px solid currentColor; }
    @media (width < 40rem) { inline-size: 100%; }
    @ & > svg { pointer-events: none; }
}
```

A declaration whose value is `$[...]` is computed when the template renders
and applied with `style.setProperty`, which a strict `style-src` policy allows:

```css
div.bar {
    i {
        width: $[progress.to_str() + "%"];
        --hue: $[hue.to_str()];
    }
}
```

Static declarations on the same element still compile to a shared class.

`@ selector { ... }` is an explicitly scoped selector rule, not an element.
`@ { ... }` targets the element and its descendants. `@document { ... }` before
the root contains document-level CSS: tokens, resets, `@font-face`, `@keyframes`,
layer ordering, and so on. Within raw CSS blocks use CSS comments, or standalone
`# ` comment lines. URLs retain `//` and fragments unchanged.

**The nearer rule wins.** `@document` CSS, and sheets installed with `@style`,
sit in the `wutu.document` cascade layer; element-local styles are unlayered.
So a declaration written on an element beats a document rule however specific
the document selector is (`main p.note { color: red; }` loses to `color: green;`
written inside that `p.note`). An `@import` in `@document` is hoisted and
imports into the same layer. To let a document rule win on purpose, use
`!important` or a layer of your own.

**`@document` belongs to its component.** Any template may start with one, not
only the root view: a component's document CSS is installed once, the first time
the component renders, and is shaken out with the component when nothing calls
it. Keep page-specific rules next to the page that uses them:

```utu
fn editor() Browser.HTMLElement {
    @wutu/\
    @document {
        .editor > pre { margin: 0; }
    }
    div.editor {
        pre {
            "…";
        }
    }
    \/;
}
```

Strings in a payload are text, so a `/\` or `\/` inside one does not open or
close a DSL: `"Envelope: /\\ … \\/";` (a written backslash is `\\`, as in
any utu string). This holds for every DSL; a string ends at its line.

Identical declaration sets receive identical deterministic classes. Each
reachable component's stylesheet is installed once, even when many instances
are created. Unused components and their style installers are removed by the
existing Wasm/import shaking. There is no runtime CSS parser or dependency.

The example uses semantic HTML, shallow DOM, grid/flex layouts, logical
properties, fluid sizing, color tokens, and native CSS nesting. Wutu does not
restrict the CSS language: unusual layout decisions remain author choices.

## Build and run

```sh
bun install
bun run build --wasm
node tools/dts/build-app.mjs examples/wutu-garden/main.utu dist/wutu-garden
cp examples/wutu-garden/index.html dist/wutu-garden/index.html
python3 -m http.server 8080 --directory dist/wutu-garden
```

Open `http://localhost:8080`. Deployment needs only `index.html`, `app.js`, and
`app.wasm`. The compiler, declaration catalog, and parser stay on the build side.
Run `node scripts/test-wutu-browser.mjs` for browser interactions, responsive
layout, persistence, and the 6 KB gzip Wasm+JS+CSS budget. This uses Playwright
Chromium (`npx playwright install chromium` if needed). The same tests also run
in WebKit: install it with `npx playwright install webkit`, then run
`node scripts/test-wutu-browser.mjs --webkit`.


### Readable source

Keep statements and block contents on separate, indented lines. Compiler diagnostics include a non-fatal `compressed-source` warning for lines longer than 160 characters that contain at least five block/statement delimiters and more than 100 characters of code outside strings and comments. Short expressions, long prose strings, comments, and multiline-string lines are excluded. The check examines original source, not generated Wutu or iterator expansions. It is a density heuristic, not a formatter or a blanket line-length rule.

The warning appears in analysis diagnostics used by `utu check` and the editor. Build output can still be minified independently of source formatting.

## Elements JavaScript owns, mount, and quiet handlers

`@unmanaged;` in an element hands its insides to JavaScript: the template makes
the element and sets the attributes it names, and renders never touch its
children or any other attribute (an editor widget, a chart, an iframe's
`srcdoc`). It has no children in its template. `on mount { … };` runs once per
element, after the render that made it; name the element with `as` to reach it:

```wutu
div as chart {
    @unmanaged;
    on mount {
        chart.append(Browser.document.createTextNode("drawn by JavaScript"));
    };
}
```

A handler normally schedules a render after it runs. A **quiet** handler does
not: write `on scroll quiet { … };`. Wutu also infers it: a handler whose every
statement assigns a property of an `as` element from those elements, `event`,
and literals, calling nothing, is quiet without the word (nothing a render
reads changed). `on scroll { overlay.scrollTop = field.scrollTop; };` is quiet;
`on scroll { state.top = field.scrollTop; };` is not.

## Lazy pages

`= wutu.lazy("./tour.utu");` shows a page that is compiled on its own and loaded
the first time it is shown. `wutu build` finds every `wutu.lazy` path in the
entry and the files it imports, and builds each as a chunk
(`chunks/tour-<hash>/app.js` and `app.wasm`, named by their bytes): the file
declares a module whose `fn page() Browser.HTMLElement` is the page. The chunk
renders it and delivers it into the placeholder `wutu.lazy` returned; a
prerendered placeholder keeps its markup until then. The host never ships the
page's code or text, so a site of many pages starts with only the one it shows.
A chunk is its own program: share state with the host through the DOM, the URL,
or storage, not through captured structs.

```utu
@wutu/\
@reactive;
main {
    if $[wutu.route() == "/tour"] {
        = wutu.lazy("./tour.utu");
    } else {
        = home.page();
    }
}
\/;
```

## Reactive views, identity, and concise expressions

Put `@reactive;` at the start of a root template. Event handlers may mutate
captured structs directly: Wutu batches a refresh into the next microtask.
Components called while rendering join that root. There is no proxy state or
virtual DOM; the compiler emits calls to a small shared DOM reconciler.
Static templates in projects without reactive views retain their direct DOM path.
External callbacks (timers, network subscriptions) call `wutu.refresh()` after
changing state. A refresh visits connected roots; this is explicit whole-view
rendering, not dependency tracking or list virtualization.

```utu
@wutu/\
@reactive;
main {
    label {
        "Search";
        input { bind:value = state.query; }
    }
    for $[state.items] |item| key $[item.id] {
        article {
            h2 { = item.title; }
            button {
                "Finish";
                on click { item.done = true; };
            }
        }
    }
}
\/;
```

`= expression;` inserts text or a component node. Attributes can use direct
expressions (`title = item.title;`) as well as `$[...]`. Attribute expressions
beginning with a quoted literal use `$[...]` when concatenating more text.
`on click { ... };` supplies an implicit typed `event`; `on submit` also prevents
navigation. Native form constraints still govern normal browser submission.
The existing explicit closure syntax remains supported.

Keys are stable **strings**, unique per repeated template under a parent. Use a
record ID rather than its changing position. Keyed reordering preserves DOM
identity, focused controls, and selection. Duplicate keys throw a useful runtime
error. Removing an item removes its DOM; reintroducing it creates new nodes.
Avoid direct structural DOM edits inside managed views; describe that structure
in the template instead.

Aliases are resolved within the nearest containing template subtree. Unrelated
sections can both have `input as field`. A form handler can access its unique
named descendant. An ambiguous reference is a compiler error. Normal Utu locals
and closure parameters take precedence over aliases.

## Bindings and typed persistence

- `bind:value = state.text;` binds strings on inputs, textareas, and selects.
- `bind:checked = state.enabled;` binds a checkbox boolean.
- `bind:number = state.amount;` binds an F64 through `valueAsNumber`. Invalid
  numeric edits do not overwrite the state with NaN.

A binding and a custom handler for the same event compose in that order.
Unchanged property values are not rewritten, preserving the input caret.
Radio groups, multiple selects, files, and richer validation use explicit events
and browser properties.

```utu
struct Preferences:
    | name: Str
    | enabled: Bool

let preferences = @stored/\
    Preferences "preferences-v1" Preferences { name: "", enabled: true }
\/;
```

`@stored` generates native/JSON conversion and validates the full stored shape
before accepting it. Supported schemas are acyclic local structs containing
`Str`, `Bool`, `I32`, `F64`, and nested `Array[T]`. Arrays decode in linear time
with a preallocated native array. Invalid or unavailable storage returns the
defaults. Data is wrapped in a versioned envelope; change the key when changing
an incompatible schema. Imported/recursive/optional schema types and automatic
migration are not currently supported.

Create stored state before mounting its reactive root. Automatic stores save after
events or `wutu.refresh()`, with a 180 ms debounce and unchanged-value deduplication.
Use `manual` after the key to save only at `wutu.save(key)` boundaries.
`wutu.flush()` writes pending changes immediately; page exit also flushes.
`validate function_name` applies an application-level `State -> Bool` validator.
Incoming cross-tab changes pass through the generated decoder. Dirty local state
blocks conflicting writes; explicitly save to keep local state or call
`wutu.reload_store(key)` to accept storage. Errors appear through
`wutu.storage_error()`. There is no automatic field merge or server sync.
See the [complete reactive example](../examples/wutu-reactive/main.utu) and
[Folio](../examples/wutu-five/folio/main.utu).

## Formatting, editor support, and preview

```sh
node cli/wutu.mjs format examples/wutu-five/folio/main.utu
node cli/wutu.mjs format examples/wutu-five/folio/main.utu --check
node cli/wutu.mjs dev examples/wutu-five/folio/main.utu --port 4176
node cli/wutu.mjs build examples/wutu-five/folio/main.utu --out dist/folio
```

The formatter lays out surrounding Utu and parsed Wutu islands together, while
preserving foreign DSL payloads.
Commented template bodies are conservatively preserved. The VS Code extension
registers the same formatter and completions for tags, attributes, bindings, and
events. Syntax diagnostics point into the original template. CSS values still
follow browser CSS semantics; this is not a full CSS language server.

The preview watches project Utu sources, rebuilds, and reloads the browser. Failed
builds retain the last working output and show an error overlay. Successful
recovery clears it by reloading. The development client restores ordinary control
values, focus, selection and scroll; the hash survives reload. This is full-page
reload, not hot module replacement: arbitrary in-memory objects are not restored. Production output has no preview client.

## Prerendering and hydration

`wutu build` prerenders by default using build-time Chromium. HTML contains real
content and styles, so it remains readable without JavaScript or before Wasm
loads. The runtime reuses marked DOM on startup, including keyed nodes, and
loads the user's stored state. Form controls are disabled until hydration to
avoid accepting edits before handlers exist. Links remain functional.

Use reactive roots for DOM-preserving hydration. Purely static templates also
prerender, and replace their snapshot once on startup. Build-time rendering runs the entry point in
a clean browser context: render public defaults, never private build credentials
or user data. The current prerenderer captures synchronous initialization; it is
not an asynchronous data loader or routing system. `--no-prerender` skips this
step. Playwright and the compiler are build tools; neither ships in the website.
The five-site build includes prerendered HTML in its 14 KB gzip per-site budget.


## Unrestricted CSS and recursive DSL composition

Put a stylesheet in a standard `@css` envelope and return it from a normal module:

```utu
mod theme {
    fn sheet() Str {
        @css/\
        @layer theme {
            .card { color: oklch(40% .12 150); }
        }
        \/;
    }
}
```

Install it with `@style $[theme.sheet()];` before the Wutu root. Identical sheets
are installed once, including during hydration, and several `@style` lines
install in source order. Static (non-reactive) projects support `@style` too. The compiler preserves the raw
CSS payload: it has no property, selector, value, or at-rule allowlist. Browser
support still determines rendering. Local Wutu declarations remain available;
use a stylesheet envelope for arbitrary CSS grammar. **UTU: Show CSS Stencil**
opens a CSS document with non-CSS characters erased and original offsets retained.
This is an editor projection, not yet continuous CSS language-server forwarding.

DSL envelopes are balanced. Wutu can contain Utu expressions that contain Wutu
again; expansion continues across newly produced DSL nodes. Unclosed envelopes
and runaway expansion are errors. The raw `/\` and `\/` delimiter pairs are
reserved even inside a payload's strings; the outer scanner does not interpret
the inner language's string escapes. This is a known literal-embedding limit.

## Scoped state, identity, and effects

`@island "unique-name";` creates an independently updating view. Its event handlers
update that view only. Its original factory and captured local state survive
parent renders. Use `wutu.invalidate("unique-name")` when another view changes its
shared state, and unique names for separate mounted instances. Analysis warns
(`unknown-island`) when an `invalidate` literal names no island in the program,
since a misspelling would otherwise refresh nothing. Replacement factory
arguments are not automatically treated as new props; mutate the shared model or
unmount and remount the island.

A loop may use `key global $[item.id]` to preserve node identity across containers
within the same island. Ordinary `key` remains local to its parent. Duplicate keys
produce runtime diagnostics. Unkeyed loops receive positional identities.

`wutu.after_render(callback)` and `wutu.focus(id)` run after the update.
`wutu.on_cleanup(callback)` registers cleanup for the current view;
`wutu.interval(key, milliseconds, callback)` updates its owner after each tick and
cancels on unmount. Register effects consistently while rendering. `wutu.route()`
reads the hash path, and hash/history changes refresh views. This is a small route
primitive, not a route table, network loader or authentication framework.

Optional `std:NumberField` keeps numeric draft text separate from validated
numbers. Optional `std:List[T]` provides `append` and `remove_at`; both return copied
arrays. `wutu.number`, `wutu.money` (integer USD cents), and `wutu.decimal` cover
simple display without shipping a formatting library.

The [two new five-site batches](wutu-round-two-review.md) exercise these APIs.
