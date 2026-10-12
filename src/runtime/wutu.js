// Small DOM reconciler shared by compiled Wutu views. No virtual DOM or proxy state.
//
// Both functions below ship to the browser through Function.prototype.toString
// (see scripts/sync-wutu-runtime.mjs), so they must stay self-contained: no
// imports and no references to anything outside their own bodies.
//
// A view is a render callback plus the root element it produced. Rendering
// walks the template again; enter()/leave() bracket each element and reuse the
// element that had the same identity last time. Identity is the template site
// plus the active key stack, so keyed loops move existing nodes instead of
// recreating them.
export function createWutuRuntime() {
  const metadata = new WeakMap();   // element -> { attrs, view }
  const listeners = new WeakMap();  // element -> Map(event -> record)
  const views = new Set();          // WeakRef<view> for every mounted root
  const scopes = new Map();         // island name -> WeakRef<view>
  const dirty = new Set();
  const afterRender = [];
  const installedStyles = new Set();
  let frames = [], active = null, keys = [], scheduled = false, generation = 0;

  function style(css) {
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

  /** Identity of an element: its site, then keys pushed since the last global key. */
  function identityOf(site, key) {
    const lastGlobal = Math.max(0, keys.findLastIndex(k => k.global));
    const path = keys.slice(lastGlobal).map(k => `:${k.explicit ? 'k' : 'c'}${k.value.length}:${k.value}`).join('');
    return site + (key ? ':' + key : '') + path;
  }

  /** Make `parent`'s children exactly `wanted`, moving nodes and keeping focus. */
  function place(parent, wanted) {
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

  function claimIdentity(parent, identity) {
    const globallyKeyed = keys.some(k => k.global);
    if (globallyKeyed && active) {
      if (active.globalClaims.has(identity)) throw new Error('Duplicate global Wutu key: ' + identity);
      active.globalClaims.add(identity);
    }
    if (keys.some(k => k.explicit)) {
      if (parent?.keyed.has(identity)) throw new Error('Duplicate Wutu key: ' + keys.findLast(k => k.explicit).value);
      parent?.keyed.add(identity);
    }
  }

  /** The previous render's element for this identity, if one can be reused. */
  function reusable(parent, identity, tag) {
    const queue = parent?.byKey.get(identity);
    while (queue && queue.index < queue.nodes.length) {
      const candidate = queue.nodes[queue.index++];
      if (!parent.used.has(candidate) && candidate.localName === tag) return candidate;
    }
    if (keys.some(k => k.global)) return active?.globalNodes.get(identity);
    return undefined;
  }

  function enter(tag, svg, site, key) {
    const parent = frames.at(-1), identity = identityOf(site, key);
    claimIdentity(parent, identity);
    let node = reusable(parent, identity, tag);
    if (node) active?.retained.add(node);
    // A root reuses its own previous element, or adopts prerendered markup.
    if (!parent) node = active?.root ?? document.querySelector(`[data-wutu-root="${site}"][data-wutu-prerender]`);
    node?.removeAttribute('data-wutu-prerender');
    if (node?.hasAttribute('data-wutu-pending')) {
      node.disabled = false;
      node.removeAttribute('data-wutu-pending');
    }
    if (!node || node.localName !== tag) {
      node = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    }
    if (parent) { parent.used.add(node); parent.wanted.push(node); }
    node.setAttribute('data-wutu', identity);
    if (!parent) {
      node.setAttribute('data-wutu-root', site);
      if (active) active.root = node;
    }
    const oldAttrs = metadata.get(node)?.attrs
      ?? new Set([...node.attributes].map(a => a.name).filter(name => !name.startsWith('data-wutu')));
    const frame = {
      node,
      old: [...node.childNodes],
      used: new Set(),
      wanted: [],
      attrs: new Set(),
      oldAttrs,
      byKey: new Map(),
      keyed: new Set(),
    };
    for (const child of frame.old) {
      if (child.nodeType !== 1) continue;
      const childIdentity = child.getAttribute('data-wutu');
      let queue = frame.byKey.get(childIdentity);
      if (!queue) frame.byKey.set(childIdentity, queue = { nodes: [], index: 0 });
      queue.nodes.push(child);
    }
    frames.push(frame);
    return node;
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
    frames.at(-1).attrs.add(name);
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
   * saves stores and schedules the owning view.
   */
  function listen(node, event, handler) {
    let map = listeners.get(node);
    if (!map) listeners.set(node, map = new Map());
    let record = map.get(event);
    if (!record) {
      record = { handlers: [], generation: -1, view: active };
      map.set(event, record);
      node.addEventListener(event, e => {
        try {
          for (const current of [...record.handlers]) {
            const result = current(e);
            if (result?.then) result.then(refresh, error => { refresh(); setTimeout(() => { throw error; }); });
          }
        } finally {
          autoSave();
          if (record.view) schedule(record.view);
        }
      });
    }
    if (record.generation !== generation) {
      record.handlers = [];
      record.generation = generation;
    }
    record.handlers.push(handler);
    record.view = active;
  }

  function leave() {
    const frame = frames.pop();
    for (const name of frame.oldAttrs) if (!frame.attrs.has(name)) frame.node.removeAttribute(name);
    metadata.set(frame.node, { ...metadata.get(frame.node), attrs: frame.attrs });
    place(frame.node, frame.wanted);
    return frame.node;
  }

  function render(view) {
    const previous = [frames, active, keys], focused = document.activeElement;
    view.cleanupIndex = 0;
    view.cleanupCallbacks ??= [];
    view.removals = new Set();
    view.retained = new Set();
    view.globalNodes = new Map();
    view.globalClaims = new Set();
    for (const node of view.root?.querySelectorAll('[data-wutu]') ?? []) view.globalNodes.set(node.getAttribute('data-wutu'), node);
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
      view.globalNodes.clear();
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

  /** Run cleanups for views rooted at or below `node`. */
  function dispose(node) {
    const view = metadata.get(node)?.view;
    if (view) {
      for (const callback of [...view.cleanups.splice(0), ...view.cleanupCallbacks.splice(0)]) callback();
      if (view.scope) scopes.delete(view.scope);
    }
    for (const child of node.children ?? []) dispose(child);
  }

  addEventListener('hashchange', refresh);
  addEventListener('popstate', refresh);

  const api = {
    enter, append, attr, listen, leave, mount, refresh, invalidate, style,
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
    after(callback) { afterRender.push(callback); schedule(); },
    focus(id) { afterRender.push(() => document.getElementById(id)?.focus()); schedule(); },
    cleanup(callback) { if (active) active.cleanupCallbacks[active.cleanupIndex++] = callback; },
    pushGlobal: key => keys.push({ value: String(key), explicit: true, global: true }),
    pushKey: key => keys.push({ value: String(key), explicit: true }),
    pushCall: key => keys.push({ value: key, explicit: false }),
    popKey: () => keys.pop(),
  };
  return api;
}

// Installed only by typed persistence. DOM-only applications do not ship codecs
// or storage listeners merely because they use reactive templates.
//
// Writes are debounced and skipped when unchanged. A change from another tab is
// applied immediately unless this tab has unsaved edits; then the store is in
// conflict and stops writing until the user explicitly saves or reloads.
export function installWutuStorage(api) {
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
}
