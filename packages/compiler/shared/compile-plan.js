import { childOfType, namedChildren, rootNode } from "../stage-tree.js";

export const SOURCE_KINDS = Object.freeze({
    PROGRAM: "program",
    LIBRARY: "library",
    MODULE_ONLY: "module_only",
});

export const COMPILE_TARGETS = Object.freeze({
    NORMAL: "normal",
    TEST: "test",
    BENCH: "bench",
});

const LEGACY_MODE_TO_TARGET = Object.freeze({
    normal: COMPILE_TARGETS.NORMAL,
    program: COMPILE_TARGETS.NORMAL,
    test: COMPILE_TARGETS.TEST,
    bench: COMPILE_TARGETS.BENCH,
});

export function normalizeCompileTarget(value = COMPILE_TARGETS.NORMAL) {
    const target = LEGACY_MODE_TO_TARGET[value];
    if (target) return target;
    throw new Error(`Unknown compile target "${value}"`);
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

export function createCompilePlan(treeOrNode, { target = COMPILE_TARGETS.NORMAL } = {}) {
    const normalizedTarget = normalizeCompileTarget(target);
    const layout = analyzeSourceLayout(treeOrNode);
    if (layout.errors.length > 0) throw new Error(layout.errors[0]);
    if (normalizedTarget === COMPILE_TARGETS.NORMAL && layout.sourceKind === SOURCE_KINDS.MODULE_ONLY) {
        throw new Error("UTU normal compile requires either a top-level `fun main()` or a `library { ... }` block.");
    }
    return {
        ...layout,
        target: normalizedTarget,
    };
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
