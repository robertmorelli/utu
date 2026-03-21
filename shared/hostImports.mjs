export const CORE_ES_HOST_IMPORT_NAMES = Object.freeze([
  "console_log",
  "i64_to_string",
  "f64_to_string",
  "math_sin",
  "math_cos",
  "math_sqrt",
]);

export const WEB_RUN_MAIN_ES_IMPORT_NAMES = CORE_ES_HOST_IMPORT_NAMES;
export const CLI_ES_HOST_IMPORT_NAMES = Object.freeze([...CORE_ES_HOST_IMPORT_NAMES, "prompt"]);
export const WEB_PROMPT_BLOCKER_MESSAGE = "UTU Run Main in the VS Code web host cannot provide synchronous `prompt()`. Use the CLI to run this file.";

export function createCliHostImports({ prompt, writeLine = defaultWriteLine }) {
  return {
    es: {
      ...createCoreEsImports(writeLine),
      prompt,
    },
  };
}

export function createWebHostImports(writeLine = () => {}) {
  return {
    es: {
      ...createCoreEsImports(writeLine),
      prompt() {
        throw new Error(WEB_PROMPT_BLOCKER_MESSAGE);
      },
    },
  };
}

export function createCliImportProvider({ prompt, writeLine = defaultWriteLine }) {
  return createImportProvider(createCliHostImports, { prompt, writeLine });
}

export function createWebImportProvider(writeLine = () => {}) {
  return createImportProvider(createWebHostImports, { writeLine });
}

export function mergeImportObjects(base, override) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = isPlainObject(merged[key]) && isPlainObject(value)
      ? { ...merged[key], ...value }
      : value;
  }
  return merged;
}

function createImportProvider(createHostImports, options) {
  const logs = [];
  const imports = createHostImports({
    ...options,
    writeLine(line) {
      const text = String(line);
      logs.push(text);
      options.writeLine?.(text);
    },
  });
  return {
    imports,
    resetLogs() {
      logs.length = 0;
    },
    getLogs() {
      return [...logs];
    },
  };
}

function createCoreEsImports(writeLine) {
  return {
    console_log(value) {
      writeLine(String(value));
    },
    i64_to_string(value) {
      return String(value);
    },
    f64_to_string(value) {
      return String(value);
    },
    math_sin(value) {
      return Math.sin(value);
    },
    math_cos(value) {
      return Math.cos(value);
    },
    math_sqrt(value) {
      return Math.sqrt(value);
    },
  };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultWriteLine(line) {
  console.log(line);
}
