import { findNamedChild, spanFromNode } from '../../document/index.js';
import { copyRange } from './types.js';

export const FILE_START_RANGE = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
export const FILE_START_OFFSET_RANGE = { start: 0, end: 0 };

export function cloneDiagnostic(diagnostic) {
    return { ...diagnostic, range: copyRange(diagnostic.range) };
}

export function findCompileErrorSpan(rootNode, message, binaryenOutput, document) {
    const functionName = extractBinaryenFunctionName(binaryenOutput);
    if (functionName) {
        const node = findNodeForWatFunction(rootNode, functionName);
        if (node)
            return spanFromNode(document, node);
    }
    return { range: FILE_START_RANGE, offsetRange: FILE_START_OFFSET_RANGE };
}

function extractBinaryenFunctionName(binaryenOutput) {
    for (const line of (binaryenOutput ?? [])) {
        const match = line.match(/\[wasm-validator error in function (\S+)\]/);
        if (match)
            return match[1];
    }
    return null;
}

function findNodeForWatFunction(rootNode, watName) {
    const testMatch = watName.match(/^__utu_test_(\d+)$/);
    if (testMatch) {
        const tests = rootNode.namedChildren.filter((node) => node.type === 'test_decl');
        return tests[parseInt(testMatch[1])] ?? null;
    }
    const benchMatch = watName.match(/^__utu_bench_(\d+)$/);
    if (benchMatch) {
        const benches = rootNode.namedChildren.filter((node) => node.type === 'bench_decl');
        return benches[parseInt(benchMatch[1])] ?? null;
    }
    for (const node of rootNode.namedChildren) {
        if (node.type !== 'export_decl')
            continue;
        const fn = findNamedChild(node, 'fn_decl');
        const name = findNamedChild(fn, 'identifier')?.text;
        if (name === watName)
            return node;
    }
    return null;
}
