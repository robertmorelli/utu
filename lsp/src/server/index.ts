import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { UtuLanguageService } from '../core/languageService';
import { UtuParserService } from '../core/parser';
import type {
  UtuCompletionItem,
  UtuDiagnostic,
  UtuDocumentHighlight,
  UtuDocumentSymbol,
  UtuHover,
  UtuLocation,
  UtuPositionLike,
  UtuRange,
  UtuSemanticToken,
  UtuTextDocument,
  UtuWorkspaceSymbol,
} from '../core/types';
import { getDocumentUri } from '../core/types';
import { UtuLanguageService as UtuLanguageServiceImpl } from '../core/languageService';

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
    const safeLine = clamp(line, 0, Math.max(offsets.length - 1, 0));
    const startOffset = offsets[safeLine] ?? 0;
    const nextOffset = offsets[safeLine + 1] ?? this.text.length;
    let endOffset = nextOffset;

    if (endOffset > startOffset && this.text.charCodeAt(endOffset - 1) === 10) {
      endOffset -= 1;
    }

    if (endOffset > startOffset && this.text.charCodeAt(endOffset - 1) === 13) {
      endOffset -= 1;
    }

    return {
      text: this.text.slice(startOffset, endOffset),
    };
  }

  positionAt(offset: number): { line: number; character: number } {
    const lineOffsets = this.getLineOffsets();
    const clampedOffset = clamp(offset, 0, this.text.length);
    let low = 0;
    let high = lineOffsets.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((lineOffsets[mid] ?? 0) > clampedOffset) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    const line = Math.max(low - 1, 0);
    return {
      line,
      character: clampedOffset - (lineOffsets[line] ?? 0),
    };
  }

  offsetAt(position: UtuPositionLike): number {
    const lineOffsets = this.getLineOffsets();
    const safeLine = clamp(position.line, 0, Math.max(lineOffsets.length - 1, 0));
    const lineOffset = lineOffsets[safeLine] ?? 0;
    const lineEndOffset = lineOffset + this.lineAt(safeLine).text.length;
    return clamp(lineOffset + position.character, lineOffset, lineEndOffset);
  }

  setText(text: string, version: number): void {
    this.text = text;
    this.version = version;
    this.lineOffsets = undefined;
  }

  applyChanges(changes: readonly UtuTextChange[], version: number): void {
    for (const change of changes) {
      if (!change.range) {
        this.text = change.text;
        this.lineOffsets = undefined;
        continue;
      }

      const startOffset = this.offsetAt(change.range.start);
      const endOffset = this.offsetAt(change.range.end);
      this.text = `${this.text.slice(0, startOffset)}${change.text}${this.text.slice(endOffset)}`;
      this.lineOffsets = undefined;
    }

    this.version = version;
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
}

export class UtuServerDocumentManager implements UtuServerDocumentStore {
  private readonly openDocuments = new Map<string, UtuServerTextDocument>();
  private workspaceFolders = new Set<string>();

  constructor(workspaceFolders: readonly string[] = []) {
    this.setWorkspaceFolders(workspaceFolders);
  }

  all(): readonly UtuServerTextDocument[] {
    return Array.from(this.openDocuments.values());
  }

  get(uri: string): UtuServerTextDocument | undefined {
    return this.openDocuments.get(uri);
  }

  open(params: UtuOpenDocumentParams): UtuServerTextDocument {
    const document = new UtuServerTextDocument(params.uri, params.version, params.text);
    this.openDocuments.set(params.uri, document);
    return document;
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
    this.workspaceFolders = new Set(
      folders
        .map((folder) => folder.trim())
        .filter((folder) => folder.length > 0),
    );
  }

  addWorkspaceFolders(folders: readonly string[]): void {
    for (const folder of folders) {
      const normalized = folder.trim();
      if (normalized) {
        this.workspaceFolders.add(normalized);
      }
    }
  }

  removeWorkspaceFolders(folders: readonly string[]): void {
    for (const folder of folders) {
      this.workspaceFolders.delete(folder);
    }
  }

  async resolve(uri: string): Promise<UtuServerTextDocument | undefined> {
    const openDocument = this.openDocuments.get(uri);
    if (openDocument) {
      return openDocument;
    }

    return loadFileDocument(uri);
  }

