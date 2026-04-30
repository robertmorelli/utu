# Utu Lowering Spec

Companion to `new_spec2.md`. For every construct in the language spec, this
document pins the exact wasm shape it lowers to. Audit by walking each section
against the codegen modules under `src/compiler/codegen/`.

Status legend (right-hand margin on each item):

- **DONE** — emitted today; covered by a runnable test in `scripts/run-tests.mjs`
- **STUB** — the codegen path exists and throws an explicit "not yet implemented" error; lowering plan is fixed
- **PLAN** — no code yet; lowering plan is fixed but the IR may not even reach codegen

Wasm dialect: WasmGC + reference types + bulk memory + mutable globals.
Today's binaryen feature flags (`codegen/index.js`) only enable
`MutableGlobals | BulkMemory`; everything reference-typed will require flipping
on `GC | ReferenceTypes` (and `SIMD128` for v128) before it can validate.

---

## 1. Top-level forms

### `export main(args) ret { body }`                                    **DONE**

Pre-codegen: `bringTargetToTopLevel` (`bring-target-to-top-level.js`)
converts to:

```html
<ir-fn data-export="main">
  <ir-fn-name kind="free" name="main"/>
  …params/return/body…
</ir-fn>
```

Wasm:

```wat
(func $main (export "main") (param …) (result …) …body…)
```

No wasm `start` function — `main` is exported and the host invokes it.

### `export lib { fn… fn… }`                                            **DONE**

Each enclosed `fn` is hoisted to top level with `data-export="wasm"`.
Wasm: each becomes `(func $name (export "name") …)`. Non-fn members are a
parse-time error per spec rule.

### Mutual exclusion of `export main` / `export lib`                    **DONE**

Enforced in `bringTargetToTopLevel` — single entry-file invariant; no codegen
implication.

---

## 2. Nominal qualifiers

These prefix struct/enum decls and *only* affect the type's wasm shape and
the dispatch instructions that target it. They do not add user-visible fields.

### `tag` on a **struct**                                          **PLAN**

Adds a synthetic first field `__tag : i32` set at construction. The tag value
is fixed per type and assigned by `link-type-decls` (any nominal struct gets a
unique non-zero tag in its type-family). Used by `alt` over an open
struct hierarchy.

```wat
(type $T (struct (field $__tag i32) (field $f1 …) …))
```

### `rec` on a **struct**                                          **PLAN**

Declares the struct as `(sub …)`-able so other structs can extend it. The
struct itself has no extra field. Subtypes are introduced by other declarations
(typically variant structs) and form a closed hierarchy known at codegen time.

```wat
(type $T (sub (struct (field $f1 …) …)))     ;; root, no supertype
(type $TVariant (sub $T (struct (field $f1 …) (field $extra …))))
```

The repeated `(field $f1 …)` in the subtype is the WasmGC text-format
requirement to spell out the inherited prefix — not a second physical slot.
See the variant-enum section for details.

### `tag rec`                                                     **PLAN**

