export function createDefaultHostImports(writeLine: (line: string) => void): Record<string, unknown> {
  return {
    es: {
      console_log(value: unknown) {
        writeLine(String(value));
      },
      prompt() {
        throw new Error('UTU Run Main in the VS Code web host cannot provide synchronous `prompt()`. Use the CLI to run this file.');
      },
      i64_to_string(value: unknown) {
        return String(value);
      },
      f64_to_string(value: unknown) {
        return String(value);
      },
      math_sin(value: number) {
        return Math.sin(value);
      },
      math_cos(value: number) {
        return Math.cos(value);
      },
      math_sqrt(value: number) {
        return Math.sqrt(value);
      },
    },
  };
}
