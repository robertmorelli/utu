import binaryenModule from 'binaryen';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

const binaryen = binaryenModule?.default ?? binaryenModule;
let valid = false;
let errorMessage = null;

try {
    const mod = binaryen.parseText(payload.wat);
    try {
        mod.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue);
        valid = Boolean(mod.validate());
    } finally {
        mod.dispose();
    }
} catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
}

process.stdout.write(JSON.stringify({ valid, errorMessage }));
