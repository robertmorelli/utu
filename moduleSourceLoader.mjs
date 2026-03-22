const IS_NODE_LIKE = typeof process === 'object' && process?.versions?.node && process?.type !== 'renderer';

export async function loadModuleFromSource(source, { preferBlobUrl = false, identifier = 'module' } = {}) {
    if (IS_NODE_LIKE) return loadNodeModuleFromSource(source, { identifier });
    if (preferBlobUrl && typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        return import(url).finally(() => URL.revokeObjectURL(url));
    }
    return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
}

async function loadNodeModuleFromSource(source, { identifier }) {
    const [{ mkdtemp, rm, writeFile }, { tmpdir }, path, { pathToFileURL }] = await Promise.all([
        import('fs/promises'),
        import('os'),
        import('path'),
        import('url'),
    ]);
    const tempDirectory = await mkdtemp(path.join(tmpdir(), 'utu-module-source-'));
    const safeIdentifier = String(identifier || 'module').replace(/[^a-zA-Z0-9._-]+/g, '-');
    const modulePath = path.join(tempDirectory, `${safeIdentifier || 'module'}.mjs`);

    await writeFile(modulePath, source, 'utf8');

    try {
        return await import(`${pathToFileURL(modulePath).href}?cacheBust=${Date.now()}`);
    } finally {
        await rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    }
}
