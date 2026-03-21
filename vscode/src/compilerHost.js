export function formatError(error) {
    if (error instanceof Error) {
        return error.stack ?? error.message;
    }
    if (typeof error === 'object' && error !== null) {
        const summary = summarizeObject(error);
        if (summary) {
            return summary;
        }
    }
    return String(error);
}
function summarizeObject(error) {
    const record = error;
    const namedMessage = [record.name, record.message].filter((value) => typeof value === 'string' && value).join(': ');
    if (namedMessage) {
        return typeof record.stack === 'string' && record.stack ? record.stack : namedMessage;
    }
    try {
        return JSON.stringify(error, createCircularReplacer(), 2);
    }
    catch {
        return undefined;
    }
}
function createCircularReplacer() {
    const seen = new WeakSet();
    return (_key, value) => {
        if (typeof value !== 'object' || value === null) {
            return value;
        }
        if (seen.has(value)) {
            return '[Circular]';
        }
        seen.add(value);
        return value;
    };
}
