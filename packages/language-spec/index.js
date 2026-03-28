// Language-spec data stays discoverable through one package entrypoint.
// Keep downstream imports on this surface.

export * from './builtins.js';
export * from './docs.js';
export * from './keywords.js';
export * from './runtime-defaults.js';
export * from './symbol-metadata.js';

// That keeps the spec data package-owned rather than path-owned.
