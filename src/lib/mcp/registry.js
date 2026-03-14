import { v4 as uuidv4 } from "uuid";
import { getSettings, updateSettings } from "@/lib/localDb";

function cloneMcpSettings(settings) {
  const mcp = settings?.mcp && typeof settings.mcp === "object" && !Array.isArray(settings.mcp)
    ? settings.mcp
    : {};

  return {
    servers: Array.isArray(mcp.servers) ? mcp.servers : [],
    secrets: mcp.secrets && typeof mcp.secrets === "object" && !Array.isArray(mcp.secrets) ? mcp.secrets : {},
  };
}

export async function listMcpServers() {
  const settings = await getSettings();
  const mcp = cloneMcpSettings(settings);
  return mcp.servers;
}

export async function getMcpServerById(id) {
  const servers = await listMcpServers();
  return servers.find((server) => server.id === id) || null;
}

export async function createMcpServer(profile) {
  const settings = await getSettings();
  const mcp = cloneMcpSettings(settings);
  const now = new Date().toISOString();

  const server = {
    id: uuidv4(),
    ...profile,
    createdAt: now,
    updatedAt: now,
  };

  mcp.servers.push(server);
  await updateSettings({ mcp });
  return server;
}

export async function updateMcpServer(id, updates) {
  const settings = await getSettings();
  const mcp = cloneMcpSettings(settings);
  const index = mcp.servers.findIndex((server) => server.id === id);

  if (index === -1) return null;

  mcp.servers[index] = {
    ...mcp.servers[index],
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  };

  await updateSettings({ mcp });
  return mcp.servers[index];
}

export async function deleteMcpServer(id) {
  const settings = await getSettings();
  const mcp = cloneMcpSettings(settings);
  const index = mcp.servers.findIndex((server) => server.id === id);

  if (index === -1) return false;

  mcp.servers.splice(index, 1);
  await updateSettings({ mcp });
  return true;
}
