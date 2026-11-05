// BG fasta g++ #9 (Martin Jambrek, after Rust #7), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fasta-gpp-9.html
// Changes: single-threaded: fasta_random's loop runs once on the calling thread
// (no SpinLock, std::thread or turn-taking; same blocks of LINES lines). The
// boost strided irange is the plain loop it stands for. SSE2 kept: Emscripten's
// <emmintrin.h> on simd128 (-msse2). fwrite/fputs/fputc -> out(), the output sink
// (here: FNV-1a over the bytes); main -> fasta(n) and bench(n). rng_buf and
// out_buf are static, not on the stack (Emscripten's stack is 64 KB). Programs that
// read fasta's output copy the block between the "fasta generator" markers and make out()
// append (scratchpad fasta-input.md).

// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// contributed by Martin Jambrek
//
// Based on a C++ translation of Rust #7 with minor changes
// made to the SSE2 intrinsics used to lookup nucleotides from
// randomly generated integers using the prescribed LCG algorithm.

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <string_view>
#include <vector>

#ifdef __SSE2__
#include <emmintrin.h>
#endif

// ---- output sink: what BG writes to stdout goes here
static uint32_t fnv_hash;
static void out(const char* data, size_t n) {
  uint32_t h = fnv_hash;
  for (size_t i = 0; i < n; i++) {
    h ^= (unsigned char)data[i];
    h *= 16777619u;
  }
  fnv_hash = h;
}
static void out(const char* s) { out(s, std::strlen(s)); }

// ---- fasta generator: copy from here to "end of the fasta generator"
constexpr int LINE_LENGTH = 60;
constexpr uint32_t IM = 139968;
constexpr int LINES = 1024;
constexpr int BLKLEN = LINE_LENGTH * LINES;

struct Nucleotide {
  char letter;
  float prob;
};

#ifdef __SSE2__
inline int horizontal_sum(__m128i v) {
  __m128i hi64 = _mm_unpackhi_epi64(v, v);
  __m128i sum64 = _mm_add_epi32(hi64, v);
  __m128i hi32 = _mm_shufflelo_epi16(sum64, _MM_SHUFFLE(1, 0, 3, 2));
  __m128i sum32 = _mm_add_epi32(sum64, hi32);
  return _mm_cvtsi128_si32(sum32);
}
#endif

template <size_t N>
struct WeightedRandom {
  // Pad size to a multiple of 4
  static constexpr size_t padded_size = ((N + 4 - 1) / 4) * 4;

  constexpr WeightedRandom(const std::array<Nucleotide, N>& c) noexcept {
    size_t i = 0;
    float acc = 0.f;
    for (auto&& [l, p] : c) {
      acc += p;
      cumprob[i] = std::floor(acc * IM);
      letters[i] = l;
      i++;
    }
    std::fill_n(cumprob + i, padded_size - i,
                std::numeric_limits<int32_t>::max());
  }

#ifdef __SSE2__
  constexpr char gen_from_u32(uint32_t prob) const noexcept {
    const auto needle = _mm_set1_epi32(prob);
    auto count = _mm_setzero_si128();

    for (size_t i = 0; i < padded_size; i += 4) {
      auto vp = _mm_load_si128((__m128i*)(cumprob + i));
      count = _mm_sub_epi32(count, _mm_cmplt_epi32(vp, needle));
    }
    return letters[horizontal_sum(count)];
  }
#else
  constexpr char gen_from_u32(uint32_t prob) const noexcept {
    auto res = std::find_if(cumprob, cumprob + N,
                            [prob](auto p) { return prob <= p; });
    auto idx = std::distance(cumprob, res);
    return letters[idx];
  }
#endif

  alignas(32) uint32_t cumprob[padded_size];
  char letters[padded_size];
};

class RandomLCG {
 public:
  RandomLCG(size_t count) : count_(count) {}

  void reset(size_t count) { count_ = count; }

  template <typename Itr>
  size_t gen(Itr begin, size_t n) noexcept {
    auto to_gen = std::min(n, count_);
    std::generate_n(begin, to_gen,
                    [this] { return (seed_ = (seed_ * 3877 + 29573) % IM); });
    count_ -= to_gen;
    return to_gen;
  }

