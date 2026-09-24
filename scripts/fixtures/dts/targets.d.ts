export interface Options { label: string; enabled?: boolean; count: number; }
export interface Base { readonly id: string; increment(amount: number): number; }
export interface Base { label: string; }
export interface Dictionary { [key: string]: number; }
export interface Callable { (a: number, b: number): number; }
export type Conditional<T> = T extends string ? { text: T } : { value: T };
export type Mapped<T> = { readonly [K in keyof T]: T[K] };
export type Choice = string | number;
export declare function sum(...values: number[]): number;
export declare function optional(value: number, factor?: number): number;
export declare function overloaded(value: string): string;
export declare function overloaded(value: number): number;
export declare function flip(value: boolean): boolean;
export declare function apply(value: number, callback: (n: number) => number): number;
export declare function echo<T>(value: T): T;
export declare function union(value: Choice): Choice;
export declare function make(options: Options): Options;
export declare function later(value: string): Promise<string>;
export declare function fail(): never;
export declare class Counter implements Base {
  constructor(start?: number);
  readonly id: string;
  label: string;
  get doubled(): number;
  increment(amount: number): number;
}
export declare const constants: { readonly name: string; times(value: number): number; nested: { answer: number } };
export declare const token: unique symbol;
export interface Symbolic { [token](): string; [Symbol.iterator](): Iterator<number>; }
export declare function symbolic(): Symbolic;
export default function greet(name: string): string;
export declare function arbitrary(callback: (this: Options, ...args: unknown[]) => unknown): unknown;
export declare function booleanCallback(callback: (value: boolean) => boolean): boolean;
export declare function identity(value: unknown): unknown;
export declare const enum ConstMode { First = 20, Second = 22 }
export declare namespace Util {
  const label: string;
  function scale(n: number): number;
  namespace Nested { const answer: number; }
}
export interface Case { upper: string; }
export interface CASE { loud: string; }

export declare const dictionary: Dictionary;
