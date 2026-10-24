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
        h2 { margin: 0; "Hello, "; = name; }
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
| `name = expression;` | Utu-valued attribute; ordinary attributes expect Str |
| `disabled;` / `disabled = condition;` | Boolean attribute presence |
| `.value = expression;` | Typed DOM **property** assignment |
| `"text";` | A text node |
| `= expression;` | Text or a node: a Str, a number or Bool (its `to_str()`), or a DOM node such as a component's result |
| `property: = expression;` | A CSS value computed at render |
| `if cond { … } else if cond { … } else { … }` | Conditional children |
| `for items \|item, i\| key item.id { … }` | Repeated children (keys may be any scalar or Str) |
| `on click { … }` | An event handler, with no event variable |
| `on click \|e\| { … }` | The same, with the event as `e`, typed as the DOM types it (`MouseEvent`) |
| `on click = handler;` | A handler value: a `cl(Browser.Event) void` |
| `bind:value = state.text;` | Two-way bindings: `value`, `checked`, `number`, `group`, `values`, `files` |
| `// comment` | A comment, first on a line or after a blank; `/* … */` also works. `#` is always text, so `color: #1f2535;` is a color |

An expression stands on its own: `if`, `for`, and `key` read up to the block's
`{` (`for` up to its `|item|`). An expression with braces or captures of its own
goes in parentheses: `if (xs any |x| { x.done; }) { … }`,
`for (xs filter |x| { x.ok; }) |x| { … }`; the loop continues that pipeline.
(Before this release Wutu wrapped expressions in `$[…]`, wrote events
`@click = $[…]`, ended `on` blocks with `;`, and named the event `event`
implicitly; each old form is now an error that names the new one.)

Common attributes are checked per tag. `canvas { padding="10" }` is an error.
`aria-*`, `data-*`, and custom-element attributes are accepted. Property
assignments use the browser declaration graph, so type errors come from the
same compiler as ordinary Utu code. String event-handler attributes (`onclick`)
are rejected: use a closure. `label { for = "name"; }` is label's attribute, not
a loop. An element has one id. An event name one edit (or swap) from a common
DOM event (`on clik`, `on chnage`) is an error; another name is a custom
event: two edits from one (`on unmount`), or one that adds to a DOM event's
name (`on changed`, `on resized`). `@reactive`,
`@island`, `@style` and `@document` come before the root element; inside an
element, `@unmanaged;` and CSS at-rules (`@media`, `@container`, …) are the
only `@` forms, and any other is an error. Interpolated strings become text, never HTML.
Written strings take Utu's escapes: `"say \"hi\"";`, `"\u2192";`, `"\\";`.
A number or Bool in a text hole shows as its `to_str()`: `= state.count;`.

A URL from a value is checked on every render, first and update alike, as an
attribute (`href = link;`) or a property (`.href = link;`): `href`, `src`,
`action`, `formaction`, `poster`, `cite`, `data`, `background`, `codebase`,
`longdesc`, `manifest`, `xlink:href`; `ping`, `srcset` and
`imagesrcset` check each URL in the list (apart at spaces or commas, each read
as a single one is). One whose scheme is
`javascript:` or `vbscript:`, read as a browser reads it (any case, whitespace
and control characters dropped: `" JaVa\tScript:"`), is not set: the attribute
goes. So is a `data:` URL, except an image, audio or video one; an SVG image
(`data:image/svg+xml`) only in an `img` or SVG `image`. An `a` or `area` with
a `download` (written, so set before the `href`) takes any `data:` href: it is
saved, not opened (`a { href = calendar; download = "agenda.ics"; }`). Prerendered HTML is the
DOM these renders made, so it holds the same. `srcdoc` is HTML, so a value
there (`srcdoc = html;`, `.srcdoc = html;`) is an error; a written one stays.
A `meta`'s `content` from a value (a refresh's URL) with any of those schemes
anywhere goes too. An event handler is never an attribute: `onclick = …;` is
an error in any case (`oNclick`, on a custom element too); an attribute's
name is always written, so the run time needs no check. (One is `on` and a DOM event's name; `one`,
`only` and `onfoo` run nothing, so they are attributes.) A `script` is code,
so its attributes and text are only as written (`src = "/app.js";`, `"…";`):
`src = url;` or `= code;` in a script is an error. HTML holds the text of
`style`, `noscript`, `iframe` (and `xmp`, `noembed`, `noframes`, `plaintext`)
unescaped, so prerendered, a value there could close the element and start
markup (`</style><img onerror=…>`): their text is only as written too
(`style { "…"; }`); `= css;`, an `if` or `for` there, or `.textContent = …;`
on one is an error. (Elements inside them are escaped as anywhere.) A
`base`'s `href` moves every relative URL, scripts' too, so `href = url;` on
`base` is an error; and `.protocol = …;` could turn a link's URL into
`javascript:` past the check, so from a value it is an error: set `.href`.
What the author writes is not checked: `href = "javascript:…";` is kept.
`.innerHTML = expr;` and `.outerHTML = expr;` set HTML, unescaped, by the
author's choice; give them only trusted text.

