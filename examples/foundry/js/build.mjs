// Builds the headless simulation for Node (tools, tests, benchmarks) and,
// once it exists, the React app for the browser.
import * as esbuild from 'esbuild';
import fs from 'node:fs';

await esbuild.build({
  entryPoints: ['src/sim.ts'], bundle: true, format: 'esm', platform: 'neutral',
  outfile: 'dist/sim.mjs', loader: { '.json': 'json' }, logLevel: 'warning',
});
if (fs.existsSync('src/main.tsx')) {
  await esbuild.build({
    entryPoints: ['src/main.tsx'], bundle: true, format: 'esm', platform: 'browser', minify: true,
    outfile: 'dist/app/app.js', loader: { '.json': 'json' }, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
  });
}
