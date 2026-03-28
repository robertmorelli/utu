import { parseHostImportName } from '../../document/index.js';
import { rootNode, namedChildren, childOfType, walk, stringLiteralValue } from '../frontend/tree.js';
import data from '../../../jsondata/jsgen.data.json' with { type: 'json' };

const {
    supportedWasmLocations: WASM_LOCATIONS,
    supportedModuleFormats: MODULE_FORMATS,
    importHostModuleLines: HOST_MODULE_LINES,
} = data;

export function jsgen(treeOrNode, binary, { mode = 'program', profile = null, where = 'base64', moduleFormat = 'esm', metadata = {}, source = null } = {}) {
    if (!WASM_LOCATIONS.includes(where))
        throw new Error(`Unsupported wasm location "${where}". Expected ${WASM_LOCATIONS.join(', ')}.`);
    if (!MODULE_FORMATS.includes(moduleFormat))
        throw new Error(`Unsupported module format "${moduleFormat}". Expected esm.`);

    const root = rootNode(treeOrNode);
    const { strings, exportNames } = analyze(root, mode, metadata);
    const moduleImports = groupImports(root, profile);
    const lines = [];

    if (source !== null) lines.push(`// utu source:\n// ${source.trimEnd().replace(/\n/g, '\n// ')}`);
    if (where === 'bun') lines.push(`import __wasmBytes from './${metadata.targetName ?? 'program'}.wasm';`);
    if (moduleImports.some(({ autoResolve }) => autoResolve)) lines.push(HOST_MODULE_LINES.join('\n'));

    lines.push('export async function instantiate(__wasmOverride, __hostImports = {}) {');
    for (const group of moduleImports)
        if (group.autoResolve)
            lines.push(`  const ${group.ref} = await __importHostModule(${JSON.stringify(group.module)});`);

    const wasmExpr = where === 'relative_url'
        ? `__wasmOverride ?? await (await fetch(new URL(import.meta.url.replace(/\\.(?:[cm]?js|mjs)$/u, ".wasm")))).arrayBuffer()`
        : where === 'local_file_node'
        ? `__wasmOverride ?? await (await import("node:fs/promises")).readFile(new URL(import.meta.url.replace(/\\.(?:[cm]?js|mjs)$/u, ".wasm")))`
        : where === 'external' ? '__wasmOverride'
        : `__wasmOverride ?? ${where === 'base64' || where === 'packed_base64' ? `Uint8Array.from(atob(${JSON.stringify(btoa(Array.from(binary, byte => String.fromCharCode(byte)).join('')))}),c=>c.charCodeAt(0))` : '__wasmBytes'}`;

    const importParts = [];
    if (strings.length) importParts.push(`"__strings":{${strings.map((v, i) => `${i}:${JSON.stringify(v)}`).join(',')}}`);
    for (const group of moduleImports) {
        const entries = group.entries.map(entry => `${JSON.stringify(entry.hostName)}:${renderBinding(group, entry)}`).join(',');
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

function analyze(root, mode, metadata = {}) {
    if (Array.isArray(metadata.strings))
        return { strings: metadata.strings, exportNames: collectExportNames(root) };

    const exportNames = collectExportNames(root);
    const strings = new Map(), bodies = [];
    const addBody = (node) => node && bodies.push(node);

    for (const item of namedChildren(root)) {
        if (item.type === 'fn_decl') addBody(childOfType(item, 'block'));
        else if (item.type === 'export_decl') {
            const fn = childOfType(item, 'fn_decl');
            addBody(childOfType(fn, 'block'));
        } else if (item.type === 'global_decl') addBody(namedChildren(item).at(-1));
        else if (item.type === 'test_decl' && mode === 'test') addBody(childOfType(item, 'block'));
        else if (item.type === 'bench_decl' && mode === 'bench') {
            const setup = namedChildren(childOfType(item, 'setup_decl'));
            bodies.push(...setup.slice(0, -1));
            addBody(childOfType(setup.at(-1), 'block'));
        }
    }

    for (const node of bodies) walk(node, child => {
        const value = stringLiteralValue(child);
        if (value !== null && !strings.has(value)) strings.set(value, strings.size);
    });
    return { strings: [...strings.keys()], exportNames };
}

function collectExportNames(root) {
    const exportNames = [];
    for (const item of namedChildren(root)) {
        if (item.type !== 'export_decl') continue;
        const fn = childOfType(item, 'fn_decl');
        exportNames.push(childOfType(fn, 'identifier').text);
    }
    return exportNames;
}

function groupImports(root, profile = null) {
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
        if (item.type === 'import_decl') {
            const [moduleNode, nameNode] = namedChildren(item);
            const module = moduleNode.text.slice(1, -1);
            const { hostName, hostPath } = parseHostImportName(nameNode.text);
            groupFor(module).entries.push(item.text.includes('(')
                ? { kind: 'function', hostName, hostPath, returnType: parseReturnType(childOfType(item, 'return_type')) }
                : { kind: 'value', hostName, hostPath });
        } else if (item.type === 'jsgen_decl') {
            groupFor('').entries.push({
                kind: 'inline_js',
                hostName: String(jsgenIdx++),
                jsSource: namedChildren(item)[0].text.slice(1, -1),
            });
        }
    }
    if (profile === 'ticks') groupFor('__utu_profile').entries.push({ kind: 'function', hostName: 'tick', hostPath: ['tick'] });
    return [...groups.values()];
}

function renderBinding(group, entry) {
    if (entry.kind === 'inline_js') return entry.jsSource;
    const hostImportRef = `__hostImports[${JSON.stringify(group.module)}]?.[${JSON.stringify(entry.hostName)}]`;
    const fallbackRef = group.autoResolve
        ? entry.hostPath.reduce((expression, segment) => `${expression}[${JSON.stringify(segment)}]`, group.ref)
        : (group.module === '__utu_profile' ? ['__utu_profile', ...entry.hostPath] : entry.hostPath)
            .map((segment, index) => index === 0
                ? `(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global))[${JSON.stringify(segment)}]`
                : /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(segment)
                    ? `.${segment}`
                    : `[${JSON.stringify(segment)}]`).join('');
    const resolvedRef = `(${hostImportRef} ?? ${fallbackRef})`;
    if (entry.kind === 'value') {
        const valueRef = group.autoResolve ? resolvedRef : hostImportRef;
        return `(() => { const __value = ${valueRef}; if (__value === undefined) throw new Error(${JSON.stringify(`Missing host import "${group.module}.${entry.hostName}"`)}); return __value; })()`;
    }
    const fallbackValue = !entry.returnType?.length
        ? null
        : entry.returnType.length === 1
            ? entry.returnType[0].kind === 'nullable'
                ? 'null'
                : entry.returnType[0].kind === 'exclusive'
                    ? '[null, null]'
                    : null
            : `[${entry.returnType.map(component => component.kind === 'exclusive' ? 'null, null' : 'null').join(', ')}]`;
    return fallbackValue === null
        ? resolvedRef
        : `(...__args) => { try { return ${resolvedRef}(...__args); } catch { return ${fallbackValue}; } }`;
}

function parseReturnType(node) {
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
