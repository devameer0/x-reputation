'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { mockGet, mockPost } = require('./mock');

const PORT = Number(process.env.PORT) || 3000;
const SORSA_BASE = 'https://api.sorsa.io/v3';
const API_KEY = (process.env.SORSA_API_KEY || '').trim();
const USE_MOCK = process.env.SORSA_MOCK === '1' || !API_KEY;
const CACHE_TTL_MS = (Number(process.env.CACHE_TTL_SEC) || 600) * 1000;

const USERNAME_RE = /^[A-Za-z0-9_]{1,15}$/;

/** @type {Map<string, { expires: number, value: any }>} */
const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
  // Soft cap so the map cannot grow forever
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function normalizeUsername(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let u = raw.trim();
  u = u.replace(/^@+/, '');
  u = u.replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '');
  u = u.split(/[/?#]/)[0] || '';
  u = u.replace(/^@+/, '').trim();
  if (!USERNAME_RE.test(u)) return null;
  return u;
}

async function sorsaGet(apiPath, username) {
  const cacheKey = `GET:${apiPath}:${username.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { data: cached, cached: true };

  if (USE_MOCK) {
    const data = mockGet(apiPath, { username });
    cacheSet(cacheKey, data);
    return { data, cached: false, mock: true };
  }

  const url = new URL(SORSA_BASE + apiPath);
  url.searchParams.set('username', username);

  const res = await fetch(url, {
    method: 'GET',
    headers: { ApiKey: API_KEY, Accept: 'application/json' },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text || 'Invalid JSON from Sorsa' };
  }
  if (!res.ok) {
    const err = new Error(body.message || `Sorsa error ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  cacheSet(cacheKey, body);
  return { data: body, cached: false };
}

async function sorsaPost(apiPath, body) {
  const username = body.username || '';
  const cacheKey = `POST:${apiPath}:${username.toLowerCase()}:${body.type || 'posts'}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { data: cached, cached: true };

  if (USE_MOCK) {
    const data = mockPost(apiPath, body);
    cacheSet(cacheKey, data);
    return { data, cached: false, mock: true };
  }

  const res = await fetch(SORSA_BASE + apiPath, {
    method: 'POST',
    headers: {
      ApiKey: API_KEY,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { message: text || 'Invalid JSON from Sorsa' };
  }
  if (!res.ok) {
    const err = new Error(parsed.message || `Sorsa error ${res.status}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  cacheSet(cacheKey, parsed);
  return { data: parsed, cached: false };
}

function requireUsername(req, res) {
  const username = normalizeUsername(req.params.username);
  if (!username) {
    res.status(400).json({
      message: 'Invalid username. Use 1–15 letters, numbers, or underscores (no @).',
    });
    return null;
  }
  return username;
}

function sendError(res, err) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
  res.status(status).json({
    message: err.message || 'Upstream error',
    ...(err.body && err.body.message ? {} : {}),
  });
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many lookups. Wait a minute and try again.' },
});
app.use('/api/', limiter);


app.get('/api/usage', async (_req, res) => {
  try {
    if (USE_MOCK) {
      return res.json({
        remaining: null,
        allocated: null,
        expires_at: null,
        meta: { mock: true, sorsaRequests: 0 },
      });
    }
    const cacheKey = 'GET:/key-usage-info:__self__';
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, meta: { mock: false, cached: true, sorsaRequests: 0 } });
    }
    const r = await fetch(SORSA_BASE + '/key-usage-info', {
      headers: { ApiKey: API_KEY, Accept: 'application/json' },
    });
    const text = await r.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
    if (!r.ok) {
      const err = new Error(body.message || `Sorsa error ${r.status}`);
      err.status = r.status;
      throw err;
    }
    cacheSet(cacheKey, body);
    res.json({ ...body, meta: { mock: false, cached: false, sorsaRequests: 1 } });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mock: USE_MOCK,
    hasKey: Boolean(API_KEY),
    cacheEntries: cache.size,
    cacheTtlSec: Math.round(CACHE_TTL_MS / 1000),
  });
});

