// BG fannkuch-redux Swift #3 (Ralph Ganszky; Swift 3 by Daniel Muellenborn), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fannkuchredux-swift-3.html
// Changes: single-threaded (DispatchQueue.concurrentPerform over the 150 tasks
// becomes a for loop); Glibc -> WASILibc; the top-level code -> the export
// bench(n), which computes fact/chunksz/ntasks, runs the tasks, and returns the
// FNV-1a hash of the bytes printResult printed. Algorithm and data layout
// (UnsafeMutablePointer<Int> buffers) unchanged.

/* The Computer Language Benchmarks Game
 https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 contributed by Ralph Ganszky
 converted to Swift 3 by Daniel Muellenborn
 */

import WASILibc

nonisolated(unsafe) var n = 0
nonisolated(unsafe) var fact = UnsafeMutablePointer<Int>.allocate(capacity: 1)
nonisolated(unsafe) var chunksz = 0
nonisolated(unsafe) var ntasks = 0
nonisolated(unsafe) var maxFlips = [Int]()
nonisolated(unsafe) var chkSums = [Int]()

struct Fannkuch {
   let n: Int
   var p: UnsafeMutablePointer<Int>
   var pp: UnsafeMutablePointer<Int>
   var count: UnsafeMutablePointer<Int>
   
   init(n: Int) {
      self.n = n
      // Allocate buffers of this instance
      p = UnsafeMutablePointer<Int>.allocate(capacity: n)
      pp = UnsafeMutablePointer<Int>.allocate(capacity: n)
      count = UnsafeMutablePointer<Int>.allocate(capacity: n)
   }
   
   mutating func firstPermutation(_ idx: Int) {
      for i in 0..<n {
         p[i] = i
      }
      
      let start = n - 1
      var indx = idx
      for i in stride(from: start, to: 0, by: -1) {
         let d = indx / fact[i]
         count[i] = d
         indx = indx % fact[i]
         
         pp.update(from: p, count: i+1)
         for j in 0...i {
            p[j] = j+d <= i ? pp[j+d] : pp[j+d-i-1]
         }
      }
   }
   
   mutating func nextPermutation() -> Bool {
      var first = p[1]
      p[1] = p[0]
      p[0] = first
      
      var i = 1
      count[i] += 1
      while count[i] > i {
         count[i] = 0
         i += 1
         p[0] = p[1]
         let next = p[0]
         for j in 1..<i {
            p[j] = p[j+1]
         }
         p[i] = first
         first = next
         count[i] += 1
      }
      return true
   }
   
   mutating func countFlips() -> Int {
      var flips = 1
      var first = p[0]
      if p[first] != 0 {
         pp.update(from: p, count: n)
         repeat {
            flips += 1
            var lo = 1
            var hi = first - 1
            while lo < hi {
               let t = pp[lo]
               pp[lo] = pp[hi]
               pp[hi] = t
               lo += 1
               hi -= 1
            }
            let t = pp[first]
            pp[first] = first
            first = t
         } while pp[first] != 0
      }
      return flips
   }
   
   mutating func runTask(_ task: Int) {
      let idxMin = task * chunksz
      let idxMax = (fact[n] < idxMin + chunksz) ? fact[n] : idxMin + chunksz
      
      // Determine first permutation
      firstPermutation(idxMin)
      
      var maxflips = 1
      var chksum = 0
      var i = idxMin
      while true {
         if p[0] != 0 {
            let flips = countFlips()
            if flips > maxflips {
               maxflips = flips
            }
            chksum += i%2 == 0 ? flips : -flips
         }
         i += 1
         if i == idxMax {
            break
         }
         let _ = nextPermutation()
      }
      maxFlips[task] = maxflips
      chkSums[task] = chksum
      p.deallocate()
      pp.deallocate()
      count.deallocate()
   }
}

func fnv(_ h0: UInt32, _ s: String) -> UInt32 {
   var h = h0
   for b in s.utf8 { h ^= UInt32(b); h = h &* 16777619 }
   return h
}

func printResult(_ n: Int, res: Int, chk: Int) -> UInt32 {
   return fnv(2166136261, "\(chk)\nPfannkuchen(\(n)) = \(res)\n")
}

@_expose(wasm, "bench")
@_cdecl("bench")
public func bench(_ n32: Int32) -> UInt32 {
   n = Int(n32)

   // Calculate factorials
   fact = UnsafeMutablePointer<Int>.allocate(capacity: n+1)
   fact[0] = 1
   for i in 1...n {
      fact[i] = fact[i-1] * i
   }

   // Determine number of tasks
   let nchunks = 150
   chunksz = (fact[n] + nchunks - 1) / nchunks
   ntasks = (fact[n] + chunksz - 1) / chunksz

   // Allocate result vectors
   maxFlips = [Int](repeating: 0, count: ntasks)
   chkSums = [Int](repeating: 0, count: ntasks)

   for i in 0..<ntasks {
      var fannkuch = Fannkuch(n: n)
      fannkuch.runTask(i)
   }

   // Collect results
   var res = 0

   for flips in maxFlips {
      if flips > res {
         res = flips
      }
   }

   var chksum = 0

   for chk in chkSums {
      chksum += chk
   }

   let h = printResult(n, res: res, chk: chksum)

   fact.deallocate()
   return h
}
