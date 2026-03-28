import { startLspServer } from './server-session.mjs';

async function main() {
  await startLspServer();
}

await main();

// This file stays intentionally small, but not hidden.
