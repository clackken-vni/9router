import { NextResponse } from "next/server";
import { createMcpServer, listMcpServers } from "@/lib/mcp/registry";
import { validateMcpServerProfile } from "@/lib/mcp/validator";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const servers = await listMcpServers();
    return NextResponse.json({ servers });
  } catch (error) {
    console.log("Error fetching MCP servers:", error);
    return NextResponse.json({ error: "Failed to fetch MCP servers" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    let profile;
    try {
      profile = await validateMcpServerProfile(body);
    } catch (validationError) {
      return NextResponse.json({ error: validationError.message }, { status: 400 });
    }

    const server = await createMcpServer(profile);
    return NextResponse.json({ server }, { status: 201 });
  } catch (error) {
    console.log("Error creating MCP server:", error);
    return NextResponse.json({ error: "Failed to create MCP server" }, { status: 500 });
  }
}
