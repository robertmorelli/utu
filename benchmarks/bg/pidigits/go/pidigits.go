/* The Computer Language Benchmarks Game, pidigits Go #4
 * https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/pidigits-go-4.html
 *
 * based on pidigits.c (by Paolo Bonzini & Sean Bartlett,
 *    modified by Michael Mellor)
 * contributed by Zhao Zhiqiang.
 * Modified by Antonio Petri to use strings.Builder
 *
 * Adapted for Wasm: cgo GMP (no cgo on GOOS=wasip1) -> math/big, each mpz
 * call as the big.Int calls that do the same (mul_ui: Mul by a big.Int
 * holding the word; addmul_ui/submul_ui: a product into tmp, then Add/Sub);
 * main -> bench(n); output -> FNV-1a of the same bytes.
 */

package main

import (
	"math/big"
	"strconv"
)

var tmp1, tmp2, acc, den, num, word big.Int

func mulUi(z, x *big.Int, y uint32) {
	word.SetUint64(uint64(y))
	z.Mul(x, &word)
}

func extract_digit(nth uint32) uint32 {
	mulUi(&tmp1, &num, nth)
	tmp2.Add(&tmp1, &acc)
	tmp1.Quo(&tmp2, &den)

	return uint32(tmp1.Uint64())
}

func eliminate_digit(d uint32) {
	mulUi(&tmp1, &den, d)
	acc.Sub(&acc, &tmp1)
	mulUi(&acc, &acc, 10)
	mulUi(&num, &num, 10)
}

func next_term(k uint32) {
	k2 := k*2 + 1

	tmp1.Lsh(&num, 1)
	acc.Add(&acc, &tmp1)
	mulUi(&acc, &acc, k2)
	mulUi(&den, &den, k2)
	mulUi(&num, &num, k)
}

const base = 48

func fnv(h uint32, s []byte) uint32 {
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

//go:wasmexport bench
func bench(n int32) uint32 {
	h := uint32(2166136261)
	sb := make([]byte, 0, 32)

	tmp1.SetUint64(0)
	tmp2.SetUint64(0)
	acc.SetUint64(0)
	den.SetUint64(1)
	num.SetUint64(1)

	k := uint32(0)
	d := uint32(0)

	for i := 0; i < int(n); {
		k++
		next_term(k)

		if num.Cmp(&acc) > 0 {
			continue
		}

		d = extract_digit(3)
		if d != extract_digit(4) {
			continue
		}

		sb = append(sb, base+byte(d))
		i++
		if i%10 == 0 {
			sb = append(sb, "\t:"...)
			sb = strconv.AppendInt(sb, int64(i), 10)
			sb = append(sb, '\n')
			h = fnv(h, sb)
			sb = sb[:0]
		}

		eliminate_digit(d)
	}
	// Go #4 prints nothing for a last partial line (BG's n is a multiple of
	// 10); the other ports pad it, so this does too.
	if len(sb) > 0 {
		for len(sb) < 10 {
			sb = append(sb, ' ')
		}
		sb = append(sb, "\t:"...)
		sb = strconv.AppendInt(sb, int64(n), 10)
		sb = append(sb, '\n')
		h = fnv(h, sb)
	}
	return h
}

func main() {}
