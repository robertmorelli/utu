// BG binary-trees Swift #4 (Isaac Gouy, after Marcel Ibes and Ralph Ganszky), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-swift-4.html
// Changes: single-threaded (the DispatchGroup/queues become calls in order:
// stretch tree, long-lived tree, each depth; the messages dictionary is kept);
// Foundation and Dispatch dropped (Foundation is 50 MB in Wasm and unused);
// the top-level code -> the export bench(n), which returns the FNV-1a hash of the
// bytes the program printed. TreeNode (a class, ARC) unchanged.

// The Computer Language Benchmarks Game
// http://benchmarksgame.alioth.debian.org/
//
// based on programs by Marcel Ibes and Ralph Ganszky
// contributed by Isaac Gouy

class TreeNode {
    var left, right: TreeNode?

    init(left: TreeNode?, right: TreeNode?) {
        self.left = left
	self.right = right
    }

    func check() -> Int {
	if left != nil {
	    return left!.check() + right!.check() + 1
	} else {
	    return 1
	}
    }
}

func bottomUpTree(_ depth: Int) -> TreeNode? {
    if depth > 0 {
	let node = TreeNode(left: bottomUpTree(depth-1),
			    right: bottomUpTree(depth-1))
	return node
    } else {
	let node = TreeNode(left: nil, right: nil)
	return node
    }
}

func inner(depth: Int, iterations: Int) -> String {
    var chk = 0
    for _ in 0..<iterations {
        let a = bottomUpTree(depth)
        chk += a!.check()
    }
    return "\(iterations)\t trees of depth \(depth)\t check: \(chk)"
}

func fnv(_ h0: UInt32, _ s: String) -> UInt32 {
    var h = h0
    for b in s.utf8 { h ^= UInt32(b); h = h &* 16777619 }
    return h
}

@_expose(wasm, "bench")
@_cdecl("bench")
public func bench(_ n32: Int32) -> UInt32 {
    let n = Int(n32)

    let minDepth = 4
    let maxDepth = (n > minDepth + 2) ? n : minDepth + 2
    var messages: [Int:String] = [:]
    let depth = maxDepth+1

    do {
        let tree = bottomUpTree(depth)
        messages[0] = "stretch tree of depth \(depth)\t check: \(tree!.check())"
    }

    // (Run concurrently on BG, the long-lived tree lives while the others are
    // built; here it is built first and checked after them.)
    let longLivedTree = bottomUpTree(maxDepth)

    for halfDepth in (minDepth / 2)..<(maxDepth/2+1) {
        let depth = halfDepth * 2
        let iterations = 1 << (maxDepth - depth + minDepth)
        let msg = inner(depth: depth, iterations: iterations)
        messages[depth] = msg
    }

    messages[Int.max] = "long lived tree of depth \(maxDepth)\t check: \(longLivedTree!.check())"

    var h: UInt32 = 2166136261
    for msg in messages.sorted(by: { $0.0 < $1.0 }) {
        h = fnv(h, msg.value + "\n")
    }
    return h
}
