import { expandSourceWithDiagnostics } from "../../../compiler/stage2/api.js";
import { analyzeSourceLayout } from "../../../../packages/compiler/source-layout.js";
import { COMPILE_TARGETS } from "../../../../packages/compiler/stage3-compile-plan.js";
import { findNamedChild, findNamedChildren, spanFromNode } from "../../../document/index.js";
import { cloneDiagnostic, findCompileErrorSpan, FILE_START_OFFSET_RANGE, FILE_START_RANGE } from "../compile-diagnostics.js";

export const COMPILE_DIAGNOSTIC_MODES = Object.freeze({
    VALIDATION: "validation",
    COMPILE: "compile",
});

export const COMPILE_DIAGNOSTIC_STAGES = Object.freeze({
    FRONTEND_LOWERING: "frontend-lowering",
    BACKEND_VALIDATION: "backend-validation",
});

export async function collectCompileDiagnostics(documentState, languageService, document, { mode = COMPILE_DIAGNOSTIC_MODES.VALIDATION } = {}) {
    const normalizedMode = normalizeCompileDiagnosticMode(mode);
    const diagnostics = getBaseDiagnostics(documentState).map(cloneDiagnostic);
    if (diagnostics.length > 0) return diagnostics;
    const localShadowingDiagnostic = findLocalShadowingDiagnostic(documentState.tree.rootNode, document);
    if (localShadowingDiagnostic) {
        diagnostics.push(localShadowingDiagnostic);
        return diagnostics;
    }
    const compileDiagnostic = await tryGetCompileDiagnostic(documentState, languageService, document, normalizedMode);
    if (compileDiagnostic) diagnostics.push(compileDiagnostic);
    return diagnostics;
}

async function tryGetCompileDiagnostic(documentState, languageService, document, mode) {
    let sourceText = documentState.source;
    try {
        const expansion = await expandSourceWithDiagnostics(documentState.tree, documentState.source, {
            mode,
            uri: document.uri,
            loadImport: languageService.loadImport ?? null,
            parseSource: async (sourceText) => {
                const parsed = await languageService.parserService.parseSource(sourceText);
                return {
                    root: parsed.tree.rootNode,
                    dispose: () => parsed.dispose(),
                };
            },
        });
        if (expansion.diagnostics.length > 0) {
            return toFileStartDiagnostic(expansion.diagnostics[0], COMPILE_DIAGNOSTIC_STAGES.FRONTEND_LOWERING);
        }
        sourceText = expansion.changed ? expansion.source : documentState.source;
    } catch (error) {
        return toFileStartDiagnostic({
            message: error?.message || String(error),
            severity: "error",
            source: "utu",
        }, COMPILE_DIAGNOSTIC_STAGES.FRONTEND_LOWERING);
    }
    if (!shouldRunBackendValidation(mode, languageService)) return null;
    try {
        await languageService.compileDocument?.({
            uri: document.uri,
            sourceText,
            compileOptions: {
                mode: COMPILE_TARGETS.NORMAL,
                optimize: false,
                loadImport: languageService.loadImport ?? null,
            },
        });
        return null;
    } catch (error) {
        const message = error?.message || String(error);
        const binaryenOutput = error?.binaryenOutput ?? [];
        const isBackendValidation = binaryenOutput.length > 0 || message.includes('Generated Wasm failed validation:') || message.includes('Generated Wasm backend failure:');
        if (!isBackendValidation) {
            return toFileStartDiagnostic({
                message,
                severity: "error",
                source: "utu",
            }, COMPILE_DIAGNOSTIC_STAGES.FRONTEND_LOWERING);
        }
        const span = findCompileErrorSpan(documentState.tree.rootNode, message, binaryenOutput, document);
        return {
            message,
            ...span,
            severity: "error",
            source: "utu",
            stage: COMPILE_DIAGNOSTIC_STAGES.BACKEND_VALIDATION,
        };
    }
}

