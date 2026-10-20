// fannkuch-redux from the Computer Language Benchmarks Game, after its
// single-threaded C program, as idiomatic AssemblyScript over Int32Arrays:
// permutations generated in place with a count array, each one flipped
// (prefix reversal) until its first element is 0.

// checksum * 1000 + maxFlips for all permutations of 0..n-1.
function fannkuch(n: i32): i64 {
  const perm = new Int32Array(n);
  const perm1 = new Int32Array(n);
  const count = new Int32Array(n);
  for (let i = 0; i < n; i++) perm1[i] = i;
  let maxFlips: i32 = 0;
  let checksum: i32 = 0;
  let permCount: i32 = 0;
  let r = n;
  while (true) {
    while (r !== 1) {
      count[r - 1] = r;
      r--;
    }
    for (let i = 0; i < n; i++) perm[i] = perm1[i];
    let flips: i32 = 0;
    let k = perm[0];
    while (k !== 0) {
      const k2 = (k + 1) >> 1;
      for (let i = 0; i < k2; i++) {
        const t = perm[i];
        perm[i] = perm[k - i];
        perm[k - i] = t;
      }
      flips++;
      k = perm[0];
    }
    if (flips > maxFlips) maxFlips = flips;
    if (permCount % 2 === 0) checksum += flips;
    else checksum -= flips;
    // The next permutation: rotate the first r + 1 elements left until a count stays positive.
    while (true) {
      if (r === n) return <i64>checksum * 1000 + maxFlips;
      const perm0 = perm1[0];
      for (let i = 0; i < r; i++) perm1[i] = perm1[i + 1];
      perm1[r] = perm0;
      count[r]--;
      if (count[r] > 0) break;
      r++;
    }
    permCount++;
  }
}

export function bench(iterations: i32): i64 {
  let sink: i64 = 0;
  for (let i = 0; i < iterations; i++) sink += fannkuch(9);
  return sink;
}
