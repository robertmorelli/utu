#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/utu-vscode-desktop.XXXXXX")"
user_data_dir="$tmp_root/user"
extensions_dir="$tmp_root/extensions"
vsix_path="$repo_root/dist/utu-vscode-0.1.1.vsix"

cleanup() {
  local line pid
  while IFS= read -r line; do
    pid="${line%% *}"
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done < <(ps ax -o pid= -o command= | grep "$user_data_dir" | grep -v grep || true)
  rm -rf "$tmp_root"
}
trap cleanup EXIT

code --user-data-dir "$user_data_dir" --extensions-dir "$extensions_dir" --install-extension "$vsix_path" --force >/dev/null 2>&1
code --user-data-dir "$user_data_dir" --extensions-dir "$extensions_dir" --new-window --disable-workspace-trust --log trace "$repo_root" >/dev/null 2>&1

deadline=$((SECONDS + 30))
while (( SECONDS < deadline )); do
  latest_log_dir="$(find "$user_data_dir/logs" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -n 1)"
  exthost_log="${latest_log_dir}/window1/exthost/exthost.log"
  if [[ -f "$exthost_log" ]] \
    && grep -q "ExtensionService#_doActivateExtension robertmorelli.utu-vscode" "$exthost_log" \
    && grep -q "ExtHostCommands#registerCommand utu.compileCurrentFile" "$exthost_log" \
    && grep -q "ExtHostCommands#registerCommand utu.runMain" "$exthost_log"; then
    echo "PASS vscode desktop activation (verified VSIX install, extension activation, and command registration)"
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for VS Code desktop activation logs under $user_data_dir" >&2
find "$user_data_dir/logs" -maxdepth 4 \( -type d -o -type f \) 2>/dev/null | sort >&2 || true
exit 1
