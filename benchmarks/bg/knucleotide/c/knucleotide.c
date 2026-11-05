// BG k-nucleotide gcc #1 (Jeremy Zerfas), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/knucleotide-gcc-1.html
// Changes: single-threaded (the OpenMP sections run in order); stdin -> the
// fasta text setup(n) makes (read line by line as fgets would); printf ->
// FNV-1a 32 over the bytes it would print, returned by bench(n). khash.h is
// klib's (MIT), vendored beside this file.


// The Computer Language Benchmarks Game
// https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
//
// Contributed by Jeremy Zerfas

// This controls the maximum length for each set of oligonucleotide frequencies
// and each oligonucleotide count output by this program.
#define MAXIMUM_OUTPUT_LENGTH 4096

#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include "khash.h"

// Define a custom hash function to use instead of khash's default hash
// function. This custom hash function uses a simpler bit shift and XOR which
// results in several percent faster performance compared to when khash's
// default hash function is used.
#define CUSTOM_HASH_FUNCTION(key) ((key) ^ (key)>>7)

KHASH_INIT(oligonucleotide, uint64_t, uint32_t, 1, CUSTOM_HASH_FUNCTION
  , kh_int64_hash_equal)

// intptr_t should be the native integer type on most sane systems.
typedef intptr_t intnative_t;

typedef struct {
	uint64_t	key;
	uint32_t	value;
} element;


// Macro to convert a nucleotide character to a code. Note that upper and lower
// case ASCII letters only differ in the fifth bit from the right and we only
// need the three least significant bits to differentiate the letters 'A', 'C',
// 'G', and 'T'. Spaces in this array/string will never be used as long as
// characters other than 'A', 'C', 'G', and 'T' aren't used.
#define code_For_Nucleotide(nucleotide) (" \0 \1\3  \2"[nucleotide & 0x7])


// And one more macro to convert the codes back to nucleotide characters.
#define nucleotide_For_Code(code) ("ACGT"[code & 0x3])


// Function to use when sorting elements with qsort() later. Elements with
// larger values will come first and in cases of identical values then elements
// with smaller keys will come first.
static int element_Compare(const element * const left_Element
  , const element * const right_Element){

	// Sort based on element values.
	if(left_Element->value < right_Element->value) return 1;
	if(left_Element->value > right_Element->value) return -1;

	// If we got here then both items have the same value so then sort based on
	// key.
	return left_Element->key > right_Element->key ? 1 : -1;
}


// Generate frequencies for all oligonucleotides in polynucleotide that are of
// desired_Length_For_Oligonucleotides and then save it to output.
static void generate_Frequencies_For_Desired_Length_Oligonucleotides(
  const char * const polynucleotide, const intnative_t polynucleotide_Length
  , const intnative_t desired_Length_For_Oligonucleotides, char * const output){

	khash_t(oligonucleotide) * hash_Table=kh_init(oligonucleotide);

	uint64_t key=0;
	const uint64_t mask=((uint64_t)1<<2*desired_Length_For_Oligonucleotides)-1;

	// For the first several nucleotides we only need to append them to key in
	// preparation for the insertion of complete oligonucleotides to hash_Table.
	for(intnative_t i=0; i<desired_Length_For_Oligonucleotides-1; i++)
		key=(key<<2 & mask) | polynucleotide[i];

	// Add all the complete oligonucleotides of
	// desired_Length_For_Oligonucleotides to hash_Table and update the count
	// for each oligonucleotide.
	for(intnative_t i=desired_Length_For_Oligonucleotides-1
	  ; i<polynucleotide_Length; i++){

		key=(key<<2 & mask) | polynucleotide[i];

		int element_Was_Unused;
		const khiter_t k=kh_put(oligonucleotide, hash_Table, key
		  , &element_Was_Unused);

		// If the element_Was_Unused, then initialize the count to 1, otherwise
		// increment the count.
		if(element_Was_Unused)
			kh_value(hash_Table, k)=1;
		else
			kh_value(hash_Table, k)++;
	}

	// Create an array of elements from hash_Table.
	intnative_t elements_Array_Size=kh_size(hash_Table), i=0;
	element * elements_Array=malloc(elements_Array_Size*sizeof(element));
	uint32_t value;
	kh_foreach(hash_Table, key, value
	  , elements_Array[i++]=((element){key, value}));

	kh_destroy(oligonucleotide, hash_Table);

	// Sort elements_Array.
	qsort(elements_Array, elements_Array_Size, sizeof(element)
	  , (int (*)(const void *, const void *)) element_Compare);

	// Print the frequencies for each oligonucleotide.
	for(intnative_t output_Position=0, i=0; i<elements_Array_Size; i++){

		// Convert the key for the oligonucleotide to a string.
		char oligonucleotide[desired_Length_For_Oligonucleotides+1];
		for(intnative_t j=desired_Length_For_Oligonucleotides-1; j>-1; j--){
			oligonucleotide[j]=nucleotide_For_Code(elements_Array[i].key);
			elements_Array[i].key>>=2;
		}
		oligonucleotide[desired_Length_For_Oligonucleotides]='\0';

		// Output the frequency for oligonucleotide to output.
		output_Position+=snprintf(output+output_Position
		  , MAXIMUM_OUTPUT_LENGTH-output_Position, "%s %.3f\n", oligonucleotide
		  , 100.0f*elements_Array[i].value
		  /(polynucleotide_Length-desired_Length_For_Oligonucleotides+1));
	}

	free(elements_Array);
}


