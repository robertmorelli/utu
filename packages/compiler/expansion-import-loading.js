import {
    childOfType,
    childrenOfType,
    kids,
    moduleNameNode,
    rootNode,
    throwOnParseErrors,
} from './expansion-shared.js';

export async function loadRootFileImports() {
    const items = this.flattenLibraryItems ? this.flattenLibraryItems(kids(this.root)) : kids(this.root);
    for (const item of items) {
        if (item.type !== 'file_import_decl') continue;
        const binding = await this.resolveFileImportBinding(item, this.uri);
        this.registerModuleTemplate(binding.template);
    }
}

export async function resolveFileImportBinding(node, fromUri) {
    if (!this.loadImport) {
        throw new Error('Cross-file module imports require a host loader.');
    }
    const sourceName = moduleNameNode(childOfType(node, 'imported_module_name'))?.text;
    const capturedName = moduleNameNode(childOfType(node, 'captured_module_name'))?.text ?? sourceName;
    const specifier = childOfType(node, 'string_lit')?.text.slice(1, -1);
    if (!sourceName || !capturedName || !specifier) {
        throw new Error('Malformed file import declaration.');
    }
    const descriptor = await this.loadImportedFile(fromUri, specifier);
    const template = descriptor.templatesByName.get(sourceName);
    if (!template) {
        throw new Error(`Imported file ${JSON.stringify(descriptor.uri)} does not define module "${sourceName}"`);
    }
    return {
        alias: capturedName,
        template: this.cloneModuleTemplate(template, capturedName),
    };
}

export async function loadImportedFile(fromUri, specifier) {
    const cacheKey = `${fromUri ?? 'memory://utu'}::${specifier}`;
    if (this.loadedFiles.has(cacheKey)) return this.loadedFiles.get(cacheKey);
    if (this.loadingFiles.has(cacheKey)) {
        throw new Error(`Cyclic file import detected for ${JSON.stringify(specifier)}`);
    }
    this.loadingFiles.add(cacheKey);
    const promise = this.loadImportedFileNow(fromUri, specifier)
        .finally(() => this.loadingFiles.delete(cacheKey));
    this.loadedFiles.set(cacheKey, promise);
    return promise;
}

export async function loadImportedFileNow(fromUri, specifier) {
    const loaded = await this.loadImport(fromUri, specifier);
    if (!loaded?.source || !loaded?.uri) {
        throw new Error(`Failed to load imported UTU file ${JSON.stringify(specifier)}`);
    }
    const parsed = loaded.root
        ? { root: rootNode(loaded.root), dispose: loaded.dispose ?? (() => {}) }
        : await this.parseImportedSource(loaded.source, loaded.uri);
    const root = rootNode(parsed.root);
    throwOnParseErrors(root);
    this.loadedFileDisposers.push(parsed.dispose);
    const fileImports = [];
    const templatesByName = new Map();

    for (const item of kids(root)) {
        if (item.type === 'file_import_decl') {
            fileImports.push(await this.resolveFileImportBinding(item, loaded.uri));
            continue;
        }
        if (item.type !== 'module_decl') {
            throw new Error(`Imported file ${JSON.stringify(loaded.uri)} may only contain module declarations and file imports`);
        }
        const template = this.buildModuleTemplate(item);
        if (templatesByName.has(template.name)) {
            throw new Error(`Imported file ${JSON.stringify(loaded.uri)} defines duplicate module "${template.name}"`);
        }
        templatesByName.set(template.name, template);
    }

    const fileBindings = new Map();
    for (const [name, template] of templatesByName) fileBindings.set(name, template);
    for (const binding of fileImports) {
        if (fileBindings.has(binding.alias)) {
            throw new Error(`Imported file ${JSON.stringify(loaded.uri)} defines duplicate module binding "${binding.alias}"`);
        }
        fileBindings.set(binding.alias, binding.template);
    }

    for (const template of templatesByName.values()) {
        template.moduleBindings = fileBindings;
    }

    return { uri: loaded.uri, templatesByName };
}

export async function parseImportedSource(source, uri) {
    if (!this.parseSource) {
        throw new Error(`Cross-file module imports require a parser for ${JSON.stringify(uri)}`);
    }
    return this.parseSource(source, uri);
}

export function buildModuleTemplate(node) {
    const name = moduleNameNode(node).text;
    const items = kids(node).filter((child) => !['identifier', 'type_ident', 'module_name', 'module_type_param_list'].includes(child.type));
    const unsupported = items.find((item) => ['module_decl', 'construct_decl', 'library_decl', 'test_decl', 'bench_decl', 'file_import_decl'].includes(item.type)) ?? null;
    if (unsupported) {
        const label = {
            module_decl: 'nested modules',
            construct_decl: 'construct declarations',
            library_decl: 'library declarations',
            test_decl: 'test declarations',
            bench_decl: 'bench declarations',
            file_import_decl: 'file imports',
        }[unsupported.type];
        throw new Error(`${label} are not supported inside modules in v1`);
    }
    return {
        name,
        typeParams: childrenOfType(childOfType(node, 'module_type_param_list'), 'type_ident').map((child) => child.text),
        items,
        moduleBindings: new Map(),
    };
}

export function cloneModuleTemplate(template, name = template.name) {
    return {
        ...template,
        name,
        typeParams: [...template.typeParams],
        items: [...template.items],
        moduleBindings: template.moduleBindings,
    };
}

export function registerModuleTemplate(template) {
    if (this.moduleTemplates.has(template.name)) {
        throw new Error(`Duplicate module "${template.name}"`);
    }
    this.moduleNames.add(template.name);
    this.moduleTemplates.set(template.name, template);
}
