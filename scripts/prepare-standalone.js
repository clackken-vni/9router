const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, ".next", "standalone");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

if (!fs.existsSync(standaloneDir)) {
  console.warn("[prepare-standalone] .next/standalone not found. Run build first.");
  process.exit(0);
}

copyDir(path.join(rootDir, ".next", "static"), path.join(standaloneDir, ".next", "static"));
copyDir(path.join(rootDir, "public"), path.join(standaloneDir, "public"));

console.log("[prepare-standalone] Synced .next/static and public into .next/standalone");
