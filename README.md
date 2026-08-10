# Drawx

Offline-first brainstorming app built with **Wails v3** (Go), **React**, **Vite** and **SQLite**.

The Go backend exposes an `AppService` to the frontend via auto-generated
bindings (`frontend/bindings/drawx`); drawings and community libraries are
persisted in a local SQLite database (`drawx.db` in the per-user config
directory).

## Prerequisites

- **Go 1.24+** — installed via mise (see [`mise.toml`](./mise.toml))
- **Node.js 24 + pnpm** — installed via mise
- **Wails v3 CLI** (`wails3`)
- Platform dependencies for Wails (Linux: `libgtk-4-dev`, `libwebkitgtk-6.0-dev`,
  `libsoup-3.0-dev`, `build-essential`; see the official Wails installation docs)

### Installing the Wails CLI

```sh
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.5
```

> Pin the CLI to the same version as `go.mod` — Wails v3 is pre-release, so
> `@latest` won't resolve until a stable v3 is tagged.

Then make sure `$(go env GOPATH)/bin` is on your `PATH`.

## Development

```sh
mise install                # installs Go, Node, pnpm, etc. from mise.toml
wails3 dev                  # builds the Go backend, starts Vite with hot reload
```

## Building

```sh
wails3 build           # builds the Linux binary into bin/
wails3 package         # produces installers (AppImage/deb/rpm)
```

You can also run the frontend on its own (useful while iterating on UI):

```sh
cd frontend
pnpm install
pnpm dev                    # http://127.0.0.1:9245
```

## Project layout

```
main.go                     # Wails app entry point
app.go                      # AppService bound to the frontend
internal/store/             # SQLite persistence (pure Go, unit-tested)
frontend/                   # React + Vite + TypeScript frontend
  bindings/drawx/           # generated Wails bindings (regenerate with wails3)
build/                      # wails3 build config
```

## Regenerating bindings

After changing methods on `AppService`, regenerate the TypeScript bindings:

```sh
wails3 generate bindings -clean=true
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) with the Go extension
- [Wails documentation](https://v3.wails.io)
