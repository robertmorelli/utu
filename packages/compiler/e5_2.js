import { runTreeWalkRewritePass } from "./e2_5.js";
import { collectJsgenPlanFromTree } from "./a5_2.js";
import { rootNode } from "./a1_4.js";
import data from "../../jsondata/jsgen.data.json" with { type: "json" };

const {
    supportedWasmLocations: WASM_LOCATIONS,
    supportedModuleFormats: MODULE_FORMATS,
    importHostModuleLines: HOST_MODULE_LINES,
} = data;

export function jsgen(treeOrNode, binary, {
    mode = "program",
    profile = null,
    where = "base64",
    moduleFormat = "esm",
    metadata = {},
    source = null,
    plan = null,
} = {}) {
    if (!WASM_LOCATIONS.includes(where))
        throw new Error(`Unsupported wasm location "${where}". Expected ${WASM_LOCATIONS.join(", ")}.`);
    if (!MODULE_FORMATS.includes(moduleFormat))
        throw new Error(`Unsupported module format "${moduleFormat}". Expected esm.`);

    const root = rootNode(treeOrNode);
    const resolvedPlan = plan ?? collectJsgenPlanFromTree(root, { mode, profile, metadata });
    const { strings = [], exportNames = [], moduleImports = [] } = resolvedPlan;
    const lines = [];

    if (source !== null) lines.push(`// utu source:\n// ${source.trimEnd().replace(/\n/g, "\n// ")}`);
    if (where === "bun") lines.push(`import __wasmBytes from './${metadata.targetName ?? "program"}.wasm';`);
    if (moduleImports.some(({ autoResolve }) => autoResolve)) lines.push(HOST_MODULE_LINES.join("\n"));

    lines.push(`export async function instantiate(${where === "provided_wasm_bytes" ? "__wasm_bytes" : "__wasmOverride"}, __hostImports = {}) {`);
    for (const group of moduleImports)
        if (group.autoResolve)
            lines.push(`  const ${group.ref} = await __importHostModule(${JSON.stringify(group.module)});`);

    const wasmExpr = where === "relative_url"
        ? `__wasmOverride ?? await (await fetch(new URL(import.meta.url.replace(/\\.(?:[cm]?js|mjs)$/u, ".wasm")))).arrayBuffer()`
        : where === "local_file_node"
            ? `__wasmOverride ?? await (await import("node:fs/promises")).readFile(new URL(import.meta.url.replace(/\\.(?:[cm]?js|mjs)$/u, ".wasm")))`
            : where === "external" ? "__wasmOverride"
                : where === "provided_wasm_bytes" ? "__wasm_bytes"
                    : `__wasmOverride ?? ${where === "base64" || where === "packed_base64" ? `Uint8Array.from(atob(${JSON.stringify(btoa(Array.from(binary, (byte) => String.fromCharCode(byte)).join("")))}),c=>c.charCodeAt(0))` : "__wasmBytes"}`;

    const importParts = [];
    if (strings.length) importParts.push(`"__strings":{${strings.map((value, index) => `${index}:${JSON.stringify(value)}`).join(",")}}`);
    for (const group of moduleImports) {
        const entries = group.entries.map((entry) => `${JSON.stringify(entry.hostName)}:${renderBinding(group, entry)}`).join(",");
        importParts.push(`${JSON.stringify(group.module)}:{${entries}}`);
    }
    const importsExpr = `{${importParts.join(",")}}`;

    if (where === "bun") {
        lines.push(`  const __r = await WebAssembly.instantiate(${wasmExpr}, ${importsExpr});`, "  return (__r.instance ?? __r).exports;");
    } else {
        lines.push(`  return (await WebAssembly.instantiate(${wasmExpr}, ${importsExpr})).instance.exports;`);
    }
    lines.push("}");
    if (source !== null && exportNames.length) lines.push(`// Exported functions: ${exportNames.join(", ")}`);
    return lines.join("\n");
}

// e5.2 Emit:
// emit final artifacts such as wasm, debug WAT, JS shims, and metadata.
export async function runE52Emit(context) {
    const a51 = context.analyses["a5.1"] ?? {};
    const a52 = context.analyses["a5.2"] ?? {};
    if (!a51.shouldEmitCompileArtifacts) {
        return runTreeWalkRewritePass("e5.2", context, (node) => node);
    }
    const stage5 = context.artifacts.stage5 ?? null;
    if (!stage5) {
        throw new Error("e5.2 requires stage5 artifacts from e5.1 before emission.");
    }
    const fullMetadata = {
        ...(stage5.metadata ?? {}),
        targetName: a51.backendOptions?.targetName ?? context.options?.targetName ?? null,
        artifact: {
            where: a51.wasmLocation ?? "base64",
            moduleFormat: a51.moduleFormat ?? "esm",
        },
    };
    const js = jsgen(treeOrNode, stage5.wasm, {
        mode: a52.mode ?? normalizeEmitMode(a51.backendOptions?.mode ?? "program"),
        profile: a52.profile ?? a51.backendOptions?.profile ?? null,
        where: a51.wasmLocation ?? "base64",
        moduleFormat: a51.moduleFormat ?? "esm",
        metadata: fullMetadata,
        source: a51.sourceForJs ?? null,
        plan: a52.jsgen ?? null,
    });
    const shim = (a51.wasmLocation ?? "base64") === "packed_base64" ? btoa(js) : js;
    return {
        tree: await runTreeWalkRewritePass("e5.2", context, (node) => node),
        artifacts: {
            stage5,
            output: {
                shim,
                js,
                wasm: stage5.wasm,
                metadata: fullMetadata,
                ...(a51.binaryenOptions?.emitWat ? { wat: stage5.wat } : {}),
            },
        },
    };
}

function normalizeEmitMode(mode) {
    return mode === "normal" ? "program" : mode;
}

function renderBinding(group, entry) {
    if (entry.kind === "inline_value") return entry.jsSource;
    const hostImportRef = `__hostImports[${JSON.stringify(group.module)}]?.[${JSON.stringify(entry.hostName)}]`;
    const resolvedRef = entry.kind === "inline_js"
        ? entry.jsSource
        : group.autoResolve
            ? `(${hostImportRef} ?? ${entry.hostPath.reduce((expression, segment) => `${expression}[${JSON.stringify(segment)}]`, group.ref)})`
            : hostImportRef;
    if (entry.kind === "value")
        return group.autoResolve ? resolvedRef : hostImportRef;
    const fallbackValue = !entry.returnType?.length
        ? null
        : entry.returnType.length === 1
            ? entry.returnType[0].kind === "nullable"
                ? "null"
                : entry.returnType[0].kind === "exclusive"
                    ? "[null, null]"
                    : null
            : `[${entry.returnType.map((component) => component.kind === "exclusive" ? "null, null" : "null").join(", ")}]`;
    return fallbackValue === null
        ? resolvedRef
        : `(...__args) => { try { return (${resolvedRef})(...__args); } catch { return ${fallbackValue}; } }`;
}
