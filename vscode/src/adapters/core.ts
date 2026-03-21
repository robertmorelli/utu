import * as vscode from 'vscode';
import type {
  UtuCompletionItem,
  UtuCompletionItemKind,
  UtuDiagnostic,
  UtuDocumentHighlight,
  UtuDocumentSymbol,
  UtuDocumentSymbolKind,
  UtuHover,
  UtuLocation,
  UtuMarkupContent,
  UtuRange,
  UtuWorkspaceSymbol,
} from '../../../lsp/src/core/types';

export function toVscodeRange(range: UtuRange): vscode.Range {
  return new vscode.Range(
    new vscode.Position(range.start.line, range.start.character),
    new vscode.Position(range.end.line, range.end.character),
  );
}

export function toVscodeLocation(location: UtuLocation): vscode.Location {
  return new vscode.Location(vscode.Uri.parse(location.uri, true), toVscodeRange(location.range));
}

export function toVscodeHover(hover: UtuHover): vscode.Hover {
  return new vscode.Hover(toMarkdownString(hover.contents), toVscodeRange(hover.range));
}

export function toVscodeDiagnostic(diagnostic: UtuDiagnostic): vscode.Diagnostic {
  const vscodeDiagnostic = new vscode.Diagnostic(
    toVscodeRange(diagnostic.range),
    diagnostic.message,
    diagnostic.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
  );
  vscodeDiagnostic.source = diagnostic.source;
  return vscodeDiagnostic;
}

export function toVscodeDocumentHighlight(
  highlight: UtuDocumentHighlight,
): vscode.DocumentHighlight {
  return new vscode.DocumentHighlight(
    toVscodeRange(highlight.range),
    highlight.kind === 'write'
      ? vscode.DocumentHighlightKind.Write
      : vscode.DocumentHighlightKind.Read,
  );
}

export function toVscodeCompletionItem(item: UtuCompletionItem): vscode.CompletionItem {
  const vscodeItem = new vscode.CompletionItem(item.label, toVscodeCompletionKind(item.kind));
  vscodeItem.detail = item.detail;
  return vscodeItem;
}

export function toVscodeDocumentSymbol(symbol: UtuDocumentSymbol): vscode.DocumentSymbol {
  return new vscode.DocumentSymbol(
    symbol.name,
    symbol.detail,
    toVscodeSymbolKind(symbol.kind),
    toVscodeRange(symbol.range),
    toVscodeRange(symbol.selectionRange),
  );
}

export function toVscodeWorkspaceSymbol(
  symbol: UtuWorkspaceSymbol,
): vscode.SymbolInformation {
  return new vscode.SymbolInformation(
    symbol.name,
    toVscodeSymbolKind(symbol.kind),
    symbol.detail,
    toVscodeLocation(symbol.location),
  );
}

export function toMarkdownString(content: UtuMarkupContent): vscode.MarkdownString {
  if (content.kind === 'plaintext') {
    const markdown = new vscode.MarkdownString();
    markdown.appendText(content.value);
    return markdown;
  }

  return new vscode.MarkdownString(content.value);
}

function toVscodeCompletionKind(kind: UtuCompletionItemKind): vscode.CompletionItemKind {
  switch (kind) {
    case 'class':
      return vscode.CompletionItemKind.Class;
    case 'enumMember':
      return vscode.CompletionItemKind.EnumMember;
    case 'function':
      return vscode.CompletionItemKind.Function;
    case 'keyword':
      return vscode.CompletionItemKind.Keyword;
    case 'method':
      return vscode.CompletionItemKind.Method;
    case 'module':
      return vscode.CompletionItemKind.Module;
    case 'variable':
      return vscode.CompletionItemKind.Variable;
    default:
      return vscode.CompletionItemKind.Text;
  }
}

function toVscodeSymbolKind(kind: UtuDocumentSymbolKind): vscode.SymbolKind {
  switch (kind) {
    case 'enum':
      return vscode.SymbolKind.Enum;
    case 'enumMember':
      return vscode.SymbolKind.EnumMember;
    case 'event':
      return vscode.SymbolKind.Event;
    case 'function':
      return vscode.SymbolKind.Function;
    case 'method':
      return vscode.SymbolKind.Method;
    case 'struct':
      return vscode.SymbolKind.Struct;
    case 'variable':
      return vscode.SymbolKind.Variable;
    default:
      return vscode.SymbolKind.Object;
  }
}
