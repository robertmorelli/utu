// BG k-nucleotide g++ #2 (Sylvester Saguban), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/knucleotide-gpp-2.html
// Changes: single-threaded (thread_count 1: one table, no std::thread);
// stdin -> the fasta text setup(n) makes (read line by line as fgets would);
// std::cout -> a std::ostringstream (same formatting) whose bytes are hashed
// (FNV-1a 32) and returned by bench(n). __gnu_pbds::cc_hash_table is
// libstdc++'s; Emscripten has libc++, so the pb_ds headers BG uses are
// vendored in pbds/ (from GCC 16, the files cc_hash_table needs) with a
// small shim (pbds/bits, pbds/debug, pbds/tr1) for the libstdc++ internals
// they include. One fix in Calculate (see there): BG's key update read the
// codes at each window's start, so its counts were off by a few (BG's 25M
// output hides it; fasta 10,000's 2-mer percentages show it).

// compile with these flags:
// -std=c++17 -march=native -msse -msse2 -msse3 -O3

#include <iostream>
#include <iomanip>
#include <sstream>
#include <cstdint>
#include <cstdlib>
#include <string>
#include <algorithm>
#include <array>
#include <map>
#include <type_traits>
#include <cstring>
#include <vector>
#include <cassert>
#include <ext/pb_ds/assoc_container.hpp>

static std::ostringstream out;

struct Cfg {
    static constexpr size_t thread_count = 1; // BG: 4 threads
    static constexpr unsigned to_char[4] = {'A', 'C', 'T', 'G'};
    static inline unsigned char to_num[128];
    using Data = std::vector<unsigned char>;

    Cfg() {
        to_num['A'] = to_num['a'] = 0;
        to_num['C'] = to_num['c'] = 1;
        to_num['T'] = to_num['t'] = 2;
        to_num['G'] = to_num['g'] = 3;
    }
} const cfg;

template <size_t size>
struct Key
{
    // select type to use for 'data', if hash key can fit on 32-bit integer
    // then use uint32_t else use uint64_t.
    using Data = typename std::conditional<size<=16, uint32_t, uint64_t>::type;

    struct Hash {
        Data operator()(const Key& t)const{ return t._data; }
    };

    Key(Data data) : _data(data) {
    }

    // uses std::string_view instead of std::string because std::string always
    // allocates a copy from the heap. while std::string_view is only a wrapper
    // of a pointer and a size
    Key(const std::string_view& str) {
        _data = 0;
        for(unsigned i = 0; i < size; ++i){
            _data <<= 2;
            _data |= cfg.to_num[unsigned(str[i])];
        }
    }

    // initialize hash from input data
    void InitKey(const unsigned char * data){
        for(unsigned i = 0; i < size; ++i){
            _data <<= 2;
            _data |= data[i];
        }
    }

    // updates the key with 1 byte
    void UpdateKey(const unsigned char data){
        _data <<= 2;
        _data |= data;
    }

    // masks out excess information
    void MaskKey(){
        _data &= _mask;
    }

    // implicit casting operator to string
    operator std::string() const {
        std::string tmp;
        Data data = _data;
        for(size_t i = 0; i != size; ++i, data >>= 2)
            tmp += cfg.to_char[data & 3ull];
        std::reverse(tmp.begin(), tmp.end());
        return std::move(tmp);
    }

    bool operator== (const Key& in) const {
        return _data == in._data;
    }
private:
    static constexpr Data _mask = ~(Data(-1) << (2 * size));
    Data _data;
};

template <size_t size, typename K = Key<size> >
using HashTable = __gnu_pbds::cc_hash_table<K, unsigned, typename K::Hash>;

template <size_t size>
void Calculate(const Cfg::Data& input, size_t begin, HashTable<size>& table)
{
    // original implementation fully recomputes the hash key for each
    // insert to the hash table. This implementation only partially
    // updates the hash, this is the same with C GCC, Rust #6 and Rust #4
    Key<size> key(0);
    // initialize key
    key.InitKey(input.data() + begin);
    // use key to increment value
    ++table[key];

    // (Fixed: BG starts at begin + thread_count and ends at size - 1 + size,
    // so the key took the codes at the window's start, not its end: the
    // first windows were wrong and the last size - 1 missing.)
    constexpr size_t nsize = std::min(size, cfg.thread_count);
    auto itr_begin = input.data() + begin + cfg.thread_count + size - nsize;
    auto itr_end = (input.data() + input.size() + 1) - nsize;
    for(;itr_begin < itr_end; itr_begin += cfg.thread_count) {
        // update the key 1 byte at a time
        for(unsigned i = 0; i < nsize; ++i)
            key.UpdateKey( itr_begin[i] );
        // then finally mask out excess information
        key.MaskKey();
        // then use key to increment value
        ++table[key];
    }
}

