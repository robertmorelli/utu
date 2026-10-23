// The browser smoke check `bun run test` runs: the Wutu regressions in
// Chromium and WebKit, and the reactive example's prerender and hydration in
// Chromium. (The full galleries are `npm run test:wutu-five`, `-more`, `-rounds`.)
import { execFileSync } from 'node:child_process';

const started = performance.now();
const run = (...args) => process.stdout.write(execFileSync('node', args, { encoding: 'utf8' }));
run('scripts/test-wutu-regressions.mjs');
run('scripts/test-wutu-regressions.mjs', '--webkit');
run('cli/wutu.mjs', 'build', 'examples/wutu-reactive/main.utu', '--out', 'dist/wutu-reactive');
run('scripts/test-wutu-smooth.mjs');
console.log(`Wutu browser smoke check passed in ${((performance.now() - started) / 1000).toFixed(1)} s`);
