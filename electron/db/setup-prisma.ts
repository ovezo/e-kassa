import { app } from "electron";
import fs from "fs";
import path from "path";

/** Must run before `@prisma/client` is loaded (imported from `prisma.ts`). */
export function setupPrismaForElectron(): void {
  if (!app.isPackaged) return;

  const clientDir = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    ".prisma",
    "client",
  );

  const indexJs = path.join(clientDir, "index.js");
  if (!fs.existsSync(indexJs)) {
    console.error("[iKassir] Prisma client missing at", clientDir);
    throw new Error(
      "Prisma client not bundled. Reinstall the app or contact support.",
    );
  }

  if (process.platform === "win32") {
    const engine = path.join(clientDir, "query_engine-windows.dll.node");
    if (fs.existsSync(engine)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
    }
  }
}

setupPrismaForElectron();
