// BG k-nucleotide Go #7 (Mark van Weert), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/knucleotide-go-7.html
// Changes: main() -> the export bench(n) (GOOS=wasip1, -buildmode=c-shared, a
// reactor); single-threaded (numCPU = 1: one map, calc32/calc64 called, not
// spawned); os.Stdin -> the fasta text setup(n) makes; fmt.Println -> into a
// strings.Builder whose bytes are hashed (FNV-1a 32) and returned. One fix
// in calc32/calc64 (see there): BG's key update read the codes at each
// window's start, so its counts were off by a few (as BG C++ #2's, which it
// follows; BG's 25M output hides it, fasta 10,000's 2-mers show it).


/* The Computer Language Benchmarks Game 
 * https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 *
 * contributed by Mark van Weert
 * based on Go#6 C++#2
 */

package main

import (
    "bufio"
    "bytes"
    "fmt"
    "io"
    "math"
    "sort"
    "strings"
    "sync"
)

// BG: runtime.NumCPU() maps and goroutines; here one, called directly.
const numCPU = 1

var toNum = strings.NewReplacer("A", string(0), "C", string(1), "T", string(2), "G", string(3), )
var toChar = []byte{'A', 'C', 'T', 'G'}

func main() {}

//go:wasmexport setup
func setup(n int32) { fastaInput = fasta(int(n)) }

//go:wasmexport bench
func bench(n int32) uint32 {
    dna := input()

    var out strings.Builder
    fmt.Fprintln(&out, WriteFrequencies(dna, 1))
    fmt.Fprintln(&out, WriteFrequencies(dna, 2))
    fmt.Fprintln(&out, WriteCount(dna, "GGT"))
    fmt.Fprintln(&out, WriteCount(dna, "GGTA"))
    fmt.Fprintln(&out, WriteCount(dna, "GGTATT"))
    fmt.Fprintln(&out, WriteCount(dna, "GGTATTTTAATT"))
    fmt.Fprintln(&out, WriteCount(dna, "GGTATTTTAATTTATAGT"))
    s := out.String()
    h := uint32(2166136261)
    for i := 0; i < len(s); i++ {
        h ^= uint32(s[i])
        h *= 16777619
    }
    return h
}

// input returns the transformed data
func input() []byte {
    data := readStdin()

    // A = 0, C = 1, T = 2, G = 3
    for idx := range data {
        data[idx] = data[idx] >> 1 & 3
    }
    return data
}

// readStdin returns the data marked with >THREE from stdin
func readStdin() []byte {
    // Create a reader for stdin
    reader := bufio.NewReaderSize(bytes.NewReader(fastaInput), 1<<20)
    var lineCount int
    for {
        // Keep reading until we encounter the start marker >THREE
        line, err := reader.ReadSlice('\n')
        if err != nil {
            panic(err)
        }

        if len(line) == 0 {
            continue
        }

        lineCount++

        if line[0] == '>' && strings.HasPrefix(string(line), ">THREE") {
            data := make([]byte, 0, lineCount*61)
            for {
                // Read from the three section
                line, err := reader.ReadSlice('\n')
                if err != nil && err != io.EOF {
                    panic(err)
                } else if err == io.EOF || len(line) == 0 {
                    // End of input reached
                    return data
                }
                // Append the read data to the data slice
                data = append(data, line[:len(line)-1]...)
            }
        }
    }
}

// WriteFrequencies returns the frequencies of the nucleotides with the given length
func WriteFrequencies(data []byte, size int) string {
    // Get counts
    counts := startCount32(data, size)

    // Store the map keys and values in a struct to sort them
    type kv struct {
        Key   uint32
        Value int
    }
    var sortedCounts []kv
    for k, v := range counts {
        sortedCounts = append(sortedCounts, kv{k, *v})
    }

    sort.Slice(sortedCounts, func(i, j int) bool {
        return sortedCounts[i].Value > sortedCounts[j].Value
    })

    sum := float32(len(data) - size + 1)
    var result string
    for _, count := range sortedCounts {
        result += fmt.Sprintf("%v %.3f\n", decompress32(count.Key, size), 100.0*float32(count.Value)/sum)
    }

    return result
}

// WriteCount returns the number of given nucleotides in the data
func WriteCount(data []byte, nucleotide string) string {
    size := len(nucleotide)

    if len(nucleotide) <= 16 {
        // Get counts nucleotide key can fit in an uint32
        counts := startCount32(data, size)

        key := compress32([]byte(toNum.Replace(nucleotide)))

        count := counts[key]
        if count == nil {
            count = new(int)
        }

        return fmt.Sprintf("%v\t%v", *count, nucleotide)

    } else {
        // Get counts for longer nucleotides
        counts := startCount64(data, size)
        key := compress64([]byte(toNum.Replace(nucleotide)))
        count := counts[key]
        if count == nil {
            count = new(int)
        }

        return fmt.Sprintf("%v\t%v", *count, nucleotide)
    }
}

func startCount32(data []byte, size int) map[uint32]*int {
    maps := make([]map[uint32]*int, numCPU)

    wg := sync.WaitGroup{}

    // Create a map for each goroutine we will spawn
    for i := 0; i < len(maps); i++ {
        maps[i] = make(map[uint32]*int)
        wg.Add(1)
        calc32(data, maps[i], i, size, &wg)
    }

    wg.Wait()

    // Add counts from all goroutines to the first map
    for i := 1; i < len(maps); i++ {
        for i2, val := range maps[i] {
            if val == nil {
                continue
            }
            if maps[0][i2] == nil {
                maps[0][i2] = new(int)
            }
            *maps[0][i2] += *val
        }
    }

    return maps[0]
}

