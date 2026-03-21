import * as vscode from 'vscode';

export type GeneratedDocumentKind = 'js' | 'wat' | 'tree';

const GENERATED_SCHEME = 'utu-generated';
const GENERATED_FILE_EXTENSIONS: Record<GeneratedDocumentKind, string> = {
  js: 'js',
  wat: 'wat',
  tree: 'txt',
};
const GENERATED_LANGUAGE_IDS: Record<GeneratedDocumentKind, string> = {
  js: 'javascript',
  wat: 'wat',
  tree: 'plaintext',
};

export class GeneratedDocumentStore implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly contents = new Map<string, string>();

  readonly onDidChange = this.emitter.event;

  upsert(kind: GeneratedDocumentKind, sourceUri: vscode.Uri, content: string): vscode.Uri {
    const fileName = sourceUri.path.split('/').filter(Boolean).at(-1) ?? 'utu';
    const extensionIndex = fileName.lastIndexOf('.');
    const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
    const query = new URLSearchParams({
      kind,
      source: sourceUri.toString(),
    }).toString();

    const uri = vscode.Uri.from({
      scheme: GENERATED_SCHEME,
      path: `/${baseName}.${GENERATED_FILE_EXTENSIONS[kind]}`,
      query,
    });

    this.contents.set(uri.toString(), content);
    this.emitter.fire(uri);
    return uri;
  }

  languageIdFor(kind: GeneratedDocumentKind): string {
    return GENERATED_LANGUAGE_IDS[kind];
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  dispose(): void {
    this.contents.clear();
    this.emitter.dispose();
  }
}
