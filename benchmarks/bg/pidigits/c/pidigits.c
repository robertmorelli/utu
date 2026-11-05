/* The Computer Language Benchmarks Game, pidigits gcc #2
 * https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/pidigits-gcc-2.html
 *
 * Contributed by Michael Ganss, derived from PHP version that was
 * contributed by Oleksii Prudkyi, port from pidigits.lua-5.lua (Mike Pall,
 * Wim Couwenberg), modified by Craig Russell. Original C version by Mr Ledrug.
 *
 * Adapted for Wasm: GMP -> mini-gmp 6.3.0 (mini-gmp.c here, GMP's single-file
 * subset, 32-bit limbs; full GMP is not built for Wasm); main -> bench(n);
 * putchar/printf -> FNV-1a of the same bytes (snprintf for the numbers).
 */

#include <stdio.h>
#include <stdint.h>
#include "mini-gmp.h"

static uint32_t fnv(uint32_t h, const char *s, int len)
{
    for (int i = 0; i < len; i++) { h ^= (unsigned char)s[i]; h *= 16777619u; }
    return h;
}

uint32_t bench(int n)
{
    mpz_t n1, n2, d, u, v, w;
    int k = 1, k2, i = 0;
    uint32_t h = 2166136261u;
    char buf[32];

    mpz_init(u);
    mpz_init(v);

    mpz_init_set_si(w, 0);
    mpz_init_set_si(n1, 4);
    mpz_init_set_si(n2, 3);
    mpz_init_set_si(d, 1);

    for (;;)
    {
        mpz_tdiv_q(u, n1, d);
        mpz_tdiv_q(v, n2, d);

        if (mpz_cmp(u, v) == 0)
        {
            char c = '0' + mpz_get_si(u);
            h = fnv(h, &c, 1);
            i++;
            if (i % 10 == 0)
                h = fnv(h, buf, snprintf(buf, sizeof buf, "\t:%d\n", i));
            if (i == n)
                break;

            // extract
            mpz_mul_si(u, u, -10);
            mpz_mul(u, d, u);
            mpz_mul_si(n1, n1, 10);
            mpz_add(n1, n1, u);
            mpz_mul_si(n2, n2, 10);
            mpz_add(n2, n2, u);
        }
        else
        {
            // produce
            k2 = k * 2;
            mpz_mul_si(u, n1, k2 - 1);
            mpz_add(v, n2, n2);
            mpz_mul_si(w, n1, k - 1);
            mpz_add(n1, u, v);
            mpz_mul_si(u, n2, k + 2);
            mpz_add(n2, w, u);
            mpz_mul_si(d, d, k2 + 1);
            k++;
        }
    }

    if (i % 10 != 0)
        h = fnv(h, buf, snprintf(buf, sizeof buf, "%*s\t:%d\n", 10 - n % 10, "", n));

    mpz_clear(n1); mpz_clear(n2); mpz_clear(d);
    mpz_clear(u); mpz_clear(v); mpz_clear(w);
    return h;
}
