// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over
// index-expanded-declarations.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// identify duplicate declarations and cross-kind naming collisions post-expansion.
export async function runDetectExpandedCollisions(context) {
    const indexed = context.analyses["index-expanded-declarations"] ?? { declarations: [], duplicates: [] };
    const collisionsByName = new Map();

    for (const entry of indexed.declarations ?? []) {
        if (!collisionsByName.has(entry.name)) collisionsByName.set(entry.name, new Set());
        collisionsByName.get(entry.name).add(entry.kind);
    }

    const kindCollisions = [...collisionsByName.entries()]
        .filter(([, kinds]) => kinds.size > 1)
        .map(([name, kinds]) => ({ name, kinds: [...kinds].sort() }));

    const diagnostics = [
        ...(indexed.duplicates ?? []).map(({ name, count }) => ({
            severity: "warning",
            source: "utu",
            phase: "detect-expanded-collisions",
            message: `Expanded tree contains duplicate declaration \"${name}\" (${count} declarations).`,
        })),
        ...kindCollisions.map(({ name, kinds }) => ({
            severity: "warning",
            source: "utu",
            phase: "detect-expanded-collisions",
            message: `Expanded tree reuses declaration name \"${name}\" across kinds: ${kinds.join(", ")}.`,
        })),
    ];

    return {
        duplicateDeclarations: indexed.duplicates ?? [],
        kindCollisions,
        diagnostics,
    };
}
