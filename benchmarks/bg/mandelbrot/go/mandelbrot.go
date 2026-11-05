// BG mandelbrot Go #6 (Koistinen, Buchholz, Broadley), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/mandelbrot-go-6.html
// Changes: one thread: renderRow over rows 0..h-1 in order (was pool goroutines fed
// by a channel); main() -> the export bench(n) (GOOS=wasip1 reactor), which returns
// the FNV-1a hash of the bytes main() wrote. Pixel loop unchanged.

package main

import (
   "fmt"
)

const ZERO float64 = 0
const LIMIT = 2.0
const ITER = 50

var rows []byte
var bytesPerRow int

func renderRow(w, h, bytes int, iter int) {
   var Zr, Zi, Tr, Ti, Cr float64
   var x, i int

   for y := 0; y < h; y++ {
      offset := bytesPerRow * y
      Ci := (2*float64(y)/float64(h) - 1.0)

      for x = 0; x < w; x++ {
         Zr, Zi, Tr, Ti = ZERO, ZERO, ZERO, ZERO
         Cr = (2*float64(x)/float64(w) - 1.5)

         for i = 0; i < iter && Tr+Ti <= LIMIT*LIMIT; i++ {
            Zi = 2*Zr*Zi + Ci
            Zr = Tr - Ti + Cr
            Tr = Zr * Zr
            Ti = Zi * Zi
         }

         if Tr+Ti <= LIMIT*LIMIT {
            rows[offset+x/8] |= (byte(1) << uint(7-(x%8)))
         }
      }
   }
}

func fnv(h uint32, s []byte) uint32 {
   for i := 0; i < len(s); i++ {
      h ^= uint32(s[i])
      h *= 16777619
   }
   return h
}

func main() {}

//go:wasmexport bench
func bench(n int32) uint32 {
   size := int(n)
   w, h := size, size
   bytesPerRow = w / 8
   rows = make([]byte, bytesPerRow*h)
   renderRow(w, h, bytesPerRow, ITER)
   hh := fnv(2166136261, []byte(fmt.Sprintf("P4\n%d %d\n", w, h)))
   return fnv(hh, rows)
}
