import type { UtuMarkupContent } from './types';

interface HoverDoc {
  signature: string;
  description: string;
}

type HoverDocs = Record<string, HoverDoc>;
type BuiltinReturnType = string | ((typeText?: string) => string | undefined);

const BUILTIN_DOCS: HoverDocs = {
  'array.len': {
    signature: 'array.len(arr) i32',
    description: 'Returns the current length of a GC array value.',
  },
  'array.new_default': {
    signature: 'array[T].new_default(len) array[T]',
    description: 'Allocates a GC array and fills it with the type default for `T`.',
  },
  'ref.null': {
    signature: 'ref.null Type',
    description: 'Constructs a null reference literal for a nullable UTU reference type.',
  },
  'str.length': {
    signature: 'str.length(s) i32',
    description: 'Returns the length of a host string via the runtime string host.',
  },
  'str.char_code_at': {
    signature: 'str.char_code_at(s, i) i32',
    description: 'Reads the UTF-16 code unit at a string index.',
  },
  'str.concat': {
    signature: 'str.concat(a, b) str',
    description: 'Concatenates two strings using the host string implementation.',
  },
  'str.substring': {
    signature: 'str.substring(s, start, end) str',
    description: 'Returns a substring backed by the host string implementation.',
  },
  'str.equals': {
    signature: 'str.equals(a, b) bool',
    description: 'Compares two strings for equality.',
  },
  'str.from_char_code_array': {
    signature: 'str.from_char_code_array(arr, start, end) str',
    description: 'Builds a string from a range of UTF-16 code units.',
  },
  'str.into_char_code_array': {
    signature: 'str.into_char_code_array(s, arr, start) i32',
    description: 'Copies a string into a UTF-16 code unit array.',
  },
  'str.from_char_code': {
    signature: 'str.from_char_code(code) str',
    description: 'Creates a one-code-unit string from an integer code point.',
  },
};

const BUILTIN_RETURN_TYPES: Record<string, BuiltinReturnType> = {
  'array.len': 'i32',
  'array.new_default': (typeText) => typeText ? `array[${typeText}]` : 'array[T]',
  'ref.null': (typeText) => typeText ? `${typeText} # null` : undefined,
  'str.length': 'i32',
  'str.char_code_at': 'i32',
  'str.into_char_code_array': 'i32',
  'str.concat': 'str',
  'str.substring': 'str',
  'str.from_char_code_array': 'str',
  'str.from_char_code': 'str',
  'str.equals': 'bool',
};

const BUILTIN_NAMESPACE_DOCS: HoverDocs = {
  array: {
    signature: 'array.*',
    description: 'Builtin namespace for GC array allocation and length queries.',
  },
  ref: {
    signature: 'ref.*',
    description: 'Builtin namespace for nullable and reference-oriented helpers.',
  },
  str: {
    signature: 'str.*',
    description: 'Builtin namespace for host-backed string operations.',
  },
};

const CORE_TYPE_DOCS: HoverDocs = {
  anyref: {
    signature: 'anyref',
    description: 'Top-level Wasm GC reference type.',
  },
  bool: {
    signature: 'bool',
    description: 'Boolean scalar represented as an `i32` with `0` and `1` semantics.',
  },
  eqref: {
    signature: 'eqref',
    description: 'Structurally comparable Wasm GC reference type.',
  },
  externref: {
    signature: 'externref',
    description: 'Opaque host reference, typically used for JS interop values.',
  },
  f32: {
    signature: 'f32',
    description: '32-bit IEEE 754 floating-point scalar.',
  },
  f64: {
    signature: 'f64',
    description: '64-bit IEEE 754 floating-point scalar.',
  },
  i31: {
    signature: 'i31',
    description: 'Wasm GC small tagged integer reference.',
  },
  i32: {
    signature: 'i32',
    description: '32-bit signed integer scalar.',
  },
  i64: {
    signature: 'i64',
    description: '64-bit signed integer scalar.',
  },
  null: {
    signature: 'null',
    description: 'The null branch of a UTU exclusive disjunction or nullable reference.',
  },
  str: {
    signature: 'str',
    description: 'Host-backed string reference provided by the runtime string host.',
  },
  u32: {
    signature: 'u32',
    description: '32-bit integer using unsigned operations where applicable.',
  },
  u64: {
    signature: 'u64',
    description: '64-bit integer using unsigned operations where applicable.',
  },
  v128: {
    signature: 'v128',
    description: '128-bit SIMD vector value.',
  },
};

const LITERAL_DOCS: HoverDocs = {
  false: {
    signature: 'false',
    description: 'Boolean false literal.',
  },
  true: {
    signature: 'true',
    description: 'Boolean true literal.',
  },
};

