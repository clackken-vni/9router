import { NextResponse } from "next/server";

/**
 * Debug Logs API
 * GET: Retrieve recent debug logs
 * DELETE: Clear logs
 */

// In-memory log storage (resets on server restart)
let debugLogs = [];
const MAX_LOGS = 100;

export function addDebugLog(type, data) {
  const log = {
    timestamp: new Date().toISOString(),
    type,
    data,
  };
  debugLogs.push(log);
  if (debugLogs.length > MAX_LOGS) {
    debugLogs = debugLogs.slice(-MAX_LOGS);
  }
}

export function getDebugLogs() {
  return debugLogs;
}

export function clearDebugLogs() {
  debugLogs = [];
  return { success: true, message: "Logs cleared" };
}

export async function GET(request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "json";

  // Filter by type if provided
  const type = url.searchParams.get("type");
  let logs = getDebugLogs();
  if (type) {
    logs = logs.filter(log => log.type === type);
  }

  if (format === "text") {
    const text = logs.map(log => {
      return `[${log.timestamp}] [${log.type}]\n${JSON.stringify(log.data, null, 2)}\n`;
    }).join("\n" + "-".repeat(80) + "\n");
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({
    count: logs.length,
    logs,
  });
}

export async function DELETE() {
  clearDebugLogs();
  return NextResponse.json({ success: true, message: "Debug logs cleared" });
}
