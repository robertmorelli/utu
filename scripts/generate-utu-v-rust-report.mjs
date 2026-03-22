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
    const nativePath = path.join(cacheDir, "rust_native", "runner");
    const arenaNativePath = path.join(cacheDir, "rust_arena_native", "runner");
    const variantNames = [
        "utu_wasm",
        "rc_rust_wasm",
        "rc_rust_native",
        "unsafe_rust_wasm",
        "unsafe_rust_native",
    ];
    const commands = [
        `bun scripts/run-deltablue-bench-case.mjs utu ${caseName} ${options.iterations}`,
        `bun scripts/run-deltablue-bench-case.mjs rust ${caseName} ${options.iterations}`,
        `${nativePath} ${caseName} ${options.iterations}`,
        `bun scripts/run-deltablue-bench-case.mjs rust_arena ${caseName} ${options.iterations}`,
        `${arenaNativePath} ${caseName} ${options.iterations}`,
    ];
    const args = [
        "hyperfine",
        "--warmup",
        String(options.warmup),
        "--min-runs",
        String(options.minRuns),
        "--export-json",
        jsonPath,
        ...variantNames.flatMap(name => ["--command-name", name]),
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
        name: variantNames[index],
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
    const sizeRows = [
        {
            name: "Utu bundle",
            sourceBytes: sizes.utu.source_bytes,
            bundleBytes: sizes.utu.bundle_bytes,
        },
        {
            name: "Rust wasm",
            sourceBytes: sizes.rust_wasm.source_bytes,
            bundleBytes: sizes.rust_wasm.bundle_bytes,
        },
        {
            name: "Rust native",
            sourceBytes: sizes.rust_native.source_bytes,
            bundleBytes: sizes.rust_native.bundle_bytes,
        },
        {
            name: "Unsafe Rust wasm",
            sourceBytes: sizes.rust_arena_wasm.source_bytes,
            bundleBytes: sizes.rust_arena_wasm.bundle_bytes,
        },
        {
            name: "Unsafe Rust native",
            sourceBytes: sizes.rust_arena_native.source_bytes,
            bundleBytes: sizes.rust_arena_native.bundle_bytes,
        },
    ];
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
        "## Source vs Bundle Sizes",
        "",
        sourceBundleTable(sizeRows),
        "",
        "Source size counts only the benchmark language files. Utu bundle size combines the generated `module.mjs` and `utu.wasm` outputs.",
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
    const sortedResults = [...results].sort((left, right) => left.mean - right.mean);
    const fastest = Math.min(...sortedResults.map(result => result.mean));
    const lines = [
        "| Variant | Mean (ms) | Stddev (ms) | Min (ms) | Max (ms) | Relative | Runs |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ];
    for (const result of sortedResults) {
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

function formatMs(seconds) {
    return round(seconds * 1000);
}

function round(value) {
    return Math.round(value * 1000) / 1000;
}

function sourceBundleTable(rows) {
    const smallestSource = Math.min(...rows.map(row => row.sourceBytes));
    const lines = [
        "| Variant | Source (bytes) | Source rel. smallest | Bundle (bytes) | Bundle / Source |",
        "| --- | ---: | ---: | ---: | ---: |",
    ];

    for (const row of rows) {
        lines.push([
            "|",
            row.name,
            "|",
            row.sourceBytes,
            "|",
            `${round(row.sourceBytes / smallestSource)}x`,
            "|",
            row.bundleBytes,
            "|",
            `${round(row.bundleBytes / row.sourceBytes)}x`,
            "|",
        ].join(" "));
    }

    return lines.join("\n");
}
