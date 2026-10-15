// Builds the headless simulation for Node (tools, tests, benchmarks) and the
// React app for the browser. In the app, the game data is read from the page's
// #game tag (as the utu app reads it), not bundled, and the stylesheet is
// bundled as text and installed at startup (as the utu app's @css module is).
import * as esbuild from 'esbuild';
import fs from 'node:fs';

await esbuild.build({
  entryPoints: ['src/sim.ts'], bundle: true, format: 'esm', platform: 'neutral',
  outfile: 'dist/sim.mjs', loader: { '.json': 'json' }, logLevel: 'warning',
});
if (fs.existsSync('src/main.tsx')) {
  const pageData = {
    name: 'page-data',
    setup(build) {
      build.onLoad({ filter: /data[\\/]game\.json$/ }, () => ({
        contents: 'export default JSON.parse(document.getElementById("game").textContent);',
        loader: 'js',
      }));
    },
  };
  await esbuild.build({
    entryPoints: ['src/main.tsx'], bundle: true, format: 'esm', platform: 'browser', minify: true,
    outfile: 'dist/app/app.js', loader: { '.css': 'text' }, jsx: 'automatic', plugins: [pageData],
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
  });
}
