import { WatGen, watgen as sharedWatgen } from "./shared.js";
import { installCollectionMixin } from "./collect.js";
import { installModuleEmitterMixin } from "./emit-module.js";
import { installExpressionGeneratorMixin } from "./generate-expressions.js";
import { installTypeHelperMixin } from "./type-helpers.js";

export const WAT_BACKEND_PHASES = Object.freeze(["collect", "emit-module", "generate-expressions", "type-helpers"]);

const WAT_BACKEND_INSTALLERS = Object.freeze([
    ["collect", installCollectionMixin],
    ["emit-module", installModuleEmitterMixin],
    ["generate-expressions", installExpressionGeneratorMixin],
    ["type-helpers", installTypeHelperMixin],
]);

let watBackendInitialized = false;

export function isWatBackendInitialized() {
    return watBackendInitialized;
}

export function initializeWatBackend() {
    if (watBackendInitialized) return;
    for (const [phase, install] of WAT_BACKEND_INSTALLERS) {
        if (!WAT_BACKEND_PHASES.includes(phase)) {
            throw new Error(`Unknown WAT backend phase "${phase}"`);
        }
        install(WatGen);
    }
    watBackendInitialized = true;
}

export function watgen(treeOrNode, options) {
    initializeWatBackend();
    return sharedWatgen(treeOrNode, options);
}
