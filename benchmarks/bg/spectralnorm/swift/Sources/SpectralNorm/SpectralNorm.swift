// BG spectralnorm Swift #3 (Ralph Ganszky; Swift 3 by Daniel Muellenborn), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-swift-3.html
// Changes: `import Glibc`/`Dispatch` -> WASILibc; one thread: each
// DispatchQueue.concurrentPerform(iterations: n) is a for loop over the rows; the
// top-level code -> the export bench(n), which returns the FNV-1a hash of the bytes
// the program printed (print's String, with its "\n"). roundDouble as BG.

/* The Computer Language Benchmarks Game
 https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 contributed by Ralph Ganszky
 converted to Swift 3 by Daniel Muellenborn
 */

import WASILibc

func A(_ i: Int, _ j: Int) -> Double {
   return 1.0 / Double((i+j)*(i+j+1)/2 + (i+1))
}

func multiplyAv(_ n: Int, _ v: [Double]) -> [Double] {
   var Av = [Double](repeating: 0.0, count: n)
   for i in 0..<n {
      var AvTemp = 0.0
      for j in 0..<n {
         AvTemp += A(i,j) * v[j]
      }
      Av[i] = AvTemp
   }
   return Av
}

func multiplyAtv(_ n: Int, _ v: [Double]) -> [Double] {
   var Atv = [Double](repeating: 0.0, count: n)
   for i in 0..<n {
      var AtvTemp = 0.0
      for j in 0..<n {
         AtvTemp += A(j,i) * v[j]
      }
      Atv[i] = AtvTemp
   }
   return Atv
}

func multiplyAtAv(_ n: Int, _ v: [Double]) -> [Double] {
   let u = multiplyAv(n, v)
   return multiplyAtv(n, u)
}

func approximate(_ n: Int) -> Double {
   var u = [Double](repeating: 1.0, count: n)
   var v = [Double]()
   for _ in 0..<10 {
      v = multiplyAtAv(n, u)
      u = multiplyAtAv(n, v)
   }
   var vBv = 0.0
   var vv = 0.0
   for i in 0..<n {
      vBv += u[i]*v[i]
      vv += v[i]*v[i]
   }
   return sqrt(vBv/vv)
}

func roundDouble(_ num: Double, precision: Int) -> String {
   let exponent = pow(10.0, Double(precision))
   let number = Double(Int(num * exponent + 0.5))/exponent
   return "\(number)"
}

func fnv(_ h0: UInt32, _ s: String) -> UInt32 {
    var h = h0
    for b in s.utf8 { h ^= UInt32(b); h = h &* 16777619 }
    return h
}

@_expose(wasm, "bench")
@_cdecl("bench")
public func bench(_ n: Int32) -> UInt32 {
    return fnv(2166136261, roundDouble(approximate(Int(n)), precision: 9) + "\n")
}
