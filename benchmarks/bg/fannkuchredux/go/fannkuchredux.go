// BG fannkuch-redux Go #3 (Oleg Mazurov; Isaac Gouy; Jan Pfeifer), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fannkuchredux-go-3.html
// Changes: single-threaded (the goroutine chain becomes a loop over the same 720
// chunks; atomics become plain adds/max); main() -> //go:wasmexport bench(n),
// which returns the FNV-1a hash of the bytes printResult printed (fmt.Sprintf).
// Algorithm and data layout (stack arrays [MAX_N]int) unchanged.

/*
 * The Computer Language Benchmarks Game
 * https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 *
 * contributed by Oleg Mazurov, June 2010
 * flag.Arg hack by Isaac Gouy
 * Stack allocation and atomic synchronization by Jan Pfeifer (2020)
 *
 */

package main

import (
    "fmt"
)

// Constant maximum size for N. Compile time known value allow us to allocate
// arrays in stack. It helps making it multiple of 64bits and memory aligned
// (hence 16).
const MAX_N = 16

var (
    NCHUNKS = 720
    CHUNKSZ = 0
    NTASKS  = 0

    n    = 12
    Fact []int

    // Accumulated results.
    res = int64(0)
    chk = int64(0)
)

func fannkuch(idxMin int) {
    idxMax := idxMin + CHUNKSZ
    if idxMax >= Fact[n] {
        idxMax = Fact[n]
    }

    // Stack allocation.
    var p, pp, count [MAX_N]int

    // First permutation.
    for i := 0; i < n; i++ {
        p[i] = i
    }
    for i, idx := n-1, idxMin; i > 0; i-- {
        d := idx / Fact[i]
        count[i] = d
        idx = idx % Fact[i]

        copy(pp[:], p[:]) // One could copy only p[:n], but it is slower.
        for j := 0; j <= i; j++ {
            if j+d <= i {
                p[j] = pp[j+d]
            } else {
                p[j] = pp[j+d-i-1]
            }
        }
    }

    maxFlips := 1
    checkSum := 0

    for idx, sign := idxMin, true; ; sign = !sign {

        // Count flips.
        first := p[0]
        if first != 0 {
            flips := 1
            if p[first] != 0 {
                copy(pp[:], p[:])
                p0 := first
                for {
                    flips++
                    for i, j := 1, p0-1; i < j; i, j = i+1, j-1 {
                        pp[i], pp[j] = pp[j], pp[i]
                    }
                    t := pp[p0]
                    pp[p0] = p0
                    p0 = t
                    if pp[p0] == 0 {
                        break
                    }
                }
            }
            if maxFlips < flips {
                maxFlips = flips
            }
            if sign {
                checkSum += flips
            } else {
                checkSum -= flips
            }
        }

        if idx++; idx == idxMax {
            break
        }

        // Next permutation.
        if sign {
            p[0], p[1] = p[1], first
        } else {
            p[1], p[2] = p[2], p[1]
            for k := 2; ; k++ {
                if count[k]++; count[k] <= k {
                    break
                }
                count[k] = 0
                for j := 0; j <= k; j++ {
                    p[j] = p[j+1]
                }
                p[k+1] = first
                first = p[0]
            }
        }
    }

    chk += int64(checkSum)
    if int64(maxFlips) > res {
        res = int64(maxFlips)
    }
}

func fnv(h uint32, s string) uint32 {
    for i := 0; i < len(s); i++ {
        h ^= uint32(s[i])
        h *= 16777619
    }
    return h
}

//go:wasmexport bench
func bench(n32 int32) uint32 {
    n = int(n32)
    res, chk = 0, 0

    Fact = make([]int, n+1)
    Fact[0] = 1
    for i := 1; i < len(Fact); i++ {
        Fact[i] = Fact[i-1] * i
    }

    CHUNKSZ = (Fact[n] + NCHUNKS - 1) / NCHUNKS
    CHUNKSZ += CHUNKSZ % 2
    NTASKS = (Fact[n] + CHUNKSZ - 1) / CHUNKSZ

    for i := 0; i < NTASKS; i++ {
        fannkuch(i * CHUNKSZ)
    }

    return fnv(2166136261, fmt.Sprintf("%d\nPfannkuchen(%d) = %d\n", chk, n, res))
}

// Built with -buildmode=c-shared the module is a WASI reactor; main never runs.
func main() {}
