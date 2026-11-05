// BG revcomp Go #6 (Dirk Moerenhout), adapted for Wasm:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/revcomp-go-6.html
// Changes: single-threaded (ncpu = 1, wasip1's NumCPU): the work orders the main
// loop sent to createOutThread and doOutThread are run in place by prep() and
// write() (no goroutines or channels; same buffers, same order). os.Stdin -> a
// bytes.Reader over the fasta output setup(n) generated (fasta Go #2's generator,
// below, with sink appending to it); os.Stdout.Write -> FNV-1a over the bytes.
// main -> the export bench(n) (GOOS=wasip1 reactor), which returns the hash.

/* The Computer Language Benchmarks Game
 * https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 *
 * contributed by Dirk Moerenhout.
 */

package main

import (
   "bufio"
   "bytes"
)

// ---- input: the fasta output setup(n) generates
var input []byte

type sink struct{}

func (sink) Write(p []byte) (int, error) {
   input = append(input, p...)
   return len(p), nil
}

// ---- fasta generator: copy from here to "end of the fasta generator"

var out *bufio.Writer

const WIDTH = 60 // Fold lines after WIDTH bytes

func min(a, b int) int {
   if a < b {
      return a
   }
   return b
}

type AminoAcid struct {
   p float64
   c byte
}

func AccumulateProbabilities(genelist []AminoAcid) {
   for i := 1; i < len(genelist); i++ {
      genelist[i].p += genelist[i-1].p
   }
}

// RepeatFasta prints the characters of the byte slice s. When it
// reaches the end of the slice, it goes back to the beginning.
// It stops after generating count characters.
// After each WIDTH characters it prints a newline.
// It assumes that WIDTH <= len(s) + 1.
func RepeatFasta(s []byte, count int) {
   pos := 0
   s2 := make([]byte, len(s)+WIDTH)
   copy(s2, s)
   copy(s2[len(s):], s)
   for count > 0 {
      line := min(WIDTH, count)
      out.Write(s2[pos : pos+line])
      out.WriteByte('\n')
      pos += line
      if pos >= len(s) {
         pos -= len(s)
      }
      count -= line
   }
}

const (
   IM = 139968
   IA = 3877
   IC = 29573
)

var lastrandom uint32 = 42

func generateRandom(buf []float64) {
   for i := 0; i < len(buf); i++ {
      lastrandom = (lastrandom*IA + IC) % IM
      buf[i] = float64(lastrandom) / IM
   }
}

// generateDna generates DNA text from random sequence.
// Each element of genelist is a struct with a character and
// a floating point number p between 0 and 1.
// generateDna takes a random float r and
// finds the first element such that p >= r.
// This is a weighted random selection.
func generateDna(genelist []AminoAcid, rb []float64, wb []byte) int {
   count := len(rb)
   i := 0
   o := 0
   for count > 0 {
      line := min(WIDTH, count)
      count -= line
      for j := 0; j < line; j++ {
         r := rb[i]
         for _, v := range genelist {
            if v.p >= r {
               wb[o] = v.c
               break
            }
         }
         i++
         o++
      }
      wb[o] = '\n'
      o++
   }
   return o
}

const (
   RANDOM_BUF_SIZE = WIDTH * 1000
   OUT_BUF_SIZE    = (WIDTH + 1) * 1000

   // 1 for output, 4 for generateDna, 1 for generateRandom and 2 spaces
   SLOT = 8
)

// RandomFasta then prints the character of the array element.
// This sequence is repeated count times.
// Between each WIDTH consecutive characters, the function prints a newline.
func RandomFasta(genelist []AminoAcid, count int) {
   rbufs := make([][]float64, SLOT)
   wbufs := make([][]byte, SLOT)
   for i := 0; i < SLOT; i++ {
      rbufs[i] = make([]float64, RANDOM_BUF_SIZE)
      wbufs[i] = make([]byte, OUT_BUF_SIZE)
   }

   for i := 0; count > 0; i++ {
      chunk := min(count, RANDOM_BUF_SIZE)
      count -= chunk
      rb := rbufs[i%SLOT][:chunk]
      wb := wbufs[i%SLOT]
      generateRandom(rb)

      o := generateDna(genelist, rb, wb)
      out.Write(wb[:o])
   }
}

func fasta(n int) {
   lastrandom = 42
   out = bufio.NewWriter(sink{})
   defer out.Flush()

   iub := []AminoAcid{
      AminoAcid{0.27, 'a'},
      AminoAcid{0.12, 'c'},
      AminoAcid{0.12, 'g'},
      AminoAcid{0.27, 't'},
      AminoAcid{0.02, 'B'},
      AminoAcid{0.02, 'D'},
      AminoAcid{0.02, 'H'},
      AminoAcid{0.02, 'K'},
      AminoAcid{0.02, 'M'},
      AminoAcid{0.02, 'N'},
      AminoAcid{0.02, 'R'},
      AminoAcid{0.02, 'S'},
      AminoAcid{0.02, 'V'},
      AminoAcid{0.02, 'W'},
      AminoAcid{0.02, 'Y'},
   }

   homosapiens := []AminoAcid{
      AminoAcid{0.3029549426680, 'a'},
      AminoAcid{0.1979883004921, 'c'},
      AminoAcid{0.1975473066391, 'g'},
      AminoAcid{0.3015094502008, 't'},
   }

   AccumulateProbabilities(iub)
   AccumulateProbabilities(homosapiens)

   alu := []byte(
      "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGG" +
         "GAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGA" +
         "CCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAAT" +
         "ACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCA" +
         "GCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGG" +
         "AGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCC" +
         "AGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA")

   out.WriteString(">ONE Homo sapiens alu\n")
   RepeatFasta(alu, 2*n)
   out.WriteString(">TWO IUB ambiguity codes\n")
   RandomFasta(iub, 3*n)
   out.WriteString(">THREE Homo sapiens frequency\n")
   RandomFasta(homosapiens, 5*n)
}

