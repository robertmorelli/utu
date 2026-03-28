export class UtuDependencyGraph {
    constructor() {
        this.entries = new Map();
    }
    clear() {
        this.entries.clear();
    }
    deleteDocument(uri) {
        this.entries.delete(uri);
    }
    updateDocument(document, header) {
        const provides = new Set(collectProvidedNames(header));
        const dependsOn = new Set(collectReferencedNames(header).filter((name) => !provides.has(name)));
        this.entries.set(document.uri, {
            version: document.version,
            provides,
            dependsOn,
        });
    }
    getDependents(uri) {
        const changed = this.entries.get(uri);
        if (!changed || changed.provides.size === 0)
            return [];
        return [...this.entries.entries()].flatMap(([candidateUri, candidate]) => {
            if (candidateUri === uri)
                return [];
            for (const name of candidate.dependsOn)
                if (changed.provides.has(name))
                    return [candidateUri];
            return [];
        });
    }
}

function collectProvidedNames(header) {
    return [
        ...(header.symbols ?? []).map((symbol) => symbol.name),
        ...(header.modules ?? []).map((moduleEntry) => moduleEntry.name),
        ...(header.constructs ?? []).map((construct) => construct.alias ?? construct.target),
    ].filter(Boolean);
}

function collectReferencedNames(header) {
    return [
        ...(header.references ?? []),
        ...(header.constructs ?? []).map((construct) => construct.target),
    ].filter(Boolean);
}
