import { runEmptyAnalysisPass, runTreeWalkAnalysisPass } from "./a1_1.js";
import { rootNode, namedChildren, childOfType, stringLiteralValue } from "./a1_4.js";

// TODO(architecture): SCARY: this analysis pass stacks prior analyses and performs multiple tree scans for emit planning.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

// a5.2 Analyze Emit Plan:
// precompute jsgen-oriented tree facts so e5.2 consumes a pipeline analysis output.
export async function runA52AnalyzeEmitPlan(context) {
    runEmptyAnalysisPass("a5.2", context);
    const a51 = context.analyses["a5.1"] ?? {};
    const mode = normalizeEmitMode(a51.backendOptions?.mode ?? "program");
    const profile = a51.backendOptions?.profile ?? null;
    if (!a51.shouldEmitCompileArtifacts) {
        return {
            mode,
            profile,
            jsgen: emptyJsgenPlan(),
        };
    }

        ?? null;
    const stage5 = context.artifacts.stage5 ?? null;
    const metadata = stage5?.metadata ?? {};
    const semantic = context.analyses["a3.3"] ?? {};
    return {
        mode,
        profile,
        jsgen: collectJsgenPlanFromTree(root, {
            mode,
            profile,
            metadata,
            semantic,
        }),
    };
}

export const runA52PrepareEmitPlan = runA52AnalyzeEmitPlan;

export function collectJsgenPlanFromTree(root, {
    mode = "program",
    profile = null,
    metadata = {},
    semantic = {},
} = {}) {
    if (!root) {
        return {
            strings: [],
            exportNames: normalizeExportNames(metadata?.exports ?? semantic?.exports ?? []),
            moduleImports: [],
        };
    }
    const exportNames = normalizeExportNames(metadata?.exports ?? semantic?.exports ?? []);
    const strings = Array.isArray(metadata?.strings)
        ? metadata.strings
        : collectStrings(root, mode);
    const moduleImports = collectModuleImports(root, profile);
    return {
        strings,
        exportNames,
        moduleImports,
    };
}

function emptyJsgenPlan() {
    return {
        strings: [],
        exportNames: [],
        moduleImports: [],
    };
}

function normalizeEmitMode(mode) {
    return mode === "normal" ? "program" : mode;
}

function normalizeExportNames(entries = []) {
    return entries
        .map((entry) => {
            if (typeof entry === "string") return entry;
            return entry?.name ?? entry?.exportName ?? null;
        })
        .filter(Boolean);
}

function collectStrings(root, mode) {
    const bodies = [];
    const addBody = (node) => {
        if (node) bodies.push(node);
    };
    for (const item of topLevelItems(root)) {
        if (item.type === "fn_decl") {
            addBody(childOfType(item, "block"));
            continue;
        }
        if (item.type === "global_decl") {
            addBody(namedChildren(item).at(-1));
            continue;
        }
        if (item.type === "test_decl" && mode === "test") {
            addBody(childOfType(item, "block"));
            continue;
        }
        if (item.type === "bench_decl" && mode === "bench") {
            const setup = namedChildren(childOfType(item, "setup_decl"));
            bodies.push(...setup.slice(0, -1));
            addBody(childOfType(setup.at(-1), "block"));
        }
    }

    if (bodies.length === 0) return [];
    const syntheticRoot = {
        type: "emit_plan_root",
        namedChildren: bodies,
    };
    return runTreeWalkAnalysisPass("a5.2", { tree: syntheticRoot }, {
        root: syntheticRoot,
        initialState: () => ({ strings: new Map() }),
        childrenOf: (node) => node?.namedChildren ?? [],
        visit: (node, { state }) => {
            const value = stringLiteralValue(node);
            if (value !== null && !state.strings.has(value)) {
                state.strings.set(value, state.strings.size);
            }
        },
        finalize: ({ strings }) => [...strings.keys()],
    });
}

function collectModuleImports(root, profile = null) {
    const groups = new Map();
    const groupFor = (module) => {
        if (!groups.has(module)) {
            groups.set(module, {
                module,
                entries: [],
                autoResolve: module.startsWith("node:"),
                ref: `__host_module_${groups.size}`,
            });
        }
        return groups.get(module);
    };

    let jsgenIdx = 0;
    for (const item of topLevelItems(root)) {
        if (item.type !== "jsgen_decl") continue;
        const sourceNode = namedChildren(item)[0] ?? null;
        if (!sourceNode) continue;
        const returnTypeNode = childOfType(item, "return_type");
        const hostName = String(jsgenIdx++);
        groupFor("").entries.push(returnTypeNode
            ? {
                kind: "inline_js",
                hostName,
                jsSource: sourceNode.text.slice(1, -1),
                returnType: parseReturnType(returnTypeNode),
            }
            : {
                kind: "inline_value",
                hostName,
                jsSource: sourceNode.text.slice(1, -1),
            });
    }
    if (profile === "ticks") {
        groupFor("__utu_profile").entries.push({
            kind: "function",
            hostName: "tick",
            hostPath: ["tick"],
        });
    }
    return [...groups.values()];
}

function topLevelItems(root) {
    return namedChildren(root).flatMap((item) =>
        item.type === "library_decl" ? namedChildren(item) : [item]
    );
}

function parseReturnType(node) {
    if (!node) return null;
    if (childOfType(node, "void_type")) return null;
    const components = [];
    const children = node.children ?? [];
    for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        if (!child.isNamed || child.type === "void_type") continue;
        const hash = children[index + 1]?.type === "#";
        const err = hash && children[index + 2]?.isNamed ? children[index + 2] : null;
        components.push(hash && err
            ? { kind: "exclusive" }
            : { kind: child.type === "nullable_type" ? "nullable" : "plain" });
        if (hash) index += err ? 2 : 1;
    }
    return components;
}