Classes from `class = classes;` are combined with authored shorthand and
compiler style classes. SVG trees use `createElementNS`; `foreignObject`
children switch back to HTML. A root tag only SVG has (`circle`, `g`, `image`,
`feGaussianBlur`) is SVG too, a `Browser.SVGElement`; `a`, `title`, `script`
and `style` are HTML. Inside `svg { }` any name is an SVG element, and an SVG
element takes any attribute (`on…` handlers and URL checks still apply),
spelled as written: `viewBox`, `stdDeviation`, `stroke-width`. A namespaced one,
`xlink:href = …;`, `xml:lang = …;` or `xmlns:xlink = …;`, is an attribute (no
CSS property has those prefixes), set in its namespace.

## Components, slots, lists, and conditions

Components are ordinary typed Utu functions. Pass data or DOM nodes as normal
parameters and insert returned nodes with `= component(args)`. There is no
separate component registry or wrapper element. A node supplied as a slot is
moved into the parent by the DOM's normal append semantics.

```utu
@wutu/\
section {
    for (plants filter |plant| { not plant.watered; }) |plant, index| {
        = plant_card(plant);
    }
    if empty {
        p { "Everything is watered."; }
    } else {
        p { "A little care goes a long way."; }
    }
}
\/;
```

Conditions chain with `else if ... { ... }`; the first matching branch renders.

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
    type = "button";
    = if plant.watered { "Watered ✓"; } else { "Water me"; };
    on click {
        plant.watered = not plant.watered;
        toggle.textContent = if plant.watered { "Watered ✓"; } else { "Water me"; };
    }
}
```

**Under `@reactive`, don't write to an element the template manages.** A
handler's `toggle.textContent = …` holds only until the next render, which
sets the node back to what the template says. Change state and let the
template show it:

```utu
p { = s.msg; }
button {
    on click { s.msg = "Saved"; }
    = "Save";
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

An element's own declaration whose property (ASCII case-insensitive) is one
edit or swap from a standard one is a typo and fails: `colr: red;` says "did
you mean color?". Custom (`--x`) and prefixed (`-webkit-…`) properties, and
ones further from a standard name, pass as written. A custom property's value
is any balanced run (`--cfg: { "a": 1 };`); comments in a value are skipped.
A value that runs on into the next statement is a missing `;`: a declaration
on its line (`color: red margin: 0;`) or the next, or an attribute, boolean
attribute or text there (`color: red` then `hidden;`).

A declaration whose value is `= ...` is computed when the template renders
and applied with `style.setProperty`, which a strict `style-src` policy allows:

```css
div.bar {
    i {
        width: = progress.to_str() + "%";
        --hue: = hue.to_str();
    }
}
```

Static declarations on the same element still compile to a shared class.

`@ selector { ... }` is an explicitly scoped selector rule, not an element.
`@ { ... }` targets the element and its descendants. `@document { ... }` before
the root contains document-level CSS: tokens, resets, `@font-face`, `@keyframes`,
layer ordering, and so on. Within raw CSS blocks use CSS comments (`/* … */`)
or `// …` lines; `# ` is not a comment. URLs retain `//` and fragments unchanged.

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
layout, persistence, and the 9 KB gzip Wasm+JS+CSS budget (about 4 KB of it is
the reconciler every template runs through; `@style` sheets and lazy modules'
loader ship only to the pages that use them, and a lazy chunk uses the page's
runtime). This uses Playwright
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
`srcdoc`). It has no children in its template. `on mount { … }` runs once per
element, after the render that made it; name the element with `as` to reach it.
A prerendered `@unmanaged` element is emptied when the page starts, and its
`on mount` draws it again:

```wutu
div as chart {
    @unmanaged;
    on mount {
        chart.append(Browser.document.createTextNode("drawn by JavaScript"));
    }
}
```

A handler normally schedules a render after it runs. A **quiet** handler does
not: write `on scroll quiet { … }`. Wutu also infers it: a handler whose every
statement assigns a property of an `as` element from those elements, `event`,
and literals, calling nothing, is quiet without the word (nothing a render
reads changed). `on scroll { overlay.scrollTop = field.scrollTop; }` is quiet;
`on scroll { state.top = field.scrollTop; }` is not.

## Lazy pages