/** Core profile: /info + /about (2 Sorsa requests, or cache hits) */
app.get('/api/lookup/:username/profile', async (req, res) => {
  const username = requireUsername(req, res);
  if (!username) return;
  try {
    const [info, about] = await Promise.all([
      sorsaGet('/info', username),
      sorsaGet('/about', username),
    ]);
    res.json({
      username,
      profile: info.data,
      about: about.data,
      meta: {
        mock: USE_MOCK,
        cached: info.cached && about.cached,
        sorsaRequests: (info.cached ? 0 : 1) + (about.cached ? 0 : 1),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/lookup/:username/score', async (req, res) => {
  const username = requireUsername(req, res);
  if (!username) return;
  try {
    const [score, changes] = await Promise.all([
      sorsaGet('/score', username),
      sorsaGet('/score-changes', username),
    ]);
    res.json({
      score: score.data,
      changes: changes.data,
      meta: {
        mock: USE_MOCK,
        cached: score.cached && changes.cached,
        sorsaRequests: (score.cached ? 0 : 1) + (changes.cached ? 0 : 1),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/lookup/:username/followers-stats', async (req, res) => {
  const username = requireUsername(req, res);
  if (!username) return;
  try {
    const result = await sorsaGet('/followers-stats', username);
    res.json({
      stats: result.data,
      meta: { mock: USE_MOCK, cached: result.cached, sorsaRequests: result.cached ? 0 : 1 },
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/lookup/:username/top-followers', async (req, res) => {
  const username = requireUsername(req, res);
  if (!username) return;
  try {
    const result = await sorsaGet('/top-followers', username);
    res.json({
      users: result.data.users || [],
      meta: { mock: USE_MOCK, cached: result.cached, sorsaRequests: result.cached ? 0 : 1 },
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/lookup/:username/top-following', async (req, res) => {
  const username = requireUsername(req, res);
  if (!username) return;
  try {
    const result = await sorsaGet('/top-following', username);
    res.json({
      users: result.data.users || [],
      meta: { mock: USE_MOCK, cached: result.cached, sorsaRequests: result.cached ? 0 : 1 },
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/lookup/:username/new-followers', async (req, res) => {
  const username = requireUsername(req, res);
  if (!username) return;
  try {
    const result = await sorsaGet('/new-followers-7d', username);
    res.json({
      users: result.data.users || [],
      meta: { mock: USE_MOCK, cached: result.cached, sorsaRequests: result.cached ? 0 : 1 },
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/lookup/:username/new-following', async (req, res) => {
  const username = requireUsername(req, res);
  if (!username) return;
  try {
    const result = await sorsaGet('/new-following-7d', username);
    res.json({
      users: result.data.users || [],
      meta: { mock: USE_MOCK, cached: result.cached, sorsaRequests: result.cached ? 0 : 1 },
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/lookup/:username/tweets', async (req, res) => {
  const username = requireUsername(req, res);
  if (!username) return;
  try {
    const result = await sorsaPost('/user-tweets', {
      username,
      type: 'posts',
      with_replies: false,
    });
    const tweets = result.data.tweets || [];
    let engSum = 0;
    let viewSum = 0;
    for (const t of tweets) {
      const eng =
        (t.likes_count || 0) +
        (t.retweet_count || 0) +
        (t.reply_count || 0) +
        (t.quote_count || 0) +
        (t.bookmark_count || 0);
      engSum += eng;
      viewSum += t.view_count || 0;
    }
    const n = tweets.length || 1;
    const engagementRate =
      viewSum > 0 ? (engSum / viewSum) * 100 : tweets.length ? (engSum / n / 100) * 100 : 0;
    res.json({
      tweets,
      engagement: {
        tweetsAnalyzed: tweets.length,
        totalEngagement: engSum,
        totalViews: viewSum,
        avgEngagementPerTweet: tweets.length ? engSum / tweets.length : 0,
        engagementRatePct: Number(engagementRate.toFixed(2)),
      },
      meta: { mock: USE_MOCK, cached: result.cached, sorsaRequests: result.cached ? 0 : 1 },
    });
  } catch (err) {
    sendError(res, err);
  }
});


app.get('/api/lookup/:username/verified-followers', async (req, res) => {
  const username = requireUsername(req, res);
  if (!username) return;
  try {
    const result = await sorsaGet('/verified-followers', username);
    const users = result.data.users || [];
    res.json({
      count: users.length,
      hasMore: Boolean(result.data.next_cursor),
      users: users.slice(0, 20),
      meta: { mock: USE_MOCK, cached: result.cached, sorsaRequests: result.cached ? 0 : 1 },
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', index: 'index.html' }));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`sorsa-x-lookup on http://localhost:${PORT} mock=${USE_MOCK} hasKey=${Boolean(API_KEY)}`); // never log API_KEY
});
