import { parseHostImportName } from './parser.js';
import { rootNode, namedChildren, childOfType, walk, stringLiteralValue } from './tree.js';
import data from './jsondata/jsgen.data.json' with { type: 'json' };

const SUPPORTED_WASM_LOCATIONS = data.supportedWasmLocations;
const SUPPORTED_MODULE_FORMATS = data.supportedModuleFormats;

export function jsgen(treeOrNode, binary, { mode = 'program', profile = null, where = 'base64', moduleFormat = 'esm', metadata = {}, source = null } = {}) {
    if (!SUPPORTED_WASM_LOCATIONS.includes(where))
        throw new Error(`Unsupported wasm location "${where}". Expected ${SUPPORTED_WASM_LOCATIONS.join(', ')}.`);
    if (!SUPPORTED_MODULE_FORMATS.includes(moduleFormat))
        throw new Error(`Unsupported module format "${moduleFormat}". Expected esm.`);

    const root = rootNode(treeOrNode);
    const { strings, exportNames } = analyze(root, mode);
    const moduleImports = groupImportsByModule(root, profile);
    const needsNodeImports = moduleImports.some(({ autoResolve }) => autoResolve);
    const lines = [];

    if (source !== null) lines.push(`// utu source:\n// ${source.trimEnd().replace(/\n/g, '\n// ')}`);
    if (where === 'bun') lines.push(`import __wasmBytes from './${metadata.targetName ?? 'program'}.wasm';`);
    if (needsNodeImports) lines.push(data.importHostModuleLines.join('\n'));

    lines.push('export async function instantiate(__wasmOverride, __hostImports = {}) {');
    for (const group of moduleImports)
        if (group.autoResolve)
            lines.push(`  const ${group.ref} = await __importHostModule(${JSON.stringify(group.module)});`);

    const wasmExpr = where === 'relative_url'
        ? `__wasmOverride ?? await (await fetch(new URL(import.meta.url.replace(/\\.(?:[cm]?js|mjs)$/u, ".wasm")))).arrayBuffer()`
        : where === 'local_file_node'
        ? `__wasmOverride ?? await (await import("node:fs/promises")).readFile(new URL(import.meta.url.replace(/\\.(?:[cm]?js|mjs)$/u, ".wasm")))`
        : where === 'external' ? '__wasmOverride'
        : `__wasmOverride ?? ${where === 'base64' || where === 'packed_base64' ? `Uint8Array.from(atob(${JSON.stringify(toBase64(binary))}),c=>c.charCodeAt(0))` : '__wasmBytes'}`;

    const importParts = [];
    if (strings.length) importParts.push(`"__strings":{${strings.map((v, i) => `${i}:${JSON.stringify(v)}`).join(',')}}`);
    for (const group of moduleImports) {
        const moduleRef = group.autoResolve ? group.ref : null;
        const entries = group.entries.map(entry => `${JSON.stringify(entry.hostName)}:${renderImportBinding(group, entry, moduleRef)}`).join(',');
        importParts.push(`${JSON.stringify(group.module)}:{${entries}}`);
    }
    const importsExpr = `{${importParts.join(',')}}`;

    if (where === 'bun') {
        lines.push(`  const __r = await WebAssembly.instantiate(${wasmExpr}, ${importsExpr});`, '  return (__r.instance ?? __r).exports;');
    } else {
        lines.push(`  return (await WebAssembly.instantiate(${wasmExpr}, ${importsExpr})).instance.exports;`);
    }
    lines.push('}');
    if (source !== null && exportNames.length) lines.push(`// Exported functions: ${exportNames.join(', ')}`);
    return lines.join('\n');
}

function analyze(root, mode) {
    const strings = new Map(), exportNames = [];
    const fnBodies = [], globalBodies = [], testBodies = [], benchBodies = [];
    const addBody = (bucket, node) => node && bucket.push(node);

    for (const item of namedChildren(root)) {
        switch (item.type) {
            case 'fn_decl':
                addBody(fnBodies, childOfType(item, 'block'));
                break;
            case 'export_decl': {
                const fn = childOfType(item, 'fn_decl');
                exportNames.push(childOfType(fn, 'identifier').text);
                addBody(fnBodies, childOfType(fn, 'block'));
                break;
            }
            case 'global_decl':
                addBody(globalBodies, namedChildren(item).at(-1));
                break;
            case 'test_decl':
                if (mode === 'test') addBody(testBodies, childOfType(item, 'block'));
                break;
            case 'bench_decl':
                if (mode !== 'bench') break;
                const named = namedChildren(childOfType(item, 'setup_decl'));
                benchBodies.push(...named.slice(0, -1));
                addBody(benchBodies, childOfType(named.at(-1), 'block'));
                break;
        }
    }

    for (const node of [...fnBodies, ...globalBodies, ...testBodies, ...benchBodies]) walk(node, child => {
        const value = stringLiteralValue(child);
        if (value !== null && !strings.has(value)) strings.set(value, strings.size);
    });
    return { strings: [...strings.keys()], exportNames };
}

