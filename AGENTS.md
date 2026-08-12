# Drawx — Development Guide

Drawx is a desktop app built with **Wails v3** (Go backend) and a
**React + Vite + TypeScript** frontend living in `frontend/`.

## Toolchain

- Tooling (Go, Node, pnpm, biome, bun, deno) is managed by **mise** — run
  `mise install` after pulling changes.
- The Wails CLI (`wails3`) is installed separately (pinned to the version in
  `go.mod`):
  `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.5`.

## Commands

- `wails3 dev` — run the app with Vite hot reload.
- `wails3 build` / `wails3 package` — build / package binaries.
- `cd frontend && pnpm dev` — run the frontend alone against a Vite dev server.
- `cd frontend && pnpm lint` / `pnpm typecheck` / `pnpm build` — frontend checks.
- `go test ./internal/store` — backend unit tests.

## Conventions

- Keep the Wails layer thin: all persistence lives in `internal/store`
  (pure Go, no Wails imports) so it stays unit-testable.
- `AppService` in `app.go` is the only thing bound to the frontend. After
  changing its methods, regenerate bindings:
  `wails3 generate bindings -clean=true`.
- Frontend services (under `frontend/src/services/`) are the only code that
  imports from `frontend/bindings/`.
