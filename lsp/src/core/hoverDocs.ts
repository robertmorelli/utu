import type { UtuMarkupContent } from './types';

interface HoverDoc {
  signature: string;
  description: string;
}

const BUILTIN_DOCS: Record<string, HoverDoc> = {
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
    description: 'Returns the length of a host string via JS String Builtins.',
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

const CORE_TYPE_DOCS: Record<string, HoverDoc> = {
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
    description: 'Host-backed string reference built on JS String Builtins.',
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

const KEYWORD_DOCS: Record<string, HoverDoc> = {
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
    signature: 'match value { pattern => expr, ... }',
    description: 'Pattern matches over variants and bindable values.',
  },
  mut: {
    signature: 'mut field: Type',
    description: 'Marks a struct field as mutable.',
  },
  not: {
    signature: 'not expr',
    description: 'Boolean negation operator.',
  },
  struct: {
    signature: 'struct Name { ... }',
    description: 'Declares a Wasm GC struct type.',
  },
  type: {
    signature: 'type Name = | Variant ...',
    description: 'Declares a sum type and its variants.',
  },
  unreachable: {
    signature: 'unreachable',
    description: 'Traps immediately and is commonly used as a force-unwrap fallback.',
  },
};

export const KEYWORD_COMPLETIONS = [
  'break',
  'else',
  'export',
  'extern',
  'fn',
  'for',
  'if',
  'import',
  'let',
  'match',
  'mut',
  'not',
  'struct',
  'type',
  'unreachable',
] as const;

export const CORE_TYPE_COMPLETIONS = [
  'anyref',
  'bool',
  'eqref',
  'externref',
  'f32',
  'f64',
  'i31',
  'i32',
  'i64',
  'str',
  'u32',
  'u64',
  'v128',
] as const;

export const BUILTIN_METHODS: Record<string, string[]> = {
  array: ['len', 'new_default'],
  ref: ['null'],
  str: [
    'length',
    'char_code_at',
    'concat',
    'substring',
    'equals',
    'from_char_code_array',
    'into_char_code_array',
    'from_char_code',
  ],
};

export function getBuiltinHover(key: string): UtuMarkupContent | undefined {
  const doc = BUILTIN_DOCS[key];
  return doc ? toMarkdown(doc) : undefined;
}

export function getBuiltinReturnType(key: string, arrayElementType?: string): string | undefined {
  switch (key) {
    case 'array.len':
      return 'i32';
    case 'array.new_default':
      return arrayElementType ? `array[${arrayElementType}]` : 'array[T]';
    case 'ref.null':
      return arrayElementType ? `${arrayElementType} # null` : undefined;
    case 'str.length':
    case 'str.char_code_at':
    case 'str.into_char_code_array':
      return 'i32';
    case 'str.concat':
    case 'str.substring':
    case 'str.from_char_code_array':
    case 'str.from_char_code':
      return 'str';
    case 'str.equals':
      return 'bool';
    default:
      return undefined;
  }
}

export function getCoreTypeHover(word: string): UtuMarkupContent | undefined {
  const doc = CORE_TYPE_DOCS[word];
  return doc ? toMarkdown(doc) : undefined;
}

export function getKeywordHover(word: string): UtuMarkupContent | undefined {
  const doc = KEYWORD_DOCS[word];
  return doc ? toMarkdown(doc) : undefined;
}

export function isBuiltinNamespace(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_METHODS, name);
}

function toMarkdown(doc: HoverDoc): UtuMarkupContent {
  return {
    kind: 'markdown',
    value: `\`\`\`utu\n${doc.signature}\n\`\`\`\n${doc.description}`,
  };
}
