const SUPPORTED_RUN_MAIN_ES_IMPORTS = new Set([
    'console_log',
    'i64_to_string',
    'f64_to_string',
    'math_sin',
    'math_cos',
    'math_sqrt',
]);
export function getRunMainBlockerMessage(source) {
    const unsupportedImports = collectUnsupportedRunMainImports(source);
    if (!unsupportedImports.length) {
        return undefined;
    }
    const promptImport = unsupportedImports.find((entry) => entry.module === 'es' && entry.name === 'prompt');
    if (promptImport) {
        return 'UTU Run Main in the VS Code web host cannot provide synchronous `prompt()`. Use the CLI to run this file.';
    }
    const nodeImport = unsupportedImports.find((entry) => entry.module.startsWith('node:'));
    if (nodeImport) {
        return `UTU Run Main in the VS Code web host cannot auto-load \`${nodeImport.module}\`. Use the CLI to run this file.`;
    }
    const labels = unsupportedImports.map((entry) => `\`${entry.module}:${entry.name}\``).join(', ');
    return `UTU Run Main in the VS Code web host only supports built-in host imports. This file needs ${labels}. Use the CLI to run this file.`;
}
export function collectUnsupportedRunMainImports(source) {
    const unsupported = [];
    const importPattern = /^\s*import\s+extern\s+"([^"]+)"\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
    for (const match of source.matchAll(importPattern)) {
        const [, moduleName = '', importName = ''] = match;
        if (moduleName === 'es' && SUPPORTED_RUN_MAIN_ES_IMPORTS.has(importName)) {
            continue;
        }
        unsupported.push({ module: moduleName, name: importName });
    }
    return unsupported;
}
