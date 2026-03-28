export async function runMain(runtime, args = []) {
  return runtime.invoke('main', args);
}
