import "./boot-log";
import fs from "fs";
import net, { type AddressInfo } from "net";
import http from "http";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { app, BrowserWindow, dialog } from "electron";
import { appendBootLog, bootLogPath } from "./boot-log";
import { appendLog, logFileLocation } from "./log-file";
import { PRODUCT_IMAGES_DEV_POINTER_FILENAME } from "../src/lib/server/product-images";
import { RECEIPT_LOGO_DEV_POINTER_FILENAME } from "../src/lib/server/receipt-logo";
import { ensureDatabase } from "./db/bootstrap";
import { setupPrismaForElectron } from "./db/setup-prisma";

function appRoot(): string {
  return app.isPackaged ? app.getAppPath() : process.cwd();
}

function nextStandaloneDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "next-standalone");
  }
  const staged = path.join(process.cwd(), "build", "next-standalone");
  if (fs.existsSync(path.join(staged, "server.js"))) {
    return staged;
  }
  return path.join(process.cwd(), ".next", "standalone");
}

/** Only true when running `npm run dev` — never for the installed .exe. */
function isNextDevSession(): boolean {
  return !app.isPackaged && process.env.NODE_ENV === "development";
}

let nextChild: ChildProcess | null = null;
let nextProdBaseUrl: string | null = null;
let mainWindow: BrowserWindow | null = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  appendBootLog("Second instance blocked — another uniKassa is already running");
  app.quit();
  process.exit(0);
}

appendBootLog("Main process starting", {
  packaged: app.isPackaged,
  nodeEnv: process.env.NODE_ENV ?? "(unset)",
});

function fatalStartup(title: string, message: string, detail?: unknown): void {
  appendBootLog(`FATAL: ${title}`, detail ?? message);
  const body = `${message}\n\nLog file:\n${bootLogPath()}`;
  dialog.showErrorBox(title, body);
  app.exit(1);
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
    return path.join(app.getPath("userData"), "unikassa.db");
  }
  return path.join(appRoot(), "prisma", "dev.db");
}

function resolveProductImagesDir(): string {
  return path.join(app.getPath("userData"), "product-images");
}

function resolveReceiptLogoDir(): string {
  return path.join(app.getPath("userData"), "receipt-logo");
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

function waitForNextChildCrash(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Next server exited early (code=${code}, signal=${signal})`));
      } else {
        resolve();
      }
    });
  });
}

function pipeNextLogs(child: ChildProcess): void {
  const tag = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.trim()) appendLog("[next] " + line);
    }
  };
  child.stdout?.on("data", tag);
  child.stderr?.on("data", tag);
}

async function ensureRendererBaseUrl(): Promise<string> {
  if (isNextDevSession()) {
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
      `Next UI server missing at ${serverJs}. Rebuild with: npm run dist:win`,
    );
  }

  const nextPkg = path.join(serverDir, "node_modules", "next", "package.json");
  if (!fs.existsSync(nextPkg)) {
    throw new Error(
      `Next runtime missing in the installer (${nextPkg}). Rebuild with: npm run dist:win`,
    );
  }

  const imagesRoot =
    process.env.UNIKASSA_PRODUCT_IMAGES_ROOT?.trim() ||
    path.join(app.getPath("userData"), "product-images");
  const receiptLogoRoot =
    process.env.UNIKASSA_RECEIPT_LOGO_ROOT?.trim() ||
    path.join(app.getPath("userData"), "receipt-logo");

  appendLog("Starting Next standalone", { serverJs, port, serverDir });

  const standaloneModules = path.join(serverDir, "node_modules");

  nextChild = spawn(process.execPath, [serverJs], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      NODE_PATH: standaloneModules,
      UNIKASSA_PRODUCT_IMAGES_ROOT: imagesRoot,
      UNIKASSA_RECEIPT_LOGO_ROOT: receiptLogoRoot,
      UNIKASSA_TIMEZONE: process.env.UNIKASSA_TIMEZONE ?? "Asia/Ashgabat",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  pipeNextLogs(nextChild);

  nextChild.on("error", (err) => {
    appendLog("Next server spawn error", err);
  });

  nextChild.on("exit", (code, signal) => {
    appendLog("Next server exited", { code, signal });
    nextChild = null;
    nextProdBaseUrl = null;
  });

  const base = `http://127.0.0.1:${port}`;
  const url = `${base}/`;

  await Promise.race([waitForHttpOk(url, 120_000), waitForNextChildCrash(nextChild)]);

  nextProdBaseUrl = base;
  return base;
}

async function createMainWindow(): Promise<void> {
  appendLog("Creating main window");

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "uniKassa",
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow = win;
  win.show();
  win.focus();

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.on("did-fail-load", (_ev, code, desc, url) => {
    appendLog("did-fail-load", { code, desc, url });
  });

  await win.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(
        "<!doctype html><body style='font-family:Segoe UI,sans-serif;padding:2rem;color:#444'>" +
          "<h2>uniKassa</h2><p>Starting…</p></body>",
      ),
  );

  const base = await ensureRendererBaseUrl();
  appendLog("Loading renderer", base);
  await win.loadURL(`${base}/`);

  if (isNextDevSession()) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

function focusOrCreateMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  void createMainWindow().catch((e) => {
    fatalStartup("uniKassa — UI failed", e instanceof Error ? e.message : String(e), e);
  });
}