`using guide lazy from "./guide.utu";` imports a module that is compiled on its
own and loaded the first time a function of it is called. The program
type-checks it as usual (a missing file, a misspelled function, or a wrong
argument is a compile error), but does not contain it: a call such as
`guide.page("you")` returns a placeholder element, typed as the function
declares (`Browser.HTMLElement`), that the module's chunk fills when it
arrives. `wutu build` builds one chunk per lazy module, with exactly the
functions the program calls, as `chunks/guide-<hash>/app.js` and `app.wasm`
(named by their bytes, so they cache safely). A prerendered placeholder keeps
its markup until the chunk arrives, and the prerenderer waits for chunks.

Arguments cross into the chunk as they are, so a lazy module's functions take
numbers, Bool, Str, and host values, and return a host element; anything else
is a compile error naming the type. A chunk is its own program: share state
with the page through those arguments, the DOM, the URL, or storage. It uses
the page's Wutu runtime rather than shipping its own, and `sizes.json` lists
each chunk under `chunks`, apart from the page's `total`.

Each call site has its own placeholder, made again when its arguments change.
A call outside any template (in `main`, say, before the first render) works
too: its placeholder belongs to the page.
If a chunk fails to load, its placeholder gets `data-wutu-lazy-error` (style
it to say so) and the next render tries again.

The file holds a module of the name the `using` gives:

```utu
// guide.utu
using Browser from std:Browser;

mod guide {
    fn page(who: Str) Browser.HTMLElement {
        @wutu/\
        article { h1 { = "Hello, " + who; } }
        \/;
    }
}
```

```utu
using guide lazy from "./guide.utu";

// …
if wutu.route() == "/guide" {
    = guide.page("you");
} else {
    = home.page();
}
```

## Reactive views, identity, and concise expressions

Put `@reactive;` at the start of a root template. Event handlers may mutate
captured structs directly: Wutu batches a refresh into the next microtask.
Components called while rendering join that root. There is no proxy state or
virtual DOM; the compiler emits calls to a small shared DOM reconciler.
Every template goes through the reconciler, so a component behaves the same
wherever it is rendered: under an `@reactive` root it re-renders with the root
(and `bind:` keeps both sides in step); rendered anywhere else it renders once.
External callbacks (timers, network subscriptions) call `wutu.refresh()` after
changing state. A refresh visits connected roots; this is explicit whole-view
rendering, not dependency tracking or list virtualization.

**Unchanged components are reused.** A hole that calls a function,
`= tag(item.title);`, is skipped on a re-render when its arguments are the same
as last time: the element the call made then is put back without calling it.
The compiler allows this only when it cannot be wrong: every argument is a
scalar or a Str (compared by value), and the function, and everything it
calls, reads no global or mem, calls no host function or `@es` of its own, and
uses none of `wutu`'s effects (`route`, `refresh`, timers, cleanups, storage).
Pass a struct, or read the route inside, and the call runs every time, as
before. A component that takes plain values (a code block from its source, a
header from its title) costs nothing once rendered.

```utu
@wutu/\
@reactive;
main {
    label {
        "Search";
        input { bind:value = state.query; }
    }
    for state.items |item| key item.id {
        article {
            h2 { = item.title; }
            button {
                "Finish";
                on click { item.done = true; }
            }
        }
    }
}
\/;
```

`= expression;` inserts text, a number, or a component node. An attribute's
value is a string literal or any expression (`title = "Remove " + item.title;`).
`on click |e| { ... }` names the event and types it (`MouseEvent` here); without
`|e|` there is no event variable. `on submit` also prevents navigation. Native
form constraints still govern normal browser submission. `on click = handler;`
takes a closure value.

Keys are any scalar or Str (`key item.id`), unique per repeated template under a parent. Use a
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

- `bind:value = state.text;` binds strings on inputs, textareas, and selects (a
  select's value is set again once its options are in place, so an option
  added in the same render can be chosen).
- `bind:checked = state.enabled;` binds a checkbox boolean.
- `bind:number = state.amount;` binds an F64 through `valueAsNumber`. Invalid
  numeric edits do not overwrite the state with NaN, and an entry the input
  cannot parse is not overwritten; a value outside `min`, `max` or `step`
  still shows.
- `bind:group = state.size;` on radio inputs binds the checked radio's `value` (a Str).
- `bind:values = state.tags;` on a `select multiple` binds the chosen values (an `Array[Str]`).
- `bind:files = state.files;` on a file input reads its `?Browser.FileList` (read-only).

A binding and a custom handler for the same event compose in that order.
Unchanged property values are not rewritten, preserving the input caret.
Richer validation uses explicit events and browser properties.

