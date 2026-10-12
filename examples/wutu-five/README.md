# Five working Wutu websites

All application UI, CSS, event handlers, and state logic are in each `main.utu`. The build script supplies only the HTML boot shell, a gallery, and escaped source viewers. The sites use no handwritten application JavaScript, external fonts, remote images, or UI runtime dependencies.

| Source | Website | Working features |
| --- | --- | --- |
| [folio/main.utu](folio/main.utu) | Reading library | Add/remove books, search, status filter, finished toggle |
| [juniper/main.utu](juniper/main.utu) | Café order notebook | Menu categories, quantities, subtotal, clear order |
| [wayfarer/main.utu](wayfarer/main.utu) | Weekend planner | Add/remove stops, day filter, visited state, budget |
| [signal/main.utu](signal/main.utu) | Conference agenda | Day/track filters, saved agenda, conflicts, ICS export |
| [scope/main.utu](scope/main.utu) | Project estimator | Add/edit/delete work, totals, project name, CSV export |

Every site saves to localStorage. Juniper and Signal are fictional brands; order notes do not submit orders, and the conference programme is illustrative. Wayfarer is a notebook, not a booking service.

```sh
node scripts/build-wutu-five.mjs
python3 -m http.server 4174 --bind 127.0.0.1 --directory dist/wutu-five
```

Open `http://127.0.0.1:4174/`. Each card opens its website or exact source. Every website also links its source viewer, which has a downloadable `main.utu`.

```sh
node scripts/test-wutu-five.mjs
node scripts/test-wutu-five.mjs --webkit
```

Tests cover interaction paths, reload persistence, CSV quoting, ICS contents, literal text rendering, mobile overflow at 390px, source parity, and a 7,000-byte gzip budget per complete page. They also save desktop/mobile screenshots in the build directory. Run the build before these tests. Playwright's Chromium and WebKit binaries must be installed.

`sizes.json` in the gallery root records measured sizes. The gzip totals add separately compressed HTML, Wasm and JavaScript (including generated CSS); they exclude source viewers, screenshots, HTTP headers, and the optional gallery. The Python preview server sends uncompressed assets; compression figures describe deployment with compression enabled.

See [the rough-edge review](../../docs/wutu-five-review.md) for limitations and proposed iterators.
