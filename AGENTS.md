# AGENTS.md

## Cursor Cloud specific instructions

### Product

**Formulaic Portal** — vanilla HTML/CSS/ES-module SPA for valuation-company field operations (dashboard, live engineer map, visits, attendance, expenses, employees). Default **demo mode** (`DEMO_MODE: true` in `js/config.js`) uses in-browser mock data; no local Supabase or Docker.

### Services

| Service | Port | Required for dev |
|---------|------|------------------|
| Static HTTP server | 5173 | Yes (ES modules need `http://`) |

There is no separate API process in-repo. Live Supabase is optional and configured only in `js/config.js`.

### Commands

See `README.md` and `package.json` for standard commands:

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm start` (`npx serve -l 5173 .`) or `npm run dev` (`python3 -m http.server 5173`) |
| Tests | `npm test` — **start the server first**; does not auto-start it |
| Lint / build | None configured |

### Non-obvious caveats

- **`npm test` requires Chrome** at `/usr/bin/google-chrome-stable` (used by `puppeteer-core` in `smoke-test.mjs`). The smoke test takes ~20–30s due to map simulation waits.
- **Network**: Demo mode still loads Leaflet from unpkg and map tiles from CARTO/OSM; smoke tests need outbound network for those CDNs.
- **Port 5173**: If something else binds 5173, change the port in both your server command and `smoke-test.mjs` (`BASE` constant), or stop the conflicting process.
- **Tmux**: For a long-running dev server in Cloud Agent VMs, use a named tmux session (e.g. `formulaic-portal-dev`) with `npm start` in `/workspace`.