// Generate a count for the number of times oligonucleotide appears in
// polynucleotide and then save it to output.
static void generate_Count_For_Oligonucleotide(
  const char * const polynucleotide, const intnative_t polynucleotide_Length
  , const char * const oligonucleotide, char * const output){
	const intnative_t oligonucleotide_Length=strlen(oligonucleotide);

	khash_t(oligonucleotide) * const hash_Table=kh_init(oligonucleotide);

	uint64_t key=0;
	const uint64_t mask=((uint64_t)1<<2*oligonucleotide_Length)-1;

	// For the first several nucleotides we only need to append them to key in
	// preparation for the insertion of complete oligonucleotides to hash_Table.
	for(intnative_t i=0; i<oligonucleotide_Length-1; i++)
		key=(key<<2 & mask) | polynucleotide[i];

	// Add all the complete oligonucleotides of oligonucleotide_Length to
	// hash_Table and update the count for each oligonucleotide.
	for(intnative_t i=oligonucleotide_Length-1; i<polynucleotide_Length; i++){

		key=(key<<2 & mask) | polynucleotide[i];

		int element_Was_Unused;
		const khiter_t k=kh_put(oligonucleotide, hash_Table, key
		  , &element_Was_Unused);

		// If the element_Was_Unused, then initialize the count to 1, otherwise
		// increment the count.
		if(element_Was_Unused)
			kh_value(hash_Table, k)=1;
		else
			kh_value(hash_Table, k)++;
	}

	// Generate the key for oligonucleotide.
	key=0;
	for(intnative_t i=0; i<oligonucleotide_Length; i++)
		key=(key<<2) | code_For_Nucleotide(oligonucleotide[i]);

	// Output the count for oligonucleotide to output.
	khiter_t k=kh_get(oligonucleotide, hash_Table, key);
	uintmax_t count=k==kh_end(hash_Table) ? 0 : kh_value(hash_Table, k);
	snprintf(output, MAXIMUM_OUTPUT_LENGTH, "%ju\t%s", count, oligonucleotide);

	kh_destroy(oligonucleotide, hash_Table);
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

static uint32_t fnv(uint32_t h, const char *s){
	for(; *s; s++){ h^=(unsigned char)*s; h*=16777619u; }
	return h;
}

void setup(int n){ fasta(n); }

uint32_t bench(int n){
	char buffer[4096];
	input_Position=0;

	// Find the start of the third polynucleotide.
	while(next_Line(buffer, sizeof(buffer)) && memcmp(">THREE", buffer
	  , sizeof(">THREE")-1));

	// Start with 1 MB of storage for reading in the polynucleotide and grow
	// geometrically.
	intnative_t polynucleotide_Capacity=1048576;
	intnative_t polynucleotide_Length=0;
	char * polynucleotide=malloc(polynucleotide_Capacity);

	// Start reading and encoding the third polynucleotide.
	while(next_Line(buffer, sizeof(buffer)) && buffer[0]!='>'){
		for(intnative_t i=0; buffer[i]!='\0'; i++)
			if(buffer[i]!='\n')
				polynucleotide[polynucleotide_Length++]
				  =code_For_Nucleotide(buffer[i]);

		// Make sure we still have enough memory allocated for any potential
		// nucleotides in the next line.
		if(polynucleotide_Capacity-polynucleotide_Length<sizeof(buffer))
			polynucleotide=realloc(polynucleotide, polynucleotide_Capacity*=2);
	}

	// Free up any leftover memory.
	polynucleotide=realloc(polynucleotide, polynucleotide_Length);

	char output_Buffer[7][MAXIMUM_OUTPUT_LENGTH];

	// (BG: OpenMP parallel sections; here in order.)
	generate_Count_For_Oligonucleotide(polynucleotide
	  , polynucleotide_Length, "GGTATTTTAATTTATAGT", output_Buffer[6]);
	generate_Count_For_Oligonucleotide(polynucleotide
	  , polynucleotide_Length, "GGTATTTTAATT", output_Buffer[5]);
	generate_Count_For_Oligonucleotide(polynucleotide
	  , polynucleotide_Length, "GGTATT", output_Buffer[4]);
	generate_Count_For_Oligonucleotide(polynucleotide
	  , polynucleotide_Length, "GGTA", output_Buffer[3]);
	generate_Count_For_Oligonucleotide(polynucleotide
	  , polynucleotide_Length, "GGT", output_Buffer[2]);
	generate_Frequencies_For_Desired_Length_Oligonucleotides(polynucleotide
	  , polynucleotide_Length, 2, output_Buffer[1]);
	generate_Frequencies_For_Desired_Length_Oligonucleotides(polynucleotide
	  , polynucleotide_Length, 1, output_Buffer[0]);

	// Output the results: printf("%s\n") each, hashed.
	uint32_t h=2166136261u;
	for(intnative_t i=0; i<7; i++){ h=fnv(h, output_Buffer[i]); h=fnv(h, "\n"); }

	free(polynucleotide);

	return h;
}