template <size_t size>
auto CalculateInThreads(const Cfg::Data& input)
{
    HashTable<size> hash_tables[cfg.thread_count];

    auto invoke = [&](unsigned begin) {
        Calculate<size>(input, begin, hash_tables[begin]);
    };

    // BG: one std::thread per table; here in order.
    for(unsigned i = 0; i < cfg.thread_count; ++i)
        invoke(i);

    auto& frequencies = hash_tables[0];
    for(unsigned i = 1 ; i < cfg.thread_count; ++i)
        for(auto& j : hash_tables[i])
            frequencies[j.first] += j.second;
    // return the 'frequency' by move instead of copy.
    return std::move(frequencies);
}

template <unsigned size>
void WriteFrequencies(const Cfg::Data& input)
{
    // we "receive" the returned object by move instead of copy.
    auto&& frequencies = CalculateInThreads<size>(input);
    std::map<unsigned, std::string, std::greater<unsigned>> freq;
    for(const auto& i: frequencies)
        freq.insert({i.second, i.first});

    const unsigned sum = input.size() + 1 - size;
    for(const auto& i : freq)
        out << i.second << ' ' << (sum ? double(100 * i.first) / sum : 0.0) << '\n';
    out << '\n';
}

template <unsigned size>
void WriteCount( const Cfg::Data& input, const std::string& text ) {
    // we "receive" the returned object by move instead of copy.
    auto&& frequencies = CalculateInThreads<size>(input);
    out << frequencies[Key<size>(text)] << '\t' << text << '\n';
}


// ---- setup(n): BG fasta's output for n (same algorithm and bytes as BG fasta:
// ALU repeated for 2n, IUB random for 3n, Homo sapiens random for 5n, lines of
// 60; LCG seed 42, cumulative probabilities in double). Untimed.
static char *fasta_Data;
static size_t fasta_Size, fasta_Capacity;
static void fasta_Put(char c){
	if(fasta_Size==fasta_Capacity)
		fasta_Data=(char *)realloc(fasta_Data, fasta_Capacity=fasta_Capacity ? fasta_Capacity*2 : 1<<16);
	fasta_Data[fasta_Size++]=c;
}
static void fasta_Puts(const char *s){ while(*s) fasta_Put(*s++); }
static unsigned fasta_Seed;
static void fasta_Random(const char *chars, const double *probs, int k, int count){
	double cum[16], c=0;
	for(int i=0; i<k; i++) cum[i]=(c+=probs[i]);
	for(int left=count; left>0; left-=60){
		int m=left<60 ? left : 60;
		for(int i=0; i<m; i++){
			fasta_Seed=(fasta_Seed*3877+29573)%139968;
			double r=fasta_Seed/139968.0;
			int j=0;
			while(j<k-1 && r>=cum[j]) j++;
			fasta_Put(chars[j]);
		}
		fasta_Put('\n');
	}
}
static void fasta(int n){
	static const char alu[]="GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA";
	static const double iub[]={0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02};
	static const double hs[]={0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008};
	fasta_Size=0;
	fasta_Seed=42;
	fasta_Puts(">ONE Homo sapiens alu\n");
	int k=0;
	for(int left=2*n; left>0; left-=60){
		int m=left<60 ? left : 60;
		for(int i=0; i<m; i++){ fasta_Put(alu[k]); if(++k==sizeof(alu)-1) k=0; }
		fasta_Put('\n');
	}
	fasta_Puts(">TWO IUB ambiguity codes\n");
	fasta_Random("acgtBDHKMNRSVWY", iub, 15, 3*n);
	fasta_Puts(">THREE Homo sapiens frequency\n");
	fasta_Random("acgt", hs, 4, 5*n);
}

// fgets over the fasta text: the next line (with its '\n') into buffer.
static size_t input_Position;
static char *next_Line(char *buffer, int size){
	if(input_Position>=fasta_Size) return NULL;
	int i=0;
	while(i<size-1 && input_Position<fasta_Size){
		char c=fasta_Data[input_Position++];
		buffer[i++]=c;
		if(c=='\n') break;
	}
	buffer[i]='\0';
	return buffer;
}

extern "C" void setup(int n) { fasta(n); }

extern "C" uint32_t bench(int)
{
    input_Position = 0;
    out.str("");
    out.clear();

    Cfg::Data data;
    std::array<char, 256> buf;

    while(next_Line(buf.data(), buf.size()) && memcmp(">THREE", buf.data(), 6));
    while(next_Line(buf.data(), buf.size()) && buf.front() != '>') {
        if(buf.front() != ';'){
            auto i = std::find(buf.begin(), buf.end(), '\n');
            data.insert(data.end(), buf.begin(), i);
        }
    }
    std::transform(data.begin(), data.end(), data.begin(), [](auto c){
        return cfg.to_num[c];
    });
    out << std::setprecision(3) << std::setiosflags(std::ios::fixed);

    WriteFrequencies<1>(data);
    WriteFrequencies<2>(data);
    // value at left is the length of the passed string.
    WriteCount<3>(data, "GGT");
    WriteCount<4>(data, "GGTA");
    WriteCount<6>(data, "GGTATT");
    WriteCount<12>(data, "GGTATTTTAATT");
    WriteCount<18>(data, "GGTATTTTAATTTATAGT");

    std::string s = out.str();
    uint32_t h = 2166136261u;
    for (unsigned char c : s) { h ^= c; h *= 16777619u; }
    return h;
}
