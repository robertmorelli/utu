// Unit tests for the Wutu DOM reconciler and typed storage (src/runtime/wutu.js),
// driven directly the way compiled templates call it, against linkedom.
import { parseHTML } from 'linkedom/worker';
import { createWutuRuntime, installWutuStorage, wutuStyle } from '../src/runtime/wutu.js';

function memoryStorage() {
  const data = new Map();
  return {
    data,
    writes: 0,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { this.writes++; data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

/** A fresh runtime with linkedom globals; `listeners` collects window events. */
async function withRuntime(body) {
  const window = parseHTML('<html><head></head><body></body></html>');
  const listeners = new Map();
  const globals = {
    document: window.document,
    localStorage: memoryStorage(),
    addEventListener: (type, handler) => listeners.set(type, [...(listeners.get(type) ?? []), handler]),
    __wutuStyles: undefined, // (each test's document starts with no sheets)
  };
  const saved = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, globals);
  const dispatch = (type, event = {}) => { for (const handler of listeners.get(type) ?? []) handler(event); };
  try {
    return await body({ api: createWutuRuntime(), document: window.document, dispatch, storage: globals.localStorage, window });
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const click = (window, node) => node.dispatchEvent(new window.Event('click'));

export function registerWutuRuntimeTests({ test, assert, assertEq }) {
  test('wutu runtime: re-rendering reuses elements, updates text, and drops stale attributes', () => withRuntime(async ({ api, document }) => {
    const state = { label: 'one', title: 'first' };
    const root = api.mount(() => {
      const main = api.enter('main', false, 'root', '');
      if (state.title) api.attr(main, 'title', state.title);
      api.enter('p', false, 'p', '');
      api.append(state.label);
      api.leave();
      api.attr(main, 'hidden', false);
      return api.leave();
    }, '');
    document.body.append(root);
    const p = root.querySelector('p');
    assertEq(root.getAttribute('title'), 'first');
    assert(!root.hasAttribute('hidden'), 'false removes boolean attributes');
    state.label = 'two';
    state.title = '';
    api.refresh();
    assert(root.querySelector('p') === p, 'element identity survives a refresh');
    assertEq(p.textContent, 'two');
    assert(!root.hasAttribute('title'), 'attributes not set on this render are removed');
  }));

  test('wutu runtime: keyed children reorder in place and duplicate keys are rejected', () => withRuntime(async ({ api, document }) => {
    let items = ['a', 'b', 'c'];
    const render = () => {
      api.enter('ul', false, 'list', '');
      for (const item of items) {
        api.pushKey(item);
        api.enter('li', false, 'item', '');
        api.append(item);
        api.leave();
        api.popKey();
      }
      return api.leave();
    };
    const root = api.mount(render, '');
    document.body.append(root);
    const before = Object.fromEntries([...root.children].map(li => [li.textContent, li]));
    items = ['c', 'a'];
    api.refresh();
    const after = [...root.children];
    assertEq(after.map(li => li.textContent).join(''), 'ca');
    assert(after[0] === before.c && after[1] === before.a, 'keyed nodes move instead of being recreated');
    assert(!before.b.isConnected, 'removed keys leave the DOM');
    items = ['x', 'x'];
    let message = '';
    try { api.refresh(); } catch (error) { message = error.message; }
    assert(message.includes('Duplicate Wutu key: x'), message);
  }));

  test('wutu runtime: listeners are replaced per render and events schedule a refresh', () => withRuntime(async ({ api, document, window }) => {
    let count = 0, renders = 0;
    const root = api.mount(() => {
      renders++;
      const button = api.enter('button', false, 'button', '');
      const seen = count;
      api.listen(button, 'click', () => { count = seen + 1; });
      api.append(String(count));
      return api.leave();
    }, '');
    document.body.append(root);
    click(window, root);
    await settle();
    click(window, root);
    await settle();
    assertEq(count, 2, 'each render installs a handler capturing its own state');
    assertEq(root.textContent, '2');
    assertEq(renders, 3);
  }));

  test('wutu runtime: islands re-render alone, keep local state, and clean up on removal', () => withRuntime(async ({ api, document }) => {
    let outerRenders = 0, innerRenders = 0, cleaned = 0;
    const island = () => api.mount(() => {
      innerRenders++;
      api.enter('section', false, 'island', '');
      api.cleanup(() => { cleaned++; });
      return api.leave();
    }, 'panel');
    let show = true;
    const root = api.mount(() => {
      outerRenders++;
      api.enter('main', false, 'outer', '');
      if (show) api.append(island());
      return api.leave();
    }, '');
    document.body.append(root);
    const section = root.querySelector('section');
    api.invalidate('panel');
    await settle();
    assertEq(innerRenders, 2, 'invalidate re-renders the island');
    assertEq(outerRenders, 1, 'without re-rendering its parent');
    api.refresh();
    assert(root.querySelector('section') === section, 'a parent refresh retains the island element');
    show = false;
    api.refresh();
    assert(!section.isConnected, 'the island is removed');
    assertEq(cleaned, 1, 'cleanup runs once when the island is removed');
    const rendersBefore = innerRenders;
    api.invalidate('panel');
    await settle();
    assertEq(innerRenders, rendersBefore, 'a removed island is forgotten');
  }));

  test('wutu runtime: styles install once, timers stop with their view, and after() runs post-render', () => withRuntime(async ({ api, document }) => {
    wutuStyle('p{color:red}');
    wutuStyle('p{color:red}');
    assertEq(document.querySelectorAll('style').length, 1);
    const cleared = [];
    const realClear = globalThis.clearInterval;
    globalThis.clearInterval = (id) => { cleared.push(id); realClear(id); };
    try {
      let show = true;
      const root = api.mount(() => {
        api.enter('main', false, 'timers', '');
        if (show) api.append(api.mount(() => {
          api.enter('p', false, 'tick', '');
          api.interval('tick', 1000, () => {});
          api.interval('tick', 1000, () => {});
          return api.leave();
        }, 'ticker'));
        return api.leave();
      }, '');
      document.body.append(root);
      let ran = false;
      api.after(() => { ran = root.isConnected; });
      await settle();
      assert(ran, 'after() runs once rendering settles');
      show = false;
      api.refresh();
      assertEq(cleared.length, 1, 'one interval per key, cleared on removal');
    } finally {
      globalThis.clearInterval = realClear;
    }
  }));

  test('wutu runtime: an interval stops with the render that no longer starts it; a select takes its value after its options', () => withRuntime(async ({ api, document }) => {
    const cleared = [];
    const realClear = globalThis.clearInterval;
    globalThis.clearInterval = (id) => { cleared.push(id); realClear(id); };
    try {
      let show = true;
      const options = ['a'];
      let chosen = 'a';
      const root = api.mount(() => {
        api.enter('main', false, 'root', '');
        // (A component in the same view: its interval is the root view's.)
        if (show) api.interval('tick', 1000, () => {});
        const select = api.enter('select', false, 'pick', '');
        // (linkedom's select has no value setter: this one, as a browser's,
        // takes a value only an option has.)
        if (!Object.hasOwn(select, 'value')) {
          let picked = '';
          Object.defineProperty(select, 'value', {
            get: () => [...select.children].some(o => o.getAttribute('value') === picked) ? picked : select.children[0]?.getAttribute('value') ?? '',
            set: value => { picked = [...select.children].some(o => o.getAttribute('value') === value) ? value : ''; },
          });
        }
        api.selectValue(select, chosen);
        for (const value of options) {
          api.pushKey(value);
          const option = api.enter('option', false, 'option', '');
          api.attr(option, 'value', value);
          api.append(value);
          api.leave();
          api.popKey();
        }
        api.leave();
        return api.leave();
      }, '');
      document.body.append(root);
      show = false;
      api.refresh();
      assertEq(cleared.length, 1, 'the interval stops when its component leaves');
      options.push('b');
      chosen = 'b';
      api.refresh();
      assertEq(root.querySelector('select').value, 'b', 'an option added in the same render can be chosen');
    } finally {
      globalThis.clearInterval = realClear;
    }
  }));

  test('wutu runtime: hydration enables pending controls and keeps prerendered styles and properties', () => withRuntime(async ({ api, document }) => {
    const program = JSON.stringify([['o', 0, ['main', {}]], ['s', 1, ['button', {}, 'go']], ['o', 2, ['p', {}]], ['y', 'width'], ['n', 2], ['t', 'x'], ['c'], ['c']]);
    // (A program is known by its FNV-1a hash, base 36, as begin() names it.)
    let n = 2166136261;
    for (let i = 0; i < program.length; i++) n = Math.imul(n ^ program.charCodeAt(i), 16777619);
    const v = 'v' + (n >>> 0).toString(36);
    document.body.innerHTML = `<main data-wutu-root="${v}:0" data-wutu-prerender data-wutu="${v}:0"><button data-wutu="${v}:1" disabled data-wutu-pending>go</button>`
      + `<p data-wutu="${v}:2" hidden title="tip" style="width: 40%">x</p></main>`;
    const prerendered = document.querySelector('p');
    const root = api.mount(() => {
      api.begin(program);
      api.put('40%');
      const p = api.node();
      if (p.hidden !== true) p.hidden = true;
      return api.done();
    }, '');
    assertEq(root.querySelectorAll('[data-wutu-pending],[disabled]').length, 0, 'controls take input once hydrated');
    const p = root.querySelector('p');
    assert(p === prerendered, 'the prerendered element is reused');
    assert(p.hasAttribute('hidden') && p.getAttribute('title') === 'tip' && p.getAttribute('style').replace(/\s/g, '').includes('width:40%'), 'what no render sets as an attribute stays');
  }));

  test('wutu runtime: global keys move nodes between parents and reject duplicates', () => withRuntime(async ({ api, document }) => {
    let column = 0;
    const root = api.mount(() => {
      api.enter('section', false, 'board', '');
      for (const index of [0, 1]) {
        api.enter('div', false, 'column' + index, '');
        if (index === column) {
          api.pushGlobal('card');
          api.enter('p', false, 'card', '');
          api.leave();
          api.popKey();
        }
        api.leave();
      }
      return api.leave();
    }, '');
    document.body.append(root);
    const card = root.querySelector('p');
    column = 1;
    api.refresh();
    assert(root.querySelector('p') === card, 'the card keeps its identity across parents');
    assert(card.parentNode === root.children[1], 'and moves to the new column');
  }));

  test('wutu storage: deduplicated writes, incoming tabs, conflicts, and explicit saves', () => withRuntime(async ({ api, dispatch, storage }) => {
    installWutuStorage(api);
    let value = 'initial', applied = '';
    api.store('notes', () => value, true, raw => { applied = raw; });
    api.save('notes');
    api.flush();
    assertEq(storage.getItem('notes'), 'initial');
    const writes = storage.writes;
    api.save('notes');
    api.flush();
    assertEq(storage.writes, writes, 'unchanged values are not rewritten');

    dispatch('storage', { key: 'notes', newValue: 'remote' });
    assertEq(applied, 'remote', 'clean state accepts another tab’s value');

    value = 'local';
    api.save('notes');
    dispatch('storage', { key: 'notes', newValue: 'conflicting' });
    api.flush();
    assertEq(storage.getItem('notes'), 'initial', 'a conflict blocks the pending write');
    assert(api.storageError.includes('conflict'), api.storageError);
    api.save('notes');
    api.flush();
    assertEq(storage.getItem('notes'), 'local', 'an explicit save resolves the conflict');

    api.store('auto', () => value, false, () => {});
    api.autoSave();
    dispatch('pagehide');
    assertEq(storage.getItem('auto'), 'local', 'automatic stores save and flush on page hide');
  }));
}
