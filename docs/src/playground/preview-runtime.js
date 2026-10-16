// Runs inside the playground's sandboxed preview frame: instantiates the module
// the playground built, with what its spec says it needs, and calls main.
// build-docs bundles this into docs/playground/preview-runtime.js.
import { instantiate } from '../../../src/selfhost/compiler.js';

window.addEventListener('message', async event => {
  if (event.data?.type !== 'wutu-run') return;
  try {
    const { exports } = await instantiate(event.data.wasm, event.data.spec);
    await exports.main?.();
    parent.postMessage({ type: 'wutu-result', ok: true }, '*');
  } catch (error) {
    parent.postMessage({ type: 'wutu-result', ok: false, error: String(error?.stack ?? error) }, '*');
  }
});

parent.postMessage({ type: 'wutu-ready' }, '*');
