# Method Promotion Notes

This file records the tightest clean path for adding `value.method(...)` after
top-level same-name type promotion landed.

## Current State

- Explicit associated calls already work:
  - `Type.method(value, ...)`
  - `mod_name.Type.method(value, ...)`
  - `Pair[i32, i32].left(value)` through promoted same-name module types
- Top-level same-name promotion is compile-time sugar only.
- Modules still lower early in `expand.js` into flat top-level declarations.
- `watgen.js` does not know about modules or promotion details. Keep it that way.

## Important Constraint

Do not implement method promotion by teaching `watgen.js` about methods.

The cheap implementation is entirely front-end:

- parser surface already exists
- `pair.left()` already parses as `call_expr(field_expr(pair, left), arg_list)`
- lower that shape in `expand.js`
- mirror the resolution in `lsp_core/languageService.js`

That keeps the backend flat and small.

## No Grammar Change Needed

`value.method(...)` already parses with the existing grammar:

- `field_expr(base, member)`
- wrapped by `call_expr`

So method promotion should not add new syntax rules unless you also want new
pipe sugar.

## Tight Compiler Strategy

Add method promotion only in `emitCallExpr`.

Order:

1. If the callee is a module field, keep the current module resolution path.
2. Otherwise, if the callee is `field_expr(base, member)`, try method lookup.
3. If method lookup succeeds, lower to the resolved associated function with
   `base` inserted as arg 0.
4. If method lookup fails, fall back to the existing field-call behavior.

Target lowering:

```utu
pair.left()
```

becomes

```utu
Type.left(pair)
```

or the already-mangled flat associated function name after expansion.

## The One Thing To Do Carefully

Do not infer methods from emitted type strings.

Use a tiny structured owner descriptor instead, something like:

```js
{ owner: 'Pair', namespace: someNamespaceOrNull }
```

That lets you resolve:

- plain top-level types
- opened module types
- module-qualified types
- promoted module types like `Pair[i32, i32]`

without reverse-engineering mangled names.

## Smallest Useful Type Tracking

The current expander only tracks local names for shadowing.

For method promotion, the cheapest useful upgrade is:

- keep local scopes as maps from name to type descriptor or `null`
- record types for:
  - params
  - `let` bindings
  - globals if easy
- keep unknown when a type is not obvious

That is enough for the common `let x: T = ...; x.method()` path.

You do not need full inference for v1.

## Cheap Receiver Inference

Support only obvious receiver forms first:

- identifier with known local/param type
- struct init
- direct associated call result with known return type
- promoted module call result with known return type
- maybe simple `else` when both sides match

If the receiver type is unknown, do not get clever. Fall back and let normal
errors happen.

Binaryen can catch the bad end states, so this path can stay compact.

## Resolution Rule

Given `base.method(args...)`:

1. infer the receiver owner descriptor for `base`
2. look up the associated function for that owner and `method`
3. emit `resolved(base, ...args)`

Use the same namespace/promoted-type helpers added for top-level promotion.

In particular:

- promoted `Pair[i32, i32]` should resolve owner `Pair` in that namespace
- alias-qualified types should resolve through the alias namespace
- opened types should still resolve through open namespace maps

## LSP Strategy

Mirror the compiler logic only in call position.

For `call_expr(field_expr(base, member), args)`:

- infer the receiver type with the same cheap owner descriptor idea
- resolve the associated function key
- suppress bogus "undefined field/function" diagnostics when method lookup wins
- keep plain field access behavior unchanged outside calls

Do not reinterpret all `field_expr` nodes as methods. Only do it when the field
expression is the callee of a call.

## Keep It Tight

- no traits
- no overload ranking
- no method values
- no `pair.left` without `()`
- no backend changes
- no monomorphization logic

If the feature stays scoped to `call_expr(field_expr(...))`, it should be a
small front-end patch instead of a compiler rewrite.
