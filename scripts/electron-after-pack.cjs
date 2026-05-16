/**
 * electron-builder afterPack: copy `node_modules/.prisma` into the unpacked asar tree.
 * Dot-folders are often omitted from asarUnpack; @prisma/client requires `.prisma/client` as a sibling.
 */
const fs = require("fs");
const path = require("path");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

/** @param {import('electron-builder').AfterPackContext} context */
exports.default = async function afterPack(context) {
  const projectRoot = path.join(__dirname, "..");
  const src = path.join(projectRoot, "node_modules", ".prisma");
  if (!fs.existsSync(src)) {
    throw new Error(
      "node_modules/.prisma not found. Run `npx prisma generate` before packaging.",
    );
  }

  const dest = path.join(
    context.appOutDir,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    ".prisma",
  );

  console.log("[iKassir] afterPack: copying Prisma client to", dest);
  fs.rmSync(dest, { recursive: true, force: true });
  copyDir(src, dest);

  const resources = path.join(context.appOutDir, "resources");
  const stagedPrismaCli = path.join(projectRoot, "build", "prisma-cli", "node_modules");
  if (fs.existsSync(path.join(stagedPrismaCli, "prisma", "build", "index.js"))) {
    console.log("[iKassir] afterPack: syncing prisma-cli bundle to", path.join(resources, "prisma-cli"));
    fs.rmSync(path.join(resources, "prisma-cli"), { recursive: true, force: true });
    copyDir(path.join(projectRoot, "build", "prisma-cli"), path.join(resources, "prisma-cli"));
  }

  const clientDir = path.join(dest, "client");
  const defaultJs = path.join(clientDir, "default.js");
  if (!fs.existsSync(defaultJs)) {
    throw new Error(
      `Generated Prisma client incomplete (${defaultJs} missing). Run \`npx prisma generate\` before packaging.`,
    );
  }

  const winEngine = path.join(clientDir, "query_engine-windows.dll.node");
  if (context.electronPlatformName === "win32" && !fs.existsSync(winEngine)) {
    throw new Error(
      `Windows Prisma engine missing (${winEngine}). ` +
        'Ensure prisma/schema.prisma has binaryTargets = ["native", "windows"] and run prisma generate.',
    );
  }

  const unpackedPrismaClient = path.join(
    context.appOutDir,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "@prisma",
    "client",
    "runtime",
    "library.js",
  );
  if (!fs.existsSync(unpackedPrismaClient)) {
    console.warn(
      "[iKassir] afterPack: @prisma/client runtime not in app.asar.unpacked — " +
        "ensure package.json asarUnpack includes node_modules/@prisma/client/**",
    );
  }

  const nextServer = path.join(resources, "next-standalone", "server.js");
  if (!fs.existsSync(nextServer)) {
    throw new Error(
      `Next standalone missing (${nextServer}). Run npm run build before electron-builder.`,
    );
  }

  const nextModule = path.join(resources, "next-standalone", "node_modules", "next", "package.json");
  if (!fs.existsSync(nextModule)) {
    const staged = path.join(projectRoot, "build", "next-standalone");
    if (!fs.existsSync(path.join(staged, "node_modules", "next", "package.json"))) {
      throw new Error(
        `Next standalone is missing node_modules/next in the installer. ` +
          `Run npm run build (prepare-next-standalone) before dist:win.`,
      );
    }
    console.log("[iKassir] afterPack: repairing next-standalone (node_modules was omitted)");
    fs.rmSync(path.join(resources, "next-standalone"), { recursive: true, force: true });
    copyDir(staged, path.join(resources, "next-standalone"));
  }

  const templateDb = path.join(resources, "ikassir-template.db");
  if (!fs.existsSync(templateDb)) {
    throw new Error(
      `Template database missing (${templateDb}). Run npm run prepare:pack before dist:win.`,
    );
  }

  const bundledPrismaCli = path.join(resources, "prisma-cli", "node_modules", "prisma", "build", "index.js");
  const bundledEffect = path.join(resources, "prisma-cli", "node_modules", "effect", "package.json");
  if (!fs.existsSync(bundledPrismaCli)) {
    throw new Error(
      `Prisma CLI missing in installer. Run npm run prepare:pack before dist:win.`,
    );
  }
  if (!fs.existsSync(bundledEffect)) {
    throw new Error(
      `Prisma CLI dependencies incomplete (effect missing). Run npm run prepare:pack before dist:win.`,
    );
  }

  const prismaResources = path.join(resources, "prisma");
  if (fs.existsSync(prismaResources)) {
    for (const name of fs.readdirSync(prismaResources)) {
      if (!name.endsWith(".db") && !name.endsWith(".db-journal")) continue;
      const file = path.join(prismaResources, name);
      if (!fs.statSync(file).isFile()) continue;
      console.warn("[iKassir] afterPack: removing stray database file from installer:", file);
      fs.unlinkSync(file);
    }
    const stillDevDb = path.join(prismaResources, "dev.db");
    if (fs.existsSync(stillDevDb)) {
      throw new Error(`Could not remove dev.db from bundle (${stillDevDb}).`);
    }
  }
};
