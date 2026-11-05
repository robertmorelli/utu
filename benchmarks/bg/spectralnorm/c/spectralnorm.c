/* BG spectralnorm gcc #7 (Bogdan Sharkov, after Mr Ledrug / Steve Decker et al.; SSE2/SSE4.1 intrinsics), adapted for Wasm:
 * https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-gcc-7.html
 * Changes: <x86intrin.h> -> <immintrin.h> (Emscripten emulates SSE4.1's
 * _mm_mullo_epi32 etc. on simd128; -mavx); the OpenMP pragmas are ignored (no
 * -fopenmp: one thread); main(argc, argv) -> bench(n), which returns the FNV-1a hash
 * of the bytes main() printed (snprintf). Loops unchanged.
 */

/* The Computer Language Benchmarks Game
 * https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 *
 * Contributed by Bogdan Sharkov 
 * Optimized memory access (SSE2 intrinsics), compile with -march=native -fopenmp for best results 
 *
 * Contributed by Mr Ledrug 
 * Algorithm lifted from Intel Fortran #2 code by Steve Decker et al.
*/

#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <malloc.h>
#include <immintrin.h>
#include <stdint.h>

double dot(double * v, double * u, int n) {
   int i;
   double sum = 0;
   for (i = 0; i < n; i++)
      sum += *v++ * *u++;
   return sum;
}

void mult_Av(double * v, double * out, const int n) {
   __m128i ONE = _mm_set1_epi32(1);  
   __m128i FOUR = _mm_set1_epi32(4);
   unsigned int i, j;
   #pragma omp parallel for schedule(static)
   for (i = 1; i <= n; i++) {
	   
	   j = i-1;
	   int k = n+j;
	   __m128i m = _mm_set1_epi32(i);
	   __m128d mysum =_mm_setzero_pd();
	   __m128i x = _mm_setr_epi32(j, j + 1, j + 2, j + 3);	   
		
		for (double* pv = v; j < k; j+=4, pv+=2) {
			__m128i y = _mm_add_epi32(x, ONE);
			__m128i a = _mm_mullo_epi32(x, y);
			x = _mm_add_epi32(x, FOUR);
			a = _mm_srli_epi32(a, 1);
			a = _mm_add_epi32(a, m);
			 
			__m128d  mul = _mm_cvtepi32_pd(a);
			__m128d  src = _mm_load_pd(pv);			
			pv+=2;
			__m128d  res = _mm_div_pd(src, mul);
			mysum = _mm_add_pd(mysum, res);
			
		    a = _mm_shuffle_epi32(a, _MM_SHUFFLE(1, 0, 3, 2));			
			mul = _mm_cvtepi32_pd(a);
			src = _mm_load_pd(pv);
			res = _mm_div_pd(src, mul);
			mysum = _mm_add_pd(mysum, res);			
		}    
	  
  	  out[i-1] = ((double*)&mysum)[0] + ((double*)&mysum)[1];
   }
	out[n] = out[n+1] =out[n+2] = 0.0;
}

void mult_Atv(double * v, double * out,  const int n) {
   __m128i ONE = _mm_set1_epi32(1);  
   __m128i FOUR = _mm_set1_epi32(4);
   int i;
   
  #pragma omp parallel for schedule(static)
   for (i = 0; i < n; i++) {
	   double* pv = v;
	  __m128d mysum =_mm_setzero_pd();
	  __m128i x = _mm_setr_epi32(i, i + 1, i + 2, i + 3);
	  __m128i aj = _mm_setr_epi32(1, 2, 3, 4);
	  for (int j=0;j < n;j+=4){
		  
			__m128i y = _mm_add_epi32(x, ONE);
			__m128i a = _mm_mullo_epi32(x, y);
			x = _mm_add_epi32(x, FOUR);
			a = _mm_srli_epi32(a, 1);
			a = _mm_add_epi32(a, aj);
			aj = _mm_add_epi32(aj, FOUR);
			 
			__m128d  mul = _mm_cvtepi32_pd(a);
			__m128d  src = _mm_load_pd(pv);
			pv+=2;
			__m128d  res = _mm_div_pd(src, mul);	
			mysum = _mm_add_pd(mysum, res);
			
			a = _mm_shuffle_epi32(a, _MM_SHUFFLE(1, 0, 3, 2));			
			mul = _mm_cvtepi32_pd(a);
			src = _mm_load_pd(pv);
			pv+=2;
			res = _mm_div_pd(src, mul);	
			mysum = _mm_add_pd(mysum, res);			
	  }		  
	  out[i] = ((double*)&mysum)[0] + ((double*)&mysum)[1];
   }
   
    out[n] = out[n+1] = out[n+2] = 0.0;
}

double *tmp;
void mult_AtAv(double *v, double *out, const int n) {
   mult_Av(v, tmp, n);
   mult_Atv(tmp, out, n);
}

static uint32_t fnv(uint32_t h, const char *s, int len) {
   for (int i = 0; i < len; i++) { h ^= (unsigned char)s[i]; h *= 16777619u; }
   return h;
}

uint32_t bench(int n) {

   double *u, *v;
   u = _mm_malloc((n+3) * sizeof(double),sizeof(__m128d));
   v = _mm_malloc((n+3) * sizeof(double),sizeof(__m128d));
   tmp = _mm_malloc((n+3) * sizeof(double),sizeof(__m128d));
   
   int i;
   for (i = 0; i < n; i++) u[i] = 1;
   u[n] = u[n+1] = u[n+2] = 0.0;
   for (i = 0; i < 10; i++) {
      mult_AtAv(u, v, n);
      mult_AtAv(v, u, n);
   }

   char out[64];
   int len = snprintf(out, sizeof out, "%.9f\n", sqrt(dot(u,v, n) / dot(v,v,n)));

	_mm_free(u);
	_mm_free(v);
	_mm_free(tmp);

   return fnv(2166136261u, out, len);
}
    
    