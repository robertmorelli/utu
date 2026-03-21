import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [impl, benchCase, iterationsArg] = process.argv.slice(2);
const iterations = Number.parseInt(iterationsArg ?? "50", 10);

if (!["utu", "rust", "native"].includes(impl) || !["chain", "projection"].includes(benchCase) || !Number.isInteger(iterations) || iterations <= 0) {
    throw new Error("Usage: bun scripts/run-deltablue-bench-case.mjs <utu|rust|native> <chain|projection> [iterations]");
}

const cacheDir = path.join(tmpdir(), "utu-deltablue-bench-cache");

if (impl === "utu") {
    await runUtu(benchCase, iterations);
} else if (impl === "rust") {
    await runRust(benchCase, iterations);
} else {
    await runNative(benchCase, iterations);
}

async function runUtu(benchCase, iterations) {
    const metadata = JSON.parse(await readFile(path.join(cacheDir, "utu", "metadata.json"), "utf8"));
    const modulePath = path.join(cacheDir, "utu", "module.mjs");
    const mod = await import(pathToFileURL(modulePath).href);
    const exports = await mod.instantiate({
        es: {
            console_log() {},
            i64_to_string(value) {
                return String(value);
            },
        },
    });

    const benchName = benchCase === "chain" ? "deltablue_chain" : "deltablue_projection";
    const benchExport = metadata.benches.find(bench => bench.name === benchName)?.exportName;
    if (!benchExport) {
        throw new Error(`No Utu bench export found for ${benchName}`);
    }

    exports[benchExport](iterations);
}

async function runRust(benchCase, iterations) {
    const wasmPath = path.join(cacheDir, "rust_wasm", "rust_deltablue.wasm");
    const wasm = await readFile(wasmPath);
    const { instance } = await WebAssembly.instantiate(wasm, {});
    const exportName = benchCase === "chain" ? "bench_chain" : "bench_projection";
    instance.exports[exportName](iterations);
}

async function runNative(benchCase, iterations) {
    const binaryPath = path.join(cacheDir, "rust_native", "rust_deltablue");
    const run = Bun.spawnSync([binaryPath, benchCase, String(iterations)], {
        stdout: "pipe",
        stderr: "pipe",
    });
    if (run.exitCode !== 0) {
        throw new Error(`native runner failed\n${run.stdout.toString()}\n${run.stderr.toString()}`);
    }
}
