import type { CallToolResult } from "@modelcontextprotocol/server";

import { lookupXPosts, type FetchLike } from "./x.js";

export const MENTION_TOOLS = new Set(["search_mentions", "semantic_search_mentions"]);

const REMOTE_X_HINT = /^\d+ X posts? omit text/;

type Mention = {
  platform?: string;
  platformPostId?: string | null;
  content?: string | null;
  metrics?: unknown;
};

function isText(block: CallToolResult["content"][number]): block is { type: "text"; text: string } {
  return block.type === "text";
}

export async function fillXPosts(
  result: CallToolResult,
  bearerToken: string,
  fetchImpl?: FetchLike,
): Promise<CallToolResult> {
  const [first, ...rest] = result.content;
  if (result.isError || !first || !isText(first)) return result;

  let payload: { data?: Mention[] };
  try {
    payload = JSON.parse(first.text) as { data?: Mention[] };
  } catch {
    return result;
  }
  const missing = (payload.data ?? []).filter(
    (post): post is Mention & { platformPostId: string } =>
      post.platform === "x" && post.content === null && !!post.platformPostId,
  );
  if (missing.length === 0) return result;

  const others = rest.filter((block) => !(isText(block) && REMOTE_X_HINT.test(block.text)));
  let found: Awaited<ReturnType<typeof lookupXPosts>>;
  try {
    found = await lookupXPosts(
      missing.map((post) => post.platformPostId),
      bearerToken,
      fetchImpl,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ...result,
      content: [
        first,
        {
          type: "text",
          text: `Couldn't fetch text for ${missing.length} X posts: ${reason}. Their X post IDs are in platformPostId.`,
        },
        ...others,
      ],
    };
  }

  for (const post of missing) {
    const xPost = found.get(post.platformPostId);
    if (!xPost) continue;
    post.content = xPost.text;
    post.metrics = xPost.metrics;
  }
  const unavailable = missing.length - found.size;
  const note =
    `Filled in text and metrics for ${found.size} X post${found.size === 1 ? "" : "s"} from the X API using your X key.` +
    (unavailable > 0
      ? ` ${unavailable} X post${unavailable === 1 ? " is" : "s are"} no longer available on X (deleted or made private), so ${unavailable === 1 ? "its" : "their"} text stays null.`
      : "");

  return {
    ...result,
    content: [
      { type: "text", text: JSON.stringify(payload) },
      { type: "text", text: note },
      ...others,
    ],
  };
}
