/* tslint:disable */
/* eslint-disable */

export class Polygon {
    free(): void;
    [Symbol.dispose](): void;
    kind(): Shape;
    constructor(sides: number, length: number);
    scale(factor: number): number;
    vertices(): Float64Array;
    label: string;
    readonly perimeter: number;
}

export enum Shape {
    Circle = 0,
    Square = 1,
}

export function each_step(count: number, callback: Function): void;

export function greet(name: string): string;

export function mean(values: Float64Array): number;

export function parse_number(text: string): number | undefined;
