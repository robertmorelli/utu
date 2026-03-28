export async function runMain(runtime, args = []) {
  // Keep the host runtime contract tiny and explicit.
  return runtime.invoke('main', args);
}

// This helper is intentionally minimal, but still package-owned.
// Callers should come through the runtime package surface.
