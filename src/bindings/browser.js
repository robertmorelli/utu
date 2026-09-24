import { BROWSER_ABI_GZIP } from './browser-catalog.generated.js';

let abiPromise;
/** Only declarations are shared; type identities and emitted operations are per compilation. */
export function loadBrowserABI() {
  return abiPromise ??= (async () => {
    const bytes = Uint8Array.from(atob(BROWSER_ABI_GZIP), c => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const abi = JSON.parse(await new Response(stream).text());
    if (abi.version !== 1) throw new Error('Unsupported browser declaration ABI version');
    return abi;
  })().catch(error => { abiPromise = undefined; throw error; });
}

export async function browserSource() {
  return { source: 'mod Browser {}', abi: await loadBrowserABI() };
}