```utu
using Browser from std:Browser;

struct Preferences:
    | name: Str
    | enabled: Bool

export main() void {
    let preferences = @stored/\
        Preferences "preferences-v1" Preferences { name: "", enabled: true }
    \/;
}
```

`@stored` generates native/JSON conversion and validates the full stored shape
before accepting it. Supported schemas are acyclic local structs containing
`Str`, `Bool`, `I32`, `F64`, and nested `Array[T]`. Arrays decode in linear time
with a preallocated native array. Invalid or unavailable storage returns the
defaults. Data is stored as `{"version":1,"data":…}`; `version` is the envelope's
format, not your schema's, so change the key when changing an incompatible schema. Imported/recursive/optional schema types and automatic
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
preserving foreign DSL payloads, strings and templates.
Commented template bodies are conservatively preserved. It changes only layout:
a file whose new layout would parse to a different tree, or that does not parse,
is left as it is (`format` says which), and an island whose layout would change
more than whitespace keeps its text. The VS Code extension
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
step. `wutu build` takes `utu build`'s modes: `-O small` (the default) and
`-O fast` keep the safety checks, `-O smallUnsafe` and `-O fastUnsafe` drop them. It builds
beside `--out` and moves its files in only once the build and prerender succeed: a failed build
leaves `--out` as it was, and other files there are kept. Playwright and the compiler are build tools; neither ships in the website.
The five-site build includes prerendered HTML in its 14.5 KB gzip per-site budget.


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

Install it with `@style theme.sheet();` before the Wutu root. Identical sheets
are installed once, including during hydration, and several `@style` lines
install in source order. Static (non-reactive) projects support `@style` too. The compiler preserves the raw
CSS payload: it has no property, selector, value, or at-rule allowlist. Browser
support still determines rendering. Local Wutu declarations remain available;
use a stylesheet envelope for arbitrary CSS grammar. **UTU: Show CSS Stencil**
opens a CSS document with non-CSS characters erased and original offsets retained.
This is an editor projection, not yet continuous CSS language-server forwarding.

DSL envelopes are balanced. Wutu can contain Utu expressions that contain Wutu
again; expansion continues across newly produced DSL nodes. Unclosed envelopes
and runaway expansion are errors. Strings in a payload are text, so a `/\` or
`\/` inside one neither opens nor closes an envelope.

## Scoped state, identity, and effects

`@island "unique-name";` creates an independently updating view. Its event handlers
update that view only. Its original factory and captured local state survive
parent renders. Use `wutu.invalidate("unique-name")` when another view changes its
shared state, and unique names for separate mounted instances. Analysis warns
(`unknown-island`) when an `invalidate` literal names no island in the program,
since a misspelling would otherwise refresh nothing. Replacement factory
arguments are not automatically treated as new props; mutate the shared model or
unmount and remount the island.

A loop may use `key global item.id` to preserve node identity across containers
within the same island. Ordinary `key` remains local to its parent. Duplicate keys
produce runtime diagnostics. Unkeyed loops receive positional identities.

`wutu.after_render(callback)` and `wutu.focus(id)` run after the update.
`wutu.on_cleanup(callback)` registers cleanup for the current view;
`wutu.interval(key, milliseconds, callback)` updates its owner after each tick;
one key runs one timer. Started during a render, it belongs to that render, like
`on_cleanup`: a render that does not start it again (its component left) stops it.
Started from `on mount` or an event handler, it belongs to that element: it stops
once the element is gone. Unmounting the view stops either.

```utu
p.clock {
    on mount { wutu.interval("tick", 1000.0, cl() void { s.seconds = s.seconds + 1; }); }
    = "Uptime " + s.seconds.to_str() + "s";
}
``` `wutu.route()`
reads the hash path, and hash/history changes refresh views. This is a small route
primitive, not a route table, network loader or authentication framework.

Optional `std:NumberField` keeps numeric draft text separate from validated
numbers. Arrays have a fixed length; a list that grows is an `Array[T]` in state,
replaced by `std:List[T]`'s `append` and `remove_at`, which return copies:

```utu
using List[Todo] |todos| from std:List;

button {
    on click { s.todos = todos.append(s.todos, Todo { text: s.draft, done: false }); }
    = "Add";
}
```

A closure is `cl(params) Type { … }`: `wutu.after_render(cl() void { s.ready = true; })`.
In a function body, a plain Utu `if`, `for` or `while` statement ends with `;`
(`if s.busy { return; };`); Wutu's own `if` and `for`, among elements, do not. `wutu.number`, `wutu.money` (integer USD cents: `-$1.23`), and `wutu.decimal` cover
simple display without shipping a formatting library.

The [two new five-site batches](wutu-round-two-review.md) exercise these APIs.
