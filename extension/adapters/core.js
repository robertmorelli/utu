import * as vscode from 'vscode';
const COMPLETION_KINDS = {
    class: vscode.CompletionItemKind.Class,
    enumMember: vscode.CompletionItemKind.EnumMember,
    function: vscode.CompletionItemKind.Function,
    keyword: vscode.CompletionItemKind.Keyword,
    method: vscode.CompletionItemKind.Method,
    module: vscode.CompletionItemKind.Module,
    text: vscode.CompletionItemKind.Text,
    variable: vscode.CompletionItemKind.Variable,
};
const SYMBOL_KINDS = {
    enum: vscode.SymbolKind.Enum,
    enumMember: vscode.SymbolKind.EnumMember,
    event: vscode.SymbolKind.Event,
    function: vscode.SymbolKind.Function,
    method: vscode.SymbolKind.Method,
    object: vscode.SymbolKind.Object,
    struct: vscode.SymbolKind.Struct,
    variable: vscode.SymbolKind.Variable,
};
const DIAGNOSTIC_SEVERITIES = {
    error: vscode.DiagnosticSeverity.Error,
};
export function toVscodeRange(range) {
    return new vscode.Range(toVscodePosition(range.start), toVscodePosition(range.end));
}
export function toVscodeLocation(location) {
    return new vscode.Location(vscode.Uri.parse(location.uri, true), toVscodeRange(location.range));
}
export function toVscodeHover(hover) {
    return new vscode.Hover(toMarkdownString(hover.contents), toVscodeRange(hover.range));
}
export function toVscodeDiagnostic(diagnostic) {
    const vscodeDiagnostic = new vscode.Diagnostic(toVscodeRange(diagnostic.range), diagnostic.message, DIAGNOSTIC_SEVERITIES[diagnostic.severity]);
    vscodeDiagnostic.source = diagnostic.source;
    return vscodeDiagnostic;
}
export function toVscodeDocumentHighlight(highlight) {
    return new vscode.DocumentHighlight(toVscodeRange(highlight.range), highlight.kind === 'write'
        ? vscode.DocumentHighlightKind.Write
        : vscode.DocumentHighlightKind.Read);
}
export function toVscodeCompletionItem(item) {
    const vscodeItem = new vscode.CompletionItem(item.label, COMPLETION_KINDS[item.kind]);
    vscodeItem.detail = item.detail;
    return vscodeItem;
}
export function toVscodeDocumentSymbol(symbol) {
    return new vscode.DocumentSymbol(symbol.name, symbol.detail, SYMBOL_KINDS[symbol.kind], toVscodeRange(symbol.range), toVscodeRange(symbol.selectionRange));
}
export function toVscodeWorkspaceSymbol(symbol) {
    return new vscode.SymbolInformation(symbol.name, SYMBOL_KINDS[symbol.kind], symbol.detail, toVscodeLocation(symbol.location));
}
export function toMarkdownString(content) {
    if (content.kind === 'markdown') {
        return new vscode.MarkdownString(content.value);
    }
    const markdown = new vscode.MarkdownString();
    markdown.appendText(content.value);
    return markdown;
}
function toVscodePosition(position) {
    return new vscode.Position(position.line, position.character);
}
