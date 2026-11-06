# X Reputation

Type an X (Twitter) username and get a **reputation report**: Sorsa Score (with low / medium / high / elite label), score trend, follower quality (influencers / projects / VCs), verified followers, engagement rate, top smart followers, and new smart followers from the last 7 days.

Built for [@devameer0](https://x.com/devameer0). UI matches [Ghosted](https://devameer0.github.io/ghosted/).

No shadowban checks — this tool is about account reputation only.

## Security

The Sorsa API key stays on the server (`SORSA_API_KEY`). The browser only talks to `/api/lookup/...`.

## Local run

```bash
cp .env.example .env
# Demo data (no key):
SORSA_MOCK=1 npm start

# Live Sorsa (free key at https://sorsa.io):
# SORSA_API_KEY=... in .env, SORSA_MOCK=0
npm start
```

Open http://localhost:3000

## Request cost (full report)

Up to **9** Sorsa requests per username (sections load lazily; cache ~10 min):

| Section | Sorsa endpoints | Requests |
|---------|-----------------|----------|
| Profile + about | `GET /info`, `GET /about` | 2 |
| Score + trend | `GET /score`, `GET /score-changes` | 2 |
| Follower quality | `GET /followers-stats` | 1 |
| Verified followers | `GET /verified-followers` | 1 |
| Top smart followers | `GET /top-followers` | 1 |
| New smart followers (7d) | `GET /new-followers-7d` | 1 |
| Posts / engagement | `POST /user-tweets` | 1 |

Free Sorsa tier = 100 requests (~11 full reports before cache helps).

## Deploy (Render)

`render.yaml` is ready. Set `SORSA_API_KEY` in the Render dashboard. Do not commit the key. Do not deploy until the user asks.

## Stack

Node + Express + static front end. No database.
