// binary-trees, from the Computer Language Benchmarks Game, in idiomatic
// Kotlin: a stretch tree, a long-lived tree, and many short-lived trees of
// increasing depth, each node an object whose children are null at the leaves.
// Every port in this directory allocates and walks the same trees in the same
// order. Compiled to WasmGC by Kotlin/Wasm; bench is exported to JavaScript.

@file:OptIn(ExperimentalJsExport::class)

class Node(val left: Node?, val right: Node?) {
    // The number of nodes in the tree.
    fun check(): Int {
        if (left == null) return 1
        return 1 + left.check() + right!!.check()
    }
}

// A perfect tree of the given depth, left subtree built first.
fun bottomUpTree(depth: Int): Node {
    if (depth > 0) {
        val left = bottomUpTree(depth - 1)
        val right = bottomUpTree(depth - 1)
        return Node(left, right)
    }
    return Node(null, null)
}

const val MIN_DEPTH = 4
const val MAX_DEPTH = 14

// One run of the benchmark; the sum of every tree's check.
fun binaryTrees(): Long {
    var checksum = 0L
    val stretchDepth = MAX_DEPTH + 1
    checksum += bottomUpTree(stretchDepth).check()

    val longLived = bottomUpTree(MAX_DEPTH)

    for (depth in MIN_DEPTH..MAX_DEPTH step 2) {
        val iterations = 1 shl (MAX_DEPTH - depth + MIN_DEPTH)
        var check = 0
        for (i in 0 until iterations) {
            check += bottomUpTree(depth).check()
        }
        checksum += check
    }

    checksum += longLived.check()
    return checksum
}

@JsExport
fun bench(iterations: Int): Long {
    var sink = 0L
    for (i in 0 until iterations) sink += binaryTrees()
    return sink
}
