// d8 prelude for the Swift DeltaBlue port. Set globalThis.PORT_DIR to the
// directory holding DeltaBlue.wasm, then load this file; it defines
// chain(iterations) and projection(iterations).
//
// The module is a WASI (preview 1) reactor built by the swift.org Swift SDK
// for WebAssembly. The shim below implements just what it imports: no args,
// no environment, no preopened directories, stdout/stderr go to print().
(() => {
  const ERRNO_SUCCESS = 0, ERRNO_BADF = 8, ERRNO_NOSYS = 52;
  let memory = null;
  const view = () => new DataView(memory.buffer);
  const zeroSizes = (countPtr, sizePtr) => {
    const dv = view();
    dv.setUint32(countPtr, 0, true);
    dv.setUint32(sizePtr, 0, true);
    return ERRNO_SUCCESS;
  };
  const pending = { 1: '', 2: '' };
  const wasi = {
    args_get: () => ERRNO_SUCCESS,
    args_sizes_get: zeroSizes,
    environ_get: () => ERRNO_SUCCESS,
    environ_sizes_get: zeroSizes,
    fd_close: () => ERRNO_BADF,
    fd_fdstat_get: () => ERRNO_BADF,
    fd_prestat_get: () => ERRNO_BADF, // ends the preopen scan
    fd_prestat_dir_name: () => ERRNO_BADF,
    fd_read: () => ERRNO_BADF,
    fd_seek: () => ERRNO_BADF,
    path_open: () => ERRNO_NOSYS,
    fd_write(fd, iovs, iovsLen, nwrittenPtr) {
      if (fd !== 1 && fd !== 2) return ERRNO_BADF;
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
      for (const line of lines) print(line);
      dv.setUint32(nwrittenPtr, written, true);
      return ERRNO_SUCCESS;
    },
    proc_exit(code) { throw new Error(`wasm proc_exit(${code})`); },
    random_get(ptr, len) {
      const bytes = new Uint8Array(memory.buffer, ptr, len);
      for (let i = 0; i < len; i++) bytes[i] = (Math.random() * 256) | 0;
      return ERRNO_SUCCESS;
    },
  };
  const dir = globalThis.PORT_DIR ?? '.';
  const module = new WebAssembly.Module(readbuffer(`${dir}/DeltaBlue.wasm`));
  const instance = new WebAssembly.Instance(module, { wasi_snapshot_preview1: wasi });
  memory = instance.exports.memory;
  instance.exports._initialize();
  const { bench_chain, bench_projection } = instance.exports;
  globalThis.chain = (iterations) => bench_chain(iterations);
  globalThis.projection = (iterations) => bench_projection(iterations);
})();
