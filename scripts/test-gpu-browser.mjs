// Real Playwright Chromium WebGPU end-to-end execution test for `gp` + `pipeline`.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createCompilerEnv } from './test-harness.mjs';
import { loaderSource, glueSource } from '../src/selfhost/loader.js';

const ROOT = process.cwd();

const SOURCE = `
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
        Mode.Add => 0.25,
        ~> 0.5,
    }
    let acc: F32 = 0.0
    for (0 ..< 2) |k| {
        acc = acc + base
    }
    forces[i] = clamp01(ps[i].x * 0.1 + acc)
}

gp integrate |i| (rw ps: Array[Particle], ro vels: Array[Vec2f], ro forces: Array[F32], uniform dt: F32) {
    ps[i].x = ps[i].x + vels[i].vx * dt + forces[i]
    ps[i].y = ps[i].y + vels[i].vy * dt
}

#workgroup(16, 16)
gp blur2d |x, y| (ro src: Array[F32], out dst: Array[F32], uniform w: U32, uniform h: U32) {
    let idx: U32 = y * w + x
    dst[idx] = src[idx] * 0.5 + x.f32() + y.f32() * 10.0
}

#workgroup(4, 4, 4)
gp voxel3d |x, y, z| (rw vol: Array[I32], uniform dim: U32) {
    let idx: U32 = (z * dim + y) * dim + x
    let n: I32 = 0
    while (n < 3) {
        vol[idx] = vol[idx] + 1
        n = n + 1
    }
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
    fn test_particles_then(cb: cl(F32, F32, F32, F32) Void) Promise[Void] {
        let ps = [Particle { x: 1.0, y: 2.0 }, Particle { x: 2.0, y: 4.0 }]
        let vels = [Vec2f { vx: 0.5, vy: -1.0 }, Vec2f { vx: 2.0, vy: 3.0 }]
        let p = step(ps, vels, 0.5, Mode.Add, 2)
        p.then(cl() {
            cb(ps[0].x, ps[0].y, ps[1].x, ps[1].y)
        })
        return p
    }

    fn test_particles_await(cb: cl(F32, F32) Void) Void {
        let ps = [Particle { x: 1.0, y: 2.0 }]
        let vels = [Vec2f { vx: 1.0, vy: 2.0 }]
        await step(ps, vels, 1.0, Mode.Scale, 1)
        cb(ps[0].x, ps[0].y)
    }

    fn test_2d_3d(cb: cl(F32, F32, I32, I32) Void) Promise[Void] {
        let src: Array[F32] = [10.0, 20.0, 30.0, 40.0]
        let dst: Array[F32] = [0.0, 0.0, 0.0, 0.0]
        let vol: Array[I32] = [1, 2, 3, 4, 5, 6, 7, 8]
        let p = run_2d_3d(src, dst, vol, 2, 2, 2)
        p.then(cl() {
            cb(dst[0], dst[3], vol[0], vol[7])
        })
        return p
    }
}
`;

