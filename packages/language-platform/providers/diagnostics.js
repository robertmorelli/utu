export const DIAGNOSTIC_PROVIDER_TRIGGERS = Object.freeze({
    ON_TYPE: "onType",
    ON_SAVE: "onSave",
    MANUAL: "manual",
});

export const DIAGNOSTIC_PROVIDER_MODES = Object.freeze({
    EDITOR: "editor",
    VALIDATION: "validation",
    COMPILE: "compile",
});

export async function getDocumentDiagnostics(languageService, document, options = {}) {
    const mode = normalizeDiagnosticProviderMode(options.mode ?? modeForDiagnosticTrigger(options.trigger));
    return languageService.getDiagnostics(document, { mode });
}

export function modeForDiagnosticTrigger(trigger = DIAGNOSTIC_PROVIDER_TRIGGERS.MANUAL) {
    switch (trigger) {
        case DIAGNOSTIC_PROVIDER_TRIGGERS.ON_TYPE:
            return DIAGNOSTIC_PROVIDER_MODES.EDITOR;
        case DIAGNOSTIC_PROVIDER_TRIGGERS.ON_SAVE:
        case DIAGNOSTIC_PROVIDER_TRIGGERS.MANUAL:
            return DIAGNOSTIC_PROVIDER_MODES.VALIDATION;
        default:
            throw new Error(`Unknown diagnostic provider trigger "${trigger}"`);
    }
}

function normalizeDiagnosticProviderMode(mode) {
    switch (mode) {
        case DIAGNOSTIC_PROVIDER_MODES.EDITOR:
        case DIAGNOSTIC_PROVIDER_MODES.VALIDATION:
        case DIAGNOSTIC_PROVIDER_MODES.COMPILE:
            return mode;
        default:
            throw new Error(`Unknown diagnostic provider mode "${mode}"`);
    }
}
