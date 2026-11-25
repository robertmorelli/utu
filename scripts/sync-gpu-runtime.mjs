import fs from 'node:fs/promises';
import { createGpuRuntime } from '../src/runtime/gpu.js';

export async function syncGpuRuntime() {
  const source = `// Generated from src/runtime/gpu.js by the build. No runtime ships unless used.
mod gpu {
    fn init() Void {
        let install: fun() Void = @es/\\ () => { globalThis.__utuGpu ??= (${createGpuRuntime.toString()})(); } \\/;
        install();
    }
    fn begin() Externref {
        init();
        let f: fun() Externref = @es/\\ () => globalThis.__utuGpu.begin() \\/;
        return f();
    }
    fn upload(session: Externref, view: Externref, readback: Bool) I32 {
        let f: fun(Externref, Externref, Bool) I32 = @es/\\ (s, v, rb) => globalThis.__utuGpu.upload(s, v, rb) \\/;
        return f(session, view, readback);
    }
    fn alloc_out(session: Externref, byte_len: I32) I32 {
        let f: fun(Externref, I32) I32 = @es/\\ (s, n) => globalThis.__utuGpu.allocOut(s, n) \\/;
        return f(session, byte_len);
    }
    fn alloc_scratch(session: Externref, byte_len: I32) I32 {
        let f: fun(Externref, I32) I32 = @es/\\ (s, n) => globalThis.__utuGpu.allocScratch(s, n) \\/;
        return f(session, byte_len);
    }
    fn bind(session: Externref, buf_id: I32) Void {
        let f: fun(Externref, I32) Void = @es/\\ (s, id) => { globalThis.__utuGpu.bind(s, id); } \\/;
        f(session, buf_id);
    }
    fn dispatch(session: Externref, wgsl: Str, entry: Str, wg_x: I32, wg_y: I32, wg_z: I32, gx: U32, gy: U32, gz: U32, uni_view: Externref) Void {
        let f: fun(Externref, Str, Str, I32, I32, I32, U32, U32, U32, Externref) Void = @es/\\ (s, wgsl, entry, wx, wy, wz, gx, gy, gz, u) => { globalThis.__utuGpu.dispatch(s, wgsl, entry, wx, wy, wz, gx, gy, gz, u); } \\/;
        f(session, wgsl, entry, wg_x, wg_y, wg_z, gx, gy, gz, uni_view);
    }
    fn copy_readback(session: Externref, buf_id: I32, view: Externref) Void {
        let f: fun(Externref, I32, Externref) Void = @es/\\ (s, id, v) => { globalThis.__utuGpu.copyReadback(s, id, v); } \\/;
        f(session, buf_id, view);
    }
    fn submit(session: Externref, on_readback: cl() Void) Promise[Void] {
        let f: fun(Externref, cl() Void) Promise[Void] = @es/\\ (s, cb) => globalThis.__utuGpu.submit(s, cb) \\/;
        return f(session, on_readback);
    }
}
`;
  await fs.writeFile(new URL('../std/Gpu.utu', import.meta.url), source);
}
