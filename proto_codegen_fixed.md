# Protocol Codegen Fix Report

## Result

Protocol lowering now matches the contract much more closely:

- one table per readable protocol member
- one table per protocol setter
- helpers lower to `struct.get $__tag` plus `call_indirect`
- tagged parent protocol dispatch no longer uses a `ref.test` / `ref.cast` ladder
- concrete getter sugar no longer bypasses the protocol table

The protocol path is now explicitly treated as Wasm-table syntax, not as a richer hidden runtime feature.

## What Changed

### 1. The parent-type RTT ladder is gone

Fix:

- tagged sum roots now carry the hidden `__tag`
- tagged variants lower with the same tag-prefix layout
- protocol helpers dispatch by reading the parent tag and doing `call_indirect`
- the dead `variantDispatch` / recursive `emitProtocolVariantHelper` RTT path was removed

Files:

- `watgen.js`

Regression coverage:

- `tagged-sum-parent-protocol-helpers-lower-to-bare-table-dispatch`
- `tagged-sum-protocol-getters-synthesize-for-variants`
- `tagged-sum-protocol-setters-dispatch-through-parent-type`
- `tagged-sum-types-dispatch-protocols-through-the-parent-type`

### 2. Getter sugar no longer bypasses the table

Fix:

- `genField()` now calls the getter helper whenever a protocol getter helper exists
- concrete `rect.area` lowers through the same dispatch helper as `Area.area(rect)`

Files:

- `watgen.js`

Regression coverage:

- `protocol-getter-sugar-always-goes-through-the-protocol-helper`

### 3. The protocol contract was tightened in user-facing docs

Fix:

- protocol docs, spec text, and hover docs now state that protocol syntax must produce the Wasm table/`call_indirect` structure and only that structure

Files:

- `README.md`
- `documentation/spec.typ`
- `jsondata/hoverDocs.data.json`

## Verification

Executed:

- `bun ./scripts/test-modules.mjs`
- `bun run test`

Both passed after the lowering changes.
