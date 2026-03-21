import * as path from 'node:path';
import * as vscode from 'vscode';

export type GeneratedDocumentKind = 'js' | 'wat' | 'tree';

const GENERATED_SCHEME = 'utu-generated';

export class GeneratedDocumentStore implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly contents = new Map<string, string>();

  readonly onDidChange = this.emitter.event;

  upsert(kind: GeneratedDocumentKind, sourceUri: vscode.Uri, content: string): vscode.Uri {
    const baseName = path.posix.basename(sourceUri.path, path.posix.extname(sourceUri.path)) || 'utu';
    const extension = kind === 'js' ? 'js' : kind === 'wat' ? 'wat' : 'txt';
    const query = new URLSearchParams({
      kind,
      source: sourceUri.toString(),
    }).toString();

    const uri = vscode.Uri.from({
      scheme: GENERATED_SCHEME,
      path: `/${baseName}.${extension}`,
      query,
    });

    this.contents.set(uri.toString(), content);
    this.emitter.fire(uri);
    return uri;
  }

  languageIdFor(kind: GeneratedDocumentKind): string {
    switch (kind) {
      case 'js':
        return 'javascript';
      case 'wat':
        return 'wat';
      default:
        return 'plaintext';
    }
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  dispose(): void {
    this.contents.clear();
    this.emitter.dispose();
  }
}