func startCount64(data []byte, size int) map[uint64]*int {
    maps := make([]map[uint64]*int, numCPU)

    wg := sync.WaitGroup{}

    // Create a map for each goroutine we will spawn
    for i := 0; i < len(maps); i++ {
        maps[i] = make(map[uint64]*int)
        wg.Add(1)
        calc64(data, maps[i], i, size, &wg)
    }

    wg.Wait()

    // Add counts from all goroutines to the first map
    for i := 1; i < len(maps); i++ {
        for i2, val := range maps[i] {
            if val == nil {
                continue
            }
            if maps[0][i2] == nil {
                maps[0][i2] = new(int)
            }
            *maps[0][i2] += *val
        }
    }

    return maps[0]
}

func calc32(data []byte, result map[uint32]*int, begin int, size int, wg *sync.WaitGroup) {
    var key uint32
    goroutineCount := uint(numCPU)

    // Init key
    for i := 0; i < size; i++ {
        key <<= 2
        key |= uint32(data[i+begin])
    }

    // Create a map to do the counts in. 
    // We don't use the map we are passed but instead return a copy of this

    p := new(int)
    *p++
    result[key] = p

    nsize := uint(size)
    if goroutineCount < nsize {
        nsize = goroutineCount
    }

    mask := ^uint32(math.MaxUint32 << uint(2*size))

    // (Fixed: BG starts at begin + goroutineCount and ends at len + 1 - size,
    // so the key took the codes at the window's start, not its end: the
    // first windows were wrong and the last size - 1 missing.)
    start := uint(begin) + goroutineCount + uint(size) - nsize
    end := uint(len(data)) + 1 - nsize
    for idx := start; idx < end; idx += goroutineCount {
        // Update the key with 1 byte at a time
        for i := uint(0); i < nsize; i++ {
            key <<= 2
            key |= uint32(data[idx+i])
        }

        // Mask out excess information
        key &= mask

        // Get pointer to the count for this key from the map
        // For a low number of different keys using a map with 
        // pointers is faster than just using a value map and do: m[key]++
        p, ok := result[key]
        if !ok {
            p = new(int)
            result[key] = p
        }
        *p++
    }

    // Signal done
    wg.Done()
}

func calc64(data []byte, result map[uint64]*int, begin int, size int, wg *sync.WaitGroup) {
    var key uint64
    goroutineCount := uint(numCPU)

    // Init key
    for i := 0; i < size; i++ {
        key <<= 2
        key |= uint64(data[i+begin])
    }

    // Create a map to do the counts in. We don't use the map 
    // we are passed but instead return a copy of this

    p := new(int)
    *p++
    result[key] = p

    nsize := uint(size)
    if goroutineCount < nsize {
        nsize = goroutineCount
    }

    mask := ^uint64(math.MaxUint64 << uint(2*size))

    // (Fixed: BG starts at begin + goroutineCount and ends at len + 1 - size,
    // so the key took the codes at the window's start, not its end: the
    // first windows were wrong and the last size - 1 missing.)
    start := uint(begin) + goroutineCount + uint(size) - nsize
    end := uint(len(data)) + 1 - nsize
    for idx := start; idx < end; idx += goroutineCount {
        // Update the key with 1 byte at a time
        if uint(len(data)) < idx+nsize {
            continue
        }
        for i := uint(0); i < nsize; i++ {
            key <<= 2
            key |= uint64(data[idx+i])
        }

        // Mask out excess information
        key &= mask

        // Get pointer to the count for this key from the map
        // For a low number of different keys using a map with 
        // pointers is faster than just using a value map and do: m[key]++
        p, ok := result[key]
        if !ok {
            p = new(int)
            result[key] = p
        }
        *p++
    }

    // Signal done
    wg.Done()

}

func compress64(sequence []byte) uint64 {
    var num uint64
    for _, char := range sequence {
        num = num<<2 | uint64(char)
    }
    return num
}

func compress32(sequence []byte) uint32 {
    var num uint32
    for _, char := range sequence {
        num = num<<2 | uint32(char)
    }
    return num
}

func decompress32(num uint32, length int) string {
    var sequence = make([]byte, length)
    for i := 0; i < length; i++ {
        sequence[length-i-1] = toChar[byte(num&3)]
        num = num >> 2
    }
    return string(sequence)
}
    
// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
var fastaInput []byte

func fasta(n int) []byte {
    const alu = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA"
    out := []byte(">ONE Homo sapiens alu\n")
    k := 0
    for left := 2 * n; left > 0; left -= 60 {
        m := min(left, 60)
        for i := 0; i < m; i++ {
            out = append(out, alu[k])
            k = (k + 1) % len(alu)
        }
        out = append(out, '\n')
    }
    seed := uint32(42)
    random := func(chars string, probs []float64, count int) {
        cum := make([]float64, len(probs))
        c := 0.0
        for i, p := range probs {
            c += p
            cum[i] = c
        }
        for left := count; left > 0; left -= 60 {
            m := min(left, 60)
            for i := 0; i < m; i++ {
                seed = (seed*3877 + 29573) % 139968
                r := float64(seed) / 139968.0
                j := 0
                for j < len(cum)-1 && r >= cum[j] {
                    j++
                }
                out = append(out, chars[j])
            }
            out = append(out, '\n')
        }
    }
    out = append(out, ">TWO IUB ambiguity codes\n"...)
    random("acgtBDHKMNRSVWY", []float64{0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02}, 3*n)
    out = append(out, ">THREE Homo sapiens frequency\n"...)
    random("acgt", []float64{0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008}, 5*n)
    return out
}
