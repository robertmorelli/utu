import { expandSourceWithDiagnostics } from "../../../compiler/frontend/expand.js";
import { watgen } from "../../../compiler/backends/wat/index.js";
import { analyzeSourceLayout, COMPILE_TARGETS } from "../../../compiler/shared/compile-plan.js";
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
    const diagnostics = documentState.index.diagnostics.map(cloneDiagnostic);
    if (diagnostics.length > 0) return diagnostics;
    const compileDiagnostic = await tryGetCompileDiagnostic(documentState, languageService, document, normalizedMode);
    if (compileDiagnostic) diagnostics.push(compileDiagnostic);
    return diagnostics;
}

async function tryGetCompileDiagnostic(documentState, languageService, document, mode) {
    let wat;
    try {
        const expansion = expandSourceWithDiagnostics(documentState.tree, documentState.source, { mode });
        if (expansion.diagnostics.length > 0) {
            return toFileStartDiagnostic(expansion.diagnostics[0], COMPILE_DIAGNOSTIC_STAGES.FRONTEND_LOWERING);
        }
        if (!expansion.changed) {
            ({ wat } = watgen(documentState.tree, { plan: createDiagnosticCompilePlan(documentState.tree.rootNode, mode) }));
        } else {
            const expandedParsed = await languageService.parserService.parseSource(expansion.source);
            try {
                ({ wat } = watgen(expandedParsed.tree, { plan: createDiagnosticCompilePlan(expandedParsed.tree.rootNode, mode) }));
            } finally {
                expandedParsed.dispose();
            }
        }
    } catch (error) {
        return toFileStartDiagnostic({
            message: error?.message || String(error),
            severity: "error",
            source: "utu",
        }, COMPILE_DIAGNOSTIC_STAGES.FRONTEND_LOWERING);
    }
    if (!shouldRunBackendValidation(mode, languageService)) return null;
    const result = await languageService.validateWat(wat);
    if (!result) return null;
    const span = findCompileErrorSpan(documentState.tree.rootNode, result.message, result.binaryenOutput, document);
    return {
        message: result.message,
        ...span,
        severity: "error",
        source: "utu",
        stage: COMPILE_DIAGNOSTIC_STAGES.BACKEND_VALIDATION,
    };
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
    return mode === COMPILE_DIAGNOSTIC_MODES.COMPILE && Boolean(languageService.validateWat);
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
