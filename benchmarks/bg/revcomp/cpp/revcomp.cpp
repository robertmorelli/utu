// BG revcomp g++ #2 (Adam Kewley), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/revcomp-gpp-2.html
// Changes: std::cin -> an istream over the fasta output setup(n) generated (a
// streambuf whose get area is that buffer; the program's reads copy from it as
// from stdin), std::cout -> an ostream whose streambuf hashes (FNV-1a) what is
// written. setup(n) runs fasta g++ #9's generator (below) with out() appending to
// the input. main() -> bench(n), which returns the hash. -DSIMD as BG builds it:
// Emscripten's <immintrin.h> on simd128 (-msse4.1). Single-threaded already.


// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// contributed by Adam Kewley

#include <iostream>
#include <string>
#include <vector>

#ifdef SIMD
#include <immintrin.h>
#endif


#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <streambuf>
#include <string_view>

#ifdef __SSE2__
#include <emmintrin.h>
#endif

// ---- input: the fasta output setup(n) generates
static std::vector<char> input;
static void out(const char* data, size_t n) { input.insert(input.end(), data, data + n); }
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

extern "C" __attribute__((export_name("setup")))
void setup(int n) {
  input.clear();
  fasta(n);
}

// stdin: a get area over the input (reads copy from it, as from stdin).
struct input_buf : std::streambuf {
  input_buf(char* begin, char* end) { setg(begin, begin, end); }
};

// stdout: FNV-1a over what is written.
struct hash_buf : std::streambuf {
  uint32_t h = 2166136261u;
  int_type overflow(int_type c) override {
    if (c != traits_type::eof()) {
      h ^= (unsigned char)c;
      h *= 16777619u;
    }
    return c;
  }
  std::streamsize xsputn(const char* s, std::streamsize n) override {
    uint32_t x = h;
    for (std::streamsize i = 0; i < n; i++) {
      x ^= (unsigned char)s[i];
      x *= 16777619u;
    }
    h = x;
    return n;
  }
};

namespace {
    using std::istream;
    using std::ostream;
    using std::runtime_error;
    using std::string;
    using std::bad_alloc;
    using std::vector;

    constexpr size_t basepairs_in_line = 60;
    constexpr size_t line_len = basepairs_in_line + sizeof('\n');

    // custom vector impl. that has *similar* methods to a
    // `vector<char>`. The reason this is necessary is because the stdlib
    // `vector<char>` implementation requires that `.resize` initializes
    // the newly-allocated content, and that `realloc` cannot be
    // used. Valgrind reports that that is ~10-20 % of application
    // perf. for large inputs.
    class unsafe_vector {
    public:
        unsafe_vector() {
            _buf = (char*)malloc(_capacity);
            if (_buf == nullptr) {
                throw bad_alloc{};
            }
        }

        unsafe_vector(const unsafe_vector& other) = delete;
        unsafe_vector(unsafe_vector&& other) = delete;
        unsafe_vector& operator=(unsafe_vector& other) = delete;
        unsafe_vector& operator=(unsafe_vector&& other) = delete;

        ~unsafe_vector() noexcept {
            free(_buf);
        }

        char* data() {
            return _buf;
        }

        // Resizes the vector to have a size of `count`. This method is
        // UNSAFE because any new vector entries are uninitialized.
        void resize_UNSAFE(size_t count) {
            size_t rem = _capacity - _size;
            if (count > rem) {
                grow(count);
            }
            _size = count;
        }

        size_t size() const {
            return _size;
        }

    private:
        void grow(size_t min_cap) {
            size_t new_cap = _capacity;
            while (new_cap < min_cap) {
                new_cap *= 2;
            }

            char* new_buf = (char*)realloc(_buf, new_cap);
            if (new_buf != nullptr) {
                _capacity = new_cap;
                _buf = new_buf;
            } else {
                // The POSIX definition of `realloc` states that a failed
                // reallocation leaves the supplied pointer untouched, so
                // throw here and let the class's destructor free the
                // untouched ptr (if necessary).
                throw bad_alloc{};
            }
        }

