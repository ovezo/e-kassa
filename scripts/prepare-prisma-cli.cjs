/**
 * Bundle Prisma CLI and all runtime dependencies (effect, etc.) for migrate deploy.
 */
const fs = require("fs");
const path = require("path");

function copyDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
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

function packageDir(rootNodeModules, packageName) {
  if (packageName.startsWith("@")) {
    const [scope, name] = packageName.split("/");
    return path.join(rootNodeModules, scope, name);
  }
  return path.join(rootNodeModules, packageName);
}

function collectDependencies(entryPackage, rootNodeModules, collected = new Set()) {
  if (collected.has(entryPackage)) return;
  const pkgJson = path.join(packageDir(rootNodeModules, entryPackage), "package.json");
  if (!fs.existsSync(pkgJson)) {
    console.warn("[iKassir] prepare-prisma-cli: dependency not installed:", entryPackage);
    return;
  }
  collected.add(entryPackage);
  const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
  for (const name of Object.keys(deps)) {
    collectDependencies(name, rootNodeModules, collected);
  }
}

const root = path.join(__dirname, "..");
const rootNodeModules = path.join(root, "node_modules");
const bundleRoot = path.join(root, "build", "prisma-cli");
const destNodeModules = path.join(bundleRoot, "node_modules");

const packages = new Set();
collectDependencies("prisma", rootNodeModules, packages);

fs.rmSync(bundleRoot, { recursive: true, force: true });
fs.mkdirSync(destNodeModules, { recursive: true });

for (const name of [...packages].sort()) {
  const src = packageDir(rootNodeModules, name);
  const dest = packageDir(destNodeModules, name);
  copyDir(src, dest);
}

const cli = path.join(destNodeModules, "prisma", "build", "index.js");
const effectPkg = path.join(destNodeModules, "effect", "package.json");
if (!fs.existsSync(cli)) {
  console.error("Prisma CLI entry missing:", cli);
  process.exit(1);
}
if (!fs.existsSync(effectPkg)) {
  console.error("effect package missing from prisma-cli bundle");
  process.exit(1);
}

// Smoke-test resolution like the packaged app (isolated NODE_PATH).
const Module = require("module");
process.env.NODE_PATH = destNodeModules;
Module._initPaths();
try {
  require(cli);
} catch (e) {
  console.error("[iKassir] prisma-cli bundle failed load test:", e.message);
  process.exit(1);
}

console.log(
  "[iKassir] prisma-cli bundle ready:",
  bundleRoot,
  `(${packages.size} packages)`,
);
