/**
 * Copy only schema + migrations into build/prisma-ship (no *.db files).
 * Used by electron-builder extraResources — avoids shipping dev.db by mistake.
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

const root = path.join(__dirname, "..");
const src = path.join(root, "prisma");
const dest = path.join(root, "build", "prisma-ship");

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

const schema = path.join(src, "schema.prisma");
if (!fs.existsSync(schema)) {
  console.error("Missing prisma/schema.prisma");
  process.exit(1);
}
fs.copyFileSync(schema, path.join(dest, "schema.prisma"));

const migrations = path.join(src, "migrations");
if (fs.existsSync(migrations)) {
  copyDir(migrations, path.join(dest, "migrations"));
}

for (const name of fs.readdirSync(dest)) {
  if (name.endsWith(".db") || name.endsWith(".db-journal")) {
    console.error("[uniKassa] Unexpected database file in prisma-ship:", name);
    process.exit(1);
  }
}

console.log("[uniKassa] prisma-ship ready:", dest);
