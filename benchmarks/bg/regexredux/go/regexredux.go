// BG regex-redux Go #5 (The Go Authors, Tylor Arndt, Chandra Sekar S, Matt
// Dellandrea, Pavel Griaznov), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/regexredux-go-5.html
// Changes: github.com/GRbit/go-pcre is a cgo binding to libpcre (no cgo on
// wasip1), so the patterns go through Go's own regexp (as BG Go #1-#3 do):
// MustCompileJIT -> regexp.MustCompile, Matcher/Match -> FindIndex,
// ReplaceAll -> ReplaceAll; single-threaded (the goroutines run in order);
// stdin -> the fasta text setup(n) makes; fmt.Printf -> fmt.Sprintf + FNV-1a
// 32, returned by bench(n).

/* The Computer Language Benchmarks Game
 * https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 *
 * regex-dna program contributed by The Go Authors.
 * modified by Tylor Arndt.
 * modified by Chandra Sekar S to use optimized PCRE binding.
 * modified by Matt Dellandrea.
 * modified by Pavel Griaznov to use PCRE JIT compilation.
 */

package main

import (
	"fmt"
	"regexp"
)

type substitution struct {
	pattern     string
	replacement string
}

func countMatches(pat string, b []byte) int {
	m := regexp.MustCompile(pat)
	n := 0

	for {
		loc := m.FindIndex(b)
		if loc == nil {
			break
		}
		n++

		b = b[loc[1]:]
	}

	return n
}

func run(input []byte) string {
	var variants = []string{
		"agggtaaa|tttaccct",
		"[cgt]gggtaaa|tttaccc[acg]",
		"a[act]ggtaaa|tttacc[agt]t",
		"ag[act]gtaaa|tttac[agt]ct",
		"agg[act]taaa|ttta[agt]cct",
		"aggg[acg]aaa|ttt[cgt]ccct",
		"agggt[cgt]aa|tt[acg]accct",
		"agggta[cgt]a|t[acg]taccct",
		"agggtaa[cgt]|[acg]ttaccct",
	}

	var substs = []substitution{
		{"tHa[Nt]", "<4>"},
		{"aND|caN|Ha[DS]|WaS", "<3>"},
		{"a[NSt]|BY", "<2>"},
		{"<[^>]*>", "|"},
		{"\\|[^|][^|]*\\|", "-"},
	}

	b := input
	ilen := len(b)

	// Delete the comment lines and newlines
	b = regexp.MustCompile("(>[^\n]*)?\n").ReplaceAll(b, []byte{})
	clen := len(b)

	mresults := make([]int, len(variants))
	for i := 0; i < len(variants); i++ {
		mresults[i] = countMatches(variants[i], b)
	}

	r := b
	for i := 0; i < len(substs); i++ {
		r = regexp.MustCompile(substs[i].pattern).ReplaceAll(r, []byte(substs[i].replacement))
	}
	lenresult := len(r)

	out := ""
	for i := 0; i < len(variants); i++ {
		out += fmt.Sprintf("%s %d\n", variants[i], mresults[i])
	}

	out += fmt.Sprintf("\n%d\n%d\n%d\n", ilen, clen, lenresult)
	return out
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.
var input []byte

func fasta(n int) []byte {
	const alu = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA"
	out := []byte(">ONE Homo sapiens alu\n")
	k := 0
	for left := 2 * n; left > 0; left -= 60 {
		m := min(left, 60)
		for i := 0; i < m; i++ {
			out = append(out, alu[k])
			k++
			if k == len(alu) {
				k = 0
			}
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

//go:wasmexport setup
func setup(n int32) {
	input = fasta(int(n))
}

//go:wasmexport bench
func bench(n int32) uint32 {
	s := run(input)
	h := uint32(2166136261)
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

func main() {}
