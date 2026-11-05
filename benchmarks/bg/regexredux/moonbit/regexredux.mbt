// Not on BG: translated from BG regex-redux Node #3 (Jesse Millikan, ...,
// Andrey Filatkin): https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/regexredux-node-3.html
// Same steps with MoonBit core's own regex engine (@string.Regex, in the
// module): clean the input, count each variant's matches, the five
// replacements in order. MoonBit's `.` matches a newline too, so the cleanup
// pattern is `>[^\n]*\n|\n` (as BG C++/Rust/Swift write it). Single-threaded;
// setup(n) makes the fasta text; bench(n) returns FNV-1a 32 of the bytes BG
// prints.

///|
fn count_matches(pattern : String, s : String) -> Int {
  let re = @string.Regex(pattern) catch { _ => panic() }
  let mut n = 0
  for _ in re.find(s) {
    n += 1
  }
  n
}

///|
fn replace_all(pattern : String, s : String, by : String) -> String {
  let re = @string.Regex(pattern) catch { _ => panic() }
  re.replace_by(s, _ => by).to_string()
}

///|
fn run(input : String) -> String {
  let variants = [
    "agggtaaa|tttaccct", "[cgt]gggtaaa|tttaccc[acg]", "a[act]ggtaaa|tttacc[agt]t",
    "ag[act]gtaaa|tttac[agt]ct", "agg[act]taaa|ttta[agt]cct", "aggg[acg]aaa|ttt[cgt]ccct",
    "agggt[cgt]aa|tt[acg]accct", "agggta[cgt]a|t[acg]taccct", "agggtaa[cgt]|[acg]ttaccct",
  ]
  let out = StringBuilder()
  let initial_len = input.length()
  let data = replace_all(">[^\\n]*\\n|\\n", input, "")
  let cleaned_len = data.length()
  for re in variants {
    out.write_string("\{re} \{count_matches(re, data)}\n")
  }
  let mut s = data
  s = replace_all("tHa[Nt]", s, "<4>")
  s = replace_all("aND|caN|Ha[DS]|WaS", s, "<3>")
  s = replace_all("a[NSt]|BY", s, "<2>")
  s = replace_all("<[^>]*>", s, "|")
  s = replace_all("\\|[^|][^|]*\\|", s, "-")
  out.write_string("\n\{initial_len}\n\{cleaned_len}\n\{s.length()}\n")
  out.to_string()
}

// ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
// 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
// probabilities in double). Untimed.

///|
let input : Ref[String] = Ref::new("")

///|
fn fasta(n : Int) -> String {
  let alu = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA"
  let out = StringBuilder()
  out.write_string(">ONE Homo sapiens alu\n")
  let mut k = 0
  let mut left = 2 * n
  while left > 0 {
    let m = if left < 60 { left } else { 60 }
    for _ in 0..<m {
      out.write_char(alu[k].unsafe_to_char())
      k += 1
      if k == alu.length() {
        k = 0
      }
    }
    out.write_char('\n')
    left -= m
  }
  let mut seed = 42
  fn random(chars : String, probs : Array[Double], count : Int) {
    let cum = []
    let mut c = 0.0
    for p in probs {
      c += p
      cum.push(c)
    }
    let mut left = count
    while left > 0 {
      let m = if left < 60 { left } else { 60 }
      for _ in 0..<m {
        seed = (seed * 3877 + 29573) % 139968
        let r = seed.to_double() / 139968.0
        let mut j = 0
        while j < cum.length() - 1 && r >= cum[j] {
          j += 1
        }
        out.write_char(chars[j].unsafe_to_char())
      }
      out.write_char('\n')
      left -= m
    }
  }

  out.write_string(">TWO IUB ambiguity codes\n")
  random("acgtBDHKMNRSVWY", [0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02], 3 * n)
  out.write_string(">THREE Homo sapiens frequency\n")
  random("acgt", [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008], 5 * n)
  out.to_string()
}

///|
pub fn setup(n : Int) -> Unit {
  input.val = fasta(n)
}

///|
pub fn bench(n : Int) -> Int {
  ignore(n)
  let s = run(input.val)
  let mut h = -2128831035
  for i in 0..<s.length() {
    h = (h ^ s[i].to_int()) * 16777619
  }
  h
}
