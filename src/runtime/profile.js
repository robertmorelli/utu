// src/runtime/profile.js — the sampling profiler for profile builds.
//
// A profile build (`utu run --profile`, selfhost/profile.utu) keeps a shadow
// stack of the utu functions running in a shared memory it exports,
// `utu_profile`: the stack pointer at byte 0, a count of pushes at 4, and
// from 8 a frame per 8 bytes (its id plus its own address, then the count
// when it was pushed). The program never stops: a worker spins on
// performance.now() and, every `interval` ms, copies the stack out. It
// reads the count first, then the frames top down: a frame pushed since
// (its count not older) was rewritten under it, and the sample is read
// again, or dropped.
//
// At an `await` the module calls `park` (the suspended frames, from where
// this stack began, are set aside and the pointer goes back) and, resumed,
// `resume` (they are put back on whatever stack it resumes on), so a
// suspended call never sits under what runs meanwhile. Each export entered
// from JavaScript begins a stack (`base`), and leaving it puts the pointer
// back, so a trap does not leave frames behind.
//
// Node and Bun run the worker from node:worker_threads; a browser needs
// SharedArrayBuffer, so a page served cross-origin isolated (COOP
// `same-origin`, COEP `require-corp`).
//
//   const profiler = createProfiler({ frames, interval: 0.25 });
//   const { exports } = await instantiate(wasm, spec, { profiler });
//   await profiler.start();
//   await exports.main();
//   const report = profileReport(await profiler.stop(), frames);
//   report.folded, report.speedscope, report.html

const HEADER = 8;

/**
 * A profiler for a profile build whose frames (by id: `{ name, file, line }`)
 * are `frames`, sampling every `interval` ms.
 */
export function createProfiler({ frames = [], interval = 0.25 } = {}) {
  let i32 = null;
  // Where the running stack's frames begin.
  let base = HEADER;
  let worker = null;
  let control = null;
  let done = null;
  // The count, bumped around a stack the host rewrites (the sampler reads it again).
  const bump = () => Atomics.add(i32, 1, 1);
  const imports = {
    // The frames from `base` up, as ids; the pointer back to `base`.
    park() {
      const top = Atomics.load(i32, 0);
      const ids = new Int32Array(Math.max(0, top - base) >> 3);
      for (let k = 0; k < ids.length; k++) ids[k] = i32[(base >> 2) + 2 * k] - (base + 8 * k);
      bump();
      Atomics.store(i32, 0, base);
      return ids;
    },
    // Parked frames back, where this stack is now; they begin it.
    resume(ids) {
      const at = Atomics.load(i32, 0);
      const count = bump() + 1;
      for (let k = 0; k < ids.length; k++) {
        i32[(at >> 2) + 2 * k] = at + 8 * k + ids[k];
        i32[(at >> 2) + 2 * k + 1] = count;
      }
      bump();
      Atomics.store(i32, 0, at + 8 * ids.length);
      base = at;
    },
  };
  // An export called from JavaScript: a stack of its own, its pointer put back after.
  const enter = f => Object.defineProperty(function (...args) {
    const outer = base;
    const at = Atomics.load(i32, 0);
    base = at;
    try {
      return f.apply(this, args);
    } finally {
      Atomics.store(i32, 0, at);
      base = outer;
    }
  }, 'length', { value: f.length });
  return {
    imports,
    frames,
    /** The instance's memory, and its exports (`utu_profile` left out) entered as above. */
    attach(instance, exports) {
      i32 = new Int32Array(instance.exports.utu_profile.buffer);
      const entered = {};
      for (const [name, value] of Object.entries(exports)) {
        if (name !== 'utu_profile') entered[name] = typeof value === 'function' ? enter(value) : value;
      }
      return entered;
    },
    /** The stack now, outermost first, by name (from the program's thread: a test's view). */
    stack() {
      const names = [];
      for (let at = HEADER; at < Atomics.load(i32, 0); at += 8) names.push(frames[i32[at >> 2] - at]?.name ?? '?');
      return names;
    },
    /** Start sampling; resolves once the sampler runs. */
    async start() {
      if (!i32) throw new Error('utu profile: attach the instance first');
      control = new Int32Array(new SharedArrayBuffer(4));
      const data = { memory: i32.buffer, control: control.buffer, interval, frames: frames.length };
      worker = await spawn(data);
      done = new Promise((resolve, reject) => {
        worker.on('message', message => message.ready || resolve(message));
        worker.on('error', reject);
      });
      await worker.ready;
    },
    /** Stop sampling: the samples (see the sampler) and how long it ran. */
    async stop() {
      // Never started (the instance trapped as it began): no samples.
      if (!worker) return { counts: [], runs: [], dropped: 0, total: 0, elapsed: 0, interval };
      Atomics.store(control, 0, 1);
      const result = await done;
      worker.terminate();
      return result;
    },
  };
}

