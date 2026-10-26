# Alidade MCP (local)

A local [MCP](https://modelcontextprotocol.io) server for
[Alidade](https://alidade-ai.com). It forwards every tool to Alidade's hosted
MCP server, and when you give it your own X API bearer token it fills in the
text and metrics of X posts before your agent sees them — so one
`search_mentions` call returns readable X posts.

Why it's local: X's terms don't let Alidade redistribute X post content, so
the hosted server returns X posts as IDs. This server runs on your machine
(or your own infrastructure) and fetches the content from X directly with
your key; Alidade never sees your X credentials.

Without an X token it behaves exactly like the hosted server.

## Setup

You need an Alidade API key (Settings → Workspace → API keys) and, optionally,
an app-only bearer token from your X developer account. X bills post lookups
to your X account.

### Claude Desktop

Download `alidade-<version>.mcpb` from the
[latest release](https://github.com/alidade-ai/alidade-mcp/releases/latest),
open it, and enter your keys in the settings form. Keys are stored in your
OS keychain.

### Claude Code

```bash
claude mcp add alidade \
  -e ALIDADE_API_KEY=ald_xxxxxxxxxxxxxxxx \
  -e X_BEARER_TOKEN=xxxxxxxx \
  -- npx -y @alidade/mcp
```

### Cursor and other clients

```json
{
  "mcpServers": {
    "alidade": {
      "command": "npx",
      "args": ["-y", "@alidade/mcp"],
      "env": {
        "ALIDADE_API_KEY": "ald_xxxxxxxxxxxxxxxx",
        "X_BEARER_TOKEN": "xxxxxxxx"
      }
    }
  }
}
```

| Variable          | Required | Description                                                              |
| ----------------- | -------- | ------------------------------------------------------------------------ |
| `ALIDADE_API_KEY` | yes      | Your Alidade workspace API key.                                          |
| `X_BEARER_TOKEN`  | no       | X app-only bearer token used to fill in X post content.                  |
| `ALIDADE_MCP_URL` | no       | Override the upstream server (default `https://api.alidade-ai.com/mcp`). |

### In your own agent backend

If your product runs its own agent, use the package as a library and connect
the returned MCP server to your agent over any MCP transport (the example uses
an in-process pair):

```ts
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createProxy } from "@alidade/mcp";

const server = await createProxy({
  apiKey: process.env.ALIDADE_API_KEY!,
  xBearerToken: process.env.X_BEARER_TOKEN,
});
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(clientTransport);
```

Or run `npx @alidade/mcp` as a stdio subprocess from any agent framework that
supports stdio MCP servers.

If you show X content to your own users, X's Developer Agreement and Policy
apply to you as the X key holder (display requirements, honoring deletions).

## How X posts are filled in

For `search_mentions` and `semantic_search_mentions`, X posts that come back
without text are looked up with X's
[posts lookup](https://docs.x.com/x-api/posts/lookup/introduction) in batches
of 100. Each post's `content` and `metrics` (`likes`, `shares` = reposts +
quotes, `replies`, `views`) are filled in, and a note says how many were
filled. Posts deleted or made private on X stay `null`. If the X call fails
(bad token, rate limit), the result is returned unchanged with the reason.

## Development

```bash
pnpm install
pnpm check      # oxlint + tsc
pnpm test
pnpm build      # dist/cli.js (bundled) + library build
pnpm pack:mcpb  # alidade-<version>.mcpb for Claude Desktop
```

## Releasing

Bump `version` in both `package.json` and `manifest.json`, commit, then tag
and push:

```bash
git tag v0.1.1 && git push origin v0.1.1
```

The release workflow checks, tests, publishes to npm (Trusted Publishing),
and creates a GitHub release with the `.mcpb` attached.
