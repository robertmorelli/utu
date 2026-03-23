# Modules And Parameterized Modules

This document records the agreed surface syntax and compiler goals for the
first UTU modules implementation.

## Goals

- Modules are compile-time namespaces only.
- Parameterized modules are compile-time source expansion only.
- There are no runtime module values.
- There are no nested modules in v1.
- Cross-file use is left for later. The first implementation is file-local.
- Methods and associated functions are sugar only.

## Surface Syntax

### Module Declaration

```utu
mod boxy[T] {
    struct Box {
        value: T,
    }

    fun Box.new(value: T) Box {
        Box { value: value };
    }

    fun Box.get(self: Box) T {
        self.value;
    }
}
```

Rules:

- `mod name { ... }` declares a plain compile-time namespace.
- `mod name[T, U] { ... }` declares a parameterized compile-time namespace.
- Module bodies may contain top-level declarations that the current compiler
  already understands, subject to v1 restrictions.
- Nested `mod` declarations are not allowed in v1.

### Associated Functions / Methods

```utu
fun Box.new(value: T) Box { ... }
fun Box.get(self: Box) T { ... }
```

Rules:

- `fun TypeName.name(...)` is explicit associated-function syntax.
- If the first parameter is `self: TypeName`, the declaration is also a method.
- These are syntax sugar only and lower to ordinary flat functions.
- Free module-level functions remain `fun name(...)`.
- We do not support `boxy[i32].new(7)` in v1. Associated functions must be
  called through a type, like `boxy[i32].Box.new(7)`.

### Construct: Namespace Alias

```utu
construct box_i32 = boxy[i32];
```

Rules:

- `construct alias = module_path;` creates a compile-time namespace alias.
- The alias is valid at top level in the current file.
- `module_path` may refer to a plain module or an instantiated parameterized
  module.

### Construct: Open Into Top Level

```utu
construct boxy[i32];
```

Rules:

- `construct module_path;` opens that namespace into the current top-level
  scope from that point onward.
- Opened names are compile-time imports only.
- Name collisions are errors.
- `construct ...;` is top-level only in v1.

### Qualified Type And Function Use

```utu
let a: boxy[i32].Box = boxy[i32].Box.new(7);
let b: box_i32.Box = box_i32.Box.new(7);

construct boxy[i32];
let c: Box = Box.new(7);
let d: i32 = Box.get(c);
```

Rules:

- Types can be qualified with module paths.
- Free module-level functions can be qualified with plain module names and
  construct aliases.
- Associated functions can be qualified with module paths and types.
- Inline instantiation paths such as `boxy[i32].Box` are allowed.
- Alias-based paths such as `box_i32.Box` are allowed.

### Pipe Syntax

```utu
let y: i32 = b -o boxy[i32].Box.get(_);
```

Rules:

- Qualified associated functions are valid pipe targets.
- The normal `_` placeholder rules continue to apply.

## Explicitly Out Of Scope For V1

- Nested modules
- Runtime modules
- Cross-file module resolution
- Implicit module-level constructor calls like `boxy[i32].new(7)`
- Trait-like constraints
- Value parameters on modules
- Named module arguments
- Partial specialization

## Implementation Strategy

- Parse modules, construct declarations, associated-function declarations,
  qualified type paths, and inline instantiation paths.
- Expand all module constructs into a flat compiler-friendly declaration list
  before normal codegen.
- Canonicalize each instantiated module to one internal namespace so alias,
  inline, and open forms all refer to the same generated symbols.
- Lower associated functions and methods to flat functions with mangled names.
- Keep the backend close to today's flat top-level model.

## V1 Restrictions To Preserve Simplicity

- Module bodies are file-local.
- `construct` is top-level only.
- Instantiation arguments are positional type arguments only.
- Nested `mod` inside `mod` is rejected.

## Verification Checklist

- Plain module type qualification works.
- Parameterized module inline qualification works.
- `construct alias = ...;` works for parameterized modules.
- `construct module_path;` opens names into top level.
- Associated functions lower and call correctly through qualified names.
- Methods lower and call correctly through qualified names and pipes.
- Alias and inline paths refer to the same instantiated type.
- Name-collision cases in `construct module_path;` fail clearly.
- Exported `main` can use alias and inline module paths.
- Bench declarations can call through module-qualified aliases and types.
- Multiple instantiations of the same parameterized module can coexist.
