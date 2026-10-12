# Still / Growing

A small persistent plant-care website authored in Utu and Wutu. Search your
plants, arrange them by watering frequency, and mark them watered. Status is
saved with the local date in localStorage and restored on reload; older dates
start a fresh day.

The page uses Wutu element/CSS blocks, typed event closures, component slots,
conditional empty states, and fused list filtering. Sorting is an inlined Utu
heapsort. There is no handwritten application JavaScript, virtual DOM, asset
fetch, or framework runtime.

Build and serve from the repository root:

```sh
node tools/dts/build-app.mjs examples/wutu-garden/main.utu dist/wutu-garden
cp examples/wutu-garden/index.html dist/wutu-garden/index.html
python3 -m http.server 8080 --directory dist/wutu-garden
```

Open http://localhost:8080. `dist/wutu-garden/sizes.json` records current raw,
gzip, and Brotli sizes for the Wasm and bundled JavaScript (including styles).
The HTML shell is a separate small asset.

```sh
node scripts/test-wutu-browser.mjs
node scripts/test-wutu-browser.mjs --webkit
```

That test builds the site, exercises search/sorting/toggles/persistence, checks
mobile overflow, writes desktop/mobile screenshots, and enforces a 6 KB gzip
application budget. See [the Wutu guide](../../docs/wutu.md) and
[iterator reference](../../docs/iterators.md).
