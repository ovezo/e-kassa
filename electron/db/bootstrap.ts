import { app } from "electron";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

function databaseUrl(dbFilePath: string): string {
  return pathToFileURL(dbFilePath).href;
}

function resolvePrismaDir(appRoot: string): string {
  const bundled = path.join(appRoot, "prisma");
  if (fs.existsSync(path.join(bundled, "schema.prisma"))) {
    return bundled;
  }
  if (app.isPackaged) {
    const extra = path.join(process.resourcesPath, "prisma");
    if (fs.existsSync(path.join(extra, "schema.prisma"))) {
      return extra;
    }
  }
  return bundled;
}

/** Apply Prisma migrations to the packaged/user DB before first use. */
export function ensureDatabase(dbFilePath: string, appRoot: string): void {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const prismaDir = resolvePrismaDir(appRoot);
  const schemaPath = path.join(prismaDir, "schema.prisma");
  if (!fs.existsSync(schemaPath)) {
    console.error("[iKassir] prisma/schema.prisma not found at", schemaPath);
    throw new Error("Database schema missing in application bundle");
  }

  const prismaCli = path.join(appRoot, "node_modules", "prisma", "build", "index.js");
  if (!fs.existsSync(prismaCli)) {
    console.error("[iKassir] Prisma CLI not found at", prismaCli);
    throw new Error("Prisma CLI missing in application bundle");
  }

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    DATABASE_URL: databaseUrl(dbFilePath),
  };

  console.error("[iKassir] Running prisma migrate deploy →", dbFilePath);
  const result = spawnSync(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: appRoot,
      env,
      stdio: "pipe",
      encoding: "utf-8",
    },
  );

  if (result.status !== 0) {
    const err = [result.stderr, result.stdout].filter(Boolean).join("\n");
    throw new Error(err || "prisma migrate deploy failed");
  }
}
