# Formulaic Portal

A field-and-branch operations portal for **valuation companies**. It gives every
role — Site Engineers, Drafters, Operators, Technical Managers, Branch Heads and
the Managing Director — a single place to run day-to-day operations.

Built with plain **HTML, CSS and JavaScript** (no build step) and backed by
**Supabase** (PostgreSQL + Auth + Realtime). It ships with a fully working
**demo mode** so you can explore every screen instantly without a backend.

---

## Features

- **Live field map** — track Site Engineers in real time on an interactive map,
  the way Swiggy/Zomato track delivery partners. Markers move live, show speed,
  battery and the job each engineer is on, and draw a recent trail.
- **CSV track replay** — drop a GPS log (`t,lat,lng`) onto the field map and
  play the route back: scrub, change speed, loop, read live position/speed, and
  inspect the parsed rows in a table.
- **Attendance** — geo-stamped check-in / check-out for every employee, plus a
  manager view of who's present, late, on leave or absent.
- **Branch expenses & expenditure** — record expenses per branch, track monthly
  budgets, and approve / reject / reimburse claims. The Managing Director can
  switch between branches; everyone else is scoped to their own branch.
- **Site visits** — create valuation jobs, assign engineers, and move jobs
  through `assigned → en route → on site → completed`.
- **Employees** — searchable team directory with roles and branches.
- **Admin login for the Managing Director** — company-wide dashboards covering
  spend, pipeline value, attendance and field-staff status across all branches.
- **Login API** — `POST /api/auth/login` signs in against demo accounts or
  Supabase; unexpected failures log `LOGIN ERROR:` and return a generic 500.
- **Role-based access** — navigation and data are scoped to each user's role.
- **Installable PWA** — Add to Home Screen on iPhone 15 Pro (standalone, splash,
  Dynamic Island safe-area insets) via `manifest.json` + `sw.js`.

## Screenshots

| Dashboard (Managing Director) | Live field map |
|---|---|
| ![Dashboard](docs/dashboard.png) | ![Live field map](docs/tracking.png) |

## Roles

| Role | Capabilities |
|------|--------------|
| **Managing Director** (admin) | Everything, across every branch — expenses, attendance, tracking, employees |
| **Branch Head** | Full access scoped to their branch |
| **Technical Manager** | Branch oversight, approves expenses & assigns visits |
| **Site Engineer** | Field staff — location tracked, marks own attendance, updates assigned visits |
| **Drafter** | Back-office: dashboard, map, visits, attendance |
| **Operator** | Back-office data entry: dashboard, map, visits, attendance, expenses |

---

## Quick start (demo mode)

Demo mode is on by default (`DEMO_MODE: true` in `js/config.js`) and runs
entirely in the browser against simulated data in `localStorage`.

```bash
npm install
npm start
#   …or without npm…
npx serve -l 5173 .
#   …or…
python3 -m http.server 5173
```

Then open <http://localhost:5173> and sign in with a demo account
(password **`demo1234`**), or click any account chip on the login screen:

| Role | Email |
|------|-------|
| Managing Director | `md@formulaic.in` |
| Branch Head | `head.mumbai@formulaic.in` |
| Technical Manager | `tech@formulaic.in` |
| Site Engineer | `imran@formulaic.in` |
| Drafter | `drafter@formulaic.in` |
| Operator | `operator@formulaic.in` |

Open **Live Field Map** as the MD or a Branch Head to watch engineers move.

Checks:

```bash
npm test              # replay, login API, and PWA contract tests (no browser needed)
npm run smoke         # headless sign-in check (requires Chrome or Edge)
npm run smoke:replay  # headless CSV replay check (requires Chrome or Edge)
```

Regenerate README screenshots:

```bash
npm run screenshots
```

---

## Login API

Sign-in is a single JSON endpoint: **`POST /api/auth/login`**. The handler is
`api/auth/login.js` — a Vercel / Next-style route with named `POST` / `GET`
exports, plus a default Node `(req, res)` handler so the same file works on a
plain static+`api/` Vercel project. It is the server counterpart of
`Auth.signIn` in `js/data.js`. A `vercel.json` with `"framework": null` keeps
Vercel from treating this as a Next.js app.

There is no Express/Fastify app behind it. On Vercel the file is mounted at
that path automatically. Locally, `npm start` is a static file server, so the
browser falls back to in-client demo (or direct Supabase) auth unless you run
`vercel dev`.

