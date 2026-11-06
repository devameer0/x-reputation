// X Reputation proxy: Supabase Edge Function. Key lives in the SORSA_API_KEY secret.
const SORSA = "https://api.sorsa.io/v3";
const ALLOWED_ORIGINS = ["https://devameer0.github.io", "http://localhost:3000", "http://localhost:3456"];
const USER_RE = /^[A-Za-z0-9_]{1,15}$/;
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { exp: number; val: unknown }>();
const hits = new Map<string, { n: number; reset: number }>();

const GET_MAP: Record<string, string[]> = {
  profile: ["/info", "/about"],
  score: ["/score", "/score-changes"],
  "followers-stats": ["/followers-stats"],
  "verified-followers": ["/verified-followers"],
  "top-followers": ["/top-followers"],
  "top-following": ["/top-following"],
  "new-followers": ["/new-followers-7d"],
  "new-following": ["/new-following-7d"],
};

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Vary": "Origin",
  };
}
const key = () => (Deno.env.get("SORSA_API_KEY") || "").trim();

async function sorsa(path: string, username: string, post = false) {
  const ck = `${path}:${username.toLowerCase()}`;
  const c = cache.get(ck);
  if (c && c.exp > Date.now()) return { data: c.val, cached: true };
  const init: RequestInit = post
    ? { method: "POST", headers: { ApiKey: key(), "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ username, type: "posts", with_replies: false }) }
    : { headers: { ApiKey: key(), Accept: "application/json" } };
  const url = post ? SORSA + path : `${SORSA}${path}?username=${encodeURIComponent(username)}`;
  const r = await fetch(url, init);
  const text = await r.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!r.ok) { const e: any = new Error(body.message || `Sorsa error ${r.status}`); e.status = r.status; throw e; }
  cache.set(ck, { exp: Date.now() + TTL, val: body });
  return { data: body, cached: false };
}

Deno.serve(async (req) => {
  const h = { ...cors(req), "Content-Type": "application/json" };
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: h });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "GET") return json({ message: "Method not allowed" }, 405);

  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("x-reputation");
  const rest = i >= 0 ? parts.slice(i + 1) : parts;

  if (rest[0] === "health" || rest.length === 0)
    return json({ ok: true, mock: false, hasKey: key().length > 0, cacheEntries: cache.size, cacheTtlSec: TTL / 1000 });

  // rate limit: 30/min per IP
  const ip = (req.headers.get("x-forwarded-for") || "anon").split(",")[0].trim();
  const now = Date.now();
  const rl = hits.get(ip);
  if (!rl || rl.reset < now) hits.set(ip, { n: 1, reset: now + 60000 });
  else if (++rl.n > 30) return json({ message: "Too many lookups. Wait a minute and try again." }, 429);

  if (rest[0] !== "lookup" || rest.length !== 3) return json({ message: "Not found" }, 404);
  const username = decodeURIComponent(rest[1]).replace(/^@+/, "");
  const section = rest[2];
  if (!USER_RE.test(username)) return json({ message: "Invalid username. Use 1–15 letters, numbers, or underscores (no @)." }, 400);
  if (!key()) return json({ message: "Server is missing SORSA_API_KEY." }, 500);

  try {
    if (section === "tweets") {
      const r = await sorsa("/user-tweets", username, true);
      const tweets = (r.data as any).tweets || [];
      let eng = 0, views = 0;
      for (const t of tweets) {
        eng += (t.likes_count || 0) + (t.retweet_count || 0) + (t.reply_count || 0) + (t.quote_count || 0) + (t.bookmark_count || 0);
        views += t.view_count || 0;
      }
      return json({ tweets, engagement: {
        tweetsAnalyzed: tweets.length, totalEngagement: eng, totalViews: views,
        avgEngagementPerTweet: tweets.length ? eng / tweets.length : 0,
        engagementRatePct: views ? Number(((eng / views) * 100).toFixed(2)) : 0,
      }, meta: { cached: r.cached } });
    }
    const paths = GET_MAP[section];
    if (!paths) return json({ message: "Not found" }, 404);
    const rs = await Promise.all(paths.map((p) => sorsa(p, username)));
    const d = rs.map((r) => r.data as any);
    const meta = { cached: rs.every((r) => r.cached) };
    switch (section) {
      case "profile": return json({ username, profile: d[0], about: d[1], meta });
      case "score": return json({ score: d[0], changes: d[1], meta });
      case "followers-stats": return json({ stats: d[0], meta });
      case "verified-followers": {
        const users = d[0].users || [];
        return json({ count: users.length, hasMore: Boolean(d[0].next_cursor), users: users.slice(0, 20), meta });
      }
      default: return json({ users: d[0].users || [], meta });
    }
  } catch (e: any) {
    const s = e.status >= 400 && e.status < 600 ? e.status : 502;
    return json({ message: e.message || "Upstream error" }, s);
  }
});
