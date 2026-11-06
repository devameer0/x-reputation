/** Mock Sorsa API responses matching documented schemas. Used when SORSA_MOCK=1 or no API key. */

function profile(username) {
  const u = (username || 'devameer0').replace(/^@/, '').toLowerCase();
  return {
    id: '1234567890',
    username: u,
    display_name: u === 'devameer0' ? 'devameer' : u.charAt(0).toUpperCase() + u.slice(1),
    description: 'Builder. Crypto. Shipping tools for X.',
    location: 'Lagos, Nigeria',
    created_at: '2021-03-14T12:00:00Z',
    followers_count: 4820,
    followings_count: 891,
    tweets_count: 12450,
    favourites_count: 3200,
    media_count: 410,
    verified: true,
    protected: false,
    can_dm: true,
    possibly_sensitive: false,
    profile_image_url: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png',
    profile_background_image_url: '',
    bio_urls: ['https://devameer0.github.io/ghosted/'],
    pinned_tweet_ids: ['1980000000000000000'],
  };
}

function about() {
  return {
    country: 'Nigeria',
    username_change_count: 2,
    last_username_change_at: '2023-08-01T00:00:00Z',
    is_blue_verified: true,
    premium_start_at: '2024-02-10T00:00:00Z',
    source: 'Twitter',
    affiliate_username: '',
  };
}

function score() {
  return { score: 1.42 };
}

function scoreChanges() {
  return { week_delta: 0.08, month_delta: 0.31 };
}

function followersStats() {
  return {
    followers_count: 28,
    influencers_count: 18,
    projects_count: 7,
    venture_capitals_count: 3,
    user_protected: false,
  };
}

function topUser(i, role) {
  const names = [
    ['VitalikButerin', 'vitalik.eth', 98.2],
    ['cz_binance', 'CZ 🔶 BNB', 87.5],
    ['aixbt_agent', 'AIXBT', 64.1],
    ['CryptoCred', 'Crypto Cred', 41.3],
    ['KaitoAI', 'Kaito', 38.9],
    ['primus_labs', 'Primus Labs', 22.4],
    ['SorsaApp', 'Sorsa', 18.7],
    ['elonmusk', 'Elon Musk', 120.0],
  ];
  const [username, display_name, score] = names[i % names.length];
  return {
    id: String(1000 + i),
    username,
    display_name,
    description: role === 'follower' ? 'Following along' : 'Building in public',
    followers_count: 50000 + i * 1200,
    followings_count: 400 + i * 10,
    tweets_count: 8000 + i * 100,
    verified: true,
    protected: false,
    can_dm: false,
    created_at: '2018-01-01T00:00:00Z',
    profile_image_url: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png',
    profile_background_image_url: '',
    score,
    follower_date: '2025-11-01T10:00:00Z',
    followerDate: '2025-11-01T10:00:00Z',
  };
}

function topFollowers() {
  return { users: Array.from({ length: 8 }, (_, i) => topUser(i, 'follower')) };
}

function topFollowing() {
  return { users: Array.from({ length: 8 }, (_, i) => topUser(i + 2, 'following')) };
}

function newFollowers() {
  return {
    users: Array.from({ length: 5 }, (_, i) => ({
      ...topUser(i + 4, 'follower'),
      followerDate: new Date(Date.now() - i * 86400000).toISOString(),
    })),
  };
}

function newFollowing() {
  return {
    users: Array.from({ length: 4 }, (_, i) => ({
      ...topUser(i + 1, 'following'),
      followerDate: new Date(Date.now() - i * 86400000).toISOString(),
    })),
  };
}

function tweets(username) {
  const u = (username || 'devameer0').replace(/^@/, '');
  const now = Date.now();
  const samples = [
    { text: 'Just shipped a new X lookup tool. Drop a username and see everything about the account.', likes: 42, rts: 11, replies: 8, quotes: 2, views: 3200, bookmarks: 5 },
    { text: 'Sorsa Score is underrated for finding smart followers in crypto.', likes: 67, rts: 19, replies: 14, quotes: 4, views: 5100, bookmarks: 9 },
    { text: 'Building in public. Next up: more tools for CT.', likes: 28, rts: 6, replies: 5, quotes: 1, views: 1800, bookmarks: 3 },
    { text: 'If you care about quality follows, check your top followers by score.', likes: 55, rts: 14, replies: 9, quotes: 3, views: 4100, bookmarks: 7 },
    { text: 'GM. Shipping today.', likes: 18, rts: 3, replies: 4, quotes: 0, views: 900, bookmarks: 1 },
  ];
  return {
    next_cursor: null,
    tweets: samples.map((s, i) => ({
      id: String(1980000000000000000n + BigInt(i)),
      full_text: s.text,
      created_at: new Date(now - i * 3600000 * 18).toISOString(),
      lang: 'en',
      likes_count: s.likes,
      retweet_count: s.rts,
      reply_count: s.replies,
      quote_count: s.quotes,
      view_count: s.views,
      bookmark_count: s.bookmarks,
      is_reply: false,
      is_quote_status: false,
      made_with_ai: false,
      paid_partnership: false,
      is_replies_limited: false,
      conversation_id_str: String(1980000000000000000n + BigInt(i)),
      entities: [],
      user: profile(u),
    })),
  };
}

const HANDLERS = {
  '/info': (q) => profile(q.username),
  '/about': () => about(),
  '/score': () => score(),
  '/score-changes': () => scoreChanges(),
  '/followers-stats': () => followersStats(),
  '/top-followers': () => topFollowers(),
  '/top-following': () => topFollowing(),
  '/new-followers-7d': () => newFollowers(),
  '/new-following-7d': () => newFollowing(),
  '/verified-followers': () => ({
    next_cursor: null,
    users: Array.from({ length: 14 }, (_, i) => {
      const u = topUser(i, 'follower');
      delete u.score;
      return { ...u, verified: true };
    }),
  }),
};

function mockGet(path, query) {
  const fn = HANDLERS[path];
  if (!fn) {
    const err = new Error(`Mock: unknown path ${path}`);
    err.status = 404;
    throw err;
  }
  return fn(query || {});
}

function mockPost(path, body) {
  if (path === '/user-tweets') {
    return tweets(body?.username || body?.user_link);
  }
  const err = new Error(`Mock: unknown POST ${path}`);
  err.status = 404;
  throw err;
}

module.exports = { mockGet, mockPost, profile };
