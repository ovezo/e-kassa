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
};