const KEYWORD_DOCS: HoverDocs = {
  assert: {
    signature: 'assert condition',
    description: 'Traps when the condition is false. Common inside UTU tests.',
  },
  bench: {
    signature: 'bench "name" |i| { setup { ... measure { ... } } }',
    description: 'Declares a benchmark that is synthesized into a callable export in bench mode.',
  },
  break: {
    signature: 'break',
    description: 'Exits the current block or loop expression, optionally yielding a value.',
  },
  else: {
    signature: 'else',
    description: 'Provides the fallback branch of an `if` expression or the unwrap fallback operator.',
  },
  export: {
    signature: 'export fn ...',
    description: 'Marks a UTU function as exported from the compiled Wasm module.',
  },
  extern: {
    signature: 'import extern "..."',
    description: 'Declares a host-provided import, typically from the `es` namespace.',
  },
  fn: {
    signature: 'fn name(params) return_type',
    description: 'Declares a UTU function.',
  },
  for: {
    signature: 'for (source) |binding| { ... }',
    description: 'Iterates over a source expression or range and binds loop captures inside the body.',
  },
  if: {
    signature: 'if condition { ... } else { ... }',
    description: 'Expression-oriented conditional branch.',
  },
  import: {
    signature: 'import extern "..." name(...)',
    description: 'Declares a host function or value import.',
  },
  let: {
    signature: 'let name: Type = expr',
    description: 'Promotes a value into a reusable binding.',
  },
  match: {
    signature: 'match value { literal => expr, _ => expr }',
    description: 'Matches scalar values against literal arms.',
  },
  alt: {
    signature: 'alt value { name: Type => expr, _ => expr }',
    description: 'Dispatches over variants and refines the matched value by type.',
  },
  measure: {
    signature: 'measure { ... }',
    description: 'Defines the benchmark body that executes inside the generated timing loop.',
  },
  mut: {
    signature: 'mut field: Type',
    description: 'Marks a struct field as mutable.',
  },
  not: {
    signature: 'not expr',
    description: 'Boolean negation operator.',
  },
  setup: {
    signature: 'setup { ... measure { ... } }',
    description: 'Defines one-time benchmark setup that runs before the measured loop.',
  },
  struct: {
    signature: 'struct Name { ... }',
    description: 'Declares a Wasm GC struct type.',
  },
  test: {
    signature: 'test "name" { ... }',
    description: 'Declares a test case that is synthesized into a zero-argument export in test mode.',
  },
  type: {
    signature: 'type Name = | Variant ...',
    description: 'Declares a sum type and its variants.',
  },
  fatal: {
    signature: 'fatal',
    description: 'Traps immediately and is commonly used as a force-unwrap fallback.',
  },
};

export const KEYWORD_COMPLETIONS = Object.keys(KEYWORD_DOCS);
export const CORE_TYPE_COMPLETIONS = Object.keys(CORE_TYPE_DOCS)
  .filter((word) => word !== 'null');
export const LITERAL_COMPLETIONS = Object.keys(LITERAL_DOCS);
export const BUILTIN_METHODS = groupBuiltinMethods(BUILTIN_DOCS);

export function getBuiltinHover(key: string): UtuMarkupContent | undefined {
  return lookupHover(BUILTIN_DOCS, key);
}

export function getBuiltinReturnType(key: string, typeText?: string): string | undefined {
  const value = BUILTIN_RETURN_TYPES[key];
  return typeof value === 'function' ? value(typeText) : value;
}

export function getCoreTypeHover(word: string): UtuMarkupContent | undefined {
  return lookupHover(CORE_TYPE_DOCS, word);
}

export function getLiteralHover(word: string): UtuMarkupContent | undefined {
  return lookupHover(LITERAL_DOCS, word);
}

export function getKeywordHover(word: string): UtuMarkupContent | undefined {
  return lookupHover(KEYWORD_DOCS, word);
}

export function getBuiltinNamespaceHover(word: string): UtuMarkupContent | undefined {
  return lookupHover(BUILTIN_NAMESPACE_DOCS, word);
}

export function isBuiltinNamespace(name: string): boolean {
  return Object.hasOwn(BUILTIN_METHODS, name);
}

function toMarkdown(doc: HoverDoc): UtuMarkupContent {
  return {
    kind: 'markdown',
    value: `\`\`\`utu\n${doc.signature}\n\`\`\`\n${doc.description}`,
  };
}

function lookupHover(docs: HoverDocs, key: string): UtuMarkupContent | undefined {
  const doc = docs[key];
  return doc ? toMarkdown(doc) : undefined;
}

function groupBuiltinMethods(docs: HoverDocs): Record<string, string[]> {
  const methods: Record<string, string[]> = {};

  for (const key of Object.keys(docs)) {
    const [namespace, method] = key.split('.');
    if (!namespace || !method) {
      continue;
    }

    (methods[namespace] ??= []).push(method);
  }

  return methods;
}
