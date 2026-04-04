import { cloneSymbol } from './analyze-clone.js';

export function hydrateHeaderSnapshot(shallowHeader, index) {
    const symbols = index.topLevelSymbols.map(cloneSymbol);
    return {
        ...shallowHeader,
        kind: 'header',
        imports: symbols
            .filter((symbol) => symbol.kind === 'importFunction' || symbol.kind === 'importValue')
            .map(({ name, kind, signature, typeText }) => ({ name, kind, signature, typeText })),
        fileImports: shallowHeader.fileImports,
        exports: symbols
            .filter((symbol) => symbol.exported)
            .map(({ name, kind, signature }) => ({ name, kind, signature })),
        symbols,
        modules: shallowHeader.modules,
        constructs: shallowHeader.constructs,
        references: shallowHeader.references,
        tests: symbols.filter((symbol) => symbol.kind === 'test').map(({ name }) => ({ name })),
        benches: symbols.filter((symbol) => symbol.kind === 'bench').map(({ name }) => ({ name })),
        hasMain: shallowHeader.hasMain,
        hasLibrary: shallowHeader.hasLibrary,
        sourceKind: shallowHeader.sourceKind,
    };
}
