import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UtuLanguageService } from '../core/languageService';
import { UtuParserService } from '../core/parser';
import {
  clamp,
  getDocumentUri,
  type UtuCompletionItem,
  type UtuDiagnostic,
  type UtuDocumentHighlight,
  type UtuDocumentSymbol,
  type UtuHover,
  type UtuLocation,
  type UtuPositionLike,
  type UtuRange,
  type UtuSemanticToken,
  type UtuTextDocument,
  type UtuWorkspaceSymbol,
} from '../core/types';

export interface UtuServerDocumentStore {
  all(): readonly UtuServerTextDocument[];
  get(uri: string): UtuServerTextDocument | undefined;
}

export interface UtuServerCapabilities {
  hover: boolean;
  definition: boolean;
  references: boolean;
  completion: boolean;
  documentHighlights: boolean;
  documentSymbols: boolean;
  workspaceSymbols: boolean;
  semanticTokens: boolean;
  diagnostics: boolean;
}

export interface UtuServerOptions {
  grammarWasmPath: string;
  runtimeWasmPath: string;
  workspaceFolders?: readonly string[];
}

export interface UtuOpenDocumentParams {
  uri: string;
  version: number;
  text: string;
}

export interface UtuTextChange {
  text: string;
  range?: UtuRange;
}

export interface UtuChangeDocumentParams {
  uri: string;
  version: number;
  changes: readonly UtuTextChange[];
}

export interface UtuSaveDocumentParams {
  uri: string;
  text?: string;
  version?: number;
}

const DEFAULT_SERVER_CAPABILITIES: UtuServerCapabilities = {
  hover: true,
  definition: true,
  references: true,
  completion: true,
  documentHighlights: true,
  documentSymbols: true,
  workspaceSymbols: true,
  semanticTokens: true,
  diagnostics: true,
};

const SKIPPED_WORKSPACE_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
]);

export function getDefaultServerCapabilities(): UtuServerCapabilities {
  return { ...DEFAULT_SERVER_CAPABILITIES };
}

export class UtuServerTextDocument implements UtuTextDocument {
  private lineOffsets?: number[];

  constructor(
    readonly uri: string,
    public version: number,
    private text: string,
  ) {}

  getText(): string {
    return this.text;
  }

  get lineCount(): number {
    return this.getLineOffsets().length;
  }

  lineAt(line: number): { text: string } {
    const offsets = this.getLineOffsets();
    const [start, end] = this.getLineBounds(line, offsets);
    return { text: this.text.slice(start, end) };
  }

  positionAt(offset: number): { line: number; character: number } {
    const offsets = this.getLineOffsets();
    const clampedOffset = clamp(offset, 0, this.text.length);
    const line = this.findLineForOffset(clampedOffset, offsets);
    return {
      line,
      character: clampedOffset - (offsets[line] ?? 0),
    };
  }

  offsetAt(position: UtuPositionLike): number {
    const offsets = this.getLineOffsets();
    const [lineStart, lineEnd] = this.getLineBounds(position.line, offsets);
    return clamp(lineStart + position.character, lineStart, lineEnd);
  }

  setText(text: string, version: number): void {
    this.replaceText(text);
    this.version = version;
  }

  applyChanges(changes: readonly UtuTextChange[], version: number): void {
    for (const change of changes) {
      if (!change.range) {
        this.replaceText(change.text);
        continue;
      }

      const start = this.offsetAt(change.range.start);
      const end = this.offsetAt(change.range.end);
      this.replaceText(
        `${this.text.slice(0, start)}${change.text}${this.text.slice(end)}`,
      );
    }

    this.version = version;
  }

  private replaceText(text: string): void {
    this.text = text;
    this.lineOffsets = undefined;
  }

  private getLineOffsets(): number[] {
    if (this.lineOffsets) {
      return this.lineOffsets;
    }

    const offsets = [0];

    for (let index = 0; index < this.text.length; index += 1) {
      const code = this.text.charCodeAt(index);

      if (code === 13) {
        if (this.text.charCodeAt(index + 1) === 10) {
          index += 1;
        }

        offsets.push(index + 1);
        continue;
      }

      if (code === 10) {
        offsets.push(index + 1);
      }
    }

    this.lineOffsets = offsets;
    return offsets;
  }

  private getSafeLine(line: number, offsets: readonly number[]): number {
    return clamp(line, 0, Math.max(offsets.length - 1, 0));
  }

  private getLineBounds(line: number, offsets: readonly number[]): [number, number] {
    const safeLine = this.getSafeLine(line, offsets);
    const start = offsets[safeLine] ?? 0;
    const nextOffset = offsets[safeLine + 1] ?? this.text.length;
    return [start, trimLineEnding(this.text, start, nextOffset)];
  }

