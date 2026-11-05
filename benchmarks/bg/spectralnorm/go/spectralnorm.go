// BG spectralnorm Go #4 (K P anonymous), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-go-4.html
// Changes: one thread: Times/TimesTransp are called directly over all rows (were
// nCPU goroutines joined through a channel); main() -> the export bench(n)
// (GOOS=wasip1, -buildmode=c-shared, a reactor), which returns the FNV-1a hash of
// the bytes main() printed (fmt.Sprintf in place of fmt.Printf).

/* The Computer Language Benchmarks Game
 * https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 *
 * contributed by K P anonymous
 * corrected by Isaac Gouy
 */

package main

import (
   "fmt"
   "math"
)

type Vec []float64

func (v Vec) Times(ii, n int, u Vec) {
   ul := len(u)
   for i := ii; i < n; i++ {
      var vi float64
      for j := 0; j < ul; j++ {
         vi += u[j] / float64(A(i, j))
      }
      v[i] = vi
   }
}

func (v Vec) TimesTransp(ii, n int, u Vec) {
   ul := len(u)
   for i := ii; i < n; i++ {
      var vi float64
      for j := 0; j < ul; j++ {
         vi += u[j] / float64(A(j, i))
      }
      v[i] = vi
   }
}

func (v Vec) ATimesTransp(u Vec) {
   x := make(Vec, len(u))
   x.Times(0, len(v), u)
   v.TimesTransp(0, len(v), x)
}

func A(i, j int) int {
   return ((i+j)*(i+j+1)/2 + i + 1)
}

func main() {}

//go:wasmexport bench
func bench(n32 int32) uint32 {
   n := int(n32)
   u := make(Vec, n)
   for i := range u {
      u[i] = 1
   }
   v := make(Vec, n)
   for i := 0; i < 10; i++ {
      v.ATimesTransp(u)
      u.ATimesTransp(v)
   }
   var vBv, vv float64
   for i, vi := range v {
      vBv += u[i] * vi
      vv += vi * vi
   }
   s := fmt.Sprintf("%0.9f\n", math.Sqrt(vBv/vv))
   h := uint32(2166136261)
   for i := 0; i < len(s); i++ {
      h ^= uint32(s[i])
      h *= 16777619
   }
   return h
}
