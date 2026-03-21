export interface UtuPosition {
  line: number;
  character: number;
}

export type UtuPositionLike = Pick<UtuPosition, 'line' | 'character'>;

export interface UtuRange {
  start: UtuPosition;
  end: UtuPosition;
}

export interface UtuUriLike {
  toString(): string;
}

export interface UtuTextLineLike {
  text: string;
}

export interface UtuTextDocument {
  uri: string | UtuUriLike;
  version: number;
  getText(): string;
  lineCount: number;
  lineAt(line: number): UtuTextLineLike;
  positionAt(offset: number): UtuPosition;
}

export interface UtuMarkupContent {
  kind: 'markdown' | 'plaintext';
  value: string;
}

export interface UtuDiagnostic {
  range: UtuRange;
  message: string;
  severity: 'error';
  source: 'utu';
}

export interface UtuLocation {
  uri: string;
  range: UtuRange;
}

export interface UtuHover {
  contents: UtuMarkupContent;
  range: UtuRange;
}

export interface UtuDocumentHighlight {
  range: UtuRange;
  kind: 'read' | 'write';
}

export type UtuCompletionItemKind =
  | 'class'
  | 'enumMember'
  | 'function'
  | 'keyword'
  | 'method'
  | 'module'
  | 'text'
  | 'variable';

export interface UtuCompletionItem {
  label: string;
  kind: UtuCompletionItemKind;
  detail?: string;
}

export interface UtuSemanticToken {
  range: UtuRange;
  type: string;
  modifiers: string[];
}

export type UtuDocumentSymbolKind =
  | 'enum'
  | 'enumMember'
  | 'event'
  | 'function'
  | 'method'
  | 'object'
  | 'struct'
  | 'variable';

export interface UtuDocumentSymbol {
  name: string;
  detail: string;
  kind: UtuDocumentSymbolKind;
  range: UtuRange;
  selectionRange: UtuRange;
}

export interface UtuWorkspaceSymbol {
  name: string;
  detail: string;
  kind: UtuDocumentSymbolKind;
  location: UtuLocation;
}

export function copyPosition(position: UtuPositionLike): UtuPosition {
  return {
    line: position.line,
    character: position.character,
  };
}

export function copyRange(range: UtuRange): UtuRange {
  return {
    start: copyPosition(range.start),
    end: copyPosition(range.end),
  };
}

export function comparePositions(
  left: UtuPositionLike,
  right: UtuPositionLike,
): number {
  if (left.line !== right.line) {
    return left.line - right.line;
  }

  return left.character - right.character;
}

export function rangeContains(
  range: UtuRange,
  position: UtuPositionLike,
): boolean {
  return comparePositions(range.start, position) <= 0 && comparePositions(position, range.end) <= 0;
}

export function rangeLength(range: UtuRange): number {
  const lineDelta = range.end.line - range.start.line;
  return lineDelta * 10_000 + (range.end.character - range.start.character);
}

export function getDocumentUri(document: UtuTextDocument): string {
  return typeof document.uri === 'string' ? document.uri : document.uri.toString();
}
