/* The Computer Language Benchmarks Game, pidigits g++ #4
 * https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/pidigits-gpp-4.html
 *
 * contributed by Alessandro Power
 *
 * Adapted for Wasm: <gmpxx.h> -> ./gmpxx.h, a minimal mpz_class over mini-gmp
 * 6.3.0 (full GMP and its gmpxx are not built for Wasm); main -> bench(n);
 * std::cout -> FNV-1a of the same bytes.
 */

#include "gmpxx.h"
#include <cstdint>
#include <cstddef>

class LFT {
public:
    mpz_class q;
    mpz_class r;
    mpz_class t;
    unsigned k;

public:
    LFT() : q(1), r(0), t(1), k(0){};

    void next() {
        ++k;
        r = (2 * k + 1) * (2 * q + r);
        t = (2 * k + 1) * t;
        q = q * k;
    }

    unsigned extract(unsigned x) const {
        static mpz_class tmp0, tmp1;
        tmp0 = q * x + r;
        tmp1 = tmp0 / t;
        return tmp1.get_ui();
    }

    void produce(unsigned n) {
        q = 10 * q;
        r = 10 * (r - n * t);
    }
};

static uint32_t fnv(uint32_t h, unsigned char c) { h ^= c; return h * 16777619u; }
static uint32_t fnv_num(uint32_t h, std::size_t x) {
    char buf[24];
    int len = 0;
    do { buf[len++] = '0' + x % 10; x /= 10; } while (x);
    while (len) h = fnv(h, buf[--len]);
    return h;
}

extern "C" uint32_t bench(int total) {
    const std::size_t TOTAL_DIGITS = total;
    uint32_t h = 2166136261u;

    LFT lft;
    std::size_t n_digits = 0;
    while (n_digits < TOTAL_DIGITS) {
        std::size_t i = 0;
        while (i < 10 and n_digits < TOTAL_DIGITS) {
            lft.next();
            if (lft.q > lft.r) continue;

            auto digit = lft.extract(3);
            if (digit == lft.extract(4)) {
                h = fnv(h, '0' + digit);
                lft.produce(digit);
                ++i;
                ++n_digits;
            }
        }

        // Pad digits with extra spaces if TOTAL_DIGITS was not a
        // multiple of 10.
        for (; i < 10; ++i) h = fnv(h, ' ');
        h = fnv(h, '\t'); h = fnv(h, ':');
        h = fnv_num(h, n_digits);
        h = fnv(h, '\n');
    }
    return h;
}
