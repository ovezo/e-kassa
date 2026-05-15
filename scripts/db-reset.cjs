/**
 * Delete local SQLite DB and re-apply all migrations (empty catalog, no users).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = [
  path.join(root, "prisma", "dev.db"),
  path.join(root, "prisma", "dev.db-journal"),
  path.join(root, "prisma", "ikassir-template.db"),
];

for (const f of files) {
  try {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log("[iKassir] Removed", path.relative(root, f));
    }
  } catch (e) {
    console.error("[iKassir] Could not remove", f, e.message);
    process.exit(1);
  }
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("\n[iKassir] Database reset complete.");
console.log("  • Dev DB: prisma/dev.db");
console.log("  • Open the app and complete setup to create the admin user.");
console.log("  • Clear browser session if needed: log out or clear site data for localhost.");
