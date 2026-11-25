// WebGPU compute (`gp` functions + `pipeline` constructs) tests:
// parsing, typechecking, negative diagnostics, WGSL emission, and end-to-end
// linearize -> mem -> mock WebGPU dispatch -> mem -> delinearize execution.
import { compileAndInstantiate, withTempUtu } from './test-harness.mjs';

async function errorsOf(compiler, ROOT, source) {
  return withTempUtu(ROOT, 'gpu_errors_check.utu', source, async (file) => {
    let diagnostics;
    try {
      diagnostics = (await compiler.analyzeFile(file)).artifacts.diagnostics;
    } catch (error) {
      diagnostics = error.artifacts?.diagnostics ?? [error.diagnostic];
    }
    return diagnostics.filter(d => d.severity !== 'warning');
  });
}

/**
 * Create a mock navigator.gpu that records all shaders, buffers, usages,
 * command encoders, dispatches, submits, and readbacks, and optionally runs
 * a custom JS compute handler per dispatch so we can verify end-to-end
 * linearize -> WebGPU -> delinearize data flow in Node/Bun!
 */
function createMockWebGPU(onDispatch = null) {
  const U_MAP_READ = 0x0001;
  const U_COPY_SRC = 0x0004;
  const U_COPY_DST = 0x0008;
  const U_UNIFORM = 0x0040;
  const U_STORAGE = 0x0080;

  const log = {
    shaders: [],
    pipelines: [],
    buffers: [],
    writes: [],
    encoders: 0,
    submits: 0,
    dispatches: [],
    copies: [],
    maps: [],
  };

  const device = {
    createShaderModule({ code }) {
      log.shaders.push(code);
      return { code };
    },
    createComputePipeline({ compute }) {
      const p = {
        module: compute.module,
        entryPoint: compute.entryPoint,
        getBindGroupLayout: () => ({}),
      };
      log.pipelines.push(p);
      return p;
    },
    createBuffer({ size, usage }) {
      const buf = {
        id: log.buffers.length,
        size,
        usage,
        bytes: new Uint8Array(size),
        destroyed: false,
        mapped: false,
        async mapAsync(mode) {
          log.maps.push({ bufId: buf.id, mode, size });
          buf.mapped = true;
        },
        getMappedRange(offset = 0, length = buf.size - offset) {
          return buf.bytes.buffer.slice(offset, offset + length);
        },
        unmap() {
          buf.mapped = false;
        },
        destroy() {
          buf.destroyed = true;
        },
      };
      log.buffers.push(buf);
      return buf;
    },
    createBindGroup({ entries }) {
      return { entries };
    },
    createCommandEncoder() {
      log.encoders += 1;
      const cmds = [];
      return {
        beginComputePass() {
          let curPipeline = null;
          let curBindGroup = null;
          return {
            setPipeline(p) { curPipeline = p; },
            setBindGroup(idx, bg) { curBindGroup = bg; },
            dispatchWorkgroups(wx, wy = 1, wz = 1) {
              cmds.push({ type: 'dispatch', pipeline: curPipeline, bindGroup: curBindGroup, wx, wy, wz });
            },
            end() {},
          };
        },
        copyBufferToBuffer(src, srcOff, dst, dstOff, size) {
          cmds.push({ type: 'copy', src, srcOff, dst, dstOff, size });
        },
        finish() {
          return { cmds };
        },
      };
    },
    queue: {
      writeBuffer(buf, offset, data, dataOff = 0, size = undefined) {
        const src = data instanceof ArrayBuffer
          ? new Uint8Array(data, dataOff, size ?? (data.byteLength - dataOff))
          : new Uint8Array(data.buffer, data.byteOffset + dataOff, size ?? (data.byteLength - dataOff));
        buf.bytes.set(src, offset);
        log.writes.push({ bufId: buf.id, offset, byteLength: src.byteLength });
      },
      submit(commandBuffers) {
        log.submits += 1;
        for (const cb of commandBuffers) {
          for (const cmd of cb.cmds) {
            if (cmd.type === 'dispatch') {
              const bufs = cmd.bindGroup.entries.map(e => e.resource.buffer);
              const entry = cmd.pipeline.entryPoint;
              const code = cmd.pipeline.module.code;
              log.dispatches.push({ entry, code, wx: cmd.wx, wy: cmd.wy, wz: cmd.wz, bufs });
              if (onDispatch) onDispatch({ entry, code, wx: cmd.wx, wy: cmd.wy, wz: cmd.wz, bufs });
            } else if (cmd.type === 'copy') {
              cmd.dst.bytes.set(cmd.src.bytes.subarray(cmd.srcOff, cmd.srcOff + cmd.size), cmd.dstOff);
              log.copies.push({ srcId: cmd.src.id, dstId: cmd.dst.id, size: cmd.size });
            }
          }
        }
      },
    },
  };

  const gpu = {
    async requestAdapter() {
      return {
        async requestDevice() { return device; },
      };
    },
  };

  return { gpu, log, U_MAP_READ, U_COPY_SRC, U_COPY_DST, U_UNIFORM, U_STORAGE };
}

