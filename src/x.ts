export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type XPost = {
  text: string;
  metrics: {
    likes: number | null;
    shares: number | null;
    replies: number | null;
    views: number | null;
  };
};

type XApiPost = {
  id: string;
  text: string;
  note_tweet?: { text?: string };
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    impression_count?: number;
  };
};

const X_LOOKUP_URL = "https://api.x.com/2/tweets";
const X_LOOKUP_BATCH_SIZE = 100;

export class XApiError extends Error {}

export async function lookupXPosts(
  ids: string[],
  bearerToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<Map<string, XPost>> {
  const posts = new Map<string, XPost>();
  for (let start = 0; start < ids.length; start += X_LOOKUP_BATCH_SIZE) {
    const batch = ids.slice(start, start + X_LOOKUP_BATCH_SIZE);
    const url = new URL(X_LOOKUP_URL);
    url.searchParams.set("ids", batch.join(","));
    url.searchParams.set("tweet.fields", "text,note_tweet,public_metrics");
    const response = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!response.ok) {
      throw new XApiError(
        `X API returned ${response.status}${response.status === 429 ? " (rate limited)" : response.status === 401 ? " (check your X bearer token)" : ""}`,
      );
    }
    const body = (await response.json()) as { data?: XApiPost[] };
    for (const post of body.data ?? []) {
      const metrics = post.public_metrics;
      posts.set(post.id, {
        text: post.note_tweet?.text ?? post.text,
        metrics: {
          likes: metrics?.like_count ?? null,
          shares:
            metrics?.retweet_count === undefined
              ? null
              : metrics.retweet_count + (metrics.quote_count ?? 0),
          replies: metrics?.reply_count ?? null,
          views: metrics?.impression_count ?? null,
        },
      });
    }
  }
  return posts;
}
