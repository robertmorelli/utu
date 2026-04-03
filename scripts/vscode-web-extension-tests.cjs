const vscode = require('vscode');

const EXTENSION_ID = 'robertmorelli.utu-vscode';

module.exports = { run };

async function run() {
  console.log('[utu-web-test] activate extension');
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  if (!extension) {
    throw new Error(`Missing extension ${EXTENSION_ID}`);
  }

  await extension.activate();
  await waitForCommands([
    'utu.compileCurrentFile',
    'utu.showGeneratedJavaScript',
    'utu.runMain',
    'utu.runTestAt',
  ]);

  console.log('[utu-web-test] open hello');
  const helloDocument = await openWorkspaceDocument('examples/hello.utu');
  console.log('[utu-web-test] compile hello');
  await vscode.commands.executeCommand('utu.compileCurrentFile', helloDocument);
  console.log('[utu-web-test] run hello main');
  await vscode.commands.executeCommand('utu.runMain', helloDocument);

  console.log('[utu-web-test] show generated js');
  await vscode.window.showTextDocument(helloDocument, { preview: false });
  await vscode.commands.executeCommand('utu.showGeneratedJavaScript', helloDocument);
  assertActiveGeneratedDocument('kind=js', ['instantiate']);

  console.log('[utu-web-test] open test file');
  const testDocument = await openWorkspaceDocument('examples/ci/tests_basic.utu');
  console.log('[utu-web-test] run first test');
  await vscode.commands.executeCommand('utu.runTestAt', testDocument, 0);
  console.log('[utu-web-test] done');

  return 0;
}

async function waitForCommands(names, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const commands = new Set(await vscode.commands.getCommands(true));
    if (names.every((name) => commands.has(name))) {
      return;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for commands: ${names.join(', ')}`);
}

async function openWorkspaceDocument(globPattern) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const matches = await vscode.workspace.findFiles(globPattern);
    if (matches.length) {
      const document = await vscode.workspace.openTextDocument(matches[0]);
      await vscode.window.showTextDocument(document, { preview: false });
      return document;
    }
    await sleep(100);
  }
  throw new Error(`Could not find workspace file matching ${JSON.stringify(globPattern)}`);
}

function assertActiveGeneratedDocument(queryFragment, contentFragments) {
  const document = vscode.window.activeTextEditor?.document;
  if (!document) {
    throw new Error('Expected an active editor after generated-document command.');
  }
  if (document.uri.scheme !== 'utu-generated') {
    throw new Error(`Expected utu-generated document, received ${document.uri.toString()}`);
  }
  if (!document.uri.query.includes(queryFragment)) {
    throw new Error(`Expected generated document query to include ${queryFragment}, received ${document.uri.query}`);
  }
  const text = document.getText();
  for (const fragment of contentFragments) {
    if (!text.includes(fragment)) {
      throw new Error(`Expected generated document to include ${JSON.stringify(fragment)}`);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
