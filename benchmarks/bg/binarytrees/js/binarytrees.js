// BG binary-trees Node #6 (Léo Sarrazin; multi thread by Andrey Filatkin), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-node-6.html
// Changes: single-threaded (worker_threads removed: each depth's work() runs in
// order on the main thread); the top-level run -> bench(n), which returns the
// FNV-1a hash of the bytes the program printed.

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   contributed by Léo Sarrazin
   multi thread by Andrey Filatkin
*/

function mainThread(n) {
    let out = '';
    const maxDepth = Math.max(6, n);

    const stretchDepth = maxDepth + 1;
    const check = itemCheck(bottomUpTree(stretchDepth));
    out += `stretch tree of depth ${stretchDepth}\t check: ${check}\n`;

    const longLivedTree = bottomUpTree(maxDepth);

    const tasks = [];
    for (let depth = 4; depth <= maxDepth; depth += 2) {
        const iterations = 1 << maxDepth - depth + 4;
        tasks.push({iterations, depth});
    }

    const results = tasks.map(({iterations, depth}) => work(iterations, depth));
    for (const result of results) {
        out += result + '\n';
    }

    out += `long lived tree of depth ${maxDepth}\t check: ${itemCheck(longLivedTree)}\n`;
    return out;
}

function work(iterations, depth) {
    let check = 0;
    for (let i = 0; i < iterations; i++) {
        check += itemCheck(bottomUpTree(depth));
    }
    return `${iterations}\t trees of depth ${depth}\t check: ${check}`;
}

function TreeNode(left, right) {
    return {left, right};
}

function itemCheck(node) {
    if (node.left === null) {
        return 1;
    }
    return 1 + itemCheck(node.left) + itemCheck(node.right);
}

function bottomUpTree(depth) {
    return depth > 0
        ? new TreeNode(bottomUpTree(depth - 1), bottomUpTree(depth - 1))
        : new TreeNode(null, null);
}

function fnv(h, s) {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

function bench(n) {
    return fnv(2166136261, mainThread(n));
}
