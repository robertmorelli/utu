// BG binary-trees Go #2 (Gerardo Lima; reviewed by Diogo Simoes), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-go-2.html
// Changes: single-threaded (the goroutines and WaitGroup become calls in the
// same order: stretch tree, long-lived tree, each depth); main() ->
// //go:wasmexport bench(n), which returns the FNV-1a hash of the bytes Run printed
// (fmt.Sprintf, as before), and collects (runtime.GC) before returning. Tree and NewTree/Count unchanged (Go's GC).

// The Computer Language Benchmarks Game
// http://benchmarksgame.alioth.debian.org/
//
// Go implementation of binary-trees, based on the reference implementation
// gcc #3, on Go #8 (which is based on Rust #4)
//
// Contributed by Gerardo Lima
// Reviewed by Diogo Simoes
// Based on previous work from Adam Shaver, Isaac Gouy, Marcel Ibes Jeremy,
//  Zerfas, Jon Harrop, Alex Mizrahi, Bruno Coutinho, ...
//

package main

import (
   "fmt"
   "runtime"
)

type Tree struct {
   Left  *Tree
   Right *Tree
}

// Count the nodes in the given complete binary tree.
func (t *Tree) Count() int {
   // Only test the Left node (this binary tree is expected to be complete).
   if t.Left == nil {
      return 1
   }
   return 1 + t.Right.Count() + t.Left.Count()
}

// Create a complete binary tree of `depth` and return it as a pointer.
func NewTree(depth int) *Tree {
   if depth > 0 {
      return &Tree{Left: NewTree(depth - 1), Right: NewTree(depth - 1)}
   } else {
      return &Tree{}
   }
}

func Run(maxDepth int) []string {

   // Set minDepth to 4 and maxDepth to the maximum of maxDepth and minDepth +2.
   const minDepth = 4
   if maxDepth < minDepth+2 {
      maxDepth = minDepth + 2
   }

   // Create an indexed string buffer for outputing the result in order.
   outCurr := 0
   outSize := 3 + (maxDepth-minDepth)/2
   outBuff := make([]string, outSize)

   // Create binary tree of depth maxDepth+1, compute its Count and set the
   // first position of the outputBuffer with its statistics.
   func() {
      tree := NewTree(maxDepth + 1)
      msg := fmt.Sprintf("stretch tree of depth %d\t check: %d",
         maxDepth+1,
         tree.Count())

      outBuff[0] = msg
   }()

   // Create a long-lived binary tree of depth maxDepth. Its statistics will be
   // handled later.
   var longLivedTree *Tree
   func() {
      longLivedTree = NewTree(maxDepth)
   }()

   // Create a lot of binary trees, of depths ranging from minDepth to maxDepth,
   // compute and tally up all their Count and record the statistics.
   for depth := minDepth; depth <= maxDepth; depth += 2 {
      iterations := 1 << (maxDepth - depth + minDepth)
      outCurr++

      func(depth, iterations, index int) {
         acc := 0
         for i := 0; i < iterations; i++ {
            // Create a binary tree of depth and accumulate total counter with its
            // node count.
            a := NewTree(depth)
            acc += a.Count()
         }
         msg := fmt.Sprintf("%d\t trees of depth %d\t check: %d",
            iterations,
            depth,
            acc)

         outBuff[index] = msg
      }(depth, iterations, outCurr)
   }

   // Compute the checksum of the long-lived binary tree that we created
   // earlier and store its statistics.
   msg := fmt.Sprintf("long lived tree of depth %d\t check: %d",
      maxDepth,
      longLivedTree.Count())
   outBuff[outSize-1] = msg

   return outBuff
}

func fnv(h uint32, s string) uint32 {
   for i := 0; i < len(s); i++ {
      h ^= uint32(s[i])
      h *= 16777619
   }
   return h
}

//go:wasmexport bench
func bench(n int32) uint32 {
   h := uint32(2166136261)
   // Print the statistics for all of the various tree depths.
   for _, m := range Run(int(n)) {
      h = fnv(h, m+"\n")
   }
   // In a wasip1 reactor, GC stopped triggering after a few bench calls at n=18
   // (the heap grew to the 4 GB limit); a collection before returning avoids it.
   runtime.GC()
   return h
}

// Built with -buildmode=c-shared the module is a WASI reactor; main never runs.
func main() {}
