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

/** `next dev` — Next is already running on 3000 (see npm script: both must use NODE_ENV=development). */
const isNextDevSession = process.env.NODE_ENV === "development";

console.error("[iKassir] Electron main loaded. NODE_ENV=%s → %s", process.env.NODE_ENV ?? "(unset)", isNextDevSession ? "load http://127.0.0.1:3000 (next dev)" : "spawn next start (production)");

let nextChild: ChildProcess | null = null;
let nextProdBaseUrl: string | null = null;

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

async function ensureRendererBaseUrl(): Promise<string> {
  if (isNextDevSession) {
    return "http://127.0.0.1:3000";
  }

  if (nextProdBaseUrl) {
    return nextProdBaseUrl;
  }

  const port = await getFreePort();
  const root = appRoot();
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

  const imagesRoot = process.env.IKASSIR_PRODUCT_IMAGES_ROOT?.trim() || path.join(root, "product-images");

  nextChild = spawn(process.execPath, [nextCli, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      NODE_ENV: "production",
      IKASSIR_PRODUCT_IMAGES_ROOT: imagesRoot,
    },
    stdio: "pipe",
  });

  nextChild.on("error", (err) => {
    console.error("next start failed to spawn:", err);
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
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
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
  const prisma = getPrisma(dbPath);
  registerIpcHandlers(prisma);
  void createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    void disconnectPrisma().finally(() => app.quit());
  }
});

app.on("before-quit", () => {
  if (nextChild && !nextChild.killed) {
    nextChild.kill("SIGTERM");
    nextChild = null;
    nextProdBaseUrl = null;
  }
  void disconnectPrisma();
});
