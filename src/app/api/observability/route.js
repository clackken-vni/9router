import { NextResponse } from "next/server";
import { queryObservabilityEvents } from "@/lib/ampObservability/reader";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const data = queryObservabilityEvents({
      day: url.searchParams.get("day") || "",
      from: url.searchParams.get("from") || "",
      to: url.searchParams.get("to") || "",
      q: url.searchParams.get("q") || "",
      status: url.searchParams.get("status") || "",
      component: url.searchParams.get("component") || "",
      source: url.searchParams.get("source") || "",
      event: url.searchParams.get("event") || "",
      session_id: url.searchParams.get("session_id") || "",
      trace_id: url.searchParams.get("trace_id") || "",
      request_id: url.searchParams.get("request_id") || "",
      route_id: url.searchParams.get("route_id") || "",
      tool_call_id: url.searchParams.get("tool_call_id") || "",
      tool_method: url.searchParams.get("tool_method") || "",
      model: url.searchParams.get("model") || "",
      provider: url.searchParams.get("provider") || "",
      limit: url.searchParams.get("limit") || "100",
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
