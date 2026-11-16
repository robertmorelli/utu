#!/usr/bin/env node
// Keep the old command discoverable while users migrate to utu.
console.error(`wutu is now part of utu:
  wutu build FILE   → utu build FILE
  wutu serve FILE   → utu FILE
  wutu format FILE  → utu format FILE`);
process.exitCode = 2;
