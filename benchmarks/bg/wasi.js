// The JavaScript a WASI (preview 1) reactor needs to run: Go (GOOS=wasip1),
// Swift (the Swift SDK for WebAssembly), Haskell (GHC's wasm backend), and C or
// C++ when its module imports WASI. scripts/benchmark-bg.mjs loads it into d8
// and counts it (minified) in those ports' sizes, so it is the shim, nothing more.
//
// instantiateWasi(bytes) instantiates the module (no args, no environment, no
// preopened directories; stdout/stderr to print), runs _initialize and then
// hs_init (GHC's RTS) when the module has them, and returns its exports.
// Imports a module has beyond the ones below answer ENOSYS.
globalThis.instantiateWasi = bytes => {
  const OK = 0, EBADF = 8, ENOSYS = 52;
  let memory;
  const view = () => new DataView(memory.buffer);
  const sizes = (count, size) => { view().setUint32(count, 0, true); view().setUint32(size, 0, true); return OK; };
  const pending = { 1: '', 2: '' };
  const wasi = {
    args_get: () => OK,
    args_sizes_get: sizes,
    environ_get: () => OK,
    environ_sizes_get: sizes,
    clock_res_get(id, out) { view().setBigUint64(out, 1000n, true); return OK; },
    clock_time_get(id, precision, out) {
      view().setBigUint64(out, id === 0 ? BigInt(Date.now()) * 1000000n : BigInt(Math.round(performance.now() * 1e6)), true);
      return OK;
    },
    fd_close: () => EBADF,
    fd_fdstat_get: () => EBADF,
    fd_fdstat_set_flags: () => EBADF,
    fd_prestat_get: () => EBADF, // ends the preopen scan
    fd_prestat_dir_name: () => EBADF,
    fd_read: () => EBADF,
    fd_seek: () => EBADF,
    fd_write(fd, iovs, count, written) {
      if (fd !== 1 && fd !== 2) return EBADF;
      const dv = view();
      let text = '', total = 0;
      for (let i = 0; i < count; i++) {
        const ptr = dv.getUint32(iovs + i * 8, true), len = dv.getUint32(iovs + i * 8 + 4, true);
        for (const b of new Uint8Array(memory.buffer, ptr, len)) text += String.fromCharCode(b);
        total += len;
      }
      const lines = (pending[fd] + text).split('\n');
      pending[fd] = lines.pop();
      for (const line of lines) (fd === 1 ? print : printErr)(line);
      dv.setUint32(written, total, true);
      return OK;
    },
    // Runtimes poll only to sleep; a single-threaded host can only return at once.
    poll_oneoff(subs, events, count, out) {
      const dv = view();
      for (let i = 0; i < count; i++) {
        const sub = subs + i * 48, ev = events + i * 32;
        dv.setBigUint64(ev, dv.getBigUint64(sub, true), true);
        dv.setUint16(ev + 8, OK, true);
        dv.setUint8(ev + 10, dv.getUint8(sub + 8));
      }
      dv.setUint32(out, count, true);
      return OK;
    },
    proc_exit(code) { throw new Error(`proc_exit(${code})`); },
    random_get(ptr, len) {
      const bytes = new Uint8Array(memory.buffer, ptr, len);
      for (let i = 0; i < len; i++) bytes[i] = (Math.random() * 256) | 0;
      return OK;
    },
    sched_yield: () => OK,
  };
  const module = new WebAssembly.Module(bytes);
  const imports = { wasi_snapshot_preview1: wasi, env: { emscripten_notify_memory_growth() {} } }; // Emscripten tells the host its memory grew; nothing to do
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.kind !== 'function') continue;
    const into = imports[imp.module] ??= {};
    if (!(imp.name in into)) into[imp.name] = () => { if (imp.module === 'wasi_snapshot_preview1') return ENOSYS; throw new Error(`${imp.module}.${imp.name} called`); };
  }
  const { exports } = new WebAssembly.Instance(module, imports);
  memory = exports.memory;
  exports._initialize?.();
  exports.hs_init?.(0, 0);
  return exports;
};
