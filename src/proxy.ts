import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { Server, type Transport } from "@modelcontextprotocol/server";

import { fillXPosts, MENTION_TOOLS } from "./hydrate.js";
import type { FetchLike } from "./x.js";

export const DEFAULT_REMOTE_URL = "https://api.alidade-ai.com/mcp";
export const VERSION = "0.1.0";

const REMOTE_X_CLAUSE = /; the result lists their X post IDs for lookup with an X API tool\./;
const X_FILL_NOTE =
  "; this local Alidade server fills in their text and metrics from the X API using your X key.";

function withXFillNote(description = ""): string {
  return REMOTE_X_CLAUSE.test(description)
    ? description.replace(REMOTE_X_CLAUSE, X_FILL_NOTE)
    : `${description} This local Alidade server fills in X post text and metrics from the X API using your X key.`;
}

export type ProxyOptions = {
  apiKey: string;
  xBearerToken?: string;
  remoteUrl?: string;
  upstream?: Transport;
  xFetch?: FetchLike;
};

export async function createProxy(options: ProxyOptions): Promise<Server> {
  const client = new Client({ name: "alidade-mcp-local", version: VERSION });
  await client.connect(
    options.upstream ??
      new StreamableHTTPClientTransport(new URL(options.remoteUrl ?? DEFAULT_REMOTE_URL), {
        requestInit: {
          headers: { Authorization: `Bearer ${options.apiKey}` },
        },
      }),
  );

  const server = new Server(
    { name: "alidade", version: VERSION },
    {
      capabilities: { tools: {} },
      instructions: client.getInstructions(),
    },
  );
  const { xBearerToken } = options;

  server.setRequestHandler("tools/list", async (request) => {
    const result = await client.listTools(request.params);
    if (!xBearerToken) return result;
    return {
      ...result,
      tools: result.tools.map((tool) =>
        MENTION_TOOLS.has(tool.name)
          ? { ...tool, description: withXFillNote(tool.description) }
          : tool,
      ),
    };
  });

  server.setRequestHandler("tools/call", async (request) => {
    const result = await client.callTool(request.params);
    if (!xBearerToken || !MENTION_TOOLS.has(request.params.name)) {
      return result;
    }
    return fillXPosts(result, xBearerToken, options.xFetch);
  });

  return server;
}
