import { describe, expect, it, vi } from "vitest";

import { lookupXPosts } from "../src/x.js";

describe("lookupXPosts", () => {
  it("looks IDs up in batches of 100", async () => {
    const ids = Array.from({ length: 250 }, (_, index) => String(index));
    const fetchImpl = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify({
            data: new URL(url).searchParams
              .get("ids")!
              .split(",")
              .map((id) => ({ id, text: `post ${id}` })),
          }),
        ),
    );

    const posts = await lookupXPosts(ids, "token", fetchImpl);

    expect(
      fetchImpl.mock.calls.map(([url]) => new URL(url).searchParams.get("ids")!.split(",").length),
    ).toEqual([100, 100, 50]);
    expect(posts.size).toBe(250);
    expect(posts.get("249")).toEqual({
      text: "post 249",
      metrics: { likes: null, shares: null, replies: null, views: null },
    });
  });
});
