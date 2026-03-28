export const binaryenValidationCases = [
    {
        name: 'binaryen-return-type-validation',
        message: 'function body type must match',
        wat: `(module (func $bad (result i32) (ref.null extern)))`,
    },
    {
        name: 'binaryen-call-arg-validation',
        message: 'call param types must match',
        wat: `(module (func $add (param i32 i32) (result i32) (i32.const 0)) (func $bad (result i32) (call $add (ref.null extern) (i32.const 1))))`,
    },
    {
        name: 'binaryen-global-init-validation',
        message: 'global init must be constant',
        wat: `(module (func $one (result i32) (i32.const 1)) (global $bad i32 (call $one)))`,
    },
    {
        name: 'binaryen-nullability-validation',
        message: 'function body type must match',
        wat: `(module (type $Box (struct (field i32))) (func $bad (result (ref $Box)) (ref.null $Box)))`,
    },
];

export const binaryenCompileFailureCases = [
    {
        name: 'binaryen-compile-return-type-validation',
        path: 'scripts/fixtures/compile_bad_return_type.utu',
        message: 'function body type must match',
    },
    {
        name: 'binaryen-compile-call-arg-validation',
        path: 'scripts/fixtures/compile_bad_call_args.utu',
        message: 'call param types must match',
    },
    {
        name: 'binaryen-compile-nullability-validation',
        path: 'scripts/fixtures/compile_nullability_mismatch.utu',
        message: 'function body type must match',
    },
    {
        name: 'binaryen-compile-global-init-validation',
        path: 'scripts/fixtures/compile_illegal_global_init.utu',
        message: 'global init must be constant',
    },
];

