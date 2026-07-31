export function run(base, piece, repeats) {
  let output = base;
  for (let i = 0; i < repeats; i++) {
    const middle = output.length >> 1;
    output = output.slice(0, middle) + piece + output.slice(middle);
  }
  return output;
}
