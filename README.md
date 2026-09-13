# drawx

> Offline-first brainstorming and whiteboard app. Infinite canvas powered by
[Excalidraw](https://excalidraw.com), 
[Tauri v2](https://tauri.app) with sqlite.

[![version](https://img.shields.io/badge/version-0.7.4-black)](#)
[![tauri](https://img.shields.io/badge/tauri-v2-24C8DB?logo=tauri)](#)
[![react](https://img.shields.io/badge/react-19-61DAFB?logo=react)](#)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](#license)

**Docs:** [drawx-docs.surge.sh](https://drawx-docs.surge.sh)

---

## Features

- **Infinite canvas** — full Excalidraw editor (shapes, arrows, text, images, freedraw) with auto-save.
- **Dashboard** — create, search, rename, delete canvases. Grid and table views.
- **Libraries** — browse, save and reuse community + personal libraries. Persisted locally, with file import/export.
- **Offline-first** — SQLite via `rusqlite` (`drawx.db` in the OS config directory). No account required. Optional custom DB path.
- **Theming** — Astryx design system (`@astryxdesign/core`) with `butter` / `gothic` themes, light/dark/system modes.
- **Auto-updates** — Tauri updater wired to CrabNebula Cloud with minisign verification.
- **MCP sync** — optional local MCP server (`DEFAULT_MCP_PORT`) to sync the active canvas to external tools.
- **Cross-platform** — builds for Linux (deb/rpm/arch/AppImage), macOS, Windows (nsis/msi).

## Download

Latest stable builds are published on CrabNebula Cloud and on the docs site:

| Platform | Artifact |
|----------|----------|
| **All platforms** | [Download on surge.sh](https://drawx-docs.surge.sh) |
| Debian (x86_64) | [debian-x86_64](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/debian-x86_64) |
| RPM (x86_64) | [rpm-x86_64](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/rpm-x86_64) |
| Arch (x86_64) | [arch-x86_64](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/arch-x86_64) |
| macOS (x86_64 / aarch64) | [macos-x86_64](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/macos-x86_64) |
| Windows (nsis) | [nsis-x86_64](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/nsis-x86_64) |
| Windows (msi) | [windows-x86_64](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/windows-x86_64) |

> Tip: On Linux you can also build a Flatpak — see [Flatpak](#flatpak).

## Tech Stack

| Layer | Choice |
|-------|--------|
| Desktop shell | **Tauri v2** (Rust) |
| Frontend | **React 19**, **React Router 7**, **Vite 8**, **TypeScript 7** |
| Canvas | `@excalidraw/excalidraw` 0.18 |
| UI | `@astryxdesign/core` + Tailwind CSS 4, `radix-ui`, `lucide-react` |
| State | `zustand` |
| Storage | `rusqlite` (bundled SQLite) + file-system / dialog plugins |
| System | `cargo`, `mise`, `biome`, `oxlint`/`oxfmt` |

## Prerequisites

Managed via [`mise.toml`](./mise.toml) — run `mise install` to get the pinned toolchains:

- **Rust** `latest` + `cargo-make`, `rust-analyzer`
- **Node.js** `24` + `npm >= 11.19` (see `package.json#devEngines`)
- **Tauri CLI** `latest` (`cargo install tauri-cli` or via mise)
- **System deps (Linux)** — `webkit2gtk-4.1`, `libayatana-appindicator3`, `libgtk-3-dev`/`libwebkitgtk-6.0-dev`, `libsoup-3.0`, `build-essential`. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

Optional:

- [`surgecli`](https://github.com/yieldray/surgecli) (`go:github.com/yieldray/surgecli`) for `mise run static` docs deploy.
- `sops` + `age` if you work with encrypted `.env` (`mise run decrypt` / `encrypt`).

## Getting Started

```sh
# 1. Clone and install toolchains
git clone https://github.com/pratyay/drawx  # or your fork
cd drawx
mise install

# 2. Install JS dependencies
npm install          # or: mise run deps

# 3. Run in dev mode (Vite + Tauri)
npm run tauri:dev    # → http://localhost:1420
# or bare frontend only (no Rust, runs in browser with LocalStorage fallback):
npm run dev          # → http://localhost:1420
```

Typecheck / lint:

```sh
npm run build        # tsc + vite build
mise run lint        # biome lint
mise run format      # biome format --write
mise run check       # lint + typecheck
mise run typecheck   # tsc --noEmit
```

## Building

```sh
# Frontend only
mise run build              # tsc + vite build → dist/

# Full desktop bundle (deb/rpm/AppImage/dmg/nsis — per OS)
mise run tauri:build        # npm exec tauri build
# alias:
mise run build:tauri

# Preview the production frontend
npm run preview
```

Release artifacts are configured in [`src-tauri/tauri.conf.json`](./src-tauri/tauri.conf.json) (`bundle.targets: "all"`, updater enabled via `crabnebula.app`). Icons live in `src-tauri/icons/`.

Version is sourced from `package.json` (`0.7.3`) and mirrored in `Packager.toml` — the `autobump` workflow bumps both on pushes to `main`.

## Project Structure

```
.
├── src/                      # React frontend
│   ├── canvas/               # Excalidraw canvas page + hooks
│   │   ├── components/       # CanvasHeader
│   │   ├── hooks/            # useCanvasData, useCanvasExports, useLibraryPersistence, useMcpSync
│   │   ├── lib/canvasState.ts
│   │   └── main.tsx
│   ├── features/dashboard/   # Dashboard page
│   │   ├── components/       # CanvasGrid, CanvasTable
│   │   └── hooks/useDashboardData.ts
│   ├── components/           # sidebar, library-browser, theme-toggle, update-prompt, database-settings
│   ├── stores/               # zustand stores (canvas, dashboard, theme)
│   ├── services/             # tauri.ts, db.ts, libraries.ts, tauri ipc wrappers
│   ├── themes/               # butter / gothic Astryx themes
│   ├── hooks/use-theme.ts
│   ├── updater.ts            # CrabNebula updater check
│   ├── App.tsx               # BrowserRouter ( / → Dashboard, /canvas/:id → Canvas )
│   └── main.tsx
├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── lib.rs            # Tauri builder, plugins, invoke_handler
│   │   ├── canvas.rs         # list/create/delete/load/save/update_title
│   │   ├── db.rs             # init_db, DbState
│   │   ├── libraries.rs      # saved libraries
│   │   ├── user_library.rs   # user library
│   │   ├── config.rs         # db_config / db_info + path pickers
│   │   ├── mcp.rs            # local MCP server
│   │   ├── paths.rs / ids.rs / time.rs
│   │   └── main.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/desktop.json
├── flatpak/                  # Flatpak manifest (org.gnome.Platform 49)
│   └── io.github.drawx.yml
├── public/ / index.html
├── theme.template.ts         # Astryx defineTheme reference
├── mise.toml                 # toolchains + tasks
├── vite.config.ts
└── package.json
```

## Configuration

### Database location

By default SQLite lives in the OS config directory (`resolve_config_dir` → `drawx.db`). You can point drawx at a custom file via **Database Settings** in the UI or directly:

- `get_db_info` / `get_db_config` / `set_db_config` (Tauri commands)
- `select_local_db_path` / `create_new_db_path` (native file picker)
- Config is persisted as `db_config.json` next to the DB.

In browser-only mode (no Tauri) canvases fall back to `localStorage`.

### Themes

`src/themes/butter` and `src/themes/gothic` define Astryx themes. The active theme + mode (`light`/`dark`/`system`) is stored in `localStorage` (`drawx-theme`, `drawx-theme-mode`) and applied before React mounts (see `index.html` inline script to avoid FOUC).

### Updater

Public key and endpoints are in `tauri.conf.json` → `plugins.updater`. The frontend calls `checkForAppUpdates()` on launch (Tauri only). Secrets for signing are stored sops-encrypted in `.env.example`.

## Scripts & Tasks

`mise.toml` exposes these tasks (`mise run <task>`):

| Task | What it does |
|------|--------------|
| `dev` | `vite` dev server |
| `build` / `build:frontend` | `tsc && vite build` |
| `preview` | `vite preview` |
| `typecheck` | `tsc --noEmit` |
| `lint` / `lint:fix` / `format` | `biome` |
| `check` / `check:fix` | lint + typecheck / lint:fix + format |
| `tauri` | pass-through `tauri` CLI |
| `tauri:dev` | `tauri dev` |
| `tauri:build` / `build:tauri` | `tauri build` |
| `astryx` / `astryx:build` / `astryx:component` | Astryx CLI |
| `encrypt` / `decrypt` | `sops` encrypt/decrypt `.env` |
| `static` | `surgecli deploy docs/ drawx-docs.surge.sh` |
| `ci` / `ci:full` | `lint + build` / `lint + tauri build` |
| `clean` | remove `dist`, `src-tauri/target`, `.vite` |

NPM equivalents are in `package.json#scripts` (`dev`, `build`, `preview`, `tauri`, `lint`, `format`).

## Flatpak

Manifest: [`flatpak/io.github.drawx.yml`](./flatpak/io.github.drawx.yml) (runtime `org.gnome.Platform//49`, extensions `rust-stable` + `node24`).

```sh
# Local build (requires flatpak-builder)
flatpak-builder --user --install build-dir flatpak/io.github.drawx.yml
flatpak run io.github.drawx
```

For Flathub offline builds, vendor Cargo + pnpm sources via `cargo-sources.json` — see comments in the manifest. CI builds the Flatpak via `.github/workflows/flatpak.yaml`.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [Tauri docs](https://v2.tauri.app) · [Excalidraw docs](https://docs.excalidraw.com) · [Astryx](https://astryx.design)

## License

[Apache-2.0](./LICENSE) — Copyright Pratyay Mustafi.