        char* _buf = nullptr;
        size_t _size = 0;
        size_t _capacity = 1024;
    };

    // Returns the complement of a a single basepair character. newline
    // characters are unaffected.
    char complement(char character) {
        // this LUT can be made smaller by ANDing with 0x1f (effectively,
        // drag the table up and paste the newline in), but that adds one
        // more instruction (`and`). Benchmarks show a tiny improvement by
        // just doing a straight lookup into a larger LUT.
        static const char complement_lut[] = {
            // [0-32): non-printables: just ensure that newline gets
            // identity-complemented.
            '\0', '\0', '\0', '\0',  '\0', '\0', '\0', '\0',
            '\0', '\0', '\n', '\0',  '\0', '\0', '\0', '\0',
            '\0', '\0', '\0', '\0',  '\0', '\0', '\0', '\0',
            '\0', '\0', '\0', '\0',  '\0', '\0', '\0', '\0',

            // [32-64): not useful here
            '\0', '\0', '\0', '\0',  '\0', '\0', '\0', '\0',
            '\0', '\0', '\0', '\0',  '\0', '\0', '\0', '\0',
            '\0', '\0', '\0', '\0',  '\0', '\0', '\0', '\0',
            '\0', '\0', '\0', '\0',  '\0', '\0', '\0', '\0',

            // [64-96): uppercase chars
            '\0', 'T', 'V', 'G',     'H', '\0', '\0', 'C',
            'D', '\0', '\0', 'M',    '\0', 'K', 'N', '\0',
            '\0', '\0', 'Y', 'S',    'A', 'A', 'B', 'W',
            '\0', 'R', '\0', '\0',   '\0', '\0', '\0', '\0',

            // [96-128]: lowercase chars
            '\0', 'T', 'V', 'G',     'H', '\0', '\0', 'C',
            'D', '\0', '\0', 'M',   '\0', 'K', 'N', '\0',
            '\0', '\0', 'Y', 'S',    'A', 'A', 'B', 'W',
            '\0', 'R', '\0', '\0',   '\0', '\0', '\0', '\0'
        };

        return complement_lut[character];
    }

    // Complement then swap `*a` with `*b`
    void complement_swap(char* a, char* b) {
        char tmp = complement(*a);
        *a = complement(*b);
        *b = tmp;
    }

#ifdef SIMD
    __m128i packed(char c) {
        return _mm_set_epi8(c, c, c, c, c, c, c, c, c, c, c, c, c, c, c, c);
    }

    __m128i reverse_complement_simd(__m128i v) {
        // reverse elements in the registers
        v =  _mm_shuffle_epi8(v, _mm_set_epi8(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15));

        // AND all elements with 0x1f, so that a smaller LUT (< 32 bytes)
        // can be used. This is important with SIMD because, unlike
        // single-char complement (above), SIMD uses 16-byte shuffles. The
        // single-char LUT would require four shuffles, this LUT requires
        // two.
        v = _mm_and_si128(v, packed(0x1f));


        // Lookup for all elements <16
        __m128i lt16_mask = _mm_cmplt_epi8(v, packed(16));
        __m128i lt16_els = _mm_and_si128(v, lt16_mask);
        __m128i lt16_lut = _mm_set_epi8('\0', 'N', 'K', '\0',
                                        'M', '\n', '\0', 'D',
                                        'C', '\0', '\0', 'H',
                                        'G', 'V', 'T', '\0');
        __m128i lt16_vals = _mm_shuffle_epi8(lt16_lut, lt16_els);

        // Lookup for all elements >16
        __m128i g16_els = _mm_sub_epi8(v, packed(16));
        __m128i g16_lut = _mm_set_epi8('\0', '\0', '\0', '\0',
                                       '\0', '\0', 'R', '\0',
                                       'W', 'B', 'A', 'A',
                                       'S', 'Y', '\0', '\0');
        __m128i g16_vals = _mm_shuffle_epi8(g16_lut, g16_els);

        // OR both lookup results
        return _mm_or_si128(lt16_vals, g16_vals);
    }
#endif

