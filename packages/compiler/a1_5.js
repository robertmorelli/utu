import { runTreeWalkAnalysisPass } from "./a1_1.js";

export const SOURCE_KINDS = Object.freeze({
    PROGRAM: "program",
    LIBRARY: "library",
    MODULE_ONLY: "module_only",
});

// TODO(architecture): SCARY: this pass walks the normalized tree and then re-analyzes the parse tree in the same file.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

// a1.5 Analyze Source Layout:
// collect top-level runnable/export shape once so later passes consume one artifact.
export async function runA15AnalyzeSourceLayout(context) {
    runTreeWalkAnalysisPass("a1.5", context, {
        visit: () => {},
    });
    const parsed = context.artifacts.parse ?? null;
    const root = parsed?.legacyTree?.rootNode ?? context.legacyTree?.rootNode ?? null;
    if (!root) {
        return {
            sourceKind: "module_only",
            hasMain: false,
            hasLibrary: false,
            exports: [],
            tests: [],
            benches: [],
            errors: [],
        };
    }
    return analyzeSourceLayout(root);
}

export function analyzeSourceLayout(treeOrNode) {
    const root = rootNode(treeOrNode);
    const topLevelMains = [];
    const libraryFunctions = [];
    const libraryMains = [];
    const tests = [];
    const benches = [];
    let hasLibrary = false;

    for (const item of namedChildren(root)) {
        if (item.type === "library_decl") {
            hasLibrary = true;
            for (const child of namedChildren(item)) {
                if (child.type === "fn_decl") {
                    const fn = describeFunction(child);
                    if (fn) {
                        libraryFunctions.push(fn);
                        if (fn.isMain) libraryMains.push(fn);
                    }
                    continue;
                }
                collectRunnableDeclaration(child, tests, benches);
            }
            continue;
        }

        if (item.type === "fn_decl") {
            const fn = describeFunction(item);
            if (fn?.isMain) topLevelMains.push(fn);
            continue;
        }

        collectRunnableDeclaration(item, tests, benches);
    }

    const errors = [];
    if (libraryMains.length > 0) {
        errors.push("`main` cannot be declared inside `library { ... }`.");
    }
    if (hasLibrary && topLevelMains.length > 0) {
        errors.push("UTU files may define either a top-level `main` or `library { ... }`, but not both.");
    }

    const sourceKind = hasLibrary
        ? SOURCE_KINDS.LIBRARY
        : topLevelMains.length > 0
            ? SOURCE_KINDS.PROGRAM
            : SOURCE_KINDS.MODULE_ONLY;

    const normalExports = sourceKind === SOURCE_KINDS.PROGRAM
        ? topLevelMains
        : sourceKind === SOURCE_KINDS.LIBRARY
            ? libraryFunctions.filter((fn) => !fn.isMain)
            : [];

    return {
        sourceKind,
        hasMain: topLevelMains.length > 0,
        hasLibrary,
        exports: normalExports.map(({ name, exportName }) => ({ name, exportName })),
        tests,
        benches,
        errors,
    };
}

function rootNode(treeOrNode) {
    if (!treeOrNode) return null;
    if (treeOrNode.rootNode) return treeOrNode.rootNode;
    if (treeOrNode.type) return treeOrNode;
    return null;
}

function describeFunction(node) {
    const nameNode = childOfType(node, "identifier");
    const assocNode = childOfType(node, "associated_fn_name");
    if (!nameNode && !assocNode) return null;
    if (assocNode) {
        const [ownerNode, memberNode] = namedChildren(assocNode);
        const exportName = `${ownerNode.text}.${memberNode.text}`;
        return {
            name: exportName,
            exportName,
            isMain: false,
        };
    }
    return {
        name: nameNode.text,
        exportName: nameNode.text,
        isMain: nameNode.text === "main",
    };
}

function collectRunnableDeclaration(node, tests, benches) {
    if (node.type !== "test_decl" && node.type !== "bench_decl") return;
    const first = namedChildren(node)[0];
    const name = first?.text?.slice(1, -1);
    if (!name) return;
    (node.type === "test_decl" ? tests : benches).push({ name });
}

function namedChildren(node) {
    if (Array.isArray(node?.namedChildren)) {
        return node.namedChildren.filter((child) => child?.type !== "comment");
    }
    if (Array.isArray(node?.children)) {
        return node.children.filter((child) => child?.isNamed !== false && child?.type !== "comment");
    }
    return [];
}

function childOfType(node, type) {
    return namedChildren(node).find((child) => child.type === type) ?? null;
}