Both apply: the struct has a `__tag : i32` first field *and* is extensible.
`alt` may dispatch by tag (cheaper) or by `br_on_cast` (necessary if the variant
carries fields the parent doesn't). Codegen prefers tag dispatch when the arms
only need to discriminate (no field reads on cast value).

### Plain struct (no qualifier)                                         **PLAN**

```wat
(type $T (struct (field $f1 …) …))
```

No supertype, no tag, cannot be `alt`'d. Held as `(ref $T)` or `(ref null $T)`.

---

## 3. Protocols                                                          **PLAN**

A `proto` declaration generates **two** wasm types and one fat-pointer
representation.

### Vtable type

```
proto P:
  | get a : i32
  | set b : f64
  | get set c : T1
  | foo(i32, f64) T2
  | bar() void
```

Lowers to:

```wat
;; one funcref slot per member; getters/setters get distinct slots
(type $P_vtable
  (struct
    (field $get_a (ref (func (param (ref $P_data)) (result i32))))
    (field $set_b (ref (func (param (ref $P_data)) (param f64))))
    (field $get_c (ref (func (param (ref $P_data)) (result <T1>))))
    (field $set_c (ref (func (param (ref $P_data)) (param  <T1>))))
    (field $foo   (ref (func (param (ref $P_data)) (param i32) (param f64) (result <T2>))))
    (field $bar   (ref (func (param (ref $P_data)))))))
```

`$P_data` is an opaque ref — concretely `anyref` or the nearest common
supertype if the implementors share one.

### Proto value layout (fat pointer)

```wat
(type $P
  (struct
    (field $data   (ref any))            ;; the concrete instance
    (field $vtable (ref $P_vtable))))    ;; impl's vtable
```

### Vtable allocation

For every type `T` that implements `P`, the codegen emits one **module-init
constant**:

```wat
(global $P_vtable_for_T (ref $P_vtable)
  (struct.new $P_vtable
    (ref.func $P[T].get_a)
    (ref.func $P[T].set_b)
    …))
```

### Up-cast (concrete → proto)

`let p: P = some_t` lowers to:

```wat
(struct.new $P
  (local.get $some_t)              ;; data
  (global.get $P_vtable_for_T))    ;; vtable
```

### Member call `p.foo(x, y)`

```wat
(call_ref $foo_sig
  (struct.get $P $data    (local.get $p))
  (local.get $x) (local.get $y)
  (struct.get $P_vtable $foo
    (struct.get $P $vtable (local.get $p))))
```

`call_ref`, not `call_indirect` — typed funcrefs validate against the slot's
function type with no runtime signature check.

### Getter `p.a`

```wat
(call_ref $get_a_sig
  (struct.get $P $data   (local.get $p))
  (struct.get $P_vtable $get_a
    (struct.get $P $vtable (local.get $p))))
```

### Setter `p.b = v`

Same shape as a member call; `set_b` returns void.

### Variance (`in P` / `out P`)

Checked at use-site by `check-module-variance.js`. **No codegen effect** — a
proto value is the same fat pointer regardless of variance. Variance only
gates which up-casts the type checker accepts.

### `fn P[T].foo |t1| (…)` (concrete impl)                              **PLAN**

A normal monomorphic wasm function `(func $P[T].foo (param $t1 (ref $T)) …)`.
Reachable only via the vtable funcref slot; never called directly except by
synthesized vtable wiring.

### `fn P.foo |p1| (…)` (virtual entry)                                 **PLAN**

Declares the slot signature in `$P_vtable`. No code is emitted for the entry
itself — the slot is filled per implementor. Calls on a value of type `P` go
through the call-via-vtable shape above.

---

## 4. Structs                                                            **DONE for scalar + nested struct fields / PLAN for tag, generics, recursive struct fields**

A struct type lowers exactly per the qualifier table above. Construction:

```utu
T1 { field1: 10, field2: x }
```

→

```wat
(struct.new $T1 (i32.const 10) (local.get $x))
```

For `tag` structs, the `__tag` field is prepended automatically:

```wat
(struct.new $T1 (i32.const <tag-of-T1>) (i32.const 10) (local.get $x))
```

Implicit init `&{ … }` is identical — `&` is resolved to the surrounding
type at IR time.

Type parameters `T1[P1, P2]`: the codegen **monomorphizes**. `T1[A, B]` and
`T1[C, D]` are two distinct wasm types with name-mangled identifiers
(`T1__A__B`, `T1__C__D`). No type erasure.

---

## 5. Enums                                                              **PLAN**

Enums are always `tag` per spec. Two sub-shapes:

### Payload-less enum

```utu
tag enum Color: | Red | Green | Blue
```

Lowers to a plain i32 valtype. No struct allocated. Variant constants
assigned at link time:

```wat
;; Red = 0, Green = 1, Blue = 2
(i32.const 0) (i32.const 1) (i32.const 2)
```

### Variant enum (named-field variants)

```utu
tag enum Result[T]:
  | Ok  { value : T }
  | Err { message : str }
```

Lowers to a parent-and-subtypes hierarchy:

```wat
(type $Result      (sub (struct (field $__tag i32))))
(type $Result_Ok   (sub $Result (struct (field $__tag i32) (field $value <T>))))
(type $Result_Err  (sub $Result (struct (field $__tag i32) (field $message externref))))
```

> **WasmGC subtyping note.** The `$__tag` in `$Result_Ok` is **not a second
> field** — it's the WasmGC text-format requirement that a subtype spell out
> the full prefix of its parent's fields. Physically there is **one** tag slot
> at offset 0; the parent's `$__tag` and the child's `$__tag` are the same
> memory. `struct.new $Result_Ok (tag) (value)` allocates 2 i32 slots
> (+ object header), not 3. Field labels in WasmGC are local to each type def;
> we reuse the name for clarity but they're independent symbols.

Construction `Ok { value: 42 }`:

```wat
(struct.new $Result_Ok (i32.const 0) (i32.const 42))
;; tag (offset 0) | value (offset 4)
```

Tag values are stable per variant — `Ok = 0`, `Err = 1`, in declaration order.

A value of type `Result[T]` is held as `(ref $Result)` (the parent). To read
variant fields you `alt`-dispatch and operate on the cast `(ref $Result_Ok)` —
the cast is zero-cost (no memory move; same object, narrower type).

---

## 6. Functions                                                          **DONE / PLAN**

### Free function `fn foo(…) T { … }`                                   **DONE**

```wat
(func $foo (param $a …) … (result <T>) …body…)
```

Param locals are addressed by index in the order they appear. `let` bindings
are appended as additional locals.

### Method `fn T.foo |t1| (…) ret { … }`                                **DONE for scalar self / PLAN for struct self**

Mangled name `T.foo`, self prepended as the first param:

```wat
(func $T.foo (param $t1 <ref-to-T>) (param $a …) … (result <ret>) …)
```

For `T = i32` etc., self is the scalar valtype directly.
For struct/enum self, self is `(ref $T)`. The wasm function is plain — no
implicit dispatch. All call-site monomorphism.

### Static method `fn T.zero() T`                                       **DONE for scalar / PLAN for struct**

Same as a free fn but namespaced under T. No self param.

### Operator overload `fn T:add |a, b| T`                               **DONE (intrinsics) / PLAN (user-defined)**

For std-lib scalar wrappers (`fn i32:add |a,b| i32 { @ir/\ <ir-i32-add/> \/ }`),
the function is **never emitted as a real wasm function**. `lowerOperators`
rewrites `a + b` to `i32:add(a, b)`; `emitCall` sees the wrapper, recognizes
its `@ir` body via `describeIntrinsicWrapper` (`codegen/intrinsics.js`), and
inlines the corresponding wasm op directly:

```wat
(i32.add <a-expr> <b-expr>)
```

User-defined overloads on user types lower as ordinary methods (a real wasm
function call), no special path.

### Protocol impl `fn P[T].foo |t1| (…)`                                **PLAN**

See Protocols section. Concrete monomorphic function; reachable only via the
vtable.

### Protocol method `fn P.foo |p1| (…)`                                 **PLAN**

Declares the vtable slot signature. Body is the *default* implementation if
provided (rare); otherwise there is no body and each impl must supply one.

---

## 7. Modules                                                            **DONE**

`mod M[T1, T2] { … }` is the unit of monomorphization.

- `&` is resolved by `expandPromotedType` (in earlier passes) to the module's
  promoted type before codegen sees the IR.
- `using M[i32, f64]` produces a fresh instantiation. Names inside are
  mangled with the type-arg suffixes: `M__i32__f64.fn_name`,
  `M__i32__f64.&` (which itself was already resolved to the type name).
- `using M[i32, f64] |Alias|` adds an in-scope alias; codegen still sees the
  mangled global name.
- Inline instantiation `Array[i32].new(10)` triggers auto-instantiation
  (already implemented and tested).

`mod` does not nest — enforced at parse time.

### Variance annotations on type params (`out P`, `in P`)               **DONE in checker**

Checked by `check-module-variance.js`. **No codegen effect.**

---

## 8. Type declarations (wasm-native binding)                            **DONE for scalars / PLAN for refs**

`type & = @ir/\ <ir-wasm-* …/> \/` binds `&` to a primitive wasm type. The
codegen reads the `<ir-wasm-*>` node from inside the `ir-type-def` and emits:

| `<ir-wasm-…>` form                              | wasm type emitted                                       | status   |
|-------------------------------------------------|---------------------------------------------------------|----------|
| `<ir-wasm-scalar kind="i32"/>`                  | `i32` (no type def — collapsed to valtype)              | **DONE** |
| `<ir-wasm-scalar kind="f64"/>` …                | `f64` …                                                 | **DONE** |
| `<ir-wasm-array elem="T" mut="true"/>`          | `(type $name (array (mut <T>)))`                        | **PLAN** |
| `<ir-wasm-array elem="T" mut="false"/>`         | `(type $name (array <T>))`                              | **PLAN** |
| `<ir-wasm-extern/>`                             | `externref` (collapsed to valtype)                      | **PLAN** |
| `<ir-wasm-i31/>`                                | `i31ref` (collapsed to valtype)                         | **PLAN** |
| `<ir-wasm-v128/>`                               | `v128` (collapsed to valtype)                           | **PLAN** |

Type-arg substitution into the `@ir` body is done **before** codegen
(`module-instantiate` pass), so the codegen always sees concrete elements.

---

## 9. Using                                                              **DONE for in-file / cross-file**

Pure pre-codegen concern. By the time codegen runs, every name has been
resolved to its instantiated module's mangled identifier. `using` produces no
wasm output of its own.

Auto-imports (`i32 u32 i64 u64 f32 f64 bool str Array`) are handled by the
loader registering them in the binding scope; codegen sees no difference
between an explicit and an auto `using`.

---

## 10. Scalar types                                                      **DONE (sized) / PLAN (rest)**

| utu      | wasm valtype  | notes                                            | status   |
|----------|---------------|--------------------------------------------------|----------|
| `i32`    | `i32`         | signed ops                                       | **DONE** |
| `u32`    | `i32`         | unsigned ops (`div_u`, `shr_u`, `lt_u`, …)       | **DONE** |
| `i64`    | `i64`         |                                                  | **DONE** |
| `u64`    | `i64`         |                                                  | **DONE** |
| `f32`    | `f32`         |                                                  | **DONE** |
| `f64`    | `f64`         |                                                  | **DONE** |
| `bool`   | `i32`         | 0 = false, 1 = true; comparisons return 0/1      | **DONE** |
| `m32`    | `i32`         | mask — only bitwise + comparison ops legal       | **PLAN** |
| `m64`    | `i64`         |                                                  | **PLAN** |
| `m128`   | `v128`        |                                                  | **PLAN** |
| `v128`   | `v128`        | requires `Features.SIMD128`                      | **PLAN** |
| `str`    | `externref`   | constructed via host imports                     | **PLAN** |
| `Array[T]` | `(ref $Array_T)` (per-T monomorph)            | mutable WasmGC array                | **PLAN** |
| `?T` (ref) | `(ref null $T)`                              | nullable ref                        | **PLAN** |
| `?T` (scalar) | not allowed                              | type checker rejects                | **DONE** |

The scalar codegen relies on namespace-mapping in `codegen/intrinsics.js`:
`u32→i32`, `u64→i64`. Unsigned intent is preserved by which **op variant** is
called (e.g. `i32.div_u`), not by a separate type id.

---

## 11. Operators

### Arithmetic / bitwise / comparison                                    **DONE**

`lowerOperators` rewrites `a OP b` → `T:fn_name(a, b)` where `T = type(a)`.
For scalar types, the std-lib wrapper's body is `<ir-NS-op/>` and the
intrinsics table inlines it (e.g. `<ir-i32-add/>` → `m.i32.add`).

For user types, the wrapper is a real method call.

### Compound assignment `x OP= rhs`                                      **DONE**

`lowerOperators` desugars first: `x = x OP rhs`. The resulting `ir-binary` is
then lowered the normal way.

### Logical `and / or / not / xor`                                       **DONE**

Lowered through the normal operator pipeline on `bool`:

```wat
and  →  bool:and(a, b)
or   →  bool:or(a, b)
xor  →  bool:xor(a, b)
not  →  bool:not(a)
```

The stdlib definitions use `@ir` to reach the underlying wasm ops, so the
compiler no longer carries a special backend-only logical path.

### Null fallback `orelse` (else)                                        **PLAN**

```utu
expr orelse default
```

When `expr : ?T`:

```wat
(if (result <T>)
  (ref.is_null <expr>)
  (then <default>)
  (else (ref.as_non_null <expr>)))
```

Already represented as `ir-else` in the IR; codegen just needs the ref-typed
arm.

### Pipe `|>`                                                            **DONE**

`lowerPipe` rewrites to an ordinary `ir-call`. Zero runtime cost.

### Assignment `=`                                                       **DONE for scalar + struct fields / PLAN for globals + array index**

- `x = v` where x is a local → `(local.set $x v)`.
- `g = v` where g is a global → `(global.set $g v)` (PLAN — globals not yet
  emitted).
- `t.f = v` → `(struct.set $T $f t v)` (DONE; `emitFieldSet` in
  `codegen/structs.js`, dispatched from `emitAssign` when LHS is an
  ir-field-access).
- `a[i] = v` → `lowerOperators` rewrites to `Array[T].set_index(a, i, v)`;
  the impl uses `array.set` (PLAN).

---

## 12. Expressions

### Literals                                                             **DONE for scalar / PLAN for ref**

| literal             | wasm                                       | status   |
|---------------------|--------------------------------------------|----------|
| `42`, `0xff`, `0b…` | `i32.const N` (default; promotes to i64 by use-site)| **DONE** |
| `3.14`, `1e-9`      | `f64.const N` (default; coerced to f32 by use-site) | **DONE** |
| `true` / `false`    | `i32.const 1` / `i32.const 0`              | **DONE** |
| `"hello"`           | host-import call returning externref       | **PLAN** |
| `\\multiline`       | concatenation of line literals via host import | **PLAN** |
| `null`              | `ref.null <inferred-ref-type>`             | **DONE for `T.null` on registered structs / PLAN for bare `null` literal** |

### Struct init `T1 { f: v, … }`                                         **DONE (plain) / PLAN (tag prefix, generics)**

```wat
(struct.new $T1 <field-exprs-in-decl-order>)
```

Field-init order in source doesn't matter — `emitStructInit` re-orders by
declared field index. `tag` struct prefix and monomorphized generic name
mangling are still pending.

### Implicit struct init `&{ … }`                                        **DONE**

Identical to the explicit form; `lower-implicit-struct-init.js` rewrites the
node to an explicit `ir-struct-init[type="..."]` using the surrounding
declared type before codegen runs, so `emitStructInit` doesn't even know
which form the user wrote.

### Array `Array[i32].new(10)`                                           **PLAN**

```wat
(array.new_default $Array_i32 (i32.const 10))
```

### Field access `expr.field`                                            **DONE**

```wat
(struct.get $T $field <expr>)
```

Stamped with the field's binaryen type at heap-type registration time
(`buildHeapTypes` in `codegen/heap-types.js`); `emitFieldGet` looks up the
field index by name and emits `struct.get` with `signed=false`.

For unsigned-narrowing fields (e.g. `i8` packed in struct — not in spec yet),
`struct.get_u`.

### Index `a[i]`                                                         **PLAN**

`lowerOperators` rewrites to `T.get_index(a, i)`. For `Array[T]`:

```wat
(array.get $Array_T <a> <i>)
```

### Slice `a[s, e]`                                                      **PLAN**

`lowerOperators` rewrites to `T.get_slice(a, s, e)`. Impl in std:array
allocates a new array and copies via `array.copy`. No first-class wasm slice.

### Call `foo(a, b)` and `T.method(a)`                                   **DONE**

```wat
(call $foo <args>)
(call $T.method <args>)
```

Resolved at compile time. `data-fn-id` (stamped by `resolve-methods`) →
`fnIndex.get(id)` → mangled wasm fn name. Free-fn calls fall back to
`callee.dataset.bindingId`.

### `if cond { … } else { … }`                                           **DONE**

```wat
(if (result <T>) <cond> <then-block> <else-block>)
```

When the if is used as a statement (no value), `result` is omitted.

### `match expr { N => …, ~> default }`                                  **DONE**

Two paths in `emitMatch` (`codegen/control.js`):

**Dense pattern set** (consecutive integers, e.g. {0, 1, 2}):

```wat
(block $result <T>
  (block $default
    (block $arm_n …
      (block $arm_0
        (br_table $arm_0 … $arm_n $default
          (i32.sub <expr> (i32.const <min>)))))    ;; idx = expr - min
    arm_0_body  br $result …)
  default_body  br $result)
```

**Sparse pattern set** (e.g. {0, 100}):

Cache scrutinee in a local, then if/else chain:

```wat
(local.set $s <expr>)
(if (i32.eq (local.get $s) (i32.const 0))
  (then arm_0_body)
  (else (if (i32.eq (local.get $s) (i32.const 100))
          (then arm_1_body)
          (else default_body))))
```

Both paths support void-typed match (no `result`, arms `br` without payload).

Pattern types other than int (bool, float, str) are **PLAN**:
- `bool` — same dense table with min=0, two arms.
- `float` — sparse-only path (`f64.eq` instead of `i32.eq`); never br_table.
- `str` — chain of `str.eq` host-import calls; sparse-only.

### `alt expr { Variant => …, ~> default }`                               **DONE for unbound rec-alt with distinct runtime shapes / STUB for bound arms and tag-alt**

Three sub-shapes depending on the scrutinee's nominal qualifier:

**Over a `tag` enum (i32 tag, no payload variants):**

Identical to `match` over the tag value. Variants are pre-assigned
contiguous tags by `link-type-decls`, so the dense `br_table` path always
applies.

**Over a `tag` variant enum (each arm carries fields):**

```wat
(block $result <T>
  (block $default
    (block $arm_n … (block $arm_0
      (br_table $arm_0 … $arm_n $default
        (struct.get $Parent $__tag <expr>))))
    ;; arm_0 — variant Ok
    (local.set $x_local
      (ref.cast (ref $Parent_Ok) <expr>))   ;; bind |x|
    arm_0_body  br $result
    …)
  default_body  br $result)
```

The `ref.cast` is statically guaranteed to succeed (the tag matched), but
emitting it is necessary for typed field access on `$x`.

**Over a `rec` struct hierarchy:**

No tag — dispatch by `br_on_cast`:

```wat
(block $result <T>
  (block $default
    (block $arm_n …
      (block $arm_0
        (br_on_cast $arm_0 anyref (ref $Parent_Variant0)
          (local.get $scrut))               ;; falls through if cast fails
        (br $arm_1)                         ;; chain
        …)
      ;; arm_0 — bound value already at top of stack from br_on_cast
      arm_0_body  br $result
      …)
    default_body  br $result))
```

The arm body sees `|x|` bound to the cast value via a `local.set` at arm entry.

**Over `tag rec`:** prefer the tag path (no cast required).

Codegen status:
- unbound rec-alt lowers today through `ref.test` / `ref.cast` dispatch
- bound rec-alt arms still throw an explicit `not yet implemented`
- tag-alt still waits on runtime tag emission
Plan documented in `codegen/control.js` header.

### `promote expr { |x| => …, ~> default }`                              **DONE**

Nullable unwrap. Pre-codegen IR shape:

```html
<ir-promote binding="x">
  <scrut data-type="?T"/>
  <ir-promote-arm><body/></ir-promote-arm>
  <ir-default-arm><body/></ir-default-arm>
</ir-promote>
```

Lowering depends on whether T is a reference or scalar:

**`?T` where T is a ref:**

```wat
(block $isnull
  (local.set $x
    (br_on_null $isnull <scrut>))           ;; if null → branch out
  arm_body  br $result)
default_body
```

**`?T` where T is a scalar:** not legal per spec ("scalars are never nullable
by default"). Type checker rejects; codegen never sees this.

Codegen status: `emitPromote` throws `not yet implemented`. Plan documented
in `codegen/control.js` header.

### `for (a … b) |i| { … }` and `for (a ..< b) |i| { … }`                **PLAN**

Inclusive `…` and exclusive `..<` iterators over an i64 range. Capture `|i|` is
**always i64** (spec: "for loop captures are always i64").

```wat
;; for (a ... b) |i|       — inclusive
(local.set $i <a-expr>)
(local.set $end <b-expr>)
(block $brk
  (loop $cnt
    (br_if $brk (i64.gt_s (local.get $i) (local.get $end)))
    <body>
    (local.set $i (i64.add (local.get $i) (i64.const 1)))
    (br $cnt)))
```

`..<` differs only in `i64.ge_s` (exit when `i >= end`) instead of `i64.gt_s`.

Labels: `for outer: (…) |i| { … }` wraps both blocks with `$outer_brk` /
`$outer_cnt` labels usable by labeled `break`.

### `while (cond) { … }`                                                 **DONE**

```wat
(block $brk
  (loop $cnt
    (br_if $brk (i32.eqz <cond>))
    <body>
    (br $cnt)))
```

Labels: `label: while (…) { … }` swaps `__while_brk` for the user label.
Today only the implicit `__while_brk` is supported; labeled break needs the
`ctx.loops` stack already in `control.js` to read the user-supplied label
(currently always `__while_brk`).

### `let x: T = expr`                                                    **DONE**

```wat
(local.set $x <expr>)
```

Where `$x` is a fresh local of type T appended to the function's locals.

### Pipe `expr |> target`                                                **DONE**

Pre-codegen via `lowerPipe`. Becomes an `ir-call` with `expr` as the first
argument (or whichever position the placeholder occupied).

### `assert cond`                                                        **PLAN**

```wat
(if (i32.eqz <cond>)
  (then (call $__utu_assert_failed (i32.const <span-id>))
        (unreachable)))
```

`$__utu_assert_failed` is a host import (`(import "utu" "assert_failed"
(func (param i32)))`). The span-id maps to a string in the
debug-side-table for error reporting.

### `fatal`                                                              **PLAN**

```wat
(call $__utu_fatal (i32.const <span-id>))
(unreachable)
```

### `break` (and `break label`)                                          **DONE (unlabeled)**

```wat
(br $enclosing_brk)
```

`ctx.loops` is a stack of `{ brk, cnt }` labels pushed by each enclosing
loop. The unlabeled form pops the top of the stack. Labeled form (PLAN) walks
the stack matching by label.

### Labeled block `label: { … }`                                         **PLAN**

```wat
(block $label <body>)
```

Allows `break label` from anywhere inside.

---

## 13. Builtin static methods                                            **DONE for scalar / PLAN for ref**

| utu form        | wasm                                                | status   |
|-----------------|-----------------------------------------------------|----------|
| `i32.clz(x)`    | `(i32.clz <x>)`                                     | **DONE** |
| `i32.ctz(x)`    | `(i32.ctz <x>)`                                     | **DONE** |
| `i32.popcnt(x)` | `(i32.popcnt <x>)`                                  | **DONE** |
| `i64.clz(x)` …  | `(i64.clz <x>)` …                                   | **DONE** |
| `f32.sqrt(x)`   | `(f32.sqrt <x>)`                                    | **DONE** |
| `f32.floor/ceil/trunc/nearest(x)` | corresponding wasm op            | **DONE** |
| `f64.…(x)` …    | as above                                            | **DONE** |
| `str.char(n)`   | `(call $__utu_str_char <n>)` (host import)          | **PLAN** |
| `i31.get(x)`    | `(i31.get_s <x>)` (signed by spec convention)       | **PLAN** |
| `T.null`        | `(ref.null $T)`                                     | **PLAN** |

Mechanism: each is the wasm op directly inlined by `codegen/intrinsics.js`,
keyed off the `<ir-NS-op/>` body of the std-lib wrapper. Adding a new
intrinsic = add the wrapper function in the std lib; no code change needed
unless the op's name doesn't follow the `<NS>.<op>` pattern.

---

## 14. Globals and DSL escape

### Top-level `let NAME: T = expr`                                       **PLAN**

Const-init global (mutability inferred from whether anything writes to it):

```wat
(global $NAME <T>     (<T>.const <evaluated>))   ;; immutable
(global $NAME (mut <T>) (<T>.const <evaluated>))  ;; mutable
```

Initializer must be a constant expression resolvable at link time. For ref
types the init is `ref.null` and a synthesized `start` function fills it.

### `@es/\ body \/`                                                      **PLAN**

ES expression compiled to a host-side function and registered as a wasm
import. Use site:

```wat
(call $__utu_es_<id> <args>)
```

The DSL plugin (`standard-dsls.js → es.expand`) returns the import
descriptor; codegen wires it.

### `@utu/\ body \/`                                                     **PLAN**

Inline utu — parsed into IR at the call site, recursively lowered. No
runtime artifact.

### `@ir/\ body \/`                                                      **DONE**

Raw IR injection — already used heavily inside std-lib intrinsics. Body
parsed as an IR fragment and spliced in. Intrinsic recognition then turns
e.g. `<ir-i32-add/>` into `m.i32.add`.

### `@wat/\ body \/`                                                     **PLAN**

Raw WAT injection. The plugin parses the WAT to a binaryen expression ref
(via `module.parseText`) and returns it for inline use. Useful for
prototyping ops binaryen.js doesn't yet bind.

---

## 15. Tests and benchmarks                                              **PLAN**

`bringTargetToTopLevel` rewrites both into `ir-fn` with role markers:

```html
<ir-fn data-role="test"  data-label="<desc>"><ir-fn-name name="__test_0"/>…</ir-fn>
<ir-fn data-role="bench" data-label="<desc>"><ir-fn-name name="__bench_0"/>…</ir-fn>
```

(Already implemented in the lowering pass; codegen emits and exports them
like any other function.)

### `test "desc" { … }`

Wasm function `(func $__test_N (export "__test_N") …)` with a void return.
`assert` inside lowers to host-import calls so the harness can record
pass/fail per test.

### `bench "desc" { … measure { … } … }`

```wat
(func $__bench_N (export "__bench_N")
  …setup…
  (call $__utu_bench_start (i32.const <id>))
  …measure-body…
  (call $__utu_bench_end (i32.const <id>))
  …teardown…)
```

`bringTargetToTopLevel` already extracts the `measure` block and stamps
`data-role="measure"` on it; codegen wraps that block with the start/end
host calls.

---

## 16. Cross-cutting: monomorphization & name mangling                   **DONE**

Every type-parameterized declaration is monomorphized at instantiation. The
mangling convention is `Name__Arg1__Arg2…`:

- `Array[i32]` → `Array__i32`
- `Pair[i32, str]` → `Pair__i32__str`
- `M1[A, B].foo` → `M1__A__B.foo`

Codegen never sees a generic — by the time we reach `codegen/index.js`, every
ir-fn's name is fully mangled and every type ref is concrete.

---

## 17. Cross-cutting: feature flags                                      **DONE / PLAN**

`codegen/index.js` sets binaryen features. Today:

```js
m.setFeatures(binaryen.Features.MutableGlobals | binaryen.Features.BulkMemory);
```

When ref types land:

```js
m.setFeatures(
  binaryen.Features.MutableGlobals |
  binaryen.Features.BulkMemory     |
  binaryen.Features.ReferenceTypes |
  binaryen.Features.GC             |
  binaryen.Features.SIMD128            // only if v128 used
);
```

Setting features early matters — binaryen rejects ref-typed expressions
under the default flag set.

---

## What's tested today (audit checklist)

Run `bun run test`. Each ✓ exercises end-to-end (parse → lower → codegen →
WebAssembly.instantiate → call):

- `codegen: arithmetic + free-fn calls`
  - exercises: `+ - * & ^ << `, free-fn `call`, multi-let, wrapper inlining
- `codegen: control flow (if/while)`
  - exercises: `if/else` expression form, `while`, mutable locals,
    binaryen `block` typing for void body statements
- `codegen: match lowers dense patterns to br_table and sparse to if/else`
  - exercises: both `emitMatchTable` and `emitMatchChain` paths

Everything else in this document is currently aspirational. When you audit,
the right move is:

1. Walk this doc top-to-bottom.
2. For each **DONE** item, find the test that proves it (or add one).
3. For each **STUB** item, confirm the corresponding emitter throws with the
   spec-mandated error message.
4. For each **PLAN** item, decide whether it's blocking the next milestone
   and triage. The plans here are the contract — if a plan disagrees with
   what you'd implement, change the plan first, then the code.