  private findLineForOffset(offset: number, offsets: readonly number[]): number {
    let low = 0;
    let high = offsets.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((offsets[mid] ?? 0) > offset) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    return Math.max(low - 1, 0);
  }
}

export class UtuServerDocumentManager implements UtuServerDocumentStore {
  private readonly openDocuments = new Map<string, UtuServerTextDocument>();
  private workspaceFolders = new Set<string>();

  constructor(workspaceFolders: readonly string[] = []) {
    this.setWorkspaceFolders(workspaceFolders);
  }

  all(): readonly UtuServerTextDocument[] {
    return [...this.openDocuments.values()];
  }

  get(uri: string): UtuServerTextDocument | undefined {
    return this.openDocuments.get(uri);
  }

  open(params: UtuOpenDocumentParams): UtuServerTextDocument {
    return this.store(new UtuServerTextDocument(params.uri, params.version, params.text));
  }

  update(params: UtuChangeDocumentParams): UtuServerTextDocument {
    const document = this.openDocuments.get(params.uri);
    if (!document) {
      throw new Error(`Cannot apply changes to unopened document: ${params.uri}`);
    }

    document.applyChanges(params.changes, params.version);
    return document;
  }

  close(uri: string): void {
    this.openDocuments.delete(uri);
  }

  clear(): void {
    this.openDocuments.clear();
  }

  setWorkspaceFolders(folders: readonly string[]): void {
    this.workspaceFolders = new Set(normalizeFolders(folders));
  }

  addWorkspaceFolders(folders: readonly string[]): void {
    for (const folder of normalizeFolders(folders)) {
      this.workspaceFolders.add(folder);
    }
  }

  removeWorkspaceFolders(folders: readonly string[]): void {
    for (const folder of normalizeFolders(folders)) {
      this.workspaceFolders.delete(folder);
    }
  }

  async resolve(uri: string): Promise<UtuServerTextDocument | undefined> {
    return this.openDocuments.get(uri) ?? loadFileDocument(uri);
  }

  async listWorkspaceDocuments(): Promise<UtuServerTextDocument[]> {
    const documents = new Map(this.openDocuments);
    const workspaceFiles = (
      await Promise.all([...this.workspaceFolders].map(listWorkspaceFilesForFolder))
    ).flat();
    const missingUris = [
      ...new Set(workspaceFiles.map((filePath) => pathToFileURL(filePath).toString())),
    ].filter((uri) => !documents.has(uri));
    const loadedDocuments = await Promise.all(missingUris.map(loadFileDocument));

    for (const document of loadedDocuments) {
      if (document) {
        documents.set(getDocumentUri(document), document);
      }
    }

    return [...documents.values()];
  }

  private store(document: UtuServerTextDocument): UtuServerTextDocument {
    this.openDocuments.set(document.uri, document);
    return document;
  }
}

export class UtuLanguageServerCore {
  readonly documents: UtuServerDocumentManager;
  readonly parserService: UtuParserService;
  readonly languageService: UtuLanguageService;

  constructor(options: UtuServerOptions) {
    this.documents = new UtuServerDocumentManager(options.workspaceFolders ?? []);
    this.parserService = new UtuParserService({
      grammarWasmPath: options.grammarWasmPath,
      runtimeWasmPath: options.runtimeWasmPath,
    });
    this.languageService = new UtuLanguageService(this.parserService);
  }

  dispose(): void {
    this.clearDocuments();
    this.languageService.dispose();
    this.parserService.dispose();
  }

  setWorkspaceFolders(folders: readonly string[]): void {
    this.documents.setWorkspaceFolders(folders);
  }

  addWorkspaceFolders(folders: readonly string[]): void {
    this.documents.addWorkspaceFolders(folders);
  }

  removeWorkspaceFolders(folders: readonly string[]): void {
    this.documents.removeWorkspaceFolders(folders);
  }

  invalidateDocument(uri: string): void {
    this.languageService.invalidate(uri);
  }

  clearDocuments(): void {
    this.documents.clear();
    this.languageService.clear();
  }

  async openDocument(params: UtuOpenDocumentParams): Promise<UtuDiagnostic[]> {
    return this.getFreshDiagnostics(this.documents.open(params));
  }

  async updateDocument(params: UtuChangeDocumentParams): Promise<UtuDiagnostic[]> {
    return this.getFreshDiagnostics(this.documents.update(params));
  }

  closeDocument(uri: string): void {
    this.documents.close(uri);
    this.invalidateDocument(uri);
  }

  async saveDocument(params: UtuSaveDocumentParams): Promise<UtuDiagnostic[]> {
    const document = this.documents.get(params.uri);
    if (document && params.text !== undefined) {
      document.setText(params.text, params.version ?? document.version);
      return this.getFreshDiagnostics(document);
    }

    return this.getDiagnostics(params.uri);
  }