/** The sampler's worker: node:worker_threads in Node and Bun, a Worker in a browser. */
async function spawn(data) {
  const source = `(${sampler})`;
  if (typeof process === 'object' && process.versions?.node) {
    const { Worker } = await import('node:worker_threads');
    const worker = new Worker(`const { parentPort, workerData } = require('node:worker_threads');
      ${source}(workerData, message => parentPort.postMessage(message));`, { eval: true, workerData: data });
    let ready;
    const handle = { on: (event, f) => worker.on(event, f), terminate: () => worker.terminate(), ready: new Promise(r => { ready = r; }) };
    worker.on('message', message => message.ready && ready());
    return handle;
  }
  if (typeof SharedArrayBuffer === 'undefined' || !globalThis.crossOriginIsolated) {
    throw new Error('utu profile: a browser needs SharedArrayBuffer: serve the page with COOP same-origin and COEP require-corp');
  }
  const url = URL.createObjectURL(new Blob([`onmessage = e => ${source}(e.data, m => postMessage(m));`], { type: 'text/javascript' }));
  const worker = new Worker(url);
  worker.postMessage(data);
  let ready;
  const listeners = [];
  worker.onmessage = e => { if (e.data.ready) ready(); else listeners.forEach(f => f(e.data)); };
  return {
    on: (event, f) => event === 'message' ? listeners.push(f) : worker.addEventListener(event, f),
    terminate: () => { worker.terminate(); URL.revokeObjectURL(url); },
    ready: new Promise(r => { ready = r; }),
  };
}

/**
 * The sampler, run in the worker (it is sent as source: nothing from outside
 * it). Until `control[0]` is set, every `interval` ms it reads the stack;
 * it posts each stack read (ids, outermost first, as a key) with how many
 * samples saw it, the runs of samples in time order, and how many it could
 * not read whole.
 */
function sampler({ memory, control, interval, frames }, post) {
  const i32 = new Int32Array(memory);
  const stop = new Int32Array(control);
  // A frame pushed in the last this many pushes was rewritten under the read.
  const RECENT = 1 << 20;
  const counts = new Map();
  const runs = [];
  let dropped = 0;
  let total = 0;
  const read = () => {
    for (let attempt = 0; attempt < 16; attempt++) {
      const count = Atomics.load(i32, 1);
      const top = Atomics.load(i32, 0);
      if (top <= 8) return '';
      const ids = [];
      let whole = true;
      for (let at = top - 8; at >= 8; at -= 8) {
        const pushed = Atomics.load(i32, (at >> 2) + 1);
        if (((pushed - count) >>> 0) < RECENT) { whole = false; break; }
        const id = Atomics.load(i32, at >> 2) - at;
        if (Atomics.load(i32, (at >> 2) + 1) !== pushed || id < 0 || id >= frames) { whole = false; break; }
        ids.push(id);
      }
      if (whole) return ids.reverse().join(',');
    }
    return null;
  };
  post({ ready: true });
  const started = performance.now();
  let next = started + interval;
  while (Atomics.load(stop, 0) === 0) {
    const now = performance.now();
    if (now < next) continue;
    next += interval;
    // Behind (the thread was descheduled): the next on time, the missed ones not made up.
    if (next < now) next = now + interval;
    const key = read();
    total++;
    if (key === null) { dropped++; continue; }
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const last = runs.at(-1);
    if (last && last[0] === key) last[1]++;
    else runs.push([key, 1]);
  }
  post({ counts: [...counts], runs, dropped, total, elapsed: performance.now() - started, interval });
}

