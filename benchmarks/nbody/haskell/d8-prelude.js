// d8 prelude for the Haskell (GHC wasm32-wasi) N-body port. Set
// globalThis.PORT_DIR to the directory holding nbody.wasm, then load this
// file; it defines bench(iterations).
//
// The module is a WASI (preview 1) reactor built by GHC's WebAssembly backend:
// linear memory with GHC's own RTS and garbage collector compiled in. The shim
// below implements what the RTS needs: no args, no environment, no preopened
// directories, clocks from Date.now/performance.now, stdout/stderr to print().
// Anything else it imports returns ENOSYS. After instantiation the prelude
// calls _initialize (wasi-libc's constructors) and hs_init(0, 0) (starts the
// RTS) once; the bench export returns int64, which arrives as a BigInt.
(() => {
  const ESUCCESS = 0, EBADF = 8, ENOSYS = 52;
  let memory = null;
  const view = () => new DataView(memory.buffer);
  const zeroSizes = (countPtr, sizePtr) => {
    const dv = view();
    dv.setUint32(countPtr, 0, true);
    dv.setUint32(sizePtr, 0, true);
    return ESUCCESS;
  };
  const now = (id) => id === 0 ? BigInt(Date.now()) * 1000000n
                               : BigInt(Math.round(performance.now() * 1e6));
  const pending = { 1: '', 2: '' };
  const wasi = {
    args_get: () => ESUCCESS,
    args_sizes_get: zeroSizes,
    environ_get: () => ESUCCESS,
    environ_sizes_get: zeroSizes,
    clock_res_get(id, resPtr) {
      view().setBigUint64(resPtr, 1000n, true);
      return ESUCCESS;
    },
    clock_time_get(id, precision, timePtr) {
      view().setBigUint64(timePtr, now(id), true);
      return ESUCCESS;
    },
    fd_close: () => EBADF,
    fd_fdstat_get: () => EBADF,
    fd_prestat_get: () => EBADF, // ends the preopen scan
    fd_prestat_dir_name: () => EBADF,
    fd_read: () => EBADF,
    fd_seek: () => EBADF,
    fd_write(fd, iovs, iovsLen, nwrittenPtr) {
      if (fd !== 1 && fd !== 2) return EBADF;
      const dv = view();
      let written = 0, text = '';
      for (let i = 0; i < iovsLen; i++) {
        const ptr = dv.getUint32(iovs + i * 8, true);
        const len = dv.getUint32(iovs + i * 8 + 4, true);
        for (const b of new Uint8Array(memory.buffer, ptr, len)) text += String.fromCharCode(b);
        written += len;
      }
      const lines = (pending[fd] + text).split('\n');
      pending[fd] = lines.pop();
      for (const line of lines) (fd === 1 ? print : printErr)(line);
      dv.setUint32(nwrittenPtr, written, true);
      return ESUCCESS;
    },
    // The RTS polls only to sleep; nothing here sleeps, and a single-threaded
    // host could only return at once anyway: report every subscription fired.
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
    proc_exit(code) { throw new Error(`wasm proc_exit(${code})`); },
    random_get(ptr, len) {
      const bytes = new Uint8Array(memory.buffer, ptr, len);
      for (let i = 0; i < len; i++) bytes[i] = (Math.random() * 256) | 0;
      return ESUCCESS;
    },
    sched_yield: () => ESUCCESS,
  };
  const dir = globalThis.PORT_DIR ?? '.';
  const module = new WebAssembly.Module(readbuffer(`${dir}/nbody.wasm`));
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module === 'wasi_snapshot_preview1' && !(imp.name in wasi)) wasi[imp.name] = () => ENOSYS;
  }
  const instance = new WebAssembly.Instance(module, { wasi_snapshot_preview1: wasi });
  const { exports } = instance;
  memory = exports.memory;
  exports._initialize();
  exports.hs_init(0, 0);
  globalThis.bench = (iterations) => Number(exports.bench(iterations));
})();
