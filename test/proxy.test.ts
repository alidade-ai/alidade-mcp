import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createProxy } from "../src/proxy.js";

const REMOTE_HINT =
  "2 X posts omit text and engagement metrics per X API terms. If an X API tool is available, look them up in one call by these X post IDs: 111,222";
const USAGE = "Rate limit: 9/10 requests remaining this window.";

const mentions = {
  meta: { savedSearchId: null },
  data: [
    { id: "a", platform: "x", platformPostId: "111", content: null, metrics: null },
    { id: "b", platform: "x", platformPostId: "222", content: null, metrics: null },
    {
      id: "c",
      platform: "linkedin",
      platformPostId: "li-1",
      content: "LinkedIn text",
      metrics: { likes: 1, shares: 0, replies: 0, views: null },
    },
  ],
};

function remoteServer() {
  const server = new McpServer(
    { name: "alidade", version: "1.0.0" },
    { instructions: "Remote instructions" },
  );
  server.registerTool(
    "search_mentions",
    {
      description:
        "Search mentions. Posts from platform x omit text and engagement metrics per X API terms; the result lists their X post IDs for lookup with an X API tool.",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [
        { type: "text", text: JSON.stringify(mentions) },
        { type: "text", text: REMOTE_HINT },
        { type: "text", text: USAGE },
      ],
    }),
  );
  server.registerTool(
    "get_workspace_info",
    { description: "Workspace info.", inputSchema: z.object({}) },
    async () => ({ content: [{ type: "text", text: '{"tier":"mentions"}' }] }),
  );
  return server;
}

function xResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function connect(options: {
  xBearerToken?: string;
  xFetch?: (url: string, init?: RequestInit) => Promise<Response>;
}) {
  const [upstreamClient, upstreamServer] = InMemoryTransport.createLinkedPair();
  await remoteServer().connect(upstreamServer);
  const proxy = await createProxy({
    apiKey: "ald_test",
    upstream: upstreamClient,
    ...options,
  });
  const [localClient, localServer] = InMemoryTransport.createLinkedPair();
  await proxy.connect(localServer);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(localClient);
  return client;
}

function texts(result: Awaited<ReturnType<Client["callTool"]>>): string[] {
  return (result.content as { type: string; text: string }[]).map((block) => block.text);
}

describe("local Alidade MCP proxy", () => {
  it("passes tools, instructions, and results through unchanged without an X key", async () => {
    const xFetch = vi.fn();
    const client = await connect({ xFetch });

    expect(client.getInstructions()).toBe("Remote instructions");
    const { tools } = await client.listTools();
    expect(tools.map((tool) => [tool.name, tool.description])).toEqual([
      [
        "search_mentions",
        "Search mentions. Posts from platform x omit text and engagement metrics per X API terms; the result lists their X post IDs for lookup with an X API tool.",
      ],
      ["get_workspace_info", "Workspace info."],
    ]);
    const result = await client.callTool({ name: "search_mentions", arguments: {} });
    expect(texts(result)).toEqual([JSON.stringify(mentions), REMOTE_HINT, USAGE]);
    expect(xFetch).not.toHaveBeenCalled();
  });

  it("fills in X post text and metrics with the X key and replaces the lookup hint", async () => {
    const xFetch = vi.fn(async () =>
      xResponse({
        data: [
          {
            id: "111",
            text: "short version…",
            note_tweet: { text: "Full long-form post text" },
            public_metrics: {
              like_count: 5,
              retweet_count: 2,
              reply_count: 1,
              quote_count: 1,
              impression_count: 900,
            },
          },
        ],
        errors: [{ resource_id: "222", title: "Not Found Error" }],
      }),
    );
    const client = await connect({ xBearerToken: "x_token", xFetch });

    const { tools } = await client.listTools();
    expect(tools[0]!.description).toBe(
      "Search mentions. Posts from platform x omit text and engagement metrics per X API terms; this local Alidade server fills in their text and metrics from the X API using your X key.",
    );
    expect(tools[1]!.description).toBe("Workspace info.");

    const result = await client.callTool({ name: "search_mentions", arguments: {} });
    const [json, note, usage] = texts(result);
    const payload = JSON.parse(json!) as typeof mentions;
    expect(payload.data[0]).toMatchObject({
      content: "Full long-form post text",
      metrics: { likes: 5, shares: 3, replies: 1, views: 900 },
    });
    expect(payload.data[1]).toMatchObject({ content: null, metrics: null });
    expect(payload.data[2]).toEqual(mentions.data[2]);
    expect(note).toBe(
      "Filled in text and metrics for 1 X post from the X API using your X key. 1 X post is no longer available on X (deleted or made private), so its text stays null.",
    );
    expect(usage).toBe(USAGE);

    expect(xFetch).toHaveBeenCalledOnce();
    const [url, init] = xFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("ids")).toBe("111,222");
    expect(init.headers).toEqual({ Authorization: "Bearer x_token" });
  });

  it("keeps the IDs and explains why when the X lookup fails", async () => {
    const client = await connect({
      xBearerToken: "bad_token",
      xFetch: async () => xResponse({ title: "Unauthorized" }, 401),
    });

    const result = await client.callTool({ name: "search_mentions", arguments: {} });
    const [json, note, usage] = texts(result);
    expect(json).toBe(JSON.stringify(mentions));
    expect(note).toBe(
      "Couldn't fetch text for 2 X posts: X API returned 401 (check your X bearer token). Their X post IDs are in platformPostId.",
    );
    expect(usage).toBe(USAGE);
  });

  it("never calls X for tools other than the mention tools", async () => {
    const xFetch = vi.fn();
    const client = await connect({ xBearerToken: "x_token", xFetch });

    const result = await client.callTool({ name: "get_workspace_info", arguments: {} });
    expect(texts(result)).toEqual(['{"tier":"mentions"}']);
    expect(xFetch).not.toHaveBeenCalled();
  });
});
