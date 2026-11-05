// Not on BG: Kotlin/Wasm translated from BG binary-trees Java GraalVM #7 (Tristan
// Dupont, after Jarkko Miettinen):
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-graalvmaot-7.html
// Single-threaded: the executor's tasks run in order. TreeNode as the Java (final
// nullable fields). bench(n) returns the FNV-1a hash of the bytes main printed.

private const val MIN_DEPTH = 4

private class TreeNode(private val left: TreeNode?, private val right: TreeNode?) {
    constructor() : this(null, null)

    fun itemCheck(): Int {
        // if necessary deallocate here
        if (null == left) {
            return 1
        }
        return 1 + left.itemCheck() + right!!.itemCheck()
    }
}

private fun bottomUpTree(depth: Int): TreeNode {
    if (0 < depth) {
        return TreeNode(bottomUpTree(depth - 1), bottomUpTree(depth - 1))
    }
    return TreeNode()
}

private fun fnv(h0: Int, s: String): Int {
    var h = h0
    for (c in s) h = (h xor c.code) * 16777619
    return h
}

@JsExport
fun bench(n: Int): Int {
    val out = StringBuilder()
    val maxDepth = if (n < (MIN_DEPTH + 2)) MIN_DEPTH + 2 else n
    val stretchDepth = maxDepth + 1

    out.append("stretch tree of depth " + stretchDepth + "\t check: "
        + bottomUpTree(stretchDepth).itemCheck() + "\n")

    val longLivedTree = bottomUpTree(maxDepth)

    val results = arrayOfNulls<String>((maxDepth - MIN_DEPTH) / 2 + 1)

    var d = MIN_DEPTH
    while (d <= maxDepth) {
        val depth = d
        var check = 0

        val iterations = 1 shl (maxDepth - depth + MIN_DEPTH)
        for (i in 1..iterations) {
            val treeNode1 = bottomUpTree(depth)
            check += treeNode1.itemCheck()
        }
        results[(depth - MIN_DEPTH) / 2] =
            "" + iterations + "\t trees of depth " + depth + "\t check: " + check
        d += 2
    }

    for (str in results) {
        out.append(str + "\n")
    }

    out.append("long lived tree of depth " + maxDepth +
        "\t check: " + longLivedTree.itemCheck() + "\n")
    return fnv(2166136261.toInt(), out.toString())
}
