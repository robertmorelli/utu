import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, "utu_v_rust.md");

const options = parseArgs(process.argv.slice(2));
const prep = Bun.spawnSync(["bun", "scripts/prepare-deltablue-bench-cache.mjs"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
});
if (prep.exitCode !== 0) {
    throw new Error(`prepare failed\n${prep.stdout.toString()}\n${prep.stderr.toString()}`);
}

const cacheDir = prep.stdout.toString().trim().split("\n").filter(Boolean).at(-1);
if (!cacheDir) {
    throw new Error("prepare script did not print a cache directory");
}

const sizes = JSON.parse(await readFile(path.join(cacheDir, "sizes.json"), "utf8"));
const chain = await runHyperfine("chain", options, cacheDir);
const projection = await runHyperfine("projection", options, cacheDir);
const markdown = renderMarkdown({
    generatedAt: new Date().toISOString(),
    options,
    sizes,
    chain,
    projection,
    cacheDir,
});

await writeFile(reportPath, markdown, "utf8");
console.log(reportPath);

async function runHyperfine(caseName, options, cacheDir) {
    const jsonDir = await mkdtemp(path.join(tmpdir(), `utu-v-rust-${caseName}-`));
    const jsonPath = path.join(jsonDir, `${caseName}.json`);
    const nativePath = path.join(cacheDir, "rust_native", "rust_deltablue");
    const commands = [
        `bun scripts/run-deltablue-bench-case.mjs utu ${caseName} ${options.iterations}`,
        `bun scripts/run-deltablue-bench-case.mjs rust ${caseName} ${options.iterations}`,
        `${nativePath} ${caseName} ${options.iterations}`,
    ];
    const args = [
        "hyperfine",
        "--warmup",
        String(options.warmup),
        "--min-runs",
        String(options.minRuns),
        "--export-json",
        jsonPath,
        "--command-name",
        "utu_wasm",
        "--command-name",
        "rust_wasm",
        "--command-name",
        "rust_native",
        ...commands,
    ];
    const run = Bun.spawnSync(args, {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
    });
    if (run.exitCode !== 0) {
        throw new Error(`hyperfine failed for ${caseName}\n${run.stdout.toString()}\n${run.stderr.toString()}`);
    }
    const data = JSON.parse(await readFile(jsonPath, "utf8"));
    await rm(jsonDir, { recursive: true, force: true });
    return data.results.map((result, index) => ({
        name: ["utu_wasm", "rust_wasm", "rust_native"][index],
        command: result.command,
        mean: result.mean,
        stddev: result.stddev,
        min: result.min,
        max: result.max,
        median: result.median,
        runs: result.times.length,
    }));
}

function parseArgs(args) {
    const options = {
        warmup: 10,
        minRuns: 10,
        iterations: 20,
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === "--warmup") {
            options.warmup = parsePositiveInt(args[++i], "--warmup");
        } else if (arg === "--min-runs") {
            options.minRuns = parsePositiveInt(args[++i], "--min-runs");
        } else if (arg === "--iterations") {
            options.iterations = parsePositiveInt(args[++i], "--iterations");
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function parsePositiveInt(value, flag) {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${flag} expects a positive integer`);
    }
    return parsed;
}

function renderMarkdown({ generatedAt, options, sizes, chain, projection, cacheDir }) {
    return [
        "# Utu vs Rust DeltaBlue",
        "",
        `Generated: ${generatedAt}`,
        "",
        "## Benchmark Setup",
        "",
        `- Warmup runs: ${options.warmup}`,
        `- Minimum timed runs: ${options.minRuns}`,
        `- Iterations per command: ${options.iterations}`,
        `- Prepared cache: \`${cacheDir}\``,
        "",
        "## Binary Sizes",
        "",
        "| Variant | Artifact | Size (bytes) | Size (KiB) |",
        "| --- | --- | ---: | ---: |",
        sizeRow("Utu wasm", "Compiled wasm payload", sizes.utu.wasm_bytes),
        sizeRow("Utu wrapper", "Generated module.mjs", sizes.utu.module_bytes),
        sizeRow("Rust wasm", "rust_deltablue.wasm", sizes.rust_wasm.wasm_bytes),
        sizeRow("Rust native", "release/rust_deltablue", sizes.rust_native.binary_bytes),
        "",
        "## Chain Benchmark",
        "",
        benchmarkTable(chain),
        "",
        "## Projection Benchmark",
        "",
        benchmarkTable(projection),
        "",
    ].join("\n");
}

function benchmarkTable(results) {
    const fastest = Math.min(...results.map(result => result.mean));
    const lines = [
        "| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ];
    for (const result of results) {
        lines.push([
            "|",
            result.name,
            "|",
            formatMs(result.mean),
            "|",
            formatMs(result.stddev),
            "|",
            formatMs(result.min),
            "|",
            formatMs(result.max),
            "|",
            `${round(result.mean / fastest)}x`,
            "|",
            result.runs,
            "|",
        ].join(" "));
    }
    return lines.join("\n");
}

function sizeRow(name, artifact, bytes) {
    return `| ${name} | ${artifact} | ${bytes} | ${round(bytes / 1024)} |`;
}

function formatMs(seconds) {
    return round(seconds * 1000);
}

function round(value) {
    return Math.round(value * 1000) / 1000;
}
