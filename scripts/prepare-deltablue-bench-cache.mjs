import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { compileUtuSource } from "../cli_artifact/src/lib/compiler.mjs";

const repoRoot = process.cwd();
const cacheDir = path.join(tmpdir(), "utu-deltablue-bench-cache");
const utuDir = path.join(cacheDir, "utu");
const rustWasmDir = path.join(cacheDir, "rust_wasm");
const rustNativeDir = path.join(cacheDir, "rust_native");

await rm(cacheDir, { recursive: true, force: true });
await mkdir(utuDir, { recursive: true });
await mkdir(rustWasmDir, { recursive: true });
await mkdir(rustNativeDir, { recursive: true });

const utu = await prepareUtu();
const rust = await prepareRust();

await writeFile(
    path.join(cacheDir, "sizes.json"),
    JSON.stringify({
        utu,
        rust_wasm: rust.wasm,
        rust_native: rust.native,
    }, null, 2),
    "utf8",
);

console.log(cacheDir);

async function prepareUtu() {
    const source = await readFile(path.join(repoRoot, "examples/deltablue.utu"), "utf8");
    const { js, metadata, wasm } = await compileUtuSource(source, { mode: "bench" });
    await writeFile(path.join(utuDir, "module.mjs"), js, "utf8");
    await writeFile(
        path.join(utuDir, "metadata.json"),
        JSON.stringify({ benches: metadata.benches }, null, 2),
        "utf8",
    );
    await writeFile(path.join(utuDir, "utu.wasm"), wasm);
    return {
        wasm_bytes: wasm.length,
        module_bytes: Buffer.byteLength(js, "utf8"),
        metadata_bytes: Buffer.byteLength(
            JSON.stringify({ benches: metadata.benches }, null, 2),
            "utf8",
        ),
    };
}

async function prepareRust() {
    const manifestPath = path.join(repoRoot, "benchmarks/rust_deltablue/Cargo.toml");
    const rustcPath = resolveRustcPath();
    const cargoPath = path.join(path.dirname(rustcPath), "cargo");
    const wasmBuildDir = path.join(rustWasmDir, "target");
    const nativeBuildDir = path.join(rustNativeDir, "target");
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
        },
    });
    if (buildNative.exitCode !== 0) {
        throw new Error(`cargo build failed\n${buildNative.stdout.toString()}\n${buildNative.stderr.toString()}`);
    }

    const wasmPath = path.join(
        wasmBuildDir,
        "wasm32-unknown-unknown",
        "release",
        "rust_deltablue.wasm",
    );
    const wasm = await readFile(wasmPath);
    await writeFile(path.join(rustWasmDir, "rust_deltablue.wasm"), wasm);

    const nativePath = path.join(nativeBuildDir, "release", "rust_deltablue");
    const native = await readFile(nativePath);
    const cachedNativePath = path.join(rustNativeDir, "rust_deltablue");
    await copyFile(nativePath, cachedNativePath);
    await chmod(cachedNativePath, 0o755);

    return {
        wasm: {
            wasm_bytes: wasm.length,
        },
        native: {
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
