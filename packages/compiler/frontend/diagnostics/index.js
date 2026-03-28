import { collectParseDiagnostics } from '../../../document/index.js';
import { parseDocument } from '../parse/index.js';

export { collectParseDiagnostics };

export async function collectDocumentDiagnostics(options = {}) {
    return (await parseDocument(options)).diagnostics;
}
