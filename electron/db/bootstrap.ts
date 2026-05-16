import { app } from "electron";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

function databaseUrl(dbFilePath: string): string {
  const normalized = dbFilePath.split(path.sep).join("/");
  return `file:${normalized}`;
}

/** Schema + migrations for packaged builds (real folder under `resources/`). */
function resolvePrismaDir(appRoot: string): string {
  if (app.isPackaged) {
    const resourcesPrisma = path.join(process.resourcesPath, "prisma");
    if (fs.existsSync(path.join(resourcesPrisma, "schema.prisma"))) {
      return resourcesPrisma;
    }
  }
  const bundled = path.join(appRoot, "prisma");
  if (fs.existsSync(path.join(bundled, "schema.prisma"))) {
    return bundled;
  }
  throw new Error("Database schema missing in application bundle");
}

function resolveTemplateDbPath(): string | null {
  if (!app.isPackaged) return null;
  const p = path.join(process.resourcesPath, "ikassir-template.db");
  return fs.existsSync(p) ? p : null;
}

function resolvePrismaCli(): string {
  const unpacked = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );
  if (fs.existsSync(unpacked)) {
    return unpacked;
  }
  const inAsar = path.join(app.getAppPath(), "node_modules", "prisma", "build", "index.js");
  if (fs.existsSync(inAsar)) {
    return inAsar;
  }
  throw new Error("Prisma CLI missing in application bundle");
}

function runMigrateDeploy(
  dbFilePath: string,
  prismaDir: string,
  schemaPath: string,
): void {
  const prismaCli = resolvePrismaCli();
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
      windowsHide: true,
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
  const templatePath = resolveTemplateDbPath();

  if (!fs.existsSync(dbFilePath)) {
    if (templatePath) {
      fs.copyFileSync(templatePath, dbFilePath);
      console.error("[iKassir] Created database from template →", dbFilePath);
      return;
    }
    if (app.isPackaged) {
      throw new Error(
        "Install bundle incomplete (ikassir-template.db missing). Reinstall the application.",
      );
    }
    runMigrateDeploy(dbFilePath, prismaDir, schemaPath);
    return;
  }

  // Existing user DB (updates): apply pending migrations.
  runMigrateDeploy(dbFilePath, prismaDir, schemaPath);
}
