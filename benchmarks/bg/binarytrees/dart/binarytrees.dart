// BG binary-trees Dart #7 (dart exe; Isaac Gouy, TreeNode after Andrey Filatkin's JS), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-dartexe-7.html
// Changes: dart compile wasm (WasmGC) in place of dart compile exe; single-threaded
// (isolates removed: each depth's request runs in order on the main isolate);
// main() publishes bench(n) on globalThis, which returns the FNV-1a hash of the
// bytes main() printed. TreeNode, itemCheck, bottomUpTree unchanged.

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
  
   contributed by Isaac Gouy
   TreeNode borrowed from Andrey Filatkin's JavaScript program
*/

import 'dart:js_interop';

int fnv(int h, String s) {
  for (final c in s.codeUnits) {
    h = ((h ^ c) * 16777619) & 0xffffffff;
  }
  return h;
}

int bench(int n) {
  final out = StringBuffer();

  final stretchDepth = n + 1;
  final check = itemCheck(bottomUpTree(stretchDepth));
  out.writeln('stretch tree of depth $stretchDepth\t check: $check');
  final longLivedTree = bottomUpTree(n);

  final requests = <RequestReply>[];
  final replies = <RequestReply>[];
  for (var depth = 4; depth <= n; depth += 2) {
    final iterations = 1 << n - depth + 4;
    requests.add(RequestReply(iterations, depth));
  }

  while (requests.isNotEmpty) {
    final request = requests.removeLast();
    for (int i = 0; i < request.iterations; i++) {
      request.check += itemCheck(bottomUpTree(request.depth));
    }
    replies.add(request);
  }

  replies.sort((a, b) => a.depth.compareTo(b.depth));
  for (var reply in replies) {
    out.writeln('${reply.iterations}\t ' +
        'trees of depth ${reply.depth}\t ' +
        'check: ${reply.check}');
  }
  out.writeln('long lived tree of depth $n\t ' +
      'check: ${itemCheck(longLivedTree)}');
  return fnv(2166136261, out.toString());
}

@JS('bench')
external set _bench(JSFunction f);

void main() {
  _bench = bench.toJS;
}

class RequestReply {
  var iterations = 0, depth = 0, check = 0;
  RequestReply(this.iterations, this.depth);
}

class TreeNode {
  TreeNode? left, right;
  TreeNode(this.left, this.right);
}

int itemCheck(TreeNode? node) {
  if (node == null || node.left == null) {
    return 1;
  } else {
    return 1 + itemCheck(node.left) + itemCheck(node.right);
  }
}

TreeNode bottomUpTree(int depth) {
  return depth > 0
      ? TreeNode(bottomUpTree(depth - 1), bottomUpTree(depth - 1))
      : TreeNode(null, null);
}
