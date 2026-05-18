import { app } from "electron";
import fs from "fs";
import path from "path";

/** Node internals used to fix Prisma resolution in packaged Electron apps. */
type NodeModuleRuntime = typeof import("module") & {
  globalPaths: string[];
  _initPaths(): void;
};
const nodeModule = require("module") as NodeModuleRuntime;

function unpackedNodeModules(): string {
  return path.join(process.resourcesPath, "app.asar.unpacked", "node_modules");
}

function prismaClientDir(): string {
  return path.join(unpackedNodeModules(), ".prisma", "client");
}

/** Must run before `@prisma/client` is loaded (imported from `prisma.ts`). */
export function setupPrismaForElectron(): void {
  if (!app.isPackaged) return;

  const nodeModules = unpackedNodeModules();
  const clientDir = prismaClientDir();
  const defaultJs = path.join(clientDir, "default.js");

  if (!fs.existsSync(defaultJs)) {
    console.error("[uniKassa] Prisma client missing at", clientDir);
    throw new Error(
      "Prisma client not bundled. Reinstall the app or contact support.",
    );
  }

  // `@prisma/client` does `require('.prisma/client/default')`. In a packaged app
  // `.prisma` often exists only under app.asar.unpacked (dot-dir + asarUnpack).
  // Point Node's search paths at unpacked node_modules before loading Prisma.
  if (!nodeModule.globalPaths.includes(nodeModules)) {
    nodeModule.globalPaths.unshift(nodeModules);
  }
  const nodePathParts = (process.env.NODE_PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  if (!nodePathParts.includes(nodeModules)) {
    process.env.NODE_PATH = [nodeModules, ...nodePathParts].join(path.delimiter);
    nodeModule._initPaths();
  }

  if (process.platform === "win32") {
    const engine = path.join(clientDir, "query_engine-windows.dll.node");
    if (fs.existsSync(engine)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
    } else {
      console.error("[uniKassa] Windows Prisma engine missing:", engine);
    }
  } else if (process.platform === "darwin") {
    const engines = fs
      .readdirSync(clientDir)
      .filter((name) => name.startsWith("libquery_engine-") && name.endsWith(".dylib.node"));
    const engine = engines[0];
    if (engine) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(clientDir, engine);
    }
  }
}

