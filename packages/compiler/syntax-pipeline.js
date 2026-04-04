// Compatibility surface for syntax-only compiler consumers.
//
// The implementation now lives in `pipeline-common.js` so the syntax-only
// entrypoint and the full compiler pipeline share one source of truth.
export {
    createCompilerSyntaxSnapshot,
    runCompilerSyntaxPipeline,
} from "./pipeline-common.js";
