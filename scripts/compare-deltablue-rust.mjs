import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { compileUtuSource } from "../cli_artifact/src/lib/compiler.mjs";

const repoRoot = process.cwd();
const targetSeconds = Number.parseFloat(process.argv[2] ?? "1");
const MAX_BENCH_ITERATIONS = 0x7fffffff;
if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) {
    throw new Error("Usage: bun scripts/compare-deltablue-rust.mjs [seconds]");
}

const targetNs = Math.floor(targetSeconds * 1e9);

const cases = (await Promise.all([loadUtu(), loadRustVariants()])).flat();
try {
    const metricsEntries = [];
    for (const benchmark of cases) {
        const metrics = await benchmarkCase(benchmark.name, benchmark.bench, targetNs);
        metricsEntries.push([benchmark.name, metrics]);
    }
    const checkEntries = await Promise.all(cases.map(async benchmark => {
        const check = await Promise.resolve(benchmark.check());
        return [benchmark.name, Number(check)];
    }));

    const metrics = Object.fromEntries(metricsEntries);
    const checks = Object.fromEntries(checkEntries);
    const wasmBytes = Object.fromEntries(cases.map(benchmark => [
        benchmark.name,
        benchmark.wasmBytes,
    ]));
    const orderedBySpeed = [...metricsEntries]
        .sort((left, right) => right[1].meanRate - left[1].meanRate)
        .map(([name]) => name);
    console.log(JSON.stringify({
        targetSeconds,
        checks,
        wasmBytes,
        rates: Object.fromEntries(metricsEntries.map(([name, benchmark]) => [
            name,
            summarizeMetrics(benchmark),
        ])),
        fastest: orderedBySpeed[0] ?? null,
        speedOrder: orderedBySpeed,
    }, null, 2));
} finally {
    await Promise.all(cases.map(benchmark => benchmark.cleanup()));
}

async function loadUtu() {
    const source = await readFile(path.join(repoRoot, "examples/deltablue.utu"), "utf8");
    const dir = await mkdtemp(path.join(tmpdir(), "utu-rust-compare-utu-"));
    const file = path.join(dir, "module.mjs");
    const { js, metadata, wasm } = await compileUtuSource(source, { mode: "bench" });
    await writeFile(file, js, "utf8");
    const mod = await import(pathToFileURL(file).href);
    const exports = await mod.instantiate();
    const cleanup = () => rm(dir, { recursive: true, force: true });
    return metadata.benches.map(bench => ({
        name: `utu_${bench.name.replace(/^deltablue_/, "")}`,
        wasmBytes: wasm.length,
        bench: (iterations) => exports[bench.exportName](iterations),
        check: () => Number(exports.main()),
        cleanup,
    }));
}

async function loadRustVariants() {
    const dir = await mkdtemp(path.join(tmpdir(), "utu-rust-compare-rust-"));
    const manifestPath = path.join(repoRoot, "benchmarks/rust_deltablue/Cargo.toml");
    const rustcPath = resolveRustcPath();
    const cargoPath = path.join(path.dirname(rustcPath), "cargo");
    const build = Bun.spawnSync([
        cargoPath,
        "build",
        "--release",
        "--target",
        "wasm32-unknown-unknown",
        "--manifest-path",
        manifestPath,
        "--target-dir",
        dir,
    ], {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
        env: {
            ...process.env,
            CARGO_TERM_COLOR: "never",
            RUSTC: rustcPath,
        },
    });
    if (build.exitCode !== 0) {
        throw new Error(
            `cargo build failed\n${build.stdout.toString()}\n${build.stderr.toString()}`,
        );
    }

    const rawWasmPath = path.join(
        dir,
        "wasm32-unknown-unknown",
        "release",
        "rust_deltablue.wasm",
    );
    const cases = await Promise.all([
        instantiateRustCase("rust_chain", "bench_chain", rawWasmPath, dir),
        instantiateRustCase("rust_projection", "bench_projection", rawWasmPath, dir),
    ]);
    const wasmOptPath = findToolPath("wasm-opt");
    if (wasmOptPath !== null) {
        const optimizedWasmPath = path.join(dir, "rust_deltablue.opt.wasm");
        const optimize = Bun.spawnSync([
            wasmOptPath,
            "-O4",
            rawWasmPath,
            "-o",
            optimizedWasmPath,
        ], {
            cwd: repoRoot,
            stdout: "pipe",
            stderr: "pipe",
        });
        if (optimize.exitCode !== 0) {
            throw new Error(
                `wasm-opt failed\n${optimize.stdout.toString()}\n${optimize.stderr.toString()}`,
            );
        }
        cases.push(
            await instantiateRustCase("rust_wasm_opt_chain", "bench_chain", optimizedWasmPath, dir),
        );
        cases.push(
            await instantiateRustCase(
                "rust_wasm_opt_projection",
                "bench_projection",
                optimizedWasmPath,
                dir,
            ),
        );
    }

    return cases;
}

