# Relay

A local-first API client for macOS, built with Electron. Every run is stored on disk as plain JSON — nothing leaves your machine.

Implemented from the claude.ai/design mock **Relay Runbook** (design project `3e859c1b`).

## Features

- **Runbook** — collection sidebar, editable request name, method + URL bar with `${variable}` highlighting, Body/Headers/Auth/Scripts tabs, real HTTP execution from the main process (no CORS), response pane with status, timing, size, Save-example and a Retry button on failed runs.
- **Copy as code** — cURL, Node.js (fetch) or Python (requests) snippets for any request (sent or not), resolved against the active environment. Paste a cURL command into the URL bar and it's parsed into method, URL, headers, auth and body.
- **Run history & diff** — every send is appended to an on-disk run log; the right panel diffs any older run against the current response (`same / ~ changed / + added / − removed`).
- **History page** — all runs grouped by day with status/method filters and a read-only request/response snapshot; "Open in Runbook" jumps back to the request.
- **Environments & variables** — Postman-style `{{baseUrl}}` / `{{token}}` variables (legacy `${var}` still resolves), edited in a dedicated Environments editor (env pill → "Edit variables…", or `⌘E`): add/remove environments and variables, set the active one. **Collection variables** too (right-click a collection → Edit variables) — they apply to every request in the collection, and environment variables override them on name collision, same precedence as Postman. Post-response scripts (`vars.set("chargeId", res.json.id)`, `assert(res.status === 201)`) run sandboxed in the main process and write variables back into the active environment. Dynamic `{{$uuid}}` / `{{$timestamp}}` resolve fresh at send time (used for `Idempotency-Key`).
- **Collections CRUD** — create collections (+ in the sidebar header), folders and requests (hover + buttons, `⌘N`, or right-click). Right-click context menus everywhere: collections (Add request / Add folder / Rename / Duplicate / Export / Delete), folders (Add request / Add folder / Rename / Duplicate / Delete), requests (Send / Copy as cURL / Rename / Duplicate / Delete). Double-click renames inline.
- **Explicit saves, Postman-style** — edits to a request live in an unsaved draft (orange dot in the title row and sidebar) with **Save (`⌘S`)** / **Discard** buttons; nothing touches disk until you save. Send always uses what you see, saved or not.
- **Export / import** — bundle collections, environments and (optionally) run history into one plain-JSON `.relay` file; import it on any machine, no account needed.
- **Variable autocomplete** — type `{{` in the URL bar, a header value, or the body editor and a scrollable dropdown lists every available variable (collection + environment + dynamic `$uuid`/`$timestamp`) with live value previews; filter as you type, arrows + Enter/Tab to insert.
- **Profiles** — multiple isolated local workspaces (own collections, environments, history), stored under `profiles/` in the app data folder. Create/switch/delete from the profile chip menu; pre-profile data migrates automatically on first launch.
- **Theming** — light/dark plus four accent colors, all from the design token sheet. Fonts (IBM Plex Sans, JetBrains Mono) are bundled — fully offline.

## Data on disk

Everything lives under `~/Library/Application Support/Relay/` as human-readable JSON:

```
settings.json                      global: theme, accent, panel state, body-size limit
profiles.json                      profile registry + active profile
profiles/<id>/workspace.json       per-profile workspace meta + active environment
profiles/<id>/environments.json    environments and their variables
profiles/<id>/collections/<id>.json one file per collection (incl. collection variables)
profiles/<id>/runs/YYYY-MM-DD.jsonl append-only run log, one JSON run per line
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

Keyboard: `⌘↩` send · `⌘S` save changes · `⌘N` new request · `⌘P` search · `⌘E` environments · `⌘,` preferences · `⌘/` shortcuts · `Esc` close.
