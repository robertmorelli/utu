export function run(n) {
  let i = 0;
  let x = 305419896;
  while (i < n) {
    x = (x + i) | 0;
    x ^= x << 13;
    x ^= x >> 17;
    i++;
  }
  return x | 0;
}
