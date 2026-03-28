import {
  activate as activateWeb,
  deactivate as deactivateWeb,
} from './extension.web.js';

export async function activate(context) {
  return activateWeb(context);
}

export function deactivate() {
  return deactivateWeb();
}
