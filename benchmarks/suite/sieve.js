export function run(n) {
  const flags = new Uint8Array(n);
  flags.fill(1);
  if (n > 0) flags[0] = 0;
  if (n > 1) flags[1] = 0;
  for (let p = 2; p * p < n; p++) {
    if (flags[p]) {
      for (let j = p * p; j < n; j += p) flags[j] = 0;
    }
  }
  let count = 0;
  for (let i = 2; i < n; i++) count += flags[i];
  return count;
}
