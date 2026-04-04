import "./module-loading.js";
import "./collect/top-level.js";
import "./collect/symbols.js";
import "./collect/namespaces-open.js";
import "./collect/namespaces-expand.js";
import "./collect/namespaces-naming.js";
import "./emit/declarations-items.js";
import "./emit/declarations-types.js";
import "./emit/declarations-functions.js";
import "./emit/declarations-runtime.js";
import "./emit/type-info.js";
import "./emit/expressions-core.js";
import "./emit/expressions-values.js";
import "./emit/expressions-calls.js";
import "./emit/expressions-pipe.js";
import "./emit/expressions-resolution.js";
import "./emit/expressions-control.js";

export { ModuleExpander } from "./module-expander.js";
export {
    childOfType,
    childrenOfType,
    containsModuleFeature,
    hasAnon,
    kids,
    rootNode,
} from "./core.js";