// ---- end of the fasta generator

//go:wasmexport setup
func setup(n int32) {
   input = input[:0]
   fasta(int(n))
}

// ---- output: FNV-1a over what the program writes
var outHash uint32

func write(p []byte) {
   h := outHash
   for _, b := range p {
      h ^= uint32(b)
      h *= 16777619
   }
   outHash = h
}

const bufLines = 1024 * 16
const lineSize = 60

var complement = [256]uint8{
   'A': 'T', 'a': 'T',
   'C': 'G', 'c': 'G',
   'G': 'C', 'g': 'C',
   'T': 'A', 't': 'A',
   'U': 'A', 'u': 'A',
   'M': 'K', 'm': 'K',
   'R': 'Y', 'r': 'Y',
   'W': 'W', 'w': 'W',
   'S': 'S', 's': 'S',
   'Y': 'R', 'y': 'R',
   'K': 'M', 'k': 'M',
   'V': 'B', 'v': 'B',
   'H': 'D', 'h': 'D',
   'D': 'H', 'd': 'H',
   'B': 'V', 'b': 'V',
   'N': 'N', 'n': 'N',
}

// createOutThread's loop body: one work order.
func prep(work [][]byte) {
   inbuf := work[0]
   outbuf := work[1]
   lines := len(inbuf) / lineSize
   linelength := lineSize
   if lines == 0 {
      linelength = len(inbuf)
   }
   for obufpos, bufpos := 0, len(inbuf)-1; bufpos >= 0; {
      for end := obufpos + linelength; obufpos < end; obufpos++ {
         outbuf[obufpos] = complement[inbuf[bufpos]]
         bufpos--
      }
      outbuf[obufpos] = '\n'
      obufpos++
   }
}

//go:wasmexport bench
func bench(n int32) uint32 {
   outHash = 2166136261
   ncpu := 1

   in := bufio.NewReader(bytes.NewReader(input))
   buf := make([]byte, 0, lineSize*2*1024*1024)

   var obuf [2][]byte
   obuf[0] = make([]byte, (lineSize+1)*bufLines*ncpu*2)
   obuf[1] = obuf[0][(lineSize+1)*bufLines*ncpu:]
   obuf[0] = obuf[0][:(lineSize+1)*bufLines*ncpu]
   activeobuf := 0

   line, err := in.ReadSlice('\n')
   for err == nil {
      title := make([]byte, len(line))
      copy(title, line)

   BulkRead:
      for {
         for lines := cap(buf)/lineSize - len(buf)/lineSize; lines > 0; lines-- {
            line, err = in.Peek(61)
            if err != nil {
               line, err = in.ReadSlice('\n')
               if err != nil || line[0] == '>' {
                  break BulkRead
               }
               buf = append(buf, line[0:len(line)-1]...)
               continue
            }
            if line[0] == '>' {
               line, err = in.ReadSlice('\n')
               break BulkRead
            }
            if line[lineSize] == '\n' {
               buf = append(buf, line[0:lineSize]...)
               in.Discard(lineSize + 1)
               continue
            }
            line, err = in.ReadSlice('\n')
            buf = append(buf, line[0:len(line)-1]...)
         }
         nbuf := make([]byte, len(buf), cap(buf)+lineSize*1024*1024)
         copy(nbuf, buf)
         buf = nbuf
      }

      write(title)

      charsleft := len(buf) % lineSize

      for bufend, lines := len(buf), len(buf)/lineSize; lines > 0; {
         linesperthread := bufLines
         linesptmod := 0
         if lines < bufLines*ncpu {
            linesperthread = lines / ncpu
            linesptmod = lines % ncpu
         }
         obufstart := 0
         obufend := 0
         for i := 0; i < ncpu; i++ {
            if i == (ncpu - 1) {
               linesperthread += linesptmod
            }
            lines -= linesperthread
            bufstart := bufend - linesperthread*lineSize
            obufend = obufstart + linesperthread*(lineSize+1)
            prepworkorder := [][]byte{buf[bufstart:bufend], obuf[activeobuf][obufstart:obufend]}
            prep(prepworkorder)
            bufend = bufstart
            obufstart = obufend
         }
         write(obuf[activeobuf][0:obufend])
         activeobuf = activeobuf ^ 1
      }
      if charsleft > 0 {
         prepworkorder := [][]byte{buf[0:charsleft], obuf[activeobuf][0 : charsleft+1]}
         prep(prepworkorder)
         write(obuf[activeobuf][0 : charsleft+1])
      }
      buf = buf[0:0]
   }
   return outHash
}

func main() {}
