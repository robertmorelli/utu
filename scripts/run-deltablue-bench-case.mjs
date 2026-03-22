import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [impl, benchCase, iterationsArg] = process.argv.slice(2);
const iterations = Number.parseInt(iterationsArg ?? "50", 10);

if (
    !["utu", "rust", "native", "rust_arena", "native_arena"].includes(impl)
    || !["chain", "projection"].includes(benchCase)
    || !Number.isInteger(iterations)
    || iterations <= 0
) {
    throw new Error("Usage: bun scripts/run-deltablue-bench-case.mjs <utu|rust|native|rust_arena|native_arena> <chain|projection> [iterations]");
}

const cacheDir = path.join(tmpdir(), "utu-deltablue-bench-cache");

if (impl === "utu") {
    await runUtu(benchCase, iterations);
} else if (impl === "rust") {
    await runRust("rust_wasm", benchCase, iterations);
} else if (impl === "rust_arena") {
    await runRust("rust_arena_wasm", benchCase, iterations);
} else if (impl === "native") {
    await runNative("rust_native", benchCase, iterations);
} else {
    await runNative("rust_arena_native", benchCase, iterations);
}

async function runUtu(benchCase, iterations) {
    const metadata = JSON.parse(await readFile(path.join(cacheDir, "utu", "metadata.json"), "utf8"));
    const modulePath = path.join(cacheDir, "utu", "module.mjs");
    const mod = await import(pathToFileURL(modulePath).href);
    const exports = await mod.instantiate();

    const benchName = benchCase === "chain" ? "deltablue_chain" : "deltablue_projection";
    const benchExport = metadata.benches.find(bench => bench.name === benchName)?.exportName;
    if (!benchExport) {
        throw new Error(`No Utu bench export found for ${benchName}`);
    }

    exports[benchExport](iterations);
}

async function runRust(dirName, benchCase, iterations) {
    const wasmPath = path.join(cacheDir, dirName, "module.wasm");
    const wasm = await readFile(wasmPath);
    const { instance } = await WebAssembly.instantiate(wasm, {});
    const exportName = benchCase === "chain" ? "bench_chain" : "bench_projection";
    instance.exports[exportName](iterations);
}

async function runNative(dirName, benchCase, iterations) {
    const binaryPath = path.join(cacheDir, dirName, "runner");
    const run = Bun.spawnSync([binaryPath, benchCase, String(iterations)], {
        stdout: "pipe",
        stderr: "pipe",
    });
    if (run.exitCode !== 0) {
        throw new Error(`native runner failed\n${run.stdout.toString()}\n${run.stderr.toString()}`);
    }
}
