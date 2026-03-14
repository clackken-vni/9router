import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateMcpServerProfile } from "../../src/lib/mcp/validator.js";

describe("validateMcpServerProfile", () => {
  it("accepts valid stdio profile", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-validator-"));

    const result = await validateMcpServerProfile({
      name: "filesystem",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      cwd,
      env: {
        NODE_ENV: "production",
      },
      secretRefs: ["MCP_FS_TOKEN"],
      restartPolicy: {
        mode: "on-failure",
        maxRetries: 3,
        backoffMs: 1000,
        maxBackoffMs: 10000,
      },
      health: {
        startupTimeoutMs: 12000,
        readyPattern: "initialized",
      },
      enabled: true,
      autostart: true,
    });

    expect(result.name).toBe("filesystem");
    expect(result.transport).toBe("stdio");
    expect(result.cwd).toBe(cwd);
    expect(result.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem"]);
  });

  it("rejects non-stdio transport", async () => {
    await expect(validateMcpServerProfile({
      name: "bad",
      transport: "http",
      command: "node",
      args: [],
    })).rejects.toThrow("transport must be 'stdio'");
  });

  it("rejects shell metacharacters in command", async () => {
    await expect(validateMcpServerProfile({
      name: "bad",
      transport: "stdio",
      command: "node && rm -rf /",
      args: [],
    })).rejects.toThrow("command contains shell metacharacters");
  });

  it("rejects invalid env key", async () => {
    await expect(validateMcpServerProfile({
      name: "bad-env",
      transport: "stdio",
      command: "node",
      args: [],
      env: {
        bad_key: "value",
      },
    })).rejects.toThrow("env key 'bad_key' is invalid");
  });

  it("rejects non-existing cwd", async () => {
    await expect(validateMcpServerProfile({
      name: "bad-cwd",
      transport: "stdio",
      command: "node",
      args: [],
      cwd: "/this/path/does/not/exist",
    })).rejects.toThrow("cwd does not exist");
  });
});
