const IS_NODE_LIKE = typeof process === 'object' && process?.versions?.node && process?.type !== 'renderer';

export async function loadModuleFromSource(source, { preferBlobUrl = false, identifier = 'module' } = {}) {
    if (typeof source === 'string' && arguments[1]?.where === 'packed_base64') source = IS_NODE_LIKE ? Buffer.from(source, 'base64').toString('utf8') : atob(source);
    if (IS_NODE_LIKE) return loadNodeModuleFromSource(source, { identifier });
    const shouldTryBlobUrl = preferBlobUrl || typeof URL.createObjectURL === 'function';
    if (shouldTryBlobUrl) {
        try {
            return await loadBlobModuleFromSource(source);
        } catch (error) {
            if (!shouldFallbackToDataUrl(error)) throw error;
        }
    }
    return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
}

function loadBlobModuleFromSource(source) {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    return import(url).finally(() => URL.revokeObjectURL(url));
}

function shouldFallbackToDataUrl(error) {
    return error instanceof TypeError;
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
