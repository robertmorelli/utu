// BG regex-redux gcc #5 (Jeremy Zerfas, Zoltan Herczeg), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/regexredux-gcc-5.html
// Changes: single-threaded (the OpenMP blocks run in order: cleanup, the
// replacements, the counts); PCRE2 has no JIT on Wasm, so pcre2_jit_compile
// is gone and pcre2_jit_match is pcre2_match (the interpreter); stdin -> the
// fasta text setup(n) makes; printf -> FNV-1a 32 over the bytes it would
// print (snprintf), returned by bench(n). PCRE2 10.45 is vendored in ../pcre2
// and built with this file (pcre2_lib.c).


// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// contributed by Jeremy Zerfas 
// modified by Zoltan Herczeg

#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#define PCRE2_CODE_UNIT_WIDTH 8
#include "../pcre2/pcre2.h"
#include <stdint.h>

typedef struct {
    PCRE2_UCHAR *data;
    PCRE2_SIZE capacity, size;
} string;


// Function for searching a src_String for a pattern, replacing it with some
// specified replacement, and storing the result in dst_String.
static void replace(char const * const pattern, char const * const replacement
  , string const * const src_String, string * const dst_String
  , pcre2_match_context * const mcontext, pcre2_match_data * mdata){

    int errorcode;
    PCRE2_SIZE erroroffset, pos=0;
    int const replacement_Size=strlen(replacement);
    PCRE2_SIZE *match=pcre2_get_ovector_pointer(mdata);

    // Compile and study pattern.
    pcre2_code * regex=pcre2_compile((PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED
      , 0, &errorcode, &erroroffset, NULL);

    // Find each match of the pattern in src_String and append the characters
    // preceding each match and the replacement text to dst_String.
    while(pcre2_match(regex, src_String->data, src_String->size, pos, 0
      , mdata, mcontext)>=0){

        // Allocate more memory for dst_String if there is not enough space for
        // the characters preceding the match and the replacement text.
        while(dst_String->size+match[0]-pos+replacement_Size
          >dst_String->capacity)
            dst_String->data=realloc(dst_String->data, dst_String->capacity*=2);

        // Append the characters preceding the match and the replacement text to
        // dst_String and update the size of dst_String.
        memcpy(dst_String->data+dst_String->size, src_String->data+pos
          , match[0]-pos);
        memcpy(dst_String->data+dst_String->size+match[0]-pos, replacement
          , replacement_Size);
        dst_String->size+=match[0]-pos+replacement_Size;

        // Update pos to continue searching after the current match.
        pos=match[1];
    }

    pcre2_code_free(regex);

    // Allocate more memory for dst_String if there is not enough space for
    // the characters following the last match (or the entire src_String if
    // there was no match).
    while(dst_String->size+src_String->size-pos>dst_String->capacity)
        dst_String->data=realloc(dst_String->data, dst_String->capacity*=2);

    // Append the characters following the last match (or the entire src_String
    // if there was no match) to dst_String and update the size of dst_String.
    memcpy(dst_String->data+dst_String->size, src_String->data+pos
      , src_String->size-pos);
    dst_String->size+=src_String->size-pos;
}


// ---- setup(n): BG fasta's output for n (same algorithm and bytes as BG fasta:
// ALU repeated for 2n, IUB random for 3n, Homo sapiens random for 5n, lines of
// 60; LCG seed 42, cumulative probabilities in double). Untimed.
static char *fasta_Data;
static size_t fasta_Size, fasta_Capacity;
static void fasta_Put(char c){
	if(fasta_Size==fasta_Capacity)
		fasta_Data=realloc(fasta_Data, fasta_Capacity=fasta_Capacity ? fasta_Capacity*2 : 1<<16);
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


static uint32_t fnv(uint32_t h, const char *s){
    for(; *s; s++){ h^=(unsigned char)*s; h*=16777619u; }
    return h;
}

void setup(int n){ fasta(n); }

uint32_t bench(int n){
    uint32_t h=2166136261u;
    char line[256];
    char const * const count_Info[]={
        "agggtaaa|tttaccct",
        "[cgt]gggtaaa|tttaccc[acg]",
        "a[act]ggtaaa|tttacc[agt]t",
        "ag[act]gtaaa|tttac[agt]ct",
        "agg[act]taaa|ttta[agt]cct",
        "aggg[acg]aaa|ttt[cgt]ccct",
        "agggt[cgt]aa|tt[acg]accct",
        "agggta[cgt]a|t[acg]taccct",
        "agggtaa[cgt]|[acg]ttaccct"
      }, * const replace_Info[][2]={
        {"tHa[Nt]", "<4>"},
        {"aND|caN|Ha[DS]|WaS", "<3>"},
        {"a[NSt]|BY", "<2>"},
        {"<[^>]*>", "|"},
        {"\\|[^|][^|]*\\|", "-"}
      };

    string input={malloc(16384), 16384}, sequences={malloc(16384), 16384};
    int postreplace_Size;


    // Read in input (BG: fread from stdin): the fasta text.
    while(input.capacity<fasta_Size+1)
        input.data=realloc(input.data, input.capacity*=2);
    memcpy(input.data, fasta_Data, fasta_Size);
    input.size=fasta_Size;


    #pragma omp parallel
    {
        pcre2_match_context * mcontext=pcre2_match_context_create(NULL);

        pcre2_match_data * mdata=pcre2_match_data_create(16, NULL);

        // Find all sequence descriptions and new lines in input, replace them
        // with empty strings, and store the result in the sequences string.
        #pragma omp single
        {
            replace(">.*\\n|\\n", "", &input, &sequences, mcontext, mdata);

            free(input.data);
        }


        // Have one thread start working on performing all the replacements
        // serially.
        #pragma omp single nowait
        {
            // We'll use two strings when doing all the replacements, searching
            // for patterns in prereplace_String and using postreplace_String to
            // store the string after the replacements have been made. After
            // each iteration these two then get swapped. Start out with both
            // strings having the same capacity as the sequences string and also
            // copy the sequences string into prereplace_String for the initial
            // iteration.
            string prereplace_String={
                malloc(sequences.capacity), sequences.capacity, sequences.size
              }, postreplace_String={
                malloc(sequences.capacity), sequences.capacity
              };
            memcpy(prereplace_String.data, sequences.data, sequences.size);

            // Iterate through all the replacement patterns and their
            // replacements in replace_Info[].
            for(int i=0; i<sizeof(replace_Info)/sizeof(char * [2]); i++){

                replace(replace_Info[i][0], replace_Info[i][1]
                  , &prereplace_String, &postreplace_String, mcontext, mdata);

                // Swap prereplace_String and postreplace_String in preparation
                // for the next iteration.
                string const temp=prereplace_String;
                prereplace_String=postreplace_String;
                postreplace_String=temp;

                postreplace_String.size=0;
            }

            // If any replacements were made, they'll be in prereplace_String
            // instead of postreplace_String because of the swap done after each
            // iteration. Copy its size to postreplace_Size.
            postreplace_Size=prereplace_String.size;

            free(prereplace_String.data);
            free(postreplace_String.data);
        }


        // Iterate through all the count patterns in count_Info[] and perform
        // the counting for each one on a different thread if available.
        #pragma omp for schedule(dynamic) ordered
        for(int i=0; i<sizeof(count_Info)/sizeof(char *); i++){

            int errorcode, count=0;
            PCRE2_SIZE erroroffset, pos=0;
            PCRE2_SIZE *match=pcre2_get_ovector_pointer(mdata);

            // Compile and study pattern.
            pcre2_code * regex=pcre2_compile((PCRE2_SPTR)count_Info[i]
              , PCRE2_ZERO_TERMINATED, 0, &errorcode, &erroroffset, NULL);
        
            // Find each match of the pattern in the sequences string and
            // increment count for each match.
            while(pcre2_match(regex, sequences.data, sequences.size
              , pos, 0, mdata, mcontext)>=0){

                count++;

                // Update pos to continue searching after the current match.
                pos=match[1];
            }

            pcre2_code_free(regex);

            // Print the count for each pattern in the correct order.
            #pragma omp ordered
            snprintf(line, sizeof(line), "%s %d\n", count_Info[i], count);
            h=fnv(h, line);
        }


        pcre2_match_context_free(mcontext);
        pcre2_match_data_free(mdata);
    }


    free(sequences.data);

    // Print the size of the original input, the size of the input without the
    // sequence descriptions & new lines, and the size after having made all the
    // replacements.
    snprintf(line, sizeof(line), "\n%d\n%d\n%d\n", (int)input.size, (int)sequences.size
      , postreplace_Size);
    return fnv(h, line);
}
    