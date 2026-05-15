/**
 * Fresh SQLite DB with all migrations applied — bundled into the Windows/mac installer.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const template = path.join(root, "prisma", "ikassir-template.db");

if (fs.existsSync(template)) {
  fs.unlinkSync(template);
}

const url = `file:${template.replace(/\\/g, "/")}`;
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: url },
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(template)) {
  console.error("Template database was not created at", template);
  process.exit(1);
}

console.log("[iKassir] Template database ready:", template);
