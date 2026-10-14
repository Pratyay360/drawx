#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC_TAURI_DIR="$REPO_ROOT/src-tauri"
TAURI_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/tauri"

# Clean up temp files on exit
TEMP_BIN=$(mktemp -d)
TEMP_EXTRACT=""
cleanup() {
  rm -rf "$TEMP_BIN"
  if [ -n "$TEMP_EXTRACT" ] && [ -d "$TEMP_EXTRACT" ]; then
    rm -rf "$TEMP_EXTRACT"
  fi
}
trap cleanup EXIT

# 1. Resolve linuxdeploy and appimage tools
LINUXDEPLOY_BIN=""
if [ -d "$TAURI_CACHE_DIR" ]; then
  cached_linuxdeploy=$(find "$TAURI_CACHE_DIR" -maxdepth 1 -name "linuxdeploy-*.AppImage" -print -quit 2>/dev/null || true)
  if [ -n "$cached_linuxdeploy" ] && [ -f "$cached_linuxdeploy" ]; then
    ln -sf "$cached_linuxdeploy" "$TEMP_BIN/linuxdeploy"
    LINUXDEPLOY_BIN="$TEMP_BIN/linuxdeploy"
  fi

  cached_appimagetool=$(find "$TAURI_CACHE_DIR" -maxdepth 1 -name "appimagetool-*.AppImage" -print -quit 2>/dev/null || true)
  if [ -n "$cached_appimagetool" ] && [ -f "$cached_appimagetool" ]; then
    ln -sf "$cached_appimagetool" "$TEMP_BIN/appimagetool"
  fi
fi

APPIMAGETOOL_BIN=""
if command -v appimagetool >/dev/null 2>&1; then
  APPIMAGETOOL_BIN="$(command -v appimagetool)"
elif [ -x "$TEMP_BIN/appimagetool" ]; then
  APPIMAGETOOL_BIN="$TEMP_BIN/appimagetool"
fi

if [ -z "$LINUXDEPLOY_BIN" ] && command -v linuxdeploy >/dev/null 2>&1; then
  LINUXDEPLOY_BIN="$(command -v linuxdeploy)"
fi

export PATH="$TEMP_BIN:$PATH"
export APPIMAGE_EXTRACT_AND_RUN=1

# 2. Patch an AppDir in-place
patch_appdir() {
  local appdir="$1"
  echo "Patching AppDir: $appdir"

  # 1. Write self-contained Wayland compatibility hook
  mkdir -p "$appdir/apprun-hooks"
  cat << 'EOF' > "$appdir/apprun-hooks/wayland-compat.sh"
export DESKTOPINTEGRATION=1

if [ -z "${LD_PRELOAD:-}" ]; then
  for lib in \
    /usr/lib/libwayland-client.so \
    /usr/lib64/libwayland-client.so \
    /usr/lib/x86_64-linux-gnu/libwayland-client.so \
    /usr/lib/aarch64-linux-gnu/libwayland-client.so \
    /usr/lib/arm-linux-gnueabihf/libwayland-client.so; do
    if [ -f "$lib" ]; then
      export LD_PRELOAD="$lib"
      break
    fi
  done
fi
EOF
  chmod +x "$appdir/apprun-hooks/wayland-compat.sh"
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
  mkdir -p "$appdir/usr/share/metainfo"
  if [ -f "$REPO_ROOT/flatpak/io.github.pratyay360.drawx.metainfo.xml" ]; then
    cp -f "$REPO_ROOT/flatpak/io.github.pratyay360.drawx.metainfo.xml" "$appdir/usr/share/metainfo/io.github.pratyay360.drawx.metainfo.xml"
  fi
}

repack_appdir() {
  local appdir="$1"
  local expected_appimage="$2"
  local bundle_dir
  bundle_dir="$(dirname "$expected_appimage")"
  local appimage_base
  appimage_base="$(basename "$expected_appimage")"

  echo "Repacking AppImage into $expected_appimage..."
  (
    cd "$bundle_dir"
    export LDAI_OUTPUT="$appimage_base"
    export LDAI_UPDATE_INFORMATION="${LDAI_UPDATE_INFORMATION:-gh-releases-zsync|pratyay360|drawx|latest|*amd64*.AppImage.zsync}"

    # Remove existing AppImage before repacking
    [ -f "$expected_appimage" ] && rm -f "$expected_appimage"

    if [ -n "$APPIMAGETOOL_BIN" ]; then
      "$APPIMAGETOOL_BIN" -u "$LDAI_UPDATE_INFORMATION" "$appdir" "$expected_appimage"
    elif [ -n "$LINUXDEPLOY_BIN" ]; then
      "$LINUXDEPLOY_BIN" --appdir "$appdir" --output appimage
    elif [ -x "$TEMP_BIN/linuxdeploy-plugin-appimage" ]; then
      "$TEMP_BIN/linuxdeploy-plugin-appimage" --appdir "$appdir"
    else
      echo "Error: Could not find appimagetool or linuxdeploy to repack $appdir" >&2
      exit 1
    fi

    # Generate zsync file if zsyncmake is available
    if command -v zsyncmake >/dev/null 2>&1; then
      echo "Generating zsync file for $expected_appimage..."
      zsyncmake -u "$appimage_base" -o "${expected_appimage}.zsync" "$expected_appimage"
    fi
  )

  echo "Successfully repacked AppImage at $expected_appimage"
}

# 4. Process targets
if [ "${1:-}" != "" ]; then
  TARGET_PATH="$(readlink -f "$1")"
  if [ -d "$TARGET_PATH" ]; then
    patch_appdir "$TARGET_PATH"
    bundle_dir="$(dirname "$TARGET_PATH")"
    appdir_name="$(basename "$TARGET_PATH")"
    expected_appimage="${bundle_dir}/${appdir_name%.AppDir}.AppImage"
    repack_appdir "$TARGET_PATH" "$expected_appimage"
  elif [ -f "$TARGET_PATH" ]; then
    TEMP_EXTRACT=$(mktemp -d)
    echo "Extracting AppImage: $TARGET_PATH"
    (cd "$TEMP_EXTRACT" && "$TARGET_PATH" --appimage-extract >/dev/null)
    EXTRACTED_APPDIR="$TEMP_EXTRACT/squashfs-root"
    patch_appdir "$EXTRACTED_APPDIR"
    repack_appdir "$EXTRACTED_APPDIR" "$TARGET_PATH"
  else
    echo "Error: Target path not found: $TARGET_PATH" >&2
    exit 1
  fi
else
  APPDIRS=()
  while IFS= read -r -d '' dir; do
    APPDIRS+=("$dir")
  done < <(find "$SRC_TAURI_DIR/target" "$REPO_ROOT/target" -type d -name "*.AppDir" -print0 2>/dev/null || true)

  if [ "${#APPDIRS[@]}" -eq 0 ]; then
    echo "No *.AppDir found to patch. (Did you run tauri build?)"
    exit 0
  fi

  for appdir in "${APPDIRS[@]}"; do
    patch_appdir "$appdir"
    bundle_dir="$(dirname "$appdir")"
    appdir_name="$(basename "$appdir")"
    expected_appimage="${bundle_dir}/${appdir_name%.AppDir}.AppImage"
    repack_appdir "$appdir" "$expected_appimage"
  done
fi

echo "Wayland AppImage patching complete."
