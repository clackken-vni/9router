const path = require("path");
const os = require("os");

// Single source of truth for data directory — matches localDb.js logic
function getDataDir() {
  const envDataDir = process.env.DATA_DIR?.trim();
  if (envDataDir) {
    try {
      require("fs").mkdirSync(envDataDir, { recursive: true });
      return envDataDir;
    } catch {
      // ignore and fallback
    }
  }

  const defaultDir = process.platform === "win32"
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "9router")
    : path.join(os.homedir(), ".9router");

  try {
    require("fs").mkdirSync(defaultDir, { recursive: true });
    return defaultDir;
  } catch {
    const fallbackDir = path.join(os.tmpdir(), "9router");
    require("fs").mkdirSync(fallbackDir, { recursive: true });
    return fallbackDir;
  }
}

const DATA_DIR = getDataDir();
const MITM_DIR = path.join(DATA_DIR, "mitm");

module.exports = { DATA_DIR, MITM_DIR };
