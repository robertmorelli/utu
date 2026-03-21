import * as vscode from 'vscode';

interface SymbolPattern {
  regex: RegExp;
  kind: vscode.SymbolKind;
  detail: string;
}

const PATTERNS: SymbolPattern[] = [
  {
    regex: /^\s*(?:export\s+)?fn\s+([a-z_][a-zA-Z0-9_]*)\s*\(/,
    kind: vscode.SymbolKind.Function,
    detail: 'function',
  },
  {
    regex: /^\s*struct\s+([A-Z][a-zA-Z0-9_]*)\b/,
    kind: vscode.SymbolKind.Struct,
    detail: 'struct',
  },
  {
    regex: /^\s*type\s+([A-Z][a-zA-Z0-9_]*)\b/,
    kind: vscode.SymbolKind.Enum,
    detail: 'type',
  },
  {
    regex: /^\s*let\s+([a-z_][a-zA-Z0-9_]*)\s*:/,
    kind: vscode.SymbolKind.Variable,
    detail: 'binding',
  },
  {
    regex: /^\s*import\s+extern\s+"[^"]+"\s+([a-z_][a-zA-Z0-9_]*)\b/,
    kind: vscode.SymbolKind.Function,
    detail: 'import',
  },
];

export class UtuDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];

    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
      const line = document.lineAt(lineNumber);

      for (const pattern of PATTERNS) {
        const match = line.text.match(pattern.regex);
        if (!match) continue;

        const name = match[1];
        const startCharacter = line.text.indexOf(name);
        const endCharacter = startCharacter + name.length;
        const range = new vscode.Range(lineNumber, 0, lineNumber, line.text.length);
        const selectionRange = new vscode.Range(lineNumber, startCharacter, lineNumber, endCharacter);
        const symbol = new vscode.DocumentSymbol(name, pattern.detail, pattern.kind, range, selectionRange);
        symbols.push(symbol);
        break;
      }
    }

    return symbols;
  }
}
