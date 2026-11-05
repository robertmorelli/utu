// The Computer Language Benchmark Game, pidigits Swift #2
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/pidigits-swift-2.html
//
// Inspired by the gcc implementation
// contributed by Ralph Ganszky
//
// Adapted for Wasm: GMP -> mini-gmp 6.3.0 (a C target of this package), so
// __gmpz_* -> mpz_* (mini-gmp's names; GMP's are macros for __gmpz_*);
// top-level code -> bench(n); print -> FNV-1a of the same bytes.

import gmp

func fnv(_ h0: UInt32, _ s: String) -> UInt32 {
    var h = h0
    for b in s.utf8 { h ^= UInt32(b); h = h &* 16777619 }
    return h
}

@_expose(wasm, "bench") @_cdecl("bench")
public func bench(_ n32: Int32) -> UInt32 {
    let n = UInt(n32)
    var h: UInt32 = 2166136261

    // Allocate numbers and defer their destruction
    let tmp1 = UnsafeMutablePointer<mpz_t>.allocate(capacity: 1)
    let tmp2 = UnsafeMutablePointer<mpz_t>.allocate(capacity: 1)
    let acc = UnsafeMutablePointer<mpz_t>.allocate(capacity: 1)
    let den = UnsafeMutablePointer<mpz_t>.allocate(capacity: 1)
    let num = UnsafeMutablePointer<mpz_t>.allocate(capacity: 1)
    defer {
        mpz_clear(tmp1)
        mpz_clear(tmp2)
        mpz_clear(acc)
        mpz_clear(den)
        mpz_clear(num)

        tmp1.deallocate()
        tmp2.deallocate()
        acc.deallocate()
        den.deallocate()
        num.deallocate()
    }

    // Initialize numbers
    mpz_init(tmp1)
    mpz_init(tmp2)

    mpz_init_set_ui(acc, 0)
    mpz_init_set_ui(den, 1)
    mpz_init_set_ui(num, 1)

    func extractDigit(_ n: UInt) -> UInt {
        mpz_mul_ui(tmp1, num, n)
        mpz_add(tmp2, tmp1, acc)
        mpz_tdiv_q(tmp1, tmp2, den)
        return mpz_get_ui(tmp1)
    }

    func eliminateDigit(_ d: UInt) {
        mpz_submul_ui(acc, den, d)
        mpz_mul_ui(acc, acc, 10)
        mpz_mul_ui(num, num, 10)
    }

    func nextTerm(_ k: UInt) {
        let k2 = 2*k+1
        mpz_addmul_ui(acc, num, 2)
        mpz_mul_ui(acc, acc, k2)
        mpz_mul_ui(den, den, k2)
        mpz_mul_ui(num, num, k)
    }

    var d: UInt
    var d4: UInt
    var k: UInt = 0

    // Generate digits
    for i in 1...n {
        repeat {
            repeat {
                k += 1
                nextTerm(k)
            } while mpz_cmp(num, acc) > 0

            d = extractDigit(3)
            d4 = extractDigit(4)
        } while d != d4

        // Output digit
        h = fnv(h, "\(d)")
        if i % 10 == 0 {
            h = fnv(h, "\t:\(i)\n")
        }

        eliminateDigit(d)
    }
    if n % 10 != 0 {
        for _ in 0..<(10-(n%10)) {
            h = fnv(h, " ")
        }
        h = fnv(h, "\t:\(n)\n")
    }
    return h
}