async function main() {
  const compiler = await createCompilerEnv({ ROOT });
  const tmpFile = path.join(ROOT, '.tmp', 'gpu_browser_test.utu');
  await fs.mkdir(path.dirname(tmpFile), { recursive: true });
  await fs.writeFile(tmpFile, SOURCE);

  const result = await compiler.compileFile(tmpFile);
  const errors = (result.artifacts.diagnostics ?? []).filter(d => d.severity !== 'warning');
  if (errors.length) {
    throw new Error('Compile errors: ' + errors.map(e => e.message).join('; '));
  }

  const wasmBytes = result.wasm ?? result.artifacts.wasm ?? result.artifacts.wasmBytes;
  const spec = result.hostSpec ?? result.artifacts.hostSpec ?? result.spec ?? {};
  const glue = glueSource(spec, wasmBytes);
  const loader = loaderSource(spec, wasmBytes, {
    runtime: '/host-imports.js',
    glue: glue ? '/glue.js' : null,
    wasm: 'await (await fetch("/app.wasm")).arrayBuffer()',
    streaming: false,
  });
  const hostImportsJs = await fs.readFile(path.join(ROOT, 'src', 'runtime', 'host-imports.js'), 'utf8');
  const wasmImportsJs = await fs.readFile(path.join(ROOT, 'src', 'runtime', 'wasm-imports.js'), 'utf8');

  const html = `<!doctype html><html><body><script type="module">
import { exports } from '/loader.js';
window.__run = async () => {
  const pThen = await new Promise((resolve, reject) => {
    let out = null;
    exports.test_particles_then((x0, y0, x1, y1) => { out = [x0, y0, x1, y1]; })
      .then(() => resolve(out), reject);
  });
  let pAwait = null;
  await exports.test_particles_await((x0, y0) => { pAwait = [x0, y0]; });
  const p23 = await new Promise((resolve, reject) => {
    let out = null;
    exports.test_2d_3d((d0, d3, v0, v7) => { out = [d0, d3, v0, v7]; })
      .then(() => resolve(out), reject);
  });
  return { pThen, pAwait, p23 };
};
</script></body></html>`;

  const server = http.createServer((req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }
    else if (req.url === '/loader.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(loader); }
    else if (req.url === '/glue.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(glue); }
    else if (req.url === '/host-imports.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(hostImportsJs); }
    else if (req.url === '/wasm-imports.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(wasmImportsJs); }
    else if (req.url === '/app.wasm') { res.writeHead(200, { 'content-type': 'application/wasm' }); res.end(Buffer.from(wasmBytes)); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', err => console.error('PAGEERROR:', err));
    page.on('console', msg => { if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text()); });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => typeof window.__run === 'function');
    const out = await page.evaluate(() => window.__run());
    console.log('Real Chromium WebGPU output:', JSON.stringify(out));

    // Verify exact math from real GPU execution!
    // pThen:
    //   step 1: ps[0].x = 1.0 -> force = clamp01(0.1 + 0.5) = 0.6 -> x = 1.0 + 0.25 + 0.6 = 1.85, y = 2.0 - 0.5 = 1.5
    //   step 2: ps[0].x = 1.85 -> force = clamp01(0.185 + 0.5) = 0.685 -> x = 1.85 + 0.25 + 0.685 = 2.785, y = 1.5 - 0.5 = 1.0
    //   step 1: ps[1].x = 2.0 -> force = clamp01(0.2 + 0.5) = 0.7 -> x = 2.0 + 1.0 + 0.7 = 3.7, y = 4.0 + 1.5 = 5.5
    //   step 2: ps[1].x = 3.7 -> force = clamp01(0.37 + 0.5) = 0.87 -> x = 3.7 + 1.0 + 0.87 = 5.57, y = 5.5 + 1.5 = 7.0
    const near = (a, b, msg) => { if (Math.abs(a - b) > 1e-4) throw new Error(`${msg}: expected ${b}, got ${a}`); };
    near(out.pThen[0], 2.785, 'ps[0].x');
    near(out.pThen[1], 1.0, 'ps[0].y');
    near(out.pThen[2], 5.57, 'ps[1].x');
    near(out.pThen[3], 7.0, 'ps[1].y');

    // pAwait (Mode.Scale => base=0.5, acc=1.0, force=clamp01(0.1+1.0)=1.0, dt=1.0):
    //   ps[0].x = 1.0 + 1.0*1.0 + 1.0 = 3.0, ps[0].y = 2.0 + 2.0*1.0 = 4.0
    near(out.pAwait[0], 3.0, 'await ps[0].x');
    near(out.pAwait[1], 4.0, 'await ps[0].y');

    // p23:
    //   dst[0] (x=0,y=0) = 10*0.5 + 0 + 0 = 5.0
    //   dst[3] (x=1,y=1) = 40*0.5 + 1 + 10 = 31.0
    //   vol[0] = 1 + 3 = 4, vol[7] = 8 + 3 = 11
    near(out.p23[0], 5.0, 'dst[0]');
    near(out.p23[1], 31.0, 'dst[3]');
    if (out.p23[2] !== 4 || out.p23[3] !== 11) throw new Error(`voxel3d mismatch: ${out.p23[2]}, ${out.p23[3]}`);

    console.log('✓ Real Playwright Chromium WebGPU execution PASSED (1D structs+helpers+match+for+scratch, await & .then, 2D blur, 3D voxel+while)');
  } finally {
    await browser.close();
    server.close();
  }
}

await main();
