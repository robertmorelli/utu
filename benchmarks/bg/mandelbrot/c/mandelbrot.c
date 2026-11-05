/* BG mandelbrot gcc #6 (Kevin Miller), adapted for Wasm:
 * https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/mandelbrot-gcc-6.html
 * Changes: `unsigned long` -> uint64_t (it holds 64 pixels, and long is 32 bits on
 * wasm32); `inline` -> `static inline` (C99 inline needs an external definition);
 * SSE2 __m128d vector arithmetic on simd128 (-msse2: Emscripten maps it); OpenMP
 * pragmas ignored (no -fopenmp: one thread); main() -> bench(n), which returns the
 * FNV-1a hash of the bytes main() wrote (header and bitmap) in place of write().
 * Algorithm and layout unchanged.
 */

// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// Contributed by Kevin Miller
//
// ver 2: added a couple of optimizations
// - Reduced number of times a vector of 8 was checked to see if
//    they had all escaped, similar to Dominic Letz's C #5 entry.
// - Processed 64 pixels at a time if width was a multiple of 64,
//    thereby reducing writes to the bitmap.
//
// compile with following gcc flags
//  -pipe -Wall -O3 -ffast-math -fno-finite-math-only -march=native -mfpmath=sse -msse3 -fopenmp


#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <emmintrin.h>


long numDigits(long n)
{
    long len = 0;
    while(n)
    {
        n=n/10;
        len++;
    }
    return len;
}

static inline long vec_nle(__m128d *v, double f)
{
    return (v[0][0] <= f ||
        v[0][1] <= f ||
        v[1][0] <= f ||
        v[1][1] <= f ||
        v[2][0] <= f ||
        v[2][1] <= f ||
        v[3][0] <= f ||
        v[3][1] <= f) ? 0 : -1;
}

static inline void clrPixels_nle(__m128d *v, double f, uint64_t * pix8)
{
    if(!(v[0][0] <= f)) *pix8 &= 0x7f;
    if(!(v[0][1] <= f)) *pix8 &= 0xbf;
    if(!(v[1][0] <= f)) *pix8 &= 0xdf;
    if(!(v[1][1] <= f)) *pix8 &= 0xef;
    if(!(v[2][0] <= f)) *pix8 &= 0xf7;
    if(!(v[2][1] <= f)) *pix8 &= 0xfb;
    if(!(v[3][0] <= f)) *pix8 &= 0xfd;
    if(!(v[3][1] <= f)) *pix8 &= 0xfe;
}

static inline void calcSum(__m128d *r, __m128d *i, __m128d *sum, __m128d *init_r, __m128d init_i)
{
    for(long pair=0; pair<4; pair++)
    {
        __m128d r2 = r[pair] * r[pair];
        __m128d i2 = i[pair] * i[pair];
        __m128d ri = r[pair] * i[pair];

        sum[pair] = r2 + i2;

        r[pair]=r2 - i2 + init_r[pair];
        i[pair]=ri + ri + init_i;
    }
}

static inline uint64_t mand8(__m128d *init_r, __m128d init_i)
{
    __m128d r[4], i[4], sum[4];
    for(long pair=0; pair<4; pair++)
    {
        r[pair]=init_r[pair];
        i[pair]=init_i;
    }

    uint64_t pix8 = 0xff;

    for (long j = 0; j < 6; j++)
    {
        for(long k=0; k<8; k++)
            calcSum(r, i, sum, init_r, init_i);

        if (vec_nle(sum, 4.0))
        {
            pix8 = 0x00;
            break;
        }
    }
    if (pix8)
    {
        calcSum(r, i, sum, init_r, init_i);
        calcSum(r, i, sum, init_r, init_i);
        clrPixels_nle(sum, 4.0, &pix8);
    }

    return pix8;
}

uint64_t mand64(__m128d *init_r, __m128d init_i)
{
    uint64_t pix64 = 0;

    for(long byte=0; byte<8; byte++)
    {
        uint64_t pix8 = mand8(init_r, init_i);

        pix64 = (pix64 >> 8) | (pix8 << 56);
        init_r += 4;
    }

    return pix64;
}



static uint32_t fnv(uint32_t h, const unsigned char *s, long len) {
    for (long i = 0; i < len; i++) { h ^= s[i]; h *= 16777619u; }
    return h;
}

uint32_t bench(int n)
{
    long wid_ht = n;
    wid_ht = (wid_ht+7) & ~7;


    // allocate memory for header and pixels

    long headerLength = numDigits(wid_ht)*2+5;
    long pad = ((headerLength + 7) & ~7) - headerLength; // pad aligns pixels on 8
    long dataLength = headerLength + wid_ht*(wid_ht>>3);
    unsigned char * const buffer = malloc(pad + dataLength);
    unsigned char * const header = buffer + pad;
    unsigned char * const pixels = header + headerLength;


    // generate the bitmap header

    sprintf((char *)header, "P4\n%ld %ld\n", wid_ht, wid_ht);


    // calculate initial values, store in r0, i0

    __m128d r0[wid_ht/2];
    double i0[wid_ht];

    for(long xy=0; xy<wid_ht; xy+=2)
    {
        r0[xy>>1] = 2.0 / wid_ht * (__m128d){xy,  xy+1} - 1.5;
        i0[xy]    = 2.0 / wid_ht *  xy    - 1.0;
        i0[xy+1]  = 2.0 / wid_ht * (xy+1) - 1.0;
    }


    // generate the bitmap

    long use8 = wid_ht%64;
    if (use8)
    {
        // process 8 pixels (one byte) at a time    
        #pragma omp parallel for schedule(guided)
        for(long y=0; y<wid_ht; y++)
        {
            __m128d init_i = (__m128d){i0[y], i0[y]};
            long rowstart = y*wid_ht/8;
            for(long x=0; x<wid_ht; x+=8)
            {
                pixels[rowstart + x/8] = mand8(r0+x/2, init_i);
            }
        }
    }
    else
    {
        // process 64 pixels (8 bytes) at a time
        #pragma omp parallel for schedule(guided)
        for(long y=0; y<wid_ht; y++)
        {
            __m128d init_i = (__m128d){i0[y], i0[y]};
            long rowstart = y*wid_ht/64;
            for(long x=0; x<wid_ht; x+=64)
            {
                ((uint64_t *)pixels)[rowstart + x/64] = mand64(r0+x/2, init_i);
            }
        }
    }

    // write the data

    uint32_t ret = fnv(2166136261u, header, dataLength);


    free(buffer);

    return ret;
}

    