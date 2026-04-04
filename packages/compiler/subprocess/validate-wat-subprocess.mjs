const importBinaryen = Function(
    'return ((Function("return this")()).__utuBinaryenLoader ? (Function("return this")()).__utuBinaryenLoader() : import("binaryen"))',
);

async function main() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    const wat = typeof payload?.wat === "string" ? payload.wat : "";
    const binaryen = (await importBinaryen()).default;

    const captured = [];
    const originalConsoleError = console.error;
    console.error = (...args) => {
        captured.push(args.map(String).join(" "));
    };

    try {
        const module = binaryen.parseText(wat);
        module.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue);
        const valid = module.validate();
        module.dispose();
        process.stdout.write(JSON.stringify({
            valid,
            errorMessage: valid ? null : captured.join("\n").trim() || "Binaryen validation failed.",
        }));
    } catch (error) {
        process.stdout.write(JSON.stringify({
            valid: false,
            errorMessage: captured.join("\n").trim() || error?.message || String(error),
        }));
    } finally {
        console.error = originalConsoleError;
    }
}

await main();
