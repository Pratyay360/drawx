#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if command -v bun >/dev/null 2>&1; then
  bun run tauri "$@"
else
  npm exec tauri "$@"
fi

bash src-tauri/scripts/patch-appimage-wayland.sh
