/**
 * Bundle Prisma CLI + @prisma/* for the installed app (migrate deploy on updates).
 */
const fs = require("fs");
const path = require("path");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing path: ${src}`);
  }
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

const root = path.join(__dirname, "..");
const dest = path.join(root, "build", "prisma-cli", "node_modules");
const prismaPkg = path.join(root, "node_modules", "prisma");
const prismaScope = path.join(root, "node_modules", "@prisma");

fs.rmSync(path.join(root, "build", "prisma-cli"), { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

copyDir(prismaPkg, path.join(dest, "prisma"));
copyDir(prismaScope, path.join(dest, "@prisma"));

const cli = path.join(dest, "prisma", "build", "index.js");
if (!fs.existsSync(cli)) {
  console.error("Prisma CLI entry missing after copy:", cli);
  process.exit(1);
}

console.log("[iKassir] prisma-cli bundle ready:", path.join(root, "build", "prisma-cli"));
