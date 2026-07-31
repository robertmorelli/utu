const vscode = require('vscode');

async function run() {
  console.log('[utu-web-test] locate extension');
  const extension = vscode.extensions.getExtension('robertmorelli.utu-vscode');
  if (!extension) throw new Error('UTU extension was not installed in the web test host');
  console.log('[utu-web-test] activate');
  await extension.activate();
  console.log('[utu-web-test] commands');

  const commands = new Set(await vscode.commands.getCommands(true));
  for (const name of ['utu.compileCurrentFile', 'utu.runMain', 'utu.showGeneratedWat']) {
    if (!commands.has(name)) throw new Error(`web extension did not register ${name}`);
  }

  console.log('[utu-web-test] open document');
  const document = await vscode.workspace.openTextDocument({
    language: 'utu',
    content: 'export main() I32 { 42; }',
  });
  console.log('[utu-web-test] compile');
  const binary = await vscode.commands.executeCommand('utu.compileCurrentFile', document);
  if (!(binary instanceof Uint8Array) || binary.byteLength === 0) {
    throw new Error('web compile command did not produce Wasm bytes');
  }
  console.log('[utu-web-test] run');
  const result = await vscode.commands.executeCommand('utu.runMain', document);
  if (result !== 42) throw new Error(`web runMain returned ${String(result)} instead of 42`);
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('[utu-web-test] done');
  return 0;
}

module.exports = { run };