  async getDiagnostics(uri: string): Promise<UtuDiagnostic[]> {
    return this.withDocument<UtuDiagnostic[]>(
      uri,
      [],
      (document) => this.languageService.getDiagnostics(document),
    );
  }

  async getHover(
    uri: string,
    position: UtuPositionLike,
  ): Promise<UtuHover | undefined> {
    return this.withDocument<UtuHover | undefined>(
      uri,
      undefined,
      (document) => this.languageService.getHover(document, position),
    );
  }

  async getDefinition(
    uri: string,
    position: UtuPositionLike,
  ): Promise<UtuLocation | undefined> {
    return this.withDocument<UtuLocation | undefined>(
      uri,
      undefined,
      (document) => this.languageService.getDefinition(document, position),
    );
  }

  async getReferences(
    uri: string,
    position: UtuPositionLike,
    includeDeclaration: boolean,
  ): Promise<UtuLocation[]> {
    return this.withDocument<UtuLocation[]>(
      uri,
      [],
      (document) => this.languageService.getReferences(document, position, includeDeclaration),
    );
  }

  async getDocumentHighlights(
    uri: string,
    position: UtuPositionLike,
  ): Promise<UtuDocumentHighlight[]> {
    return this.withDocument<UtuDocumentHighlight[]>(
      uri,
      [],
      (document) => this.languageService.getDocumentHighlights(document, position),
    );
  }

  async getCompletionItems(
    uri: string,
    position: UtuPositionLike,
  ): Promise<UtuCompletionItem[]> {
    return this.withDocument<UtuCompletionItem[]>(
      uri,
      [],
      (document) => this.languageService.getCompletionItems(document, position),
    );
  }

  async getDocumentSemanticTokens(uri: string): Promise<UtuSemanticToken[]> {
    return this.withDocument<UtuSemanticToken[]>(
      uri,
      [],
      (document) => this.languageService.getDocumentSemanticTokens(document),
    );
  }

  async getDocumentSymbols(uri: string): Promise<UtuDocumentSymbol[]> {
    return this.withDocument<UtuDocumentSymbol[]>(
      uri,
      [],
      (document) => this.languageService.getDocumentSymbols(document),
    );
  }

  async getWorkspaceSymbols(query: string): Promise<UtuWorkspaceSymbol[]> {
    return this.languageService.getWorkspaceSymbols(
      query,
      await this.documents.listWorkspaceDocuments(),
    );
  }

  private async getFreshDiagnostics(document: UtuServerTextDocument): Promise<UtuDiagnostic[]> {
    this.invalidateDocument(document.uri);
    return this.languageService.getDiagnostics(document);
  }

  private async withDocument<T>(
    uri: string,
    fallback: T,
    action: (document: UtuServerTextDocument) => Promise<T>,
  ): Promise<T> {
    const document = await this.documents.resolve(uri);
    return document ? action(document) : fallback;
  }
}

export class UtuLanguageServer extends UtuLanguageServerCore {}

async function loadFileDocument(uri: string): Promise<UtuServerTextDocument | undefined> {
  const filePath = tryFileUriToPath(uri);
  if (!filePath) {
    return undefined;
  }

  try {
    const [text, metadata] = await Promise.all([
      readFile(filePath, 'utf8'),
      stat(filePath),
    ]);

    return new UtuServerTextDocument(uri, Math.trunc(metadata.mtimeMs), text);
  } catch {
    return undefined;
  }
}

async function listWorkspaceFilesForFolder(folderUri: string): Promise<string[]> {
  const folderPath = tryFileUriToPath(folderUri);
  return folderPath ? collectWorkspaceFiles(folderPath) : [];
}

async function collectWorkspaceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const pending = [directory];

  while (pending.length > 0) {
    const currentDirectory = pending.pop();
    if (!currentDirectory) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(currentDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = resolvePath(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        if (!SKIPPED_WORKSPACE_DIRECTORIES.has(entry.name)) {
          pending.push(entryPath);
        }

        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.utu')) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function normalizeFolders(folders: readonly string[]): string[] {
  return folders.map((folder) => folder.trim()).filter(isNonEmptyString);
}

function tryFileUriToPath(uri: string): string | undefined {
  if (!uri.startsWith('file://')) {
    return undefined;
  }

  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}

function trimLineEnding(text: string, start: number, end: number): number {
  let trimmedEnd = end;

  while (trimmedEnd > start) {
    const code = text.charCodeAt(trimmedEnd - 1);
    if (code !== 10 && code !== 13) {
      break;
    }

    trimmedEnd -= 1;
  }

  return trimmedEnd;
}

function isNonEmptyString(value: string): value is string {
  return value.length > 0;
}
