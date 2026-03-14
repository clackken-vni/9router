import { NextResponse } from "next/server";
import { deleteMcpServer, getMcpServerById, updateMcpServer } from "@/lib/mcp/registry";
import { validateMcpServerProfile } from "@/lib/mcp/validator";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const server = await getMcpServerById(id);

    if (!server) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    return NextResponse.json({ server });
  } catch (error) {
    console.log("Error fetching MCP server:", error);
    return NextResponse.json({ error: "Failed to fetch MCP server" }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const existing = await getMcpServerById(id);

    if (!existing) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    const body = await request.json();
    const merged = {
      ...existing,
      ...body,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };

    let profile;
    try {
      profile = await validateMcpServerProfile(merged);
    } catch (validationError) {
      return NextResponse.json({ error: validationError.message }, { status: 400 });
    }

    const updated = await updateMcpServer(id, profile);
    return NextResponse.json({ server: updated });
  } catch (error) {
    console.log("Error updating MCP server:", error);
    return NextResponse.json({ error: "Failed to update MCP server" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const deleted = await deleteMcpServer(id);

    if (!deleted) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting MCP server:", error);
    return NextResponse.json({ error: "Failed to delete MCP server" }, { status: 500 });
  }
}