### Request

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "md@formulaic.in", "password": "demo1234" }
```

| Field | Required | Notes |
|-------|----------|--------|
| `email` | yes | Trimmed; compared case-insensitively in demo mode |
| `password` | yes | Plain text over HTTPS; never logged |

`GET /api/auth/login` returns **405** `{ "error": "Method not allowed" }`.

### Success (200)

```json
{
  "profile": {
    "id": "u-md",
    "full_name": "Aarav Mehta",
    "email": "md@formulaic.in",
    "role": "managing_director",
    "branch_id": null,
    "phone": "+91 98200 11000",
    "is_active": true
  },
  "session": null
}
```

`session` is `null` in demo mode. After a live Supabase sign-in it is:

```json
{
  "access_token": "…",
  "refresh_token": "…",
  "expires_in": 3600,
  "token_type": "bearer"
}
```

The profile is a public subset of `public.profiles` — no password or auth
metadata. If Supabase Auth succeeds but the profile row is missing (the
`handle_new_user` trigger has not run yet), the handler synthesizes one from
the JWT (`role` defaults to `operator`).

### Errors

| Status | When | Body |
|--------|------|------|
| **400** | Missing/blank `email` or `password` | `{ "error": "Email and password are required." }` |
| **401** | Unknown email (demo) | `{ "error": "No account found for that email." }` |
| **401** | Wrong password (demo) | `{ "error": "Incorrect password. (Demo password: demo1234)" }` |
| **401** | Supabase rejected the credentials | `{ "error": "<supabase message>" }` |
| **405** | `GET` or any non-POST | `{ "error": "Method not allowed" }` |
| **500** | Thrown exception, invalid JSON, network failure talking to Supabase | `{ "error": "Internal server error" }` |

**500s never leak the cause.** The `catch` logs the real exception and returns
a generic payload:

```js
} catch (error) {
  console.error("LOGIN ERROR:", error);
  return Response.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}
```

Look for `LOGIN ERROR:` in the function logs when debugging a 500.

### Demo vs Supabase

The handler picks a backend from environment variables (either name works):

| Variable | Also accepted as | Purpose |
|----------|------------------|---------|
| `SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` | Project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon public key (the function calls Auth with it server-side) |

- **Both unset** — demo mode. Same accounts and password (`demo1234`) as the
  login-screen chips. Source of truth is `DEMO_PROFILES` / `DEMO_PASSWORD` in
  `js/mock.js`.
- **Both set** — live mode. `POST {url}/auth/v1/token?grant_type=password`,
  then `GET {url}/rest/v1/profiles?id=eq.{user.id}`.

Setting only one of the two is treated as demo (both are required).

### How the browser uses it

`Auth.signIn` in `js/data.js` tries the API first:

1. `POST /api/auth/login` with `{ email, password }`.
2. If the response is JSON, that result is used (success → store the profile;
   4xx/5xx → show `error` on the login form).
3. If the path is missing (static `serve` returns HTML 404) or `fetch` throws
   a `TypeError` (no network / CORS), it falls back:
   - demo: match `Mock.db().profiles` + `localStorage` session
   - live: `supabase.auth.signInWithPassword` from `js/config.js`

So `npm start` keeps working without Vercel, and a Vercel deploy (or
`vercel dev`) automatically starts using the route.

### Try it

With the function running (`vercel dev`, or any host that mounts `api/`):

```bash
# happy path
curl -sS -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"md@formulaic.in","password":"demo1234"}'

# 401
curl -sS -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"md@formulaic.in","password":"nope"}'

# 400
curl -sS -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"md@formulaic.in"}'