 private:
  uint32_t seed_ = 42;
  size_t count_;
};

// Based off make_Sequence_Buffer() from C gcc #2.
inline std::vector<char> gen_repeat_buffer(std::string_view seq) {
  size_t n_chars = seq.length() * LINE_LENGTH;
  std::vector<char> buffer(n_chars + n_chars / LINE_LENGTH);
  char* bufferOffset = buffer.data();

  std::vector<char> extended(seq.length() + LINE_LENGTH);
  for (size_t i = 0; i < extended.size(); ++i) {
    extended[i] = seq[i % seq.length()];
  }

  char line[LINE_LENGTH + 1];
  size_t offset = 0;
  while (n_chars > 0) {
    size_t line_Length = std::min<size_t>(n_chars, LINE_LENGTH);
    line[line_Length] = '\n';

    std::copy_n(begin(extended) + offset, line_Length, line);

    offset += line_Length;
    offset -= (offset > seq.length()) * seq.length();

    std::copy_n(line, line_Length + 1, bufferOffset);
    bufferOffset += line_Length + 1;
    n_chars -= line_Length;
  }
  return buffer;
}

// Based off repeat_And_Wrap_String() from C gcc #2.
inline void fasta_repeat(std::string_view seq, size_t n_chars) {
  auto sequence = gen_repeat_buffer(seq);
  size_t outputBytes = n_chars + n_chars / LINE_LENGTH;
  while (outputBytes >= sequence.size()) {
    out(sequence.data(), sequence.size());
    outputBytes -= sequence.size();
  }
  out(sequence.data(), outputBytes);
  out("\n", 1);
}

template <size_t N>
inline void fasta_random(RandomLCG& rng, const WeightedRandom<N>& wr) {
  alignas(32) static std::array<uint32_t, BLKLEN> rng_buf;
  alignas(32) static std::array<char, BLKLEN + LINES> out_buf;
  while (1) {
    size_t count = rng.gen(begin(rng_buf), std::size(rng_buf));

    if (count == 0)
      break;

    const uint32_t* rng_sub = rng_buf.data();

    size_t line_count = 0;
    for (size_t begin = 0; begin < count; begin += LINE_LENGTH) {
      auto end = std::min(begin + LINE_LENGTH, count);

      for (auto j = begin; j < end; ++j) {
        out_buf[j + line_count] = wr.gen_from_u32(rng_sub[j]);
      }

      out_buf[end + line_count] = '\n';
      line_count++;
    }
    out(out_buf.data(), count + line_count);
  }
}

static void fasta(int n) {
  constexpr std::string_view alu =
      "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTT"
      "GGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTC"
      "GAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACT"
      "AAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTG"
      "TAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCT"
      "TGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCG"
      "CCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTC"
      "TCAAAAA";
  out(">ONE Homo sapiens alu\n");
  fasta_repeat(alu, n * 2);

  constexpr std::array<Nucleotide, 15> iub{{
        {'a', 0.27f}, {'c', 0.12f}, {'g', 0.12f},
        {'t', 0.27f}, {'B', 0.02f}, {'D', 0.02f},
        {'H', 0.02f}, {'K', 0.02f}, {'M', 0.02f},
        {'N', 0.02f}, {'R', 0.02f}, {'S', 0.02f},
        {'V', 0.02f}, {'W', 0.02f}, {'Y', 0.02f}
  }};

  RandomLCG rng(n * 3);

  out(">TWO IUB ambiguity codes\n");
  fasta_random(rng, WeightedRandom(iub));

  rng.reset(n * 5);

  constexpr std::array<Nucleotide, 4> homosapiens{{
      {'a', 0.3029549426680f},
      {'c', 0.1979883004921f},
      {'g', 0.1975473066391f},
      {'t', 0.3015094502008f},
  }};

  out(">THREE Homo sapiens frequency\n");
  fasta_random(rng, WeightedRandom(homosapiens));
}
// ---- end of the fasta generator

extern "C" __attribute__((export_name("bench")))
uint32_t bench(int n) {
  fnv_hash = 2166136261u;
  fasta(n);
  return fnv_hash;
}
