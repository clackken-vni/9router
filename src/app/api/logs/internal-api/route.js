import { NextResponse } from "next/server";
import { readRecentLogs, clearLogs, getLogFilePath } from "@/lib/internalApiLogger";

export async function GET(request) {
  const url = new URL(request.url);
  const lines = parseInt(url.searchParams.get("lines") || "100", 10);
  
  try {
    const logs = readRecentLogs(lines);
    return NextResponse.json({
      ok: true,
      logFile: getLogFilePath(),
      count: logs.length,
      logs
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const success = clearLogs();
    return NextResponse.json({
      ok: success,
      message: success ? "Logs cleared" : "Failed to clear logs"
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}