async function withMockWebGPU(mock, fn) {
  const prevNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const prevGpuRuntime = globalThis.__utuGpu;
  delete globalThis.__utuGpu;
  Object.defineProperty(globalThis, 'navigator', {
    value: { gpu: mock.gpu },
    configurable: true,
    writable: true,
  });
  try {
    return await fn();
  } finally {
    delete globalThis.__utuGpu;
    if (prevGpuRuntime !== undefined) globalThis.__utuGpu = prevGpuRuntime;
    if (prevNav) Object.defineProperty(globalThis, 'navigator', prevNav);
    else delete globalThis.navigator;
  }
}

export function registerGpuTests({ test, assert, assertEq, assertNoErrors, makeCompiler }) {
  // ── 1. Negative diagnostics ────────────────────────────────────────────────

  test('gpu: writing to ro buffer is a compile error', async ({ compiler, ROOT }) => {
    const errs = await errorsOf(compiler, ROOT, `
gp bad |i| (ro xs: Array[F32]) {
    xs[i] = 1.0
}
`);
    assert(errs.length >= 1, 'expected error writing to ro buffer');
    assert(errs.some(e => e.message.includes('read-only') || e.message.includes('ro')), `unexpected error: ${errs.map(e => e.message).join('; ')}`);
  });

  test('gpu: writing to uniform or grid index is a compile error', async ({ compiler, ROOT }) => {
    const errs = await errorsOf(compiler, ROOT, `
gp bad |i| (rw xs: Array[F32], uniform dt: F32) {
    dt = 2.0
    i = 0
}
`);
    assert(errs.length >= 2, `expected 2 errors, got ${errs.length}: ${errs.map(e => e.message).join('; ')}`);
  });

  test('gpu: passing ro buffer to rw/out parameter in pipeline is a compile error', async ({ compiler, ROOT }) => {
    const errs = await errorsOf(compiler, ROOT, `
gp mutate |i| (rw xs: Array[F32]) {
    xs[i] = xs[i] + 1.0
}
pipeline bad_pipe(ro xs: Array[F32]) Promise[Void] {
    mutate(xs)
}
`);
    assert(errs.length >= 1, 'expected error passing ro buffer to rw param');
    assert(errs.some(e => e.message.includes('read-only') || e.message.includes('ro')), `unexpected: ${errs.map(e => e.message).join('; ')}`);
  });

  test('gpu: aliasing rw/out buffer in one dispatch is a compile error', async ({ compiler, ROOT }) => {
    const errs = await errorsOf(compiler, ROOT, `
gp copy |i| (ro src: Array[F32], out dst: Array[F32]) {
    dst[i] = src[i]
}
pipeline bad_alias(rw buf: Array[F32]) Promise[Void] {
    copy(buf, buf)
}
`);
    assert(errs.length >= 1, 'expected aliasing error');
    assert(errs.some(e => e.message.includes('alias')), `unexpected: ${errs.map(e => e.message).join('; ')}`);
  });

  test('gpu: grid arity mismatch is a compile error', async ({ compiler, ROOT }) => {
    const errs = await errorsOf(compiler, ROOT, `
gp blur |x, y| (ro src: Array[F32], out dst: Array[F32]) {
    dst[x] = src[x]
}
pipeline bad_grid(ro a: Array[F32], out b: Array[F32], w: U32) Promise[Void] {
    blur(a, b)
    blur(a, b) over (w, w, w)
}
`);
    assert(errs.length >= 2, `expected 2 arity errors, got ${errs.length}: ${errs.map(e => e.message).join('; ')}`);
    assert(errs.some(e => e.message.includes('arity') || e.message.includes('2D')), `unexpected: ${errs.map(e => e.message).join('; ')}`);
  });

  test('gpu: non-GPU types (F64, I64, Str) are rejected', async ({ compiler, ROOT }) => {
    const errs = await errorsOf(compiler, ROOT, `
gp bad_f64 |i| (rw xs: Array[F64]) {
    xs[i] = 1.0
}
gp bad_str(s: Str) I32 {
    return 0
}
gp bad_i64(x: I64) I64 {
    return x
}
`);
    assert(errs.length >= 3, `expected >=3 non-GPU type errors, got ${errs.length}: ${errs.map(e => e.message).join('; ')}`);
  });

  test('gpu: recursion in gp helpers is rejected', async ({ compiler, ROOT }) => {
    const errs = await errorsOf(compiler, ROOT, `
gp fact(n: I32) I32 {
    if n <= 1 { return 1 }
    return n * fact(n - 1)
}
`);
    assert(errs.length >= 1, 'expected recursion error');
    assert(errs.some(e => e.message.includes('Recursion')), `unexpected: ${errs.map(e => e.message).join('; ')}`);
  });

  test('gpu: disallowed constructs (GC alloc, closure, non-gp call) rejected in gp', async ({ compiler, ROOT }) => {
    const errs = await errorsOf(compiler, ROOT, `
fn cpu_fn(x: F32) F32 => x + 1.0
gp bad |i| (rw xs: Array[F32]) {
    let arr = [1.0, 2.0]
    xs[i] = cpu_fn(xs[i])
}
`);
    assert(errs.length >= 2, `expected >=2 errors, got ${errs.length}: ${errs.map(e => e.message).join('; ')}`);
  });

  test('gpu: calling gp kernel from CPU code or dispatching gp helper is rejected', async ({ compiler, ROOT }) => {
    const errs = await errorsOf(compiler, ROOT, `
gp helper(x: F32) F32 => x * 2.0
gp kern |i| (rw xs: Array[F32]) {
    xs[i] = helper(xs[i])
}
pipeline p(rw xs: Array[F32]) Promise[Void] {
    helper(1.0)
}
fn cpu_call(xs: Array[F32]) Void {
    kern(xs)
}
`);
    assert(errs.length >= 2, `expected >=2 errors, got ${errs.length}: ${errs.map(e => e.message).join('; ')}`);
  });

  // ── 2. WGSL emission & end-to-end execution with mock WebGPU ──────────────

  test('gpu: 1D/2D/3D WGSL emission, #workgroup, helpers, structs, control flow, and end-to-end pipeline', async ({ compiler, ROOT }) => {
    const source = `
enum(U32) Mode:
    | Add
    | Scale

struct Particle:
    | x: F32
    | y: F32

struct Vec2f:
    | vx: F32
    | vy: F32

gp clamp01(v: F32) F32 {
    return if v < 0.0 { 0.0 } else if v > 1.0 { 1.0 } else { v }
}

#workgroup(64)
gp calc_forces |i| (ro ps: Array[Particle], out forces: Array[F32], uniform mode: Mode) {
    let base: F32 = match mode {
        Mode.Add => 1.0,
        ~> 2.0,
    }
    let acc: F32 = 0.0
    for (0 ..< 3) |k| {
        acc = acc + base
    }
    forces[i] = clamp01(ps[i].x + acc)
}

gp integrate |i| (rw ps: Array[Particle], ro vels: Array[Vec2f], ro forces: Array[F32], uniform dt: F32) {
    ps[i].x = ps[i].x + vels[i].vx * dt + forces[i]
    ps[i].y = ps[i].y + vels[i].vy * dt
}

#workgroup(16, 16)
gp blur2d |x, y| (ro src: Array[F32], out dst: Array[F32], uniform w: U32, uniform h: U32) {
    let idx: U32 = y * w + x
    dst[idx] = src[idx] * 0.5
}

#workgroup(4, 4, 4)
gp voxel3d |x, y, z| (rw vol: Array[I32], uniform dim: U32) {
    let idx: U32 = (z * dim + y) * dim + x
    vol[idx] = vol[idx] + 1
}

pipeline step(
    rw ps: Array[Particle],
    ro vels: Array[Vec2f],
    uniform dt: F32,
    uniform mode: Mode,
    substeps: U32,
) Promise[Void] {
    let forces = Buffer[F32](ps.len())
    for (0 ..< substeps) |_| {
        calc_forces(ps, forces, mode)
        integrate(ps, vels, forces, dt)
    }
}

pipeline run_2d_3d(
    ro src: Array[F32],
    out dst: Array[F32],
    rw vol: Array[I32],
    w: U32,
    h: U32,
    dim: U32,
) Promise[Void] {
    blur2d(src, dst, w, h) over (w, h)
    voxel3d(vol, dim) over (dim, dim, dim)
}

lib {
    fn test_step() Promise[Void] {
        let ps = [Particle { x: 1.0, y: 2.0 }, Particle { x: 3.0, y: 4.0 }]
        let vels = [Vec2f { vx: 0.5, vy: -1.0 }, Vec2f { vx: 2.0, vy: 3.0 }]
        return step(ps, vels, 0.5, Mode.Add, 2)
    }
    fn run_and_check(cb: cl(F32, F32, F32, F32) Void) Promise[Void] {
        let ps = [Particle { x: 1.0, y: 2.0 }, Particle { x: 3.0, y: 4.0 }]
        let vels = [Vec2f { vx: 0.5, vy: -1.0 }, Vec2f { vx: 2.0, vy: 3.0 }]
        let p = step(ps, vels, 0.5, Mode.Add, 2)
        p.then(cl() {
            cb(ps[0].x, ps[0].y, ps[1].x, ps[1].y)
        })
        return p
    }
    fn run_2d_3d_check(cb: cl(F32, I32) Void) Promise[Void] {
        let src: Array[F32] = [10.0, 20.0, 30.0, 40.0]
        let dst: Array[F32] = [0.0, 0.0, 0.0, 0.0]
        let vol: Array[I32] = [1, 2, 3, 4, 5, 6, 7, 8]
        let p = run_2d_3d(src, dst, vol, 2, 2, 2)
        p.then(cl() {
            cb(dst[3], vol[7])
        })
        return p
    }
}
`;
    const mock = createMockWebGPU(({ entry, bufs }) => {
      if (entry === 'calc_forces') {
        // bufs: [ps, forces, uni]
        const psF = new Float32Array(bufs[0].bytes.buffer);
        const forcesF = new Float32Array(bufs[1].bytes.buffer);
        const uniU = new Uint32Array(bufs[2].bytes.buffer);
        const n = uniU[0];
        const mode = uniU[4];
        const base = mode === 0 ? 1.0 : 2.0;
        for (let i = 0; i < n; i++) {
          let v = psF[i * 2] + base * 3.0;
          forcesF[i] = v < 0 ? 0 : v > 1 ? 1 : v;
        }
      } else if (entry === 'integrate') {
        // bufs: [ps, vels, forces, uni]
        const psF = new Float32Array(bufs[0].bytes.buffer);
        const velsF = new Float32Array(bufs[1].bytes.buffer);
        const forcesF = new Float32Array(bufs[2].bytes.buffer);
        const uniU = new Uint32Array(bufs[3].bytes.buffer);
        const uniF = new Float32Array(bufs[3].bytes.buffer);
        const n = uniU[0];
        const dt = uniF[4];
        for (let i = 0; i < n; i++) {
          psF[i * 2] = psF[i * 2] + velsF[i * 2] * dt + forcesF[i];
          psF[i * 2 + 1] = psF[i * 2 + 1] + velsF[i * 2 + 1] * dt;
        }
      } else if (entry === 'blur2d') {
        const srcF = new Float32Array(bufs[0].bytes.buffer);
        const dstF = new Float32Array(bufs[1].bytes.buffer);
        const uniU = new Uint32Array(bufs[2].bytes.buffer);
        const w = uniU[0], h = uniU[1];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            dstF[y * w + x] = srcF[y * w + x] * 0.5;
          }
        }
      } else if (entry === 'voxel3d') {
        const volI = new Int32Array(bufs[0].bytes.buffer);
        const uniU = new Uint32Array(bufs[1].bytes.buffer);
        const dim = uniU[4];
        for (let i = 0; i < dim * dim * dim; i++) volI[i] += 1;
      }
    });

    await withMockWebGPU(mock, async () => {
      const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'gpu_e2e.utu', source });
      const { exports } = instance;

      // Run step (substeps = 2) and verify in-place delinearization
      let got = null;
      await exports.run_and_check((x0, y0, x1, y1) => { got = [x0, y0, x1, y1]; });
      assert(got !== null, 'then callback did not run');
      // After 2 substeps with dt=0.5, force=1.0:
      // ps[0]: x = 1 + 2*(0.5*0.5 + 1.0) = 3.5, y = 2 + 2*(-1.0*0.5) = 1.0
      // ps[1]: x = 3 + 2*(2.0*0.5 + 1.0) = 7.0, y = 4 + 2*(3.0*0.5) = 7.0
      assertEq(got[0], 3.5);
      assertEq(got[1], 1.0);
      assertEq(got[2], 7.0);
      assertEq(got[3], 7.0);

      // Verify single encoder, single submit for the 4 dispatches (2 substeps * 2 kernels)
      assertEq(mock.log.encoders, 1);
      assertEq(mock.log.submits, 1);
      assertEq(mock.log.dispatches.length, 4);
      // Pipeline cache: only 2 shaders compiled for 4 dispatches
      assertEq(mock.log.shaders.length, 2);

      // Verify buffer usages:
      // buf 0 = ps (rw): STORAGE | COPY_DST | COPY_SRC
      // buf 1 = vels (ro): STORAGE | COPY_DST (NO COPY_SRC -> never read back!)
      // buf 2 = forces (Buffer[F32] scratch): STORAGE only (NO COPY_DST, NO COPY_SRC!)
      assertEq(mock.log.buffers[0].usage, mock.U_STORAGE | mock.U_COPY_DST | mock.U_COPY_SRC);
      assertEq(mock.log.buffers[1].usage, mock.U_STORAGE | mock.U_COPY_DST);
      assertEq(mock.log.buffers[2].usage, mock.U_STORAGE);
      // Only 1 buffer (ps) was copied to staging & mapped!
      assertEq(mock.log.copies.length, 1);
      assertEq(mock.log.copies[0].srcId, 0);
      assertEq(mock.log.maps.length, 1);

      // Verify emitted WGSL for calc_forces and integrate
      const wgslForces = mock.log.shaders[0];
      assert(wgslForces.includes('struct Particle'), 'missing struct Particle');
      assert(wgslForces.includes('fn clamp01('), 'missing helper clamp01');
      assert(wgslForces.includes('@workgroup_size(64, 1, 1)'), 'missing workgroup_size(64, 1, 1)');
      assert(wgslForces.includes('if (i >= _uni._grid.x) { return; }'), 'missing 1D bounds check');
      assert(wgslForces.includes('var<storage, read> ps: array<Particle>;'), 'missing ro ps binding');
      assert(wgslForces.includes('var<storage, read_write> forces: array<f32>;'), 'missing out forces binding');
      assert(wgslForces.includes('switch ('), 'missing switch for match');
      assert(wgslForces.includes('for (var k:'), 'missing for loop');

      // Run 2D & 3D kernels
      let got23 = null;
      await exports.run_2d_3d_check((d3, v7) => { got23 = [d3, v7]; });
      assertEq(got23[0], 20.0);
      assertEq(got23[1], 9);

      const wgsl2d = mock.log.shaders[2];
      assert(wgsl2d.includes('@workgroup_size(16, 16, 1)'), 'missing 2D workgroup_size');
      assert(wgsl2d.includes('if (x >= _uni._grid.x || y >= _uni._grid.y) { return; }'), 'missing 2D bounds check');

      const wgsl3d = mock.log.shaders[3];
      assert(wgsl3d.includes('@workgroup_size(4, 4, 4)'), 'missing 3D workgroup_size');
      assert(wgsl3d.includes('if (x >= _uni._grid.x || y >= _uni._grid.y || z >= _uni._grid.z) { return; }'), 'missing 3D bounds check');
    });
  });
}