app.on("second-instance", () => {
  appendBootLog("Second instance — focusing main window");
  focusOrCreateMainWindow();
});

app.whenReady().then(async () => {
  appendLog("App ready", {
    packaged: app.isPackaged,
    userData: app.getPath("userData"),
    resources: process.resourcesPath,
    isNextDev: isNextDevSession(),
  });

  try {
    setupPrismaForElectron();
  } catch (e) {
    fatalStartup(
      "uniKassa — database engine",
      e instanceof Error ? e.message : String(e),
      e,
    );
    return;
  }

  const dbPath = resolveDbPath();
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const productImagesDir = resolveProductImagesDir();
  process.env.UNIKASSA_PRODUCT_IMAGES_ROOT = productImagesDir;
  if (!fs.existsSync(productImagesDir)) {
    fs.mkdirSync(productImagesDir, { recursive: true });
  }
  const receiptLogoDir = resolveReceiptLogoDir();
  process.env.UNIKASSA_RECEIPT_LOGO_ROOT = receiptLogoDir;
  if (!fs.existsSync(receiptLogoDir)) {
    fs.mkdirSync(receiptLogoDir, { recursive: true });
  }
  appendLog("Paths", { dbPath, productImagesDir, receiptLogoDir });

  if (isNextDevSession()) {
    try {
      const pointerPath = path.join(appRoot(), PRODUCT_IMAGES_DEV_POINTER_FILENAME);
      fs.writeFileSync(pointerPath, `${productImagesDir}\n`, "utf8");
    } catch (e) {
      appendLog("Failed to write dev product-images pointer", e);
    }
    try {
      const pointerPath = path.join(appRoot(), RECEIPT_LOGO_DEV_POINTER_FILENAME);
      fs.writeFileSync(pointerPath, `${receiptLogoDir}\n`, "utf8");
    } catch (e) {
      appendLog("Failed to write dev receipt-logo pointer", e);
    }
  }

  if (app.isPackaged) {
    try {
      ensureDatabase(dbPath, appRoot());
    } catch (e) {
      fatalStartup(
        "uniKassa — database setup",
        e instanceof Error ? e.message : String(e),
        e,
      );
      return;
    }
  }

  const { getPrisma, disconnectPrisma } = await import("./db/prisma");
  const { registerIpcHandlers } = await import("./ipc/register");

  let prisma;
  try {
    prisma = getPrisma(dbPath);
  } catch (e) {
    fatalStartup(
      "uniKassa — database connection",
      e instanceof Error ? e.message : String(e),
      e,
    );
    return;
  }

  registerIpcHandlers(prisma);
  appendLog("IPC registered, opening window");
  focusOrCreateMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      focusOrCreateMainWindow();
    }
  });

  app.on("before-quit", () => {
    killNextChild();
    void disconnectPrisma();
  });
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    killNextChild();
    try {
      const { disconnectPrisma } = await import("./db/prisma");
      await disconnectPrisma();
    } catch {
      // ignore
    }
    app.quit();
  }
});
