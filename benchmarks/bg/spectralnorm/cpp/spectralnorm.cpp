// BG spectralnorm g++ #6 (Jakubowski et al.), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-gpp-6.html
// Changes: OpenMP removed (one thread: begin = 0, end = N; the barriers are
// no-ops without -fopenmp); GetThreadCount (sched_getaffinity) removed; main() ->
// extern "C" bench(N), which returns the FNV-1a hash of the bytes main() printed.
// SSE2 on Emscripten's simd128 emulation (-msse3). Algorithm unchanged.

// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// Original C contributed by Sebastien Loisel
// Conversion to C++ by Jon Harrop
// OpenMP parallelize by The Anh Tran
// Add SSE by The Anh Tran
// Additional SSE optimization by Krzysztof Jakubowski

// g++ -pipe -O3 -march=native -fopenmp -mfpmath=sse -msse2 \
//     ./spec.c++ -o ./spec.run

#include <cmath>
#include <cstdlib>
#include <cstdio>
#include <cstdint>
#include <emmintrin.h>

template <bool modei> int Index(int i, int j) {
    return (((i + j) * (i + j + 1)) >> 1) + (modei? i : j) + 1;
}

template <bool modei>
void EvalPart(double *__restrict__ src, double *__restrict__ dst,
                int begin, int end, int length) {
    int i = begin;

    for(; i + 1 < end; i += 2) {
        __m128d sum = _mm_set_pd(
			src[0] / double(Index<modei>(i + 1, 0)),
			src[0] / double(Index<modei>(i + 0, 0)));
    
		__m128d ti = modei?
			_mm_set_pd(i + 1, i + 0) :
			_mm_set_pd(i + 2, i + 1);	
		__m128d last = _mm_set_pd(
			Index<modei>(i + 1, 0),
			Index<modei>(i + 0, 0));

        for(int j = 1; j < length; j++) {
			__m128d idx = last + ti + _mm_set1_pd(j);
			last = idx;
            sum = sum + _mm_set1_pd(src[j]) / idx;
        }

        _mm_storeu_pd(dst + i + 0, sum);
    }
    for(; i < end; i++) {
        double sum = 0;
        for (int j = 0; j < length; j++)
            sum += src[j] / double(Index<modei>(i, j));
        dst[i] = sum;
    }

}

void EvalATimesU(double *src, double *dst, int begin, int end, int N) {
    EvalPart<1>(src, dst, begin, end, N);
}

void EvalAtTimesU(double *src, double *dst, int begin, int end, int N) {
    EvalPart<0>(src, dst, begin, end, N);
}

void EvalAtATimesU(double *src, double *dst, double *tmp,
                   int begin, int end, int N) {
    EvalATimesU (src, tmp, begin, end, N);
    #pragma omp barrier
    EvalAtTimesU(tmp, dst, begin, end, N);
    #pragma omp barrier
}

double spectral_game(int N) {
    __attribute__((aligned(16))) double u[N];
    __attribute__((aligned(16))) double v[N], tmp[N];

    double vBv = 0.0;
    double vv = 0.0;

    // (one thread: was #pragma omp parallel num_threads(GetThreadCount()))
    {
        // this block will be executed by NUM_THREADS
        // variable declared in this block is private for each thread
        int threadid = 0;
        int threadcount = 1;
        int chunk = N / threadcount;

        // calculate each thread's working range [r1 .. r2) => static schedule
        int begin = threadid * chunk;
        int end = (threadid < (threadcount -1)) ? (begin + chunk) : N;

        for(int i = begin; i < end; i++)
            u[i] = 1.0;
        #pragma omp barrier

        for (int ite = 0; ite < 10; ++ite) {
            EvalAtATimesU(u, v, tmp, begin, end, N);
            EvalAtATimesU(v, u, tmp, begin, end, N);
        }
    
        double sumvb = 0.0, sumvv = 0.0;
        for (int i = begin; i < end; i++) {
            sumvv += v[i] * v[i];
            sumvb += u[i] * v[i];
        }

                {
            vBv += sumvb;
            vv += sumvv;
        }
    }

    return sqrt(vBv / vv);
}

static uint32_t fnv(uint32_t h, const char *s, int len) {
    for (int i = 0; i < len; i++) { h ^= (unsigned char)s[i]; h *= 16777619u; }
    return h;
}

extern "C" uint32_t bench(int N) {
    char out[64];
    int len = snprintf(out, sizeof out, "%.9f\n", spectral_game(N));
    return fnv(2166136261u, out, len);
}
