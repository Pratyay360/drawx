#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC_TAURI_DIR="$REPO_ROOT/src-tauri"
HOOK_SRC="$SRC_TAURI_DIR/appimage/apprun-wayland-compat.sh"

if [ ! -f "$HOOK_SRC" ]; then
  echo "Error: Wayland compatibility hook not found at $HOOK_SRC" >&2
  exit 1
fi

TAURI_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/tauri"

# Find generated *.AppDir directories in src-tauri/target or target
APPDIRS=()
while IFS= read -r -d '' dir; do
  APPDIRS+=("$dir")
done < <(find "$SRC_TAURI_DIR/target" "$REPO_ROOT/target" -type d -name "*.AppDir" -print0 2>/dev/null || true)

if [ "${#APPDIRS[@]}" -eq 0 ]; then
  echo "No *.AppDir found to patch. (Did you run tauri build?)"
  exit 0
fi

# Set up temporary directory for linuxdeploy and plugins
TEMP_BIN=$(mktemp -d)
cleanup() {
  rm -rf "$TEMP_BIN"
}
trap cleanup EXIT

LINUXDEPLOY_BIN=""
if [ -d "$TAURI_CACHE_DIR" ]; then
  # Look for linuxdeploy AppImage in Tauri cache
  cached_linuxdeploy=$(find "$TAURI_CACHE_DIR" -maxdepth 1 -name "linuxdeploy-*.AppImage" -print -quit 2>/dev/null || true)
  if [ -n "$cached_linuxdeploy" ] && [ -f "$cached_linuxdeploy" ]; then
    ln -sf "$cached_linuxdeploy" "$TEMP_BIN/linuxdeploy"
    LINUXDEPLOY_BIN="$TEMP_BIN/linuxdeploy"
  fi

  # Look for linuxdeploy-plugin-appimage in Tauri cache
  cached_plugin=$(find "$TAURI_CACHE_DIR" -maxdepth 1 -name "linuxdeploy-plugin-appimage.AppImage" -print -quit 2>/dev/null || true)
  if [ -n "$cached_plugin" ] && [ -f "$cached_plugin" ]; then
    ln -sf "$cached_plugin" "$TEMP_BIN/linuxdeploy-plugin-appimage"
  fi
fi

if [ -z "$LINUXDEPLOY_BIN" ] && command -v linuxdeploy >/dev/null 2>&1; then
  LINUXDEPLOY_BIN="$(command -v linuxdeploy)"
fi

export PATH="$TEMP_BIN:$PATH"
export APPIMAGE_EXTRACT_AND_RUN=1

for appdir in "${APPDIRS[@]}"; do
  echo "Patching AppDir: $appdir"

  # 1. Copy hook into apprun-hooks/wayland-compat.sh
  mkdir -p "$appdir/apprun-hooks"
  cp "$HOOK_SRC" "$appdir/apprun-hooks/wayland-compat.sh"
  chmod +x "$appdir/apprun-hooks/wayland-compat.sh"

  # 2. Patch AppRun so it sources the new hook before executing AppRun.wrapped
  if [ -f "$appdir/AppRun.wrapped" ]; then
    if ! grep -q "wayland-compat.sh" "$appdir/AppRun"; then
      cat << 'EOF' > "$appdir/AppRun"
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "${0}")")"
if [ -f "$HERE/apprun-hooks/wayland-compat.sh" ]; then
  . "$HERE/apprun-hooks/wayland-compat.sh"
fi
exec "$HERE/AppRun.wrapped" "$@"
EOF
      chmod +x "$appdir/AppRun"
    fi
  elif [ -f "$appdir/AppRun" ]; then
    mv "$appdir/AppRun" "$appdir/AppRun.wrapped"
    cat << 'EOF' > "$appdir/AppRun"
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "${0}")")"
if [ -f "$HERE/apprun-hooks/wayland-compat.sh" ]; then
  . "$HERE/apprun-hooks/wayland-compat.sh"
fi
exec "$HERE/AppRun.wrapped" "$@"
EOF
    chmod +x "$appdir/AppRun"
  fi

  # 3. Repack the AppImage using linuxdeploy from Tauri's cache
  bundle_dir="$(dirname "$appdir")"
  appdir_name="$(basename "$appdir")"
  appimage_base="${appdir_name%.AppDir}.AppImage"
  expected_appimage="${bundle_dir}/${appimage_base}"

  echo "Repacking AppImage for $appdir_name..."
  (
    cd "$bundle_dir"
    export LDAI_OUTPUT="$appimage_base"

    # Remove existing AppImage before repacking
    [ -f "$expected_appimage" ] && rm -f "$expected_appimage"

    if [ -n "$LINUXDEPLOY_BIN" ]; then
      "$LINUXDEPLOY_BIN" --appdir "$appdir" --output appimage
    elif command -v appimagetool >/dev/null 2>&1; then
      appimagetool "$appdir" "$expected_appimage"
    elif [ -x "$TEMP_BIN/linuxdeploy-plugin-appimage" ]; then
      "$TEMP_BIN/linuxdeploy-plugin-appimage" --appdir "$appdir"
    else
      echo "Error: Could not find linuxdeploy or appimagetool to repack $appdir" >&2
      exit 1
    fi
  )

  echo "Successfully repacked AppImage at $expected_appimage"
done

echo "Wayland AppImage patching complete."
