import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "internal-api.log");
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        const backupFile = `${LOG_FILE}.${Date.now()}.bak`;
        fs.renameSync(LOG_FILE, backupFile);
        // Keep only last 3 backup files
        const files = fs.readdirSync(LOG_DIR)
          .filter(f => f.startsWith("internal-api.log") && f.endsWith(".bak"))
          .sort()
          .reverse();
        files.slice(3).forEach(f => {
          try { fs.unlinkSync(path.join(LOG_DIR, f)); } catch {}
        });
      }
    }
  } catch (err) {
    // Ignore rotation errors
  }
}

function formatTimestamp() {
  return new Date().toISOString();
}

function writeLog(level, category, message, data = null) {
  rotateLogIfNeeded();
  
  const timestamp = formatTimestamp();
  const logLine = {
    timestamp,
    level,
    category,
    message,
    ...(data && { data })
  };
  
  const logString = JSON.stringify(logLine) + "\n";
  
  try {
    fs.appendFileSync(LOG_FILE, logString, "utf8");
  } catch (err) {
    console.error("[LogWriter] Failed to write log:", err.message);
  }
  
  // Also console log for dev visibility
  const consoleMsg = `[${timestamp}] [${level}] [${category}] ${message}`;
  if (level === "ERROR") {
    console.error(consoleMsg, data || "");
  } else if (level === "WARN") {
    console.warn(consoleMsg, data || "");
  } else {
    console.log(consoleMsg, data || "");
  }
}

export const logInternalApi = {
  request(requestInfo) {
    writeLog("INFO", "REQUEST", "Incoming internal API request", requestInfo);
  },
  
  overwrite(overwriteInfo) {
    writeLog("INFO", "OVERWRITE", "Overwrite matched", overwriteInfo);
  },
  
  proxy(proxyInfo) {
    writeLog("INFO", "PROXY", "Proxying to upstream", proxyInfo);
  },
  
  response(responseInfo) {
    writeLog("INFO", "RESPONSE", "Response sent", responseInfo);
  },
  
  error(errorInfo) {
    writeLog("ERROR", "ERROR", "Error occurred", errorInfo);
  },
  
  debug(debugInfo) {
    if (process.env.DEBUG_INTERNAL_API === "1") {
      writeLog("DEBUG", "DEBUG", "Debug info", debugInfo);
    }
  },
  
  discovery(discoveryInfo) {
    writeLog("WARN", "DISCOVERY", "Unknown method/path discovered", discoveryInfo);
  }
};

export function getLogFilePath() {
  return LOG_FILE;
}

export function readRecentLogs(lines = 100) {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }
    
    const content = fs.readFileSync(LOG_FILE, "utf8");
    const allLines = content.trim().split("\n").filter(Boolean);
    
    return allLines.slice(-lines).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  } catch (err) {
    return [{ error: err.message }];
  }
}

export function clearLogs() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.unlinkSync(LOG_FILE);
    }
    return true;
  } catch (err) {
    return false;
  }
}
