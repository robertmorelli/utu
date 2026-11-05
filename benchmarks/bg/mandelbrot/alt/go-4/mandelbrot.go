// BG mandelbrot Go #4 (Koistinen, Buchholz, Broadley, Lake, Corsi, Yuzhaninov), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/mandelbrot-go-4.html
// Changes: one thread: renderRows takes the rows in order (was NumCPU*2 goroutines
// sharing an atomic row counter, joined by a WaitGroup); main() -> the export
// bench(n) (GOOS=wasip1, -buildmode=c-shared, a reactor), which returns the FNV-1a
// hash of the bytes main() wrote (fmt.Sprintf header, then the rows) in place of
// the bufio stdout writer. renderRow unchanged.

/* The Computer Language Benchmarks Game
 * https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 *
 * Contributed by Martin Koistinen
 * Based on mandelbrot.c contributed by Greg Buchholz and The Go Authors
 * flag.Arg hack by Isaac Gouy
 *
 * Large changes by Bill Broadley, including:
 * 1) Switching the one goroutine per line to one per CPU
 * 2) Replacing gorouting calls with channels
 * 3) Handling out of order results in the file writer.

 * modified by Sean Lake
 *
 * modified by Rodrigo Corsi
 * 1)two goroutines per cpu
 * 2)each goroutine generate one line and increment counter (atomic int32)


 * modified by Anton Yuzhaninov
 *
 */

package main

import (
    "fmt"
)

const limit = 4.0        // abs(z) < 2
const maxIter = 50       // number of iterations

var rows [][]byte
var bytesPerRow int
var initial_r []float64
var initial_i []float64

// renderRow returns rendered row of pixels
// pixels packed in one byte for PBM image
func renderRow(y0 *int32) []byte {
    var i, j, x int
    var res, b byte
    var Zr1, Zr2, Zi1, Zi2, Tr1, Tr2, Ti1, Ti2 float64

    row := make([]byte, bytesPerRow)

    for xByte := range row {
        res = 0
        Ci := initial_i[*y0]
        for i = 0; i < 8; i += 2 {
            x = xByte << 3 // * 8
            Cr1 := initial_r[x+i]
            Cr2 := initial_r[x+i+1]

            Zr1 = Cr1
            Zi1 = Ci

            Zr2 = Cr2
            Zi2 = Ci

            b = 0

            for j = 0; j < maxIter; j++ {
                Tr1 = Zr1 * Zr1
                Ti1 = Zi1 * Zi1
                Zi1 = 2*Zr1*Zi1 + Ci
                Zr1 = Tr1 - Ti1 + Cr1

                if Tr1+Ti1 > limit {
                    b |= 2
                    if b == 3 {
                        break
                    }
                }

                Tr2 = Zr2 * Zr2
                Ti2 = Zi2 * Zi2
                Zi2 = 2*Zr2*Zi2 + Ci
                Zr2 = Tr2 - Ti2 + Cr2

                if Tr2+Ti2 > limit {
                    b |= 1
                    if b == 3 {
                        break
                    }
                }
            }
            res = (res << 2) | b
        }
        row[xByte] = ^res
    }
    return row
}

func renderRows(s32 int32) {
    var y int32
    for y = 0; y < s32; y++ {
        rows[y] = renderRow(&y)
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

    bytesPerRow = size >> 3

    // Precompute the initial real and imaginary values for each x and y
    // coordinate in the image.
    initial_r = make([]float64, size)
    initial_i = make([]float64, size)
    inv := 2.0 / float64(size)
    for xy := 0; xy < size; xy++ {
        i := inv * float64(xy)
        initial_r[xy] = i - 1.5
        initial_i[xy] = i - 1.0
    }

    rows = make([][]byte, size)

    renderRows(int32(size))

    h := fnv(2166136261, []byte(fmt.Sprintf("P4\n%d %d\n", size, size)))
    for y := 0; y < size; y++ {
        h = fnv(h, rows[y])
    }
    return h
}
