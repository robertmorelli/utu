export function createDefaultHostImports(writeLine) {
    return {
        es: {
            console_log(value) {
                writeLine(String(value));
            },
            prompt() {
                throw new Error('UTU Run Main in the VS Code web host cannot provide synchronous `prompt()`. Use the CLI to run this file.');
            },
            i64_to_string(value) {
                return String(value);
            },
            f64_to_string(value) {
                return String(value);
            },
            math_sin(value) {
                return Math.sin(value);
            },
            math_cos(value) {
                return Math.cos(value);
            },
            math_sqrt(value) {
                return Math.sqrt(value);
            },
        },
    };
}