function normalizeCompileDiagnosticMode(mode) {
    switch (mode) {
        case COMPILE_DIAGNOSTIC_MODES.VALIDATION:
        case COMPILE_DIAGNOSTIC_MODES.COMPILE:
            return mode;
        default:
            throw new Error(`Unknown compile diagnostic mode "${mode}"`);
    }
}

function shouldRunBackendValidation(mode, languageService) {
    return mode === COMPILE_DIAGNOSTIC_MODES.COMPILE && typeof languageService.compileDocument === 'function';
}

function createDiagnosticCompilePlan(rootNode, mode) {
    if (mode === COMPILE_DIAGNOSTIC_MODES.COMPILE)
        return null;
    const layout = analyzeSourceLayout(rootNode);
    if (layout.errors.length > 0)
        throw new Error(layout.errors[0]);
    return {
        ...layout,
        target: COMPILE_TARGETS.NORMAL,
    };
}

function toFileStartDiagnostic(diagnostic, stage) {
    return {
        message: diagnostic.message,
        range: diagnostic.range ?? FILE_START_RANGE,
        offsetRange: diagnostic.offsetRange ?? FILE_START_OFFSET_RANGE,
        severity: diagnostic.severity ?? "error",
        source: diagnostic.source ?? "utu",
        stage,
    };
}

function getBaseDiagnostics(documentState) {
    if (hasTopLevelFileImports(documentState.tree.rootNode))
        return documentState.parseDiagnostics ?? [];
    return documentState.index.diagnostics;
}

function hasTopLevelFileImports(rootNode) {
    for (const item of rootNode?.namedChildren ?? []) {
        if (item.type === "file_import_decl")
            return true;
        if (item.type !== "library_decl")
            continue;
        for (const child of item.namedChildren ?? []) {
            if (child.type === "file_import_decl")
                return true;
        }
    }
    return false;
}

function findLocalShadowingDiagnostic(rootNode, document) {
    const localScopeStack = [];
    const pushScope = () => void localScopeStack.push(new Set());
    const popScope = () => void localScopeStack.pop();
    const declareLocal = (identifierNode) => {
        if (!identifierNode || localScopeStack.length === 0)
            return null;
        const name = identifierNode.text;
        for (const scope of localScopeStack) {
            if (scope.has(name)) {
                const span = spanFromNode(document, identifierNode);
                return {
                    message: `Local shadowing is not allowed; duplicate binding "${name}"`,
                    range: span.range,
                    offsetRange: span.offsetRange,
                    severity: "error",
                    source: "utu",
                    stage: COMPILE_DIAGNOSTIC_STAGES.FRONTEND_LOWERING,
                };
            }
        }
        localScopeStack.at(-1).add(name);
        return null;
    };
    const walkNode = (node) => {
        if (!node)
            return null;
        if (node.type === "fn_decl") {
            pushScope();
            try {
                for (const paramNode of findNamedChildren(findNamedChild(node, "param_list"), "param")) {
                    const diagnostic = declareLocal(findNamedChild(paramNode, "identifier"));
                    if (diagnostic)
                        return diagnostic;
                }
                return walkNode(findNamedChild(node, "block"));
            }
            finally {
                popScope();
            }
        }
        if (node.type === "block") {
            pushScope();
            try {
                for (const child of node.namedChildren ?? []) {
                    const diagnostic = walkNode(child);
                    if (diagnostic)
                        return diagnostic;
                }
                return null;
            }
            finally {
                popScope();
            }
        }
        if (node.type === "bind_expr") {
            for (const bindTarget of node.namedChildren.slice(0, -1)) {
                if (bindTarget.type !== "bind_target")
                    continue;
                const diagnostic = declareLocal(findNamedChild(bindTarget, "identifier"));
                if (diagnostic)
                    return diagnostic;
            }
            for (const child of node.namedChildren) {
                if (child.type === "bind_target")
                    continue;
                const diagnostic = walkNode(child);
                if (diagnostic)
                    return diagnostic;
            }
            return null;
        }
        for (const child of node.namedChildren ?? []) {
            const diagnostic = walkNode(child);
            if (diagnostic)
                return diagnostic;
        }
        return null;
    };
    return walkNode(rootNode);
}
