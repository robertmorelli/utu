const IS_NODE_LIKE = typeof process === 'object' && process?.versions?.node && process?.type !== 'renderer';
const ASSET_BASE_GLOBAL = '__utuModuleSourceAssetBaseUrl';
const GLOBAL_REFERENCE = 'global' + 'This';

export async function loadModuleFromSource(source, { assetBaseUrl, assetFiles = [], preferBlobUrl = false, identifier = 'module' } = {}) {
    if (typeof source === 'string' && arguments[1]?.where === 'packed_base64') source = IS_NODE_LIKE ? Buffer.from(source, 'base64').toString('utf8') : atob(source);
    if (IS_NODE_LIKE) return loadNodeModuleFromSource(source, { assetBaseUrl, assetFiles, identifier });
    const shouldTryBlobUrl = preferBlobUrl || typeof URL.createObjectURL === 'function';
    const preparedSource = injectAssetBasePreamble(source, assetBaseUrl);
    if (shouldTryBlobUrl) {
        try {
            return await loadBlobModuleFromSource(preparedSource);
        } catch (error) {
            if (!shouldFallbackToDataUrl(error)) throw error;
        }
    }
    return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(preparedSource)}`);
}

function loadBlobModuleFromSource(source) {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    return import(url).finally(() => URL.revokeObjectURL(url));
}

function shouldFallbackToDataUrl(error) {
    return error instanceof TypeError;
}

async function loadNodeModuleFromSource(source, { assetBaseUrl, assetFiles, identifier }) {
    const [{ mkdtemp, readFile, rm, writeFile }, { tmpdir }, path, { pathToFileURL }] = await Promise.all([
        import('fs/promises'),
        import('os'),
        import('path'),
        import('url'),
    ]);
    const tempDirectory = await mkdtemp(path.join(tmpdir(), 'utu-module-source-'));
    const safeIdentifier = String(identifier || 'module').replace(/[^a-zA-Z0-9._-]+/g, '-');
    const modulePath = path.join(tempDirectory, `${safeIdentifier || 'module'}.mjs`);

    await writeFile(modulePath, injectAssetBasePreamble(source, assetBaseUrl), 'utf8');
    await Promise.all(assetFiles.map(async (asset) => {
        const { sourcePath, targetName } = normalizeAssetFile(asset, path);
        await writeFile(path.join(tempDirectory, targetName), await readFile(sourcePath));
    }));

    try {
        return await import(`${pathToFileURL(modulePath).href}?cacheBust=${Date.now()}`);
    } finally {
        await rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    }
}

function injectAssetBasePreamble(source, assetBaseUrl) {
    if (typeof assetBaseUrl !== 'string' || assetBaseUrl.length === 0)
        return source;
    const preamble = `(Function('return this')()).${ASSET_BASE_GLOBAL} = ${JSON.stringify(assetBaseUrl)};\n`;
    return `${preamble}${source}`;
}

function normalizeAssetFile(asset, path) {
    if (typeof asset === 'string' || asset instanceof URL) {
        const pathname = asset instanceof URL ? asset.pathname : asset;
        return { sourcePath: asset, targetName: path.basename(pathname) };
    }
    if (asset && (typeof asset.source === 'string' || asset.source instanceof URL) && typeof asset.target === 'string') {
        return { sourcePath: asset.source, targetName: asset.target };
    }
    throw new Error('assetFiles entries must be a path, URL, or { source, target } object.');
}
