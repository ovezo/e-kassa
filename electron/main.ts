import "./db/setup-prisma";
import fs from "fs";
import net, { type AddressInfo } from "net";
import http from "http";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { app, BrowserWindow } from "electron";
import { PRODUCT_IMAGES_DEV_POINTER_FILENAME } from "../src/lib/server/product-images";
import { ensureDatabase } from "./db/bootstrap";
import { getPrisma, disconnectPrisma } from "./db/prisma";
import { registerIpcHandlers } from "./ipc/register";

function appRoot(): string {
  return app.isPackaged ? app.getAppPath() : process.cwd();
}

function nextStandaloneDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "next-standalone");
  }
  return path.join(process.cwd(), ".next", "standalone");
}

/** `next dev` — Next is already running on 3000 (see npm script: both must use NODE_ENV=development). */
const isNextDevSession = process.env.NODE_ENV === "development";

console.error("[iKassir] Electron main loaded. NODE_ENV=%s → %s", process.env.NODE_ENV ?? "(unset)", isNextDevSession ? "load http://127.0.0.1:3000 (next dev)" : "spawn Next standalone server (production)");

let nextChild: ChildProcess | null = null;
let nextProdBaseUrl: string | null = null;
let mainWindow: BrowserWindow | null = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

function killNextChild(): void {
  const child = nextChild;
  if (!child || child.killed) {
    nextChild = null;
    nextProdBaseUrl = null;
    return;
  }
  const pid = child.pid;
  if (process.platform === "win32" && pid) {
    spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore", windowsHide: true });
  } else {
    child.kill("SIGTERM");
  }
  nextChild = null;
  nextProdBaseUrl = null;
}

function resolveDbPath(): string {
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), "ikassir.db");
  }
  return path.join(appRoot(), "prisma", "dev.db");
}

/** Writable product photos — always under Electron `userData` (dev + prod) so IPC and Next match shipped behavior. */
function resolveProductImagesDir(): string {
  return path.join(app.getPath("userData"), "product-images");
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      s.close(() => {
        if (!addr || typeof addr === "string") {
          reject(new Error("Could not allocate port"));
        } else {
          resolve((addr as AddressInfo).port);
        }
      });
    });
    s.on("error", reject);
  });
}

function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Timeout waiting for ${url}`));
        return;
      }
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          setTimeout(tryOnce, 200);
        }
      });
      req.on("error", () => setTimeout(tryOnce, 200));
    };
    tryOnce();
  });
}

function pipeNextLogs(child: ChildProcess): void {
  const tag = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.trim()) console.error("[iKassir][next]", line);
    }
  };
  child.stdout?.on("data", tag);
  child.stderr?.on("data", tag);
}

async function ensureRendererBaseUrl(): Promise<string> {
  if (isNextDevSession) {
    return "http://127.0.0.1:3000";
  }

  if (nextProdBaseUrl) {
    return nextProdBaseUrl;
  }

  const port = await getFreePort();
  const serverDir = nextStandaloneDir();
  const serverJs = path.join(serverDir, "server.js");

  if (!fs.existsSync(serverJs)) {
    throw new Error(
      `Next standalone server missing at ${serverJs}. Rebuild with npm run dist:win.`,
    );
  }

  const imagesRoot =
    process.env.IKASSIR_PRODUCT_IMAGES_ROOT?.trim() ||
    path.join(app.getPath("userData"), "product-images");

  console.error("[iKassir] Starting Next standalone: %s (port %s)", serverJs, port);

  nextChild = spawn(process.execPath, [serverJs], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      IKASSIR_PRODUCT_IMAGES_ROOT: imagesRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  pipeNextLogs(nextChild);

  nextChild.on("error", (err) => {
    console.error("[iKassir] Next server failed to spawn:", err);
  });

  nextChild.on("exit", (code, signal) => {
    console.error("[iKassir] Next server exited (code=%s signal=%s)", code, signal);
    nextChild = null;
    nextProdBaseUrl = null;
  });

  const base = `http://127.0.0.1:${port}`;
  await waitForHttpOk(`${base}/`, 90_000);
  nextProdBaseUrl = base;
  return base;
}

async function createMainWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "iKassir",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.on("did-fail-load", (_ev, code, desc, url) => {
    console.error("[iKassir] did-fail-load code=%s desc=%s url=%s", code, desc, url);
  });

  win.once("ready-to-show", () => {
    win.show();
    win.focus();
    if (process.platform === "darwin") {
      app.focus({ steal: true });
    }
    console.error("[iKassir] Window ready: %s", win.getTitle());
  });

  const base = await ensureRendererBaseUrl();
  console.error("[iKassir] Loading renderer: %s/", base);
  await win.loadURL(`${base}/`);

  if (isNextDevSession) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

function focusOrCreateMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }
  void createMainWindow().catch((e) => {
    console.error("[iKassir] Failed to open window:", e);
    app.quit();
  });
}

app.on("second-instance", () => {
  focusOrCreateMainWindow();
});

app.whenReady().then(() => {
  const dbPath = resolveDbPath();
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const productImagesDir = resolveProductImagesDir();
  process.env.IKASSIR_PRODUCT_IMAGES_ROOT = productImagesDir;
  if (!fs.existsSync(productImagesDir)) {
    fs.mkdirSync(productImagesDir, { recursive: true });
  }
  console.error("[iKassir] Database path:", dbPath);
  console.error("[iKassir] Product images dir:", productImagesDir);

  if (isNextDevSession && !app.isPackaged) {
    try {
      const pointerPath = path.join(appRoot(), PRODUCT_IMAGES_DEV_POINTER_FILENAME);
      fs.writeFileSync(pointerPath, `${productImagesDir}\n`, "utf8");
    } catch (e) {
      console.error("[iKassir] Failed to write", PRODUCT_IMAGES_DEV_POINTER_FILENAME, "for Next dev:", e);
    }
  }

  if (app.isPackaged) {
    try {
      ensureDatabase(dbPath, appRoot());
    } catch (e) {
      console.error("[iKassir] Database setup failed:", e);
      app.quit();
      return;
    }
  }
  let prisma;
  try {
    prisma = getPrisma(dbPath);
  } catch (e) {
    console.error("[iKassir] Prisma init failed:", e);
    app.quit();
    return;
  }
  registerIpcHandlers(prisma);
  focusOrCreateMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      focusOrCreateMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    killNextChild();
    void disconnectPrisma().finally(() => app.quit());
  }
});

app.on("before-quit", () => {
  killNextChild();
  void disconnectPrisma();
});
