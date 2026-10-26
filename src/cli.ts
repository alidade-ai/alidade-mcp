#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createProxy } from "./proxy.js";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const apiKey = env("ALIDADE_API_KEY");
if (!apiKey) {
  console.error(
    "ALIDADE_API_KEY is not set. Create a key under Settings → Workspace → API keys in Alidade.",
  );
  process.exit(1);
}

try {
  const server = await createProxy({
    apiKey,
    xBearerToken: env("X_BEARER_TOKEN"),
    remoteUrl: env("ALIDADE_MCP_URL"),
  });
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error("Failed to connect to the Alidade MCP server:", error);
  process.exit(1);
}
