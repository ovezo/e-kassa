# iKassir

Desktop POS for a coffee shop reception: **Electron** + **Next.js** (normal server: `next dev` / `next start`) + **SQLite** via **Prisma**. See [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md) for the full product and technical specification.

## Prerequisites

- Node.js 20+
- npm

## First-time setup

1. Copy environment for Prisma (SQLite file lives next to `prisma/schema.prisma`):

   ```bash
   cp .env.example .env
   ```

2. Install dependencies and generate the Prisma client:

   ```bash
   npm install
   ```

3. Create the local database (single initial migration):

   ```bash
   npm run db:reset
   ```

   Use `npm run db:migrate` only when you change `prisma/schema.prisma` during development.

## Development

### Electron window does not appear

1. In the terminal you should see **two** labeled streams: `[next]` and `[electron]`. Look for `[iKassir] Starting Electron…` then logs from `electron/main.ts` (`[iKassir] Electron main loaded…`).
2. On **macOS**, check the **Dock** and **Cmd+Tab** for **Electron** — the window sometimes opens behind other apps. We call `app.focus({ steal: true })` on ready to reduce that.
3. If `[electron]` shows an error or exits immediately, run **two terminals** so logs are obvious:
   - Terminal A: `npm run dev:web` (or `cross-env NODE_ENV=development next dev`)
   - Terminal B: `npm run dev:electron`  
   That uses the same `NODE_ENV=development` so Electron loads **http://127.0.0.1:3000** instead of trying to spawn `next start`.

### Browser only (Chrome / Safari — easiest for UI debugging)

Runs Next on port 3000. Auth and DB go through the **dev-only** HTTP bridge at [`/api/ipc`](src/app/api/ipc/route.ts) (same SQLite as Electron when you use the same machine and `.env`).

```bash
npm run dev:web
```

Open **http://127.0.0.1:3000** (or the URL printed in the terminal). Use Chrome DevTools as for any React app.

### Electron + Next (full desktop shell with IPC)

```bash
npm run dev
```

- Starts **Next dev** on port 3000 and opens **Electron** pointed at that URL.
- First launch: **setup** wizard for the admin user. Then **login**.

In this mode you can debug:

- **Renderer (React):** Electron **View → Toggle Developer Tools** (or the window opens with devtools in development).
- **Main process:** attach a debugger to the Electron main process, or add `console.log` in `electron/` and watch the terminal where you ran `npm run dev`.

### Why there were two paths (IPC vs browser)

Originally only `window.ikassir.invoke` (preload) talked to SQLite in the **Electron main** process. Browsers have no preload, so calls failed. In **development**, if preload is missing, the UI now **POSTs to `/api/ipc`** and Next runs the same auth logic against Prisma. That route returns **403 in production** so it is not a public API in shipped builds.

## Production build (local)

```bash
npm run build
```

Runs **`next build`** (creates `.next/`) and compiles Electron to `dist-electron/`.

Running **Electron without** `NODE_ENV=development` (e.g. after a build) will **spawn `next start`** on a random loopback port and load the UI there — same routing model as in the browser.

## Windows installer

Build on a machine with **Node.js 20+** and npm. Run migrations once in the project before packaging:

```bash
npm install
npm run db:migrate
npm run dist:win
```

Output:

- **Installer (Windows 10/11, Intel/AMD):** `release/iKassir-Setup-0.1.0.exe` (NSIS `.exe`, 64-bit x64)
- **Unpacked (testing):** `npm run dist:win:dir` → `release/win-unpacked/`

The installed app stores its SQLite database under the user profile (e.g. `%APPDATA%\iKassir\ikassir.db`). On first launch, bundled Prisma migrations are applied automatically.

If you see **Cannot find module '.prisma/client/default'** after an older build, reinstall from a fresh `npm run dist:win` build (the installer bundles the Prisma client explicitly).

### Blank window or app won’t open again (Windows)

The UI is served by a small **Next.js server** in `resources/next-standalone/` (not inside `app.asar`). If an old build left **iKassir** running in Task Manager, end that task, then start again.

If the app exits immediately, open the log file (the error dialog shows the path), usually:

`%APPDATA%\iKassir\ikassir.log` (folder name is **iKassir** with capital K — same as `Roaming\ikassir` on Windows)

### `dev.db` inside `resources\prisma` (installed app)

That file must **not** be there — it is only for development. The installed app uses:

- **Your data:** `%APPDATA%\iKassir\ikassir.db`
- **First-run template:** `resources\ikassir-template.db` (not `dev.db`)

If you see `dev.db` under `resources\prisma`, you are on an **old installer**. Rebuild with the latest code: `npm run prepare:pack` then `npm run dist:win`. New builds copy only `schema.prisma` + `migrations` into `resources\prisma` (no `.db` files).

### `no such table: Product` (SQLite)

Usually an **old database file** is still present from a previous schema, or `npm run db:migrate` was run on `prisma/dev.db` while the **installed app** uses `%APPDATA%\iKassir\ikassir.db`.

**Installed app (Windows):** uninstall is not required — quit iKassir, delete:

`%APPDATA%\iKassir\ikassir.db`

Then start iKassir again (a fresh DB is created from the bundled template).

**Development (project folder):**

```bash
npm run db:reset
```

Then `npm run dist:win` again so the installer includes an up-to-date template database.

### Build Windows installer from macOS

Cross-building often works:

```bash
npm run dist:win
```

If NSIS fails, build on a Windows PC or use `npm run dist:win:dir` and zip `release/win-unpacked` for portable use.

### Optional icon

Add `build/icon.ico` (256×256) before `dist:win` for a custom installer and app icon.

## Packaged app (macOS)

```bash
npm run dist:dir    # unpacked app in release/
npm run dist        # macOS dmg/zip (on macOS)
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Next dev + Electron |
| `npm run dev:web` | Next dev only (browser debugging) |
| `npm run build` | `next build` + compile Electron |
| `npm run start` | `next start` (production Next server) |
| `npm run db:migrate` | Prisma migrate |
| `npm run db:studio` | Prisma Studio |
| `npm run lint` | ESLint |
| `npm run clean` | Remove `.next`, `out`, `dist-electron` |
| `npm run dist:win` | Windows NSIS installer (`release/iKassir-Setup-*.exe`) |
| `npm run dist:win:dir` | Unpacked Windows app (`release/win-unpacked/`) |

## Project layout

- `electron/` — main process, preload, IPC, Prisma from Electron
- `src/app/` — Next.js App Router UI + `api/ipc` dev bridge
- `prisma/` — schema and migrations

## Order route note

The order workspace uses **`/pos/order/?id=`** so we do not rely on unknown dynamic segments at prerender time. With a full server build you could move to `/pos/order/[id]` later if desired.

## Troubleshooting `Cannot find module './NNN.js'` or webpack cache ENOENT

The Next dev cache under `.next/` can get out of sync. Fix:

```bash
npm run clean
npm run dev:web
```

If `/sw.js` spam appears in logs, unregister stale service workers for `http://127.0.0.1:3000` (Chrome → Application → Service Workers). A minimal [`public/sw.js`](public/sw.js) is included to reduce noise.
