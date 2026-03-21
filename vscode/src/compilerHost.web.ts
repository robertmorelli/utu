import type { CompilerHost, CompileArtifacts } from './compilerHost';

export class WebCompilerHost implements CompilerHost {
  async compile(
    _source: string,
    _options: { wat?: boolean; optimize?: boolean } = {},
  ): Promise<CompileArtifacts> {
    throw new Error(
      'UTU compile commands are not available in vscode.dev yet. Language features still work in the web extension.',
    );
  }
}
