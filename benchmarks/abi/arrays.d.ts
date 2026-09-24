// ABI contracts, deliberately narrower than TypeScript's generic Array<T>.
export interface Numbers {
  readonly length: number;
  [index: number]: number;
  reduce(callback: (sum: number, value: number) => number, initial: number): number;
}
export declare function sum(values: Numbers): number;

export interface OpaqueNumbers { readonly length: number; readonly [index: number]: unknown; }
