# Relay

A local-first API client for macOS, built with Electron. Every run is stored on disk as plain JSON — nothing leaves your machine.

Implemented from the claude.ai/design mock **Relay Runbook** (design project `3e859c1b`).

## Features

- **Runbook** — collection sidebar, method + URL bar with `${variable}` highlighting, Body/Headers/Auth/Scripts tabs, real HTTP execution from the main process (no CORS), response pane with status, timing, size, Copy-as-cURL and Save-example.
- **Run history & diff** — every send is appended to an on-disk run log; the right panel diffs any older run against the current response (`same / ~ changed / + added / − removed`).
- **History page** — all runs grouped by day with status/method filters and a read-only request/response snapshot; "Open in Runbook" jumps back to the request.
- **Environments** — Staging / Production / Local with `baseUrl`, `token`, etc. Post-response scripts (`vars.set("chargeId", res.json.id)`, `assert(res.status === 201)`) run sandboxed in the main process and write variables back into the active environment. Dynamic `${$uuid}` / `${$timestamp}` resolve fresh at send time (used for `Idempotency-Key`).
- **Export / import** — bundle collections, environments and (optionally) run history into one plain-JSON `.relay` file; import it on any machine, no account needed.
- **Theming** — light/dark plus four accent colors, all from the design token sheet. Fonts (IBM Plex Sans, JetBrains Mono) are bundled — fully offline.

## Data on disk

Everything lives under `~/Library/Application Support/Relay/` as human-readable JSON:

```
workspace.json        workspace meta + active environment
settings.json         theme, accent, panel state, body-size limit
environments.json     environments and their variables
collections/<id>.json one file per collection
runs/YYYY-MM-DD.jsonl append-only run log, one JSON run per line
```

`cat runs/2026-07-16.jsonl | jq .` works. Corrupt files are quarantined (`*.corrupt-<ts>`), never deleted. Writes are atomic (temp file + rename).

## Develop

```bash
npm install
npm run dev        # electron-vite dev with HMR
npm run typecheck  # renderer + main tsconfigs
npm run build      # bundle main/preload/renderer to out/
npm run dist       # build + package (dmg + zip in dist/)
```

Note: unset `ELECTRON_RUN_AS_NODE` before launching Electron from tooling that sets it.

## Architecture

- `src/main` — window (hiddenInset titlebar, sandboxed renderer), all fs/HTTP/dialog work, `node:vm` script runner, per-day JSONL run log.
- `src/preload` — `window.relay`, a thin typed `contextBridge` facade over `ipcRenderer.invoke`.
- `src/renderer` — React + zustand; hand-rolled JSON editor (transparent textarea over highlighted `<pre>`), tokenizer shared by editor/viewer/diff, line diff via `diff` + changed-row pairing.
- `src/shared` — types, IPC channel names, `${var}` interpolation and cURL generation used by both processes so preview and send can't drift.

Keyboard: `⌘↩` send · `⌘P` search · `⌘,` preferences · `⌘/` shortcuts · `Esc` close.
