import { runCompiledProgram } from "./nodeRuntime.mjs";

export async function runCompiledMain(instantiate) {
  await runCompiledProgram(instantiate);
}
