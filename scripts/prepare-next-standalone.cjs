/**
 * After `next build` with `output: "standalone"`, copy assets the standalone server needs.
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
const standalone = path.join(root, ".next", "standalone");
const serverJs = path.join(standalone, "server.js");

if (!fs.existsSync(serverJs)) {
  console.error(
    "[iKassir] .next/standalone/server.js not found. Ensure next.config has output: \"standalone\" and run next build.",
  );
  process.exit(1);
}

copyDir(path.join(root, "public"), path.join(standalone, "public"));
copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));

console.log("[iKassir] Prepared Next standalone at", standalone);
