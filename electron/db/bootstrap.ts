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

function resolveTemplateDbPath(): string | null {
  if (!app.isPackaged) return null;
  const p = path.join(process.resourcesPath, "ikassir-template.db");
  return fs.existsSync(p) ? p : null;
}

function runMigrateDeploy(
  dbFilePath: string,
  appRoot: string,
  prismaDir: string,
  schemaPath: string,
): void {
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
      cwd: prismaDir,
      env,
      stdio: "pipe",
      encoding: "utf-8",
    },
  );

  if (result.status !== 0) {
    const err = [result.stderr, result.stdout].filter(Boolean).join("\n");
    console.error("[iKassir] migrate deploy output:\n", err);
    throw new Error(err || "prisma migrate deploy failed");
  }
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

  const templatePath = resolveTemplateDbPath();

  if (!fs.existsSync(dbFilePath)) {
    if (templatePath) {
      fs.copyFileSync(templatePath, dbFilePath);
      console.error("[iKassir] Created database from template →", dbFilePath);
      return;
    }
    runMigrateDeploy(dbFilePath, appRoot, prismaDir, schemaPath);
    return;
  }

  // Existing DB (e.g. after app update): apply pending migrations only.
  runMigrateDeploy(dbFilePath, appRoot, prismaDir, schemaPath);
}