// = Reports

/** Frame ids as names, the same name told apart by its place. */
function labels(frames) {
  const seen = new Map();
  for (const f of frames) seen.set(f.name, (seen.get(f.name) ?? new Set()).add(`${f.file}:${f.line}`));
  return frames.map(f => seen.get(f.name).size > 1 && f.line != null ? `${f.name} (${shortFile(f.file)}:${f.line})` : f.name);
}

const shortFile = file => String(file ?? '').split('/').at(-1);

const IDLE = '(idle)';

/**
 * What the samples say: `folded` stacks (`a;b;c N`, flamegraph.pl's and
 * speedscope's input), `speedscope` JSON, a self-contained flame graph
 * page (`html`), and `top`, each function's self and total samples.
 */
export function profileReport(samples, frames, { title = 'utu profile' } = {}) {
  const names = labels(frames);
  const stackOf = key => key === '' ? [IDLE] : key.split(',').map(id => names[+id]);
  const folded = samples.counts.map(([key, n]) => `${stackOf(key).join(';')} ${n}`).toSorted().join('\n') + '\n';
  // Self and total samples, by name.
  const top = new Map();
  for (const [key, n] of samples.counts) {
    const stack = stackOf(key);
    for (const name of new Set(stack)) {
      const row = top.get(name) ?? { name, self: 0, total: 0 };
      row.total += n;
      top.set(name, row);
    }
    top.get(stack.at(-1)).self += n;
  }
  const taken = samples.total - samples.dropped;
  return {
    folded,
    speedscope: speedscope(samples, frames, names, title),
    html: flameHtml(folded, title, samples),
    top: [...top.values()].toSorted((a, b) => b.self - a.self || b.total - a.total),
    samples: taken,
    dropped: samples.dropped,
    elapsed: samples.elapsed,
  };
}

/** speedscope's file format: one sampled profile, in time order, weighed in milliseconds. */
function speedscope(samples, frames, names, title) {
  const shared = frames.map((f, k) => ({ name: names[k], ...(f.file ? { file: f.file } : {}), ...(f.line ? { line: f.line } : {}) }));
  const idle = shared.length;
  shared.push({ name: IDLE });
  const stacks = [];
  const weights = [];
  for (const [key, n] of samples.runs) {
    stacks.push(key === '' ? [idle] : key.split(',').map(Number));
    weights.push(n * samples.interval);
  }
  const end = weights.reduce((a, b) => a + b, 0);
  return JSON.stringify({
    $schema: 'https://www.speedscope.app/file-format-schema.json',
    name: title, exporter: 'utu', activeProfileIndex: 0, shared: { frames: shared },
    profiles: [{ type: 'sampled', name: title, unit: 'milliseconds', startValue: 0, endValue: end, samples: stacks, weights }],
  });
}

