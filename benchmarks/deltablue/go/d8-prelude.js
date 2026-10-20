// d8 prelude for the Go (GOOS=wasip1, -buildmode=c-shared) DeltaBlue port.
// Set globalThis.PORT_DIR to the directory holding deltablue.wasm, load this
// file, then call chain(iterations) / projection(iterations).
//
// The module is a WASI reactor: Go's runtime imports a handful of
// wasi_snapshot_preview1 functions, provided here by a minimal shim, and
// _initialize must run once before any export is called.
(() => {
  const dir = globalThis.PORT_DIR ?? '.';
  const module = new WebAssembly.Module(readbuffer(`${dir}/deltablue.wasm`));
  let memory;
  const view = () => new DataView(memory.buffer);
  const ESUCCESS = 0, EBADF = 8, ENOSYS = 52;

  class ProcExit extends Error {
    constructor(code) { super(`proc_exit(${code})`); this.code = code; }
  }

  const wasi = {
    args_sizes_get(argcPtr, bufSizePtr) {
      view().setUint32(argcPtr, 0, true);
      view().setUint32(bufSizePtr, 0, true);
      return ESUCCESS;
    },
    args_get() { return ESUCCESS; },
    environ_sizes_get(countPtr, bufSizePtr) {
      view().setUint32(countPtr, 0, true);
      view().setUint32(bufSizePtr, 0, true);
      return ESUCCESS;
    },
    environ_get() { return ESUCCESS; },
    clock_time_get(id, precision, timePtr) {
      // id 0 is realtime (Date.now), anything else is monotonic (performance.now).
      const ns = id === 0 ? BigInt(Date.now()) * 1000000n
                          : BigInt(Math.round(performance.now() * 1e6));
      view().setBigUint64(timePtr, ns, true);
      return ESUCCESS;
    },
    random_get(ptr, len) {
      const bytes = new Uint8Array(memory.buffer, ptr, len);
      for (let i = 0; i < len; i++) bytes[i] = (Math.random() * 256) | 0;
      return ESUCCESS;
    },
    fd_write(fd, iovs, iovsLen, nwrittenPtr) {
      if (fd !== 1 && fd !== 2) return EBADF;
      const dv = view();
      let text = '', written = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = dv.getUint32(iovs + i * 8, true);
        const len = dv.getUint32(iovs + i * 8 + 4, true);
        text += String.fromCharCode(...new Uint8Array(memory.buffer, ptr, len)); // d8 has no TextDecoder; output is ASCII
        written += len;
      }
      (fd === 1 ? print : printErr)(text.replace(/\n$/, ''));
      dv.setUint32(nwrittenPtr, written, true);
      return ESUCCESS;
    },
    // Go only polls to sleep; nothing in this program sleeps, and a
    // single-threaded host could only return at once anyway: report every
    // subscription as fired.
    poll_oneoff(inPtr, outPtr, nsubs, neventsPtr) {
      const dv = view();
      for (let i = 0; i < nsubs; i++) {
        const sub = inPtr + i * 48, ev = outPtr + i * 32;
        dv.setBigUint64(ev, dv.getBigUint64(sub, true), true); // userdata
        dv.setUint16(ev + 8, ESUCCESS, true);                  // error
        dv.setUint8(ev + 10, dv.getUint8(sub + 8));            // type
      }
      dv.setUint32(neventsPtr, nsubs, true);
      return ESUCCESS;
    },
    sched_yield() { return ESUCCESS; },
    proc_exit(code) { throw new ProcExit(code); },
  };
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module === 'wasi_snapshot_preview1' && !(imp.name in wasi)) {
      wasi[imp.name] = () => ENOSYS;
    }
  }

  const instance = new WebAssembly.Instance(module, { wasi_snapshot_preview1: wasi });
  memory = instance.exports.memory;
  instance.exports._initialize();
  const { bench_chain, bench_projection } = instance.exports;
  // The exports return int64, which arrives as a BigInt.
  globalThis.chain = (iterations) => Number(bench_chain(iterations));
  globalThis.projection = (iterations) => Number(bench_projection(iterations));
})();