# 500 — invalid JSON is caught and logged as LOGIN ERROR:
curl -sS -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{not-json'
```

Automated coverage is in `scripts/test-login.mjs` (run via `npm test`): demo
sign-in, case-insensitive email, 400/401/405, the 500 catch (invalid JSON and
a thrown Supabase `fetch`), a mocked live Supabase exchange, and a real
`POST http://127.0.0.1:<port>/api/auth/login` over Node's HTTP server.

## Going live with Supabase

1. Create a project at <https://supabase.com>.
2. In the SQL editor, run, in order:
   - `supabase/schema.sql` — tables, types, triggers, realtime publication
   - `supabase/policies.sql` — Row Level Security
   - `supabase/seed.sql` — branches + sample valuation jobs
3. Create users in **Authentication → Users** (or let them sign up). A matching
   row in `public.profiles` is created automatically by a trigger. Then set each
   user's `role` and `branch_id` using the `UPDATE` examples at the bottom of
   `seed.sql`.
4. In `js/config.js`, paste your **Project URL** and **anon public key**, and set
   `DEMO_MODE: false`.
5. On the host that serves `api/auth/login.js`, set `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` (see [Login API](#login-api)) so the function talks to
   the same project. Without those, the route stays on demo accounts.
6. Serve the files as above. The app now reads/writes Supabase and subscribes to
   realtime location updates. The login form uses `POST /api/auth/login` when
   that path is mounted, and falls back to the Supabase JS client otherwise.

## Replaying a GPS track from CSV

**Live Field Map → Track replay** plays a recorded GPS log over the map, next to
the live engineers. Pick one of the bundled samples or **Load CSV…** to open a
file from your computer.

Expected shape — elapsed seconds plus coordinates:

```csv
t,lat,lng
0.0,28.472800,77.508900
3.0,28.473100,77.509000
6.0,28.473400,77.509100
```

The parser is deliberately forgiving:

- Column names may be `t` / `time` / `timestamp`, `lat` / `latitude`, `lng` / `lon` / `longitude`
- Time may be elapsed seconds, `HH:MM:SS`, or an ISO timestamp (rebased to zero)
- Comma, semicolon, tab or pipe separated; `#` comments and blank lines ignored
- Headerless files are read as `t,lat,lng` (or `lat,lng`)
- Unreadable rows are skipped and reported instead of failing the whole file

While a track is loaded you can play/pause, scrub, run at 0.5×–16×, loop, fit
the map to the route, open the parsed rows in a **Data** table, and **download**
the CSV back to your computer. The position, speed and distance covered are
interpolated between fixes, so playback stays smooth on sparse logs.

Bundled samples live in `sample/`.

### How live tracking works in production

Site Engineers open **Live Field Map** and tap **Share my location**. The browser
streams GPS fixes (`navigator.geolocation.watchPosition`) which are inserted into
the `locations` table. A trigger keeps `live_positions` in sync, and Supabase
Realtime pushes those rows to managers' maps. (For background tracking, point a
mobile app or a lightweight device agent at the same `locations` table.)

---

## Project structure

```
index.html              App shell + CDN includes (Leaflet, Supabase)
css/styles.css          Design system
js/
  config.js             Supabase credentials + demo toggle
  app.js                Bootstrap + hash router
  data.js               Data layer (Supabase  ⇄  demo fallback)
  mock.js               In-browser demo backend + live movement simulator
  replay.js             CSV track parsing, geometry + playback clock
  roles.js              Roles, permissions, status helpers
  layout.js             Sidebar + topbar shell
  ui.js                 Reusable UI (modal, stat cards, charts)
  util.js               DOM/format helpers + icon set
  views/                dashboard · tracking · attendance · expenses ·
                        employees · visits · profile · login
supabase/
  schema.sql            Tables, enums, triggers, realtime
  policies.sql          Row Level Security
  seed.sql              Branches + demo jobs
sample/                 Example GPS logs for track replay
scripts/                Smoke tests, replay / login / PWA tests, screenshot capture
api/auth/login.js       POST /api/auth/login — demo or Supabase, safe 500 catch
manifest.json           Web app manifest (standalone PWA)
sw.js                   Service worker — caches the app shell, skips /api/
icons/                  Home-screen icons + iPhone 15 Pro splash screens
```

## Install on iPhone 15 Pro

The portal is a PWA. `manifest.json` uses the same keys as a basic installable
app (`name`, `short_name`, `start_url`, `display: standalone`) plus icons,
theme colors, and a maskable 512 icon. There is **no trailing comma** — iOS
rejects invalid JSON and the app will not install.

1. Open the site in **Safari** (not an in-app browser).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch **Formulaic** from the home screen. It opens full-screen
   (`display: standalone`) with the iPhone 15 Pro splash
   (`1179×2556` portrait / `2556×1179` landscape) and a black-translucent
   status bar that clears the Dynamic Island (`viewport-fit=cover` +
   `env(safe-area-inset-*)`).

`sw.js` caches the app shell so the last-used screens still load offline.
`POST /api/auth/login` is never cached.

## Tech

- Vanilla JS (ES modules), HTML, CSS — no build tooling required
- [Leaflet](https://leafletjs.com/) + OpenStreetMap tiles for the map
- [Supabase](https://supabase.com/) for database, auth and realtime
- Data exchanged as JSON throughout

## License

MIT
