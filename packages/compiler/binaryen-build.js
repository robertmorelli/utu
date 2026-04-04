import { runTreeWalkRewritePass } from "./rewrite-pass.js";
import { mergeBackendMetadata, normalizeMode } from "./backend-metadata-defaults.js";
import { createBinaryenIrFromWat } from "./binaryen.js";

const HISTORICAL_WAT_BACKEND_COMMIT = "18e076a";
const HISTORICAL_WAT_BACKEND_FILES = [
    "index.js",
    "core.js",
    "shared.js",
    "collect.js",
    "emit-module.js",
    "generate-expressions.js",
    "type-helpers.js",
    "protocol.js",
    "parse.js",
];
const importNodeChildProcess = Function('return import("node:child_process")');
const importNodeFsPromises = Function('return import("node:fs/promises")');
const importNodeOs = Function('return import("node:os")');
const importNodePath = Function('return import("node:path")');
const importNodeUrl = Function('return import("node:url")');
const importNodeUtil = Function('return import("node:util")');

let historicalWatgenPromise = null;

export async function compileBinaryen(treeOrNode, options = {}) {
    if (!treeOrNode) {
        throw new Error("compileBinaryen requires a syntax tree.");
    }

    const watgen = await loadHistoricalWatgen();
    const mode = normalizeMode(options.mode);
    const { wat, metadata } = watgen(treeOrNode, {
        mode,
        profile: options.profile ?? null,
    });

    const ir = await createBinaryenIrFromWat(wat, { metadata });

    return {
        kind: "binaryen-ir",
        ir,
        ...(options.emitWat ? { wat } : {}),
        metadata,
        binaryenOutput: ir.binaryenOutput,
    };
}

export async function runBuildBinaryenModule(context) {
    const binaryenMetadata = context.analyses["collect-binaryen-metadata"] ?? {};
    const loweringMetadata = context.analyses["collect-lowering-metadata"] ?? {};
    const backendMetadataDefaults = context.analyses["prepare-backend-metadata-defaults"] ?? {};
    const tree = await runTreeWalkRewritePass("build-binaryen-module", context, (node) => node);
    if (!binaryenMetadata.shouldBuildBinaryen) return { tree };

    const binaryenArtifactRaw = await compileBinaryen(context.legacyTree ?? context.artifacts.parse?.legacyTree ?? null, {
        mode: normalizeMode(loweringMetadata.backendOptions?.mode ?? backendMetadataDefaults.mode ?? "program"),
        profile: loweringMetadata.backendOptions?.profile ?? null,
        targetName: loweringMetadata.backendOptions?.targetName ?? null,
        plan: loweringMetadata.backendOptions?.plan ?? null,
        optimize: binaryenMetadata.optimize ?? true,
        emitWat: binaryenMetadata.emitWat ?? false,
    });
    const binaryenArtifact = {
        ...binaryenArtifactRaw,
        metadata: mergeBackendMetadata(
            backendMetadataDefaults.metadataDefaults ?? {},
            binaryenArtifactRaw?.metadata ?? {},
        ),
    };

    return {
        tree,
        artifacts: { binaryenArtifact },
    };
}

async function loadHistoricalWatgen() {
    if (!historicalWatgenPromise) {
        historicalWatgenPromise = materializeHistoricalWatgen();
    }
    return historicalWatgenPromise;
}

async function materializeHistoricalWatgen() {
    const [{ execFile }, { promisify }] = await Promise.all([
        importNodeChildProcess(),
        importNodeUtil(),
    ]);
    const execFileAsync = promisify(execFile);
    const [{ mkdtemp, mkdir, readFile, writeFile }, { tmpdir }, path, { pathToFileURL }] = await Promise.all([
        importNodeFsPromises(),
        importNodeOs(),
        importNodePath(),
        importNodeUrl(),
    ]);

    const repoRoot = process.cwd();
    const tempRoot = await mkdtemp(path.join(tmpdir(), "utu-historical-wat-"));
    const backendRoot = path.join(tempRoot, "packages/compiler/backends/wat");
    const frontendRoot = path.join(tempRoot, "packages/compiler/frontend");
    const sharedRoot = path.join(tempRoot, "packages/compiler/shared");
    const jsondataRoot = path.join(tempRoot, "jsondata");

    await Promise.all([
        mkdir(backendRoot, { recursive: true }),
        mkdir(frontendRoot, { recursive: true }),
        mkdir(sharedRoot, { recursive: true }),
        mkdir(jsondataRoot, { recursive: true }),
    ]);

    await Promise.all(HISTORICAL_WAT_BACKEND_FILES.map(async (fileName) => {
        const historicalPath = `packages/compiler/backends/wat/${fileName}`;
        const { stdout } = await execFileAsync("git", ["show", `${HISTORICAL_WAT_BACKEND_COMMIT}:${historicalPath}`], {
            cwd: repoRoot,
            encoding: "utf8",
            maxBuffer: 1024 * 1024 * 16,
        });
        await writeFile(
            path.join(backendRoot, fileName),
            patchHistoricalWatBackendSource(fileName, stdout),
            "utf8",
        );
    }));

    const frontendTreeHref = pathToFileURL(path.join(repoRoot, "packages/compiler/stage-tree.js")).href;
    const compilePlanHref = pathToFileURL(path.join(repoRoot, "packages/compiler/shared/compile-plan.js")).href;
    const expandUtilsHref = pathToFileURL(path.join(repoRoot, "packages/compiler/shared/expand-utils.js")).href;
    const watgenData = await readFile(path.join(repoRoot, "jsondata/watgen.data.json"), "utf8");

    await Promise.all([
        writeFile(path.join(frontendRoot, "tree.js"), `export * from ${JSON.stringify(frontendTreeHref)};\n`, "utf8"),
        writeFile(path.join(sharedRoot, "compile-plan.js"), `export * from ${JSON.stringify(compilePlanHref)};\n`, "utf8"),
        writeFile(path.join(sharedRoot, "expand-utils.js"), `export * from ${JSON.stringify(expandUtilsHref)};\n`, "utf8"),
        writeFile(path.join(jsondataRoot, "watgen.data.json"), watgenData, "utf8"),
    ]);

    const module = await import(`${pathToFileURL(path.join(backendRoot, "index.js")).href}?cacheBust=${Date.now()}`);
    return module.watgen;
}

function patchHistoricalWatBackendSource(fileName, source) {
    if (fileName !== "shared.js" || source.includes("COMPOUND_ASSIGN_BINARY_OPS,")) {
        return source;
    }
    return source.replace(
        "    DISCARD_HINT,\n    TOP_LEVEL_COLLECT_HANDLERS,\n",
        "    DISCARD_HINT,\n    COMPOUND_ASSIGN_BINARY_OPS,\n    TOP_LEVEL_COLLECT_HANDLERS,\n",
    );
}