function groupImportsByModule(root, profile = null) {
    const groups = new Map();
    const groupFor = (module) => {
        if (!groups.has(module)) groups.set(module, {
            module,
            entries: [],
            autoResolve: module.startsWith('node:'),
            ref: `__host_module_${groups.size}`,
        });
        return groups.get(module);
    };

    let jsgenIdx = 0;
    for (const item of namedChildren(root)) {
        if (item.type !== 'import_decl' && item.type !== 'jsgen_decl') continue;
        const entry = item.type === 'import_decl'
            ? parseImportDecl(item)
            : parseJsgenDecl(item, jsgenIdx++);
        groupFor(entry.module).entries.push(entry);
    }
    if (profile === 'ticks') groupFor('__utu_profile').entries.push({ name: 'tick', hostName: 'tick', hostPath: ['tick'], kind: 'function' });
    return [...groups.values()];
}

function parseImportDecl(node) {
    const [moduleNode, nameNode] = namedChildren(node);
    const module = moduleNode.text.slice(1, -1);
    const name = nameNode.text;
    const { hostName, hostPath } = parseHostImportName(name);
    if (node.text.includes('(')) {
        return {
            kind: 'function',
            module,
            name,
            hostName,
            hostPath,
            paramCount: namedChildren(childOfType(node, 'import_param_list')).length,
            returnType: parseReturnTypeNode(childOfType(node, 'return_type')),
        };
    }
    return { kind: 'value', module, name, hostName, hostPath };
}

function parseJsgenDecl(node, index) {
    const [sourceNode] = namedChildren(node);
    return {
        kind: 'inline_js',
        module: '',
        hostName: String(index),
        jsSource: sourceNode.text.slice(1, -1),
    };
}


function toBase64(bytes) {
    let bin = '';
    for (const byte of bytes) bin += String.fromCharCode(byte);
    return btoa(bin);
}


function renderHostImportAccess(rootExpression, path) {
    return path.reduce((expression, segment) => `${expression}[${JSON.stringify(segment)}]`, rootExpression);
}

function renderHostImportExpression(path) {
    const globalRoot = `(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global))`;
    return path.map((segment, index) => index === 0
        ? `${globalRoot}[${JSON.stringify(segment)}]`
        : /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(segment)
            ? `.${segment}`
            : `[${JSON.stringify(segment)}]`).join('');
}


function renderImportBinding(group, entry, moduleRef) {
    if (entry.kind === 'inline_js') return entry.jsSource;
    const hostImportRef = `__hostImports[${JSON.stringify(group.module)}]?.[${JSON.stringify(entry.hostName)}]`;
    const fallbackRef = moduleRef
        ? renderHostImportAccess(moduleRef, entry.hostPath)
        : renderHostImportExpression(group.module === '__utu_profile' ? ['__utu_profile', ...entry.hostPath] : entry.hostPath);
    const resolvedRef = `(${hostImportRef} ?? ${fallbackRef})`;
    if (entry.kind === 'value') {
        const valueRef = moduleRef ? resolvedRef : hostImportRef;
        return `(() => { const __value = ${valueRef}; if (__value === undefined) throw new Error(${JSON.stringify(`Missing host import "${group.module}.${entry.hostName}"`)}); return __value; })()`;
    }
    const caughtFallback = renderCaughtFallback(entry.returnType);
    return caughtFallback === null
        ? resolvedRef
        : `(...__args) => { try { return ${resolvedRef}(...__args); } catch { return ${caughtFallback}; } }`;
}

function parseReturnTypeNode(node) {
    if (!node) return null;
    if (childOfType(node, 'void_type')) return null;
    const components = [];
    for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index];
        if (!child.isNamed || child.type === 'void_type') continue;
        const hash = node.children[index + 1]?.type === '#';
        const err = hash && node.children[index + 2]?.isNamed ? node.children[index + 2] : null;
        components.push(hash && err ? { kind: 'exclusive' } : { kind: child.type === 'nullable_type' ? 'nullable' : 'plain' });
        if (hash) index += err ? 2 : 1;
    }
    return components;
}

function renderCaughtFallback(returnType) {
    if (!returnType?.length) return null;
    if (returnType.length === 1) {
        return returnType[0].kind === 'nullable'
            ? 'null'
            : returnType[0].kind === 'exclusive'
                ? '[null, null]'
                : null;
    }
    return `[${returnType.map(component => component.kind === 'exclusive' ? 'null, null' : 'null').join(', ')}]`;
}