    // Reverse-complement a contiguous range, [begin, end), of bps.
    //
    // precondition: [begin, end) can be reverse-complemented without
    // needing to account for newlines etc. (the caller should handle this
    // externally).
    void reverse_complement_bps(char* start, char* end, size_t num_bps) {
#ifdef SIMD
        while (num_bps >= 16) {
            end -= 16;

            __m128i tmp = _mm_lddqu_si128((__m128i*)start);
            _mm_storeu_si128((__m128i*)start, reverse_complement_simd(_mm_lddqu_si128((__m128i*)end)));
            _mm_storeu_si128((__m128i*)end, reverse_complement_simd(tmp));

            num_bps -= 16;
            start += 16;
        }
#else
        // even when not using platform-dependent SIMD, it's still
        // advantageous to unroll the loop. This gives a ~10 % speedup on
        // my laptop (intel i7-8550U)
        while (num_bps >= 16) {
            for (size_t i = 0; i < 16; ++i) {
                complement_swap(start++, --end);
            }

            num_bps -= 16;
        }
#endif

        // portable and works for all sizes of inputs, but is slowest.
        for (size_t i = 0; i < num_bps; ++i) {
            complement_swap(start++, --end);
        }
    }

    struct Sequence {
        string header;  // not incl. starting delim (>)
        unsafe_vector seq;  // basepair lines. all lines terminated by newline
    };

    // Reverse-complements a FASTA sequence. Unformatted basepair (no
    // header) input. All lines apart from the last line contain *exactly*
    // 60 basepairs. The last line can contain <= 60 basepairs, and must
    // have a trailing newline.
    //
    // The reason this alg. is more complicated than necessary for several
    // reasons:
    //
    // - If newlines were stripped from the input while reading the input,
    //   then memory usage would be ~1/60th lower and this step would be
    //   mostly branchless (good). However, writing the output would
    //   require re-adding the newlines into some intermediate output
    //   buffer before writing the output (very bad).
    //
    // - If newlines are not stripped from the input, then they need to be
    //   handled by this step. The easiest way to handle the newlines (<10
    //   LOC) is to have an `if (next_char == '\n') skip;` check on each
    //   iteration (front and back). However, this introduces two compare
    //   + (sometimes) jump operations per basepair, plus the main loop
    //   invariant. It also prevents doing multi-basepair swaps (SIMD,
    //   loop unrolling, etc.), which is where the *real* perf gains are
    //   hiding (20-50 %).
    //
    // - So we want to optimize this alg. for branchless, preferably
    //   multi-basepair, swaps + complements. However, the presence of
    //   trailing newlines means that the input might be non-symmetric
    //   (that is, the data cannot be blindly swapped because the newlines
    //   will end up in an incorrect location in the output).
    void reverse_complement(Sequence& s) {
        char* begin = s.seq.data();
        char* end = s.seq.data() + s.seq.size();

        if (begin == end) {
            return;
        }

        size_t len = end - begin;
        size_t trailer_len = len % line_len;

        // skip end-of-data, so that `end` points to the last newline in
        // the input (i.e. "just past the end of the last basepair")
        end--;

        // optimal case: all lines in the input are exactly `line_len` in
        // length, with no trailing bps. The relative offsets (from
        // begin/end) of newlines in the data are symmetrical. Therefore,
        // The algorithm can just reverse + complement the entire input,
        // apart from the last newline.
        if (trailer_len == 0) {

            size_t num_pairs = len/2;
            reverse_complement_bps(begin, end, num_pairs);

            bool has_middle_bp = (len % 2) > 0;
            if (has_middle_bp) {
                begin[num_pairs] = complement(begin[num_pairs]);
            }

            return;
        }

        // suboptimal case: the last line in the sequence is < `line_len`
        // (it is a "trailing" line). This means that newlines in the
        // input appear at non-symmetrical offsets relative to `begin` and
        // `end`. Because of this, the algorithm has to carefully step
        // over the newlines so that they aren't reversed into an
        // incorrect location in the output.
        size_t trailer_bps = trailer_len > 0 ? trailer_len - 1 : 0;

        size_t rem_bps = basepairs_in_line - trailer_bps;
        size_t rem_bytes = rem_bps + 1;

        size_t num_whole_lines = len / line_len;
        size_t num_steps = num_whole_lines / 2;

        // there are at least two whole lines (+ trailer) per iteration of
        // this loop. This means that we can revcomp the trailer, skip the
        // trailer (+ newline, on the trailer's side), then revcomp the
        // remainder, skip the remainder (+newline, on the starting side)
        // to maintain the loop invariant.
        for (size_t i = 0; i < num_steps; ++i) {
            reverse_complement_bps(begin, end, trailer_bps);
            begin += trailer_bps;
            end -= trailer_len;

            reverse_complement_bps(begin, end, rem_bps);
            begin += rem_bytes;
            end -= rem_bps;
        }

        // there may be one whole line (+ trailer) remaining. In this
        // case, we do the first step of the above (revcomp the trailer)
        // but *not* the second (revcomp the remainder) because the
        // remainder will overlap.
        bool has_unpaired_line = (num_whole_lines % 2) > 0;
        if (has_unpaired_line) {
            reverse_complement_bps(begin, end, trailer_bps);
            begin += trailer_bps;
            end -= trailer_len;
        }

        // no *whole* lines remaining, but there may be bytes remaining on
        // the current line.
        size_t bps_in_last_line = end - begin;
        size_t swaps_in_last_line = bps_in_last_line/2;
        reverse_complement_bps(begin, end, swaps_in_last_line);

        // edge case: there is exactly one byte in the middle of the input
        // that needs to be complemented *but not swapped*.
        bool has_unpaired_byte = (bps_in_last_line % 2) > 0;
        if (has_unpaired_byte) {
            begin[swaps_in_last_line] = complement(begin[swaps_in_last_line]);
        }
    }

