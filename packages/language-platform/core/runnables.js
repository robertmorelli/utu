export function isRunnableMainSymbol(symbol) {
    return symbol.kind === 'function' && symbol.exported && symbol.name === 'main';
}

export function hasRunnableMain(index) {
    return index.topLevelSymbols.some(isRunnableMainSymbol);
}

export function isRunnableSymbol(symbol) {
    return symbol.kind === 'test' || symbol.kind === 'bench';
}

export function collectRunnableEntries(index) {
    const ordinals = new Map([['test', 0], ['bench', 0]]);
    return index.topLevelSymbols.flatMap((symbol) => {
        if (isRunnableMainSymbol(symbol))
            return [{ kind: 'main', symbol }];
        if (!isRunnableSymbol(symbol))
            return [];
        const ordinal = ordinals.get(symbol.kind) ?? 0;
        ordinals.set(symbol.kind, ordinal + 1);
        return [{ kind: symbol.kind, ordinal, symbol }];
    });
}