async function instantiateRustCase(name, exportName, wasmPath, dir) {
    const wasm = await readFile(wasmPath);
    const { instance } = await WebAssembly.instantiate(wasm, {});
    return {
        name,
        wasmBytes: wasm.length,
        bench: (iterations) => instance.exports[exportName](iterations),
        check: () => instance.exports.run_check(),
        cleanup: () => rm(dir, { recursive: true, force: true }),
    };
}

function resolveRustcPath() {
    const rustc = Bun.spawnSync(["rustup", "which", "rustc"], {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
    });
    if (rustc.exitCode !== 0) {
        throw new Error(`rustup which rustc failed\n${rustc.stderr.toString()}`);
    }
    return rustc.stdout.toString().trim();
}

function findToolPath(command) {
    const result = Bun.spawnSync(["which", command], {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
    });
    if (result.exitCode !== 0) {
        return null;
    }
    return result.stdout.toString().trim();
}

async function benchmarkCase(name, bench, targetNs) {
    let estimate = await calibrateIterations(bench, targetNs, 1);
    const samples = [];
    for (let i = 0; i < 3; i++) {
        const iterations = clampIterations(estimate);
        const elapsedNs = await timeInvocation(() => bench(iterations));
        samples.push({ iterations, elapsedNs, rate: rate(iterations, elapsedNs) });
        estimate = projectIterations(iterations, elapsedNs, targetNs);
    }
    const meanRate = samples.reduce((sum, sample) => sum + sample.rate, 0) / samples.length;
    const meanNsPerIter =
        samples.reduce((sum, sample) => sum + sample.elapsedNs, 0)
        / samples.reduce((sum, sample) => sum + sample.iterations, 0);
    return {
        name,
        samples,
        meanRate,
        meanNsPerIter,
    };
}

async function timeInvocation(run) {
    const start = process.hrtime.bigint();
    await run();
    return Number(process.hrtime.bigint() - start);
}

async function calibrateIterations(bench, targetNs, initialIterations) {
    let iterations = clampIterations(initialIterations);
    let elapsedNs = await timeInvocation(() => bench(iterations));

    while (elapsedNs < targetNs / 10 && iterations < MAX_BENCH_ITERATIONS) {
        const scale = elapsedNs <= 0 ? 10 : Math.max(2, Math.ceil((targetNs / 10) / elapsedNs));
        const next = clampIterations(iterations * scale);
        if (next === iterations) break;
        iterations = next;
        elapsedNs = await timeInvocation(() => bench(iterations));
    }

    return projectIterations(iterations, elapsedNs, targetNs);
}

function projectIterations(iterations, elapsedNs, targetNs) {
    if (elapsedNs <= 0) return clampIterations(iterations * 10);
    return clampIterations(Math.round(iterations * (targetNs / elapsedNs)));
}

function clampIterations(value) {
    if (!Number.isFinite(value) || value < 1) return 1;
    return Math.max(1, Math.min(MAX_BENCH_ITERATIONS, Math.round(value)));
}

function rate(iterations, elapsedNs) {
    return elapsedNs <= 0 ? 0 : iterations / (elapsedNs / 1e9);
}

function summarizeMetrics(metrics) {
    return {
        meanIterPerSecond: round(metrics.meanRate),
        minIterPerSecond: round(Math.min(...metrics.samples.map(sample => sample.rate))),
        maxIterPerSecond: round(Math.max(...metrics.samples.map(sample => sample.rate))),
        nsPerIter: round(metrics.meanNsPerIter),
        samples: metrics.samples.map(sample => ({
            iterations: sample.iterations,
            elapsedNs: sample.elapsedNs,
            iterPerSecond: round(sample.rate),
        })),
    };
}

function round(value) {
    return Math.round(value * 1000) / 1000;
}