    void read_up_to(istream& in, unsafe_vector& out, char delim) {
        constexpr size_t read_size = 1<<16;

        size_t bytes_read = 0;
        out.resize_UNSAFE(read_size);
        while (in) {
            in.getline(out.data() + bytes_read, read_size, delim);
            bytes_read += in.gcount();

            if (in.fail()) {
                // failed because it ran out of buffer space. Expand the
                // buffer and perform another read
                out.resize_UNSAFE(bytes_read + read_size);
                in.clear(in.rdstate() & ~std::ios::failbit);
            } else if (in.eof()) {
                // hit EOF, rather than delmiter, but an EOF can be
                // treated almost identially to a delmiter, except that we
                // don't remove the delimiter from the read buffer.
                break;
            } else {
                // succeeded in reading *up to and including* the sequence
                // delimiter. Remove the delmiter.
                --bytes_read;
                break;
            }
        }
        out.resize_UNSAFE(bytes_read);
    }

    // Read a sequence, starting *after* the first delimiter (>)
    void read_sequence(istream& in, Sequence& out) {
        out.header.resize(0);
        std::getline(in, out.header);
        read_up_to(in, out.seq, '>');
    }

    void write_sequence(ostream& out, Sequence& s) {
        out << '>';
        out << s.header;
        out << '\n';
        out.write(s.seq.data(), s.seq.size());
    }
}

namespace revcomp {
    // Reverse-complement an istream of FASTA data (in) and write the
    // output into `out`.
    void reverse_complement_fasta_stream(istream& in, ostream& out) {
        // the read function assumes that '>' has already been read
        // (because istream::getline will read it per loop iteration:
        // prevents needing to 'peek' a bunch).
        if (in.get() != '>') {
            throw runtime_error{"unexpected input: next char should be the start of a seqence header"};
        }

        Sequence s;
        while (not in.eof()) {
            read_sequence(in, s);
            reverse_complement(s);
            write_sequence(out, s);
        }
    }
}

extern "C" __attribute__((export_name("bench")))
uint32_t bench(int) {
  input_buf in_buf(input.data(), input.data() + input.size());
  std::istream in(&in_buf);
  hash_buf out_buf;
  std::ostream out(&out_buf);

  revcomp::reverse_complement_fasta_stream(in, out);
  out.flush();
  return out_buf.h;
}
