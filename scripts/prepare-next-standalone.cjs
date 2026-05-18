/**
 * After `next build` with `output: "standalone"`, copy the full standalone tree
 * (including node_modules) into build/next-standalone for electron-builder.
 * electron-builder often skips node_modules in extraResources unless we ship a
 * pre-staged folder explicitly.
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
const standaloneSrc = path.join(root, ".next", "standalone");
const standaloneDest = path.join(root, "build", "next-standalone");
const serverJs = path.join(standaloneSrc, "server.js");

if (!fs.existsSync(serverJs)) {
  console.error(
    '[uniKassa] .next/standalone/server.js not found. Run "next build" with output: "standalone".',
  );
  process.exit(1);
}

fs.rmSync(standaloneDest, { recursive: true, force: true });
copyDir(standaloneSrc, standaloneDest);

copyDir(path.join(root, "public"), path.join(standaloneDest, "public"));
copyDir(path.join(root, ".next", "static"), path.join(standaloneDest, ".next", "static"));

const nextPkg = path.join(standaloneDest, "node_modules", "next", "package.json");
if (!fs.existsSync(nextPkg)) {
  console.error("[uniKassa] Standalone bundle missing node_modules/next — build is incomplete.");
  process.exit(1);
}

console.log("[uniKassa] Next standalone staged at", standaloneDest);
