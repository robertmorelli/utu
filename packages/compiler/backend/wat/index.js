export {
    isWatBackendInitialized,
    initializeWatBackend,
    WAT_BACKEND_PHASES,
    watgen,
} from './core.js';

// Keep the backend package surface stable for compiler callers.
// The owning implementation still lives in ./core.js.
