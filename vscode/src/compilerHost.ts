import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';

export interface CompileArtifacts {
  js: string;
  wat?: string;
  wasm: Uint8Array;
}

interface CompilerModule {
  compile(source: string, options?: { wat?: boolean; optimize?: boolean }): Promise<CompileArtifacts>;
}

export class RepoCompilerHost {
  private compilerPromise?: Promise<CompilerModule>;

  constructor(private readonly extensionUri: vscode.Uri) {}

  async compile(
    source: string,
    options: { wat?: boolean; optimize?: boolean } = {},
  ): Promise<CompileArtifacts> {
    const compiler = await this.getCompiler();
    return compiler.compile(source, options);
  }

  private async getCompiler(): Promise<CompilerModule> {
    if (!this.compilerPromise) {
      this.compilerPromise = this.loadCompiler();
    }

    return this.compilerPromise;
  }

  private async loadCompiler(): Promise<CompilerModule> {
    const compilerPath = path.join(this.extensionUri.fsPath, 'dist', 'compiler.mjs');

    try {
      return (await import(pathToFileURL(compilerPath).href)) as CompilerModule;
    } catch (error) {
      this.compilerPromise = undefined;
      throw new Error(
        `Unable to load the bundled UTU compiler snapshot at ${compilerPath}. Run \`npm run build\` in the vscode folder and try again.\n\n${formatError(error)}`,
      );
    }
  }
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}
