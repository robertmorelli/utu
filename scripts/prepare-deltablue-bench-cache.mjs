import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import grammarWasmPath from "../tree-sitter-utu.wasm" with { type: "file" };
import runtimeWasmPath from "web-tree-sitter/web-tree-sitter.wasm" with { type: "file" };

import * as compiler from "../index.js";

const repoRoot = process.cwd();
const compilerAssetOptions = { wasmUrl: grammarWasmPath, runtimeWasmUrl: runtimeWasmPath };
const cacheDir = path.join(tmpdir(), "utu-deltablue-bench-cache");
const utuDir = path.join(cacheDir, "utu");
const rustWasmDir = path.join(cacheDir, "rust_wasm");
const rustNativeDir = path.join(cacheDir, "rust_native");
const rustArenaWasmDir = path.join(cacheDir, "rust_arena_wasm");
const rustArenaNativeDir = path.join(cacheDir, "rust_arena_native");

await rm(cacheDir, { recursive: true, force: true });
await Promise.all([
    mkdir(utuDir, { recursive: true }),
    mkdir(rustWasmDir, { recursive: true }),
    mkdir(rustNativeDir, { recursive: true }),
    mkdir(rustArenaWasmDir, { recursive: true }),
    mkdir(rustArenaNativeDir, { recursive: true }),
]);

const utu = await prepareUtu();
const rust = await prepareRustVariant({
    manifestPath: path.join(repoRoot, "examples/rust_benchmarks/rust_deltablue/Cargo.toml"),
    artifactName: "rust_deltablue",
    wasmDir: rustWasmDir,
    nativeDir: rustNativeDir,
    nativeRustFlags: "-C target-cpu=native",
});
const rustArena = await prepareRustVariant({
    manifestPath: path.join(repoRoot, "examples/rust_benchmarks/rust_deltablue_arena/Cargo.toml"),
    artifactName: "rust_deltablue_arena",
    wasmDir: rustArenaWasmDir,
    nativeDir: rustArenaNativeDir,
    nativeRustFlags: "-C target-cpu=native",
});

await writeFile(
    path.join(cacheDir, "sizes.json"),
    JSON.stringify({
        utu,
        rust_wasm: rust.wasm,
        rust_native: rust.native,
        rust_arena_wasm: rustArena.wasm,
        rust_arena_native: rustArena.native,
    }, null, 2),
    "utf8",
);

console.log(cacheDir);

async function prepareUtu() {
    const source = await readFile(path.join(repoRoot, "examples/deltablue.utu"), "utf8");
    await compiler.init(compilerAssetOptions);
    const { js, metadata, wasm } = await compiler.compile(source, { mode: "bench", ...compilerAssetOptions });
    const moduleBytes = Buffer.byteLength(js, "utf8");
    await writeFile(path.join(utuDir, "module.mjs"), js, "utf8");
    await writeFile(
        path.join(utuDir, "metadata.json"),
        JSON.stringify({ benches: metadata.benches }, null, 2),
        "utf8",
    );
    await writeFile(path.join(utuDir, "utu.wasm"), wasm);
    return {
        source_artifact: "examples/deltablue.utu",
        source_bytes: Buffer.byteLength(source, "utf8"),
        bundle_artifact: "module.mjs + utu.wasm",
        bundle_bytes: moduleBytes + wasm.length,
        wasm_bytes: wasm.length,
        module_bytes: moduleBytes,
        metadata_bytes: Buffer.byteLength(
            JSON.stringify({ benches: metadata.benches }, null, 2),
            "utf8",
        ),
    };
}

async function prepareRustVariant({ manifestPath, artifactName, wasmDir, nativeDir, nativeRustFlags }) {
    const rustcPath = resolveRustcPath();
    const cargoPath = path.join(path.dirname(rustcPath), "cargo");
    const wasmOptPath = resolveWasmOptPath();
    const wasmBuildDir = path.join(wasmDir, "target");
    const nativeBuildDir = path.join(nativeDir, "target");

    const buildWasm = Bun.spawnSync([
        cargoPath,
        "build",
        "--release",
        "--target",
        "wasm32-unknown-unknown",
        "--manifest-path",
        manifestPath,
        "--target-dir",
        wasmBuildDir,
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
    if (buildWasm.exitCode !== 0) {
        throw new Error(`cargo build failed\n${buildWasm.stdout.toString()}\n${buildWasm.stderr.toString()}`);
    }

    const buildNative = Bun.spawnSync([
        cargoPath,
        "build",
        "--release",
        "--manifest-path",
        manifestPath,
        "--target-dir",
        nativeBuildDir,
    ], {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
        env: {
            ...process.env,
            CARGO_TERM_COLOR: "never",
            RUSTC: rustcPath,
            RUSTFLAGS: joinRustFlags(process.env.RUSTFLAGS, nativeRustFlags),
        },
    });
    if (buildNative.exitCode !== 0) {
        throw new Error(`cargo build failed\n${buildNative.stdout.toString()}\n${buildNative.stderr.toString()}`);
    }

    const wasmPath = path.join(
        wasmBuildDir,
        "wasm32-unknown-unknown",
        "release",
        `${artifactName}.wasm`,
    );
    const optimizedWasmPath = path.join(wasmDir, "module.opt.wasm");
    const optimizeWasm = Bun.spawnSync([
        wasmOptPath,
        "-O4",
        wasmPath,
        "-o",
        optimizedWasmPath,
    ], {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
    });
    if (optimizeWasm.exitCode !== 0) {
        throw new Error(`wasm-opt failed\n${optimizeWasm.stdout.toString()}\n${optimizeWasm.stderr.toString()}`);
    }
    const wasm = await readFile(optimizedWasmPath);
    await writeFile(path.join(wasmDir, "module.wasm"), wasm);

    const nativePath = path.join(nativeBuildDir, "release", artifactName);
    const native = await readFile(nativePath);
    const cachedNativePath = path.join(nativeDir, "runner");
    await copyFile(nativePath, cachedNativePath);
    await chmod(cachedNativePath, 0o755);
    const sourceBytes = await sumFileBytes([
        path.join(path.dirname(manifestPath), "src", "lib.rs"),
        path.join(path.dirname(manifestPath), "src", "main.rs"),
    ]);

    return {
        wasm: {
            source_artifact: "src/lib.rs + src/main.rs",
            source_bytes: sourceBytes,
            bundle_artifact: `${artifactName}.wasm`,
            bundle_bytes: wasm.length,
            wasm_bytes: wasm.length,
        },
        native: {
            source_artifact: "src/lib.rs + src/main.rs",
            source_bytes: sourceBytes,
            bundle_artifact: `release/${artifactName}`,
            bundle_bytes: native.length,
            binary_bytes: native.length,
        },
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

function resolveWasmOptPath() {
    return path.join(repoRoot, "node_modules", "binaryen", "bin", "wasm-opt");
}

function joinRustFlags(existing, extra) {
    return existing ? `${existing} ${extra}` : extra;
}

async function sumFileBytes(paths) {
    const files = await Promise.all(paths.map(file => readFile(file)));
    return files.reduce((sum, file) => sum + file.length, 0);
}
