// A minimal gmpxx.h over mini-gmp (../c/mini-gmp.h): mpz_class with just the
// operators pidigits g++ #4 uses. GMP's real gmpxx.h needs full GMP, which is
// not built for Wasm here. No expression templates: each operator makes a
// temporary (moved, not copied), where gmpxx would fuse some of them.
#pragma once
extern "C" {
#include "../c/mini-gmp.h"
}

class mpz_class {
public:
    mpz_t v;
    mpz_class() { mpz_init(v); }
    mpz_class(long x) { mpz_init_set_si(v, x); }
    mpz_class(int x) { mpz_init_set_si(v, x); }
    mpz_class(unsigned x) { mpz_init_set_ui(v, x); }
    mpz_class(const mpz_class &o) { mpz_init_set(v, o.v); }
    mpz_class(mpz_class &&o) { mpz_init(v); mpz_swap(v, o.v); }
    ~mpz_class() { mpz_clear(v); }
    mpz_class &operator=(const mpz_class &o) { mpz_set(v, o.v); return *this; }
    mpz_class &operator=(mpz_class &&o) { mpz_swap(v, o.v); return *this; }
    unsigned long get_ui() const { return mpz_get_ui(v); }
};

inline mpz_class operator*(const mpz_class &a, const mpz_class &b) { mpz_class r; mpz_mul(r.v, a.v, b.v); return r; }
inline mpz_class operator*(mpz_class &&a, const mpz_class &b) { mpz_mul(a.v, a.v, b.v); return static_cast<mpz_class &&>(a); }
inline mpz_class operator*(const mpz_class &a, mpz_class &&b) { mpz_mul(b.v, a.v, b.v); return static_cast<mpz_class &&>(b); }
inline mpz_class operator*(mpz_class &&a, mpz_class &&b) { mpz_mul(a.v, a.v, b.v); return static_cast<mpz_class &&>(a); }
inline mpz_class operator*(const mpz_class &a, unsigned x) { mpz_class r; mpz_mul_ui(r.v, a.v, x); return r; }
inline mpz_class operator*(mpz_class &&a, unsigned x) { mpz_mul_ui(a.v, a.v, x); return static_cast<mpz_class &&>(a); }
inline mpz_class operator*(unsigned x, const mpz_class &a) { return a * x; }
inline mpz_class operator*(unsigned x, mpz_class &&a) { return static_cast<mpz_class &&>(a) * x; }
inline mpz_class operator*(int x, const mpz_class &a) { mpz_class r; mpz_mul_si(r.v, a.v, x); return r; }
inline mpz_class operator*(int x, mpz_class &&a) { mpz_mul_si(a.v, a.v, x); return static_cast<mpz_class &&>(a); }
inline mpz_class operator+(const mpz_class &a, const mpz_class &b) { mpz_class r; mpz_add(r.v, a.v, b.v); return r; }
inline mpz_class operator+(mpz_class &&a, const mpz_class &b) { mpz_add(a.v, a.v, b.v); return static_cast<mpz_class &&>(a); }
inline mpz_class operator-(const mpz_class &a, const mpz_class &b) { mpz_class r; mpz_sub(r.v, a.v, b.v); return r; }
inline mpz_class operator-(const mpz_class &a, mpz_class &&b) { mpz_sub(b.v, a.v, b.v); return static_cast<mpz_class &&>(b); }
inline mpz_class operator/(const mpz_class &a, const mpz_class &b) { mpz_class r; mpz_tdiv_q(r.v, a.v, b.v); return r; }
inline mpz_class operator/(mpz_class &&a, const mpz_class &b) { mpz_tdiv_q(a.v, a.v, b.v); return static_cast<mpz_class &&>(a); }
inline bool operator>(const mpz_class &a, const mpz_class &b) { return mpz_cmp(a.v, b.v) > 0; }
