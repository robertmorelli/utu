# Language Spec Package

This package is the single obvious home for language metadata that used to be scattered across JSON imports.

Current modules:

- [`builtins.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-spec/builtins.js)
- [`keywords.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-spec/keywords.js)
- [`docs.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-spec/docs.js)
- [`symbol-metadata.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-spec/symbol-metadata.js)
- [`runtime-defaults.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-spec/runtime-defaults.js)
- [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-spec/index.js)

Design rule:

- start by co-locating metadata and re-exporting it
- only add generation if co-location alone stops being enough