  async listWorkspaceDocuments(): Promise<UtuServerTextDocument[]> {
    const documents = new Map<string, UtuServerTextDocument>(
      Array.from(this.openDocuments.entries()),
    );

    const filePaths = await Promise.all(
      Array.from(this.workspaceFolders, async (folderUri) => {
        const folderPath = tryFileUriToPath(folderUri);
        if (!folderPath) {
          return [];
        }

        return collectWorkspaceFiles(folderPath);
      }),
    );

    const candidates = filePaths.flat();
    const loadedDocuments = await Promise.all(
      candidates.map(async (filePath) => {
        const uri = pathToFileURL(filePath).toString();
        if (documents.has(uri)) {
          return undefined;
        }

        return loadFileDocument(uri);
      }),
    );

    for (const document of loadedDocuments) {
      if (document) {
        documents.set(getDocumentUri(document), document);
      }
    }

    return Array.from(documents.values());
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
    this.languageService = new UtuLanguageServiceImpl(this.parserService);
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
    const document = this.documents.open(params);
    this.invalidateDocument(document.uri);
    return this.languageService.getDiagnostics(document);
  }

  async updateDocument(params: UtuChangeDocumentParams): Promise<UtuDiagnostic[]> {
    const document = this.documents.update(params);
    this.invalidateDocument(document.uri);
    return this.languageService.getDiagnostics(document);
  }

  closeDocument(uri: string): void {
    this.documents.close(uri);
    this.invalidateDocument(uri);
  }

  async saveDocument(params: UtuSaveDocumentParams): Promise<UtuDiagnostic[]> {
    const openDocument = this.documents.get(params.uri);
    if (openDocument && params.text !== undefined) {
      openDocument.setText(params.text, params.version ?? openDocument.version);
      this.invalidateDocument(params.uri);
      return this.languageService.getDiagnostics(openDocument);
    }

    return this.getDiagnostics(params.uri);
  }

  async getDiagnostics(uri: string): Promise<UtuDiagnostic[]> {
    const document = await this.documents.resolve(uri);
    if (!document) {
      return [];
    }

    return this.languageService.getDiagnostics(document);
  }

  async getHover(
    uri: string,
    position: UtuPositionLike,
  ): Promise<UtuHover | undefined> {
    const document = await this.documents.resolve(uri);
    if (!document) {
      return undefined;
    }

    return this.languageService.getHover(document, position);
  }

  async getDefinition(
    uri: string,
    position: UtuPositionLike,
  ): Promise<UtuLocation | undefined> {
    const document = await this.documents.resolve(uri);
    if (!document) {
      return undefined;
    }

    return this.languageService.getDefinition(document, position);
  }

  async getReferences(
    uri: string,
    position: UtuPositionLike,
    includeDeclaration: boolean,
  ): Promise<UtuLocation[]> {
    const document = await this.documents.resolve(uri);
    if (!document) {
      return [];
    }

    return this.languageService.getReferences(document, position, includeDeclaration);
  }

  async getDocumentHighlights(
    uri: string,
    position: UtuPositionLike,
  ): Promise<UtuDocumentHighlight[]> {
    const document = await this.documents.resolve(uri);
    if (!document) {
      return [];
    }

    return this.languageService.getDocumentHighlights(document, position);
  }

  async getCompletionItems(
    uri: string,
    position: UtuPositionLike,
  ): Promise<UtuCompletionItem[]> {
    const document = await this.documents.resolve(uri);
    if (!document) {
      return [];
    }

    return this.languageService.getCompletionItems(document, position);
  }

  async getDocumentSemanticTokens(uri: string): Promise<UtuSemanticToken[]> {
    const document = await this.documents.resolve(uri);
    if (!document) {
      return [];
    }

    return this.languageService.getDocumentSemanticTokens(document);
  }

  async getDocumentSymbols(uri: string): Promise<UtuDocumentSymbol[]> {
    const document = await this.documents.resolve(uri);
    if (!document) {
      return [];
    }

    return this.languageService.getDocumentSymbols(document);
  }

  async getWorkspaceSymbols(query: string): Promise<UtuWorkspaceSymbol[]> {
    const documents = await this.documents.listWorkspaceDocuments();
    return this.languageService.getWorkspaceSymbols(query, documents);
  }
}

export class UtuLanguageServer extends UtuLanguageServerCore {}

async function loadFileDocument(uri: string): Promise<UtuServerTextDocument | undefined> {
  const filePath = tryFileUriToPath(uri);
  if (!filePath) {
    return undefined;
  }

  try {
    const [contents, metadata] = await Promise.all([
      readFile(filePath, 'utf8'),
      stat(filePath),
    ]);

    return new UtuServerTextDocument(uri, Math.trunc(metadata.mtimeMs), contents);
  } catch {
    return undefined;
  }
}

async function collectWorkspaceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const pending = [directory];

  while (pending.length > 0) {
    const currentDirectory = pending.pop();
    if (!currentDirectory) {
      continue;
    }

    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIPPED_WORKSPACE_DIRECTORIES.has(entry.name)) {
          pending.push(resolvePath(currentDirectory, entry.name));
        }

        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.utu')) {
        files.push(resolvePath(currentDirectory, entry.name));
      }
    }
  }

  return files;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