/** A flame graph of folded stacks, as one page with no outside files: click a frame to zoom, hover for counts. */
function flameHtml(folded, title, samples) {
  const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const note = `${samples.total - samples.dropped} samples every ${samples.interval} ms over ${(samples.elapsed / 1000).toFixed(2)} s`
    + (samples.dropped ? `, ${samples.dropped} dropped` : '');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
:root { --bg: #fbfaf7; --fg: #1d1c1a; --dim: #6b6862; --line: #d9d5cc; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #1b1a18; --fg: #ece9e2; --dim: #9a968e; --line: #3a3833; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
h1 { font-size: 15px; margin: 0 0 4px; }
p { margin: 0 0 12px; color: var(--dim); }
#search { font: inherit; padding: 4px 6px; margin-bottom: 8px; width: min(320px, 100%); background: transparent; color: inherit; border: 1px solid var(--line); border-radius: 4px; }
#graph { position: relative; width: 100%; overflow: hidden; }
.f { position: absolute; height: 17px; box-sizing: border-box; border: 1px solid var(--bg); border-radius: 2px; overflow: hidden; white-space: nowrap; padding: 0 4px; font-size: 11px; line-height: 15px; cursor: pointer; color: #1d1c1a; }
.f.hit { outline: 2px solid #c03; outline-offset: -2px; }
#tip { position: fixed; pointer-events: none; background: var(--fg); color: var(--bg); padding: 4px 6px; border-radius: 4px; font-size: 12px; display: none; max-width: 70vw; }
</style></head><body>
<h1>${escape(title)}</h1>
<p>${escape(note)}. Click a frame to zoom, the bottom one to zoom out.</p>
<input id="search" placeholder="Highlight functions…" aria-label="Highlight functions">
<div id="graph"></div><div id="tip"></div>
<script>
const folded = ${JSON.stringify(folded).replace(/</g, '\\u003c')};
const root = { name: 'all', value: 0, kids: new Map() };
for (const line of folded.split('\\n')) {
  if (!line) continue;
  const cut = line.lastIndexOf(' ');
  const n = +line.slice(cut + 1);
  let node = root;
  root.value += n;
  for (const name of line.slice(0, cut).split(';')) {
    let kid = node.kids.get(name);
    if (!kid) node.kids.set(name, kid = { name, value: 0, kids: new Map(), up: node });
    kid.value += n;
    node = kid;
  }
}
const graph = document.getElementById('graph');
const tip = document.getElementById('tip');
const search = document.getElementById('search');
const H = 17;
let focus = root;
const hue = name => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return name === '(idle)' ? 'hsl(40 8% 75%)' : 'hsl(' + (10 + h % 40) + ' 75% ' + (62 + h % 14) + '%)'; };
function draw() {
  graph.textContent = '';
  const width = graph.clientWidth;
  let depth = 0;
  const chain = [];
  for (let n = focus; n; n = n.up) chain.unshift(n);
  const place = (node, x, w, level) => {
    if (w < 1) return;
    depth = Math.max(depth, level);
    const el = document.createElement('div');
    el.className = 'f';
    el.style.cssText = 'left:' + x + 'px;width:' + w + 'px;bottom:' + level * H + 'px;background:' + hue(node.name);
    if (w > 30) el.textContent = node.name;
    const q = search.value.trim().toLowerCase();
    if (q && node.name.toLowerCase().includes(q)) el.classList.add('hit');
    el.onclick = () => { focus = node === focus && node.up ? node.up : node; draw(); };
    el.onmousemove = e => {
      tip.style.display = 'block';
      tip.textContent = node.name + ' · ' + node.value + ' samples · ' + (100 * node.value / root.value).toFixed(1) + '%';
      tip.style.left = Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8) + 'px';
      tip.style.top = e.clientY + 14 + 'px';
    };
    el.onmouseleave = () => { tip.style.display = 'none'; };
    graph.appendChild(el);
    return el;
  };
  // The path to the focus, full width; then what is under it.
  chain.forEach((node, level) => place(node, 0, width, level));
  const under = (node, x, w, level) => {
    let at = x;
    for (const kid of [...node.kids.values()].sort((a, b) => a.name < b.name ? -1 : 1)) {
      const kw = w * kid.value / node.value;
      place(kid, at, kw, level);
      under(kid, at, kw, level + 1);
      at += kw;
    }
  };
  under(focus, 0, width, chain.length);
  graph.style.height = (depth + 1) * H + 'px';
}
search.oninput = draw;
addEventListener('resize', draw);
draw();
</script></body></html>
`;
}
