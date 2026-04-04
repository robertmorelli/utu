// Public compiler surface for `packages/compiler`.
//
// This file intentionally remains as a small, stable barrel so callers can
// import from a single location while internals continue to evolve.
//
// We keep both exports to preserve the historical top-level API shape.
export * from './core.js';
export * from './api/index.js';
