// wasm/index.js — the wasm backend: modules, types, encoding, and text.
//
// `wasm` gathers what code generation uses, under the names Binaryen's JS
// API gives them (`wasm.i32`, `wasm.createType`, `wasm.getExpressionType`, …),
// which is the interface codegen was written against.

import { Module } from './module.js';
import {
  TypeBuilder, anyref, arrayref, createType, eqref, expandType, externref, f32, f64, funcref, heap,
  i16, i31ref, i32, i64, i8, none, ref, structref, topOf, unreachable, v128,
} from './types.js';

export { Module } from './module.js';
export { TypeBuilder } from './types.js';

export const wasm = Object.freeze({
  Module,
  TypeBuilder,
  none,
  unreachable,
  i32,
  i64,
  f32,
  f64,
  v128,
  i8,
  i16,
  notPacked: null,
  funcref,
  externref,
  anyref,
  eqref,
  i31ref,
  structref,
  arrayref,
  // Strings are JS strings, held as externref (see module.js).
  stringref: externref,
  createType,
  expandType,
  getExpressionType: expression => expression.type,
  getTypeFromHeapType: (heapType, nullable) => ref(heapType, Boolean(nullable)),
  /** Whether a reference type is in the `any` hierarchy (structs, arrays, i31). */
  isAnyReference: type => type.kind === 'ref' && topOf(type.heap) === heap.any,
});
