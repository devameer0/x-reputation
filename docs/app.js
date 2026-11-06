(() => {
  const form = document.getElementById('lookup-form');
  const input = document.getElementById('username');
  const btn = document.getElementById('lookup-btn');
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('error');
  const results = document.getElementById('results');

  const fmt = (n) => {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const x = Number(n);
    if (Math.abs(x) >= 1e6) return (x / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(x) >= 1e3) return (x / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    if (Math.abs(x) >= 100) return String(Math.round(x * 10) / 10);
    return String(Math.round(x * 100) / 100);
  };

  const parseWhen = (iso) => {
    if (!iso) return null;
    let d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
    // Twitter classic: "Sat Sep 14 07:54:09 +0000 2019"
    d = new Date(String(iso).replace(' +0000', ' UTC'));
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const fmtDate = (iso) => {
    const d = parseWhen(iso);
    if (!d) return '—';
    try {
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  };

  const accountAge = (iso) => {
    const d = parseWhen(iso);
    if (!d) return '—';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 30) return days + ' days';
    const months = Math.floor(days / 30);
    if (months < 24) return months + ' months';
    const years = Math.floor(days / 365);
    const rem = Math.floor((days % 365) / 30);
    return years + 'y' + (rem ? ' ' + rem + 'mo' : '');
  };

  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const avatarUrl = (url) => {
    if (!url) return 'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png';
    return url.replace('_normal.', '_400x400.');
  };

  /** Bands calibrated to real Sorsa Score ranges (raw number still shown). */
  function scoreTier(score) {
    const s = Number(score);
    if (!Number.isFinite(s)) return { key: 'low', label: 'Unknown', blurb: 'No Sorsa Score yet for this account.' };
    if (s >= 400) return { key: 'elite', label: 'Elite', blurb: 'Very strong recognition among crypto influencers, projects, and VCs.' };
    if (s >= 100) return { key: 'high', label: 'High', blurb: 'Clear reputation in crypto circles — smart accounts know this handle.' };
    if (s >= 25) return { key: 'medium', label: 'Medium', blurb: 'Some recognition. Growing, but not yet a top smart-follower magnet.' };
    return { key: 'low', label: 'Low', blurb: 'Little tracked recognition so far among indexed crypto accounts.' };
  }

  function setStatus(msg) {
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
  }

  function setError(msg) {
    if (!msg) {
      errorEl.hidden = true;
      errorEl.innerHTML = '';
      return;
    }
    errorEl.hidden = false;
    errorEl.innerHTML = `<strong>Could not load</strong>${esc(msg)}`;
  }

  function sectionBody(name) {
    return document.querySelector(`[data-section="${name}"] [data-body]`);
  }

  function showSkeleton(name) {
    const el = sectionBody(name);
    if (el) el.innerHTML = '<div class="skeleton"></div>';
  }

  function showSecError(name, msg) {
    const el = sectionBody(name);
    if (el) el.innerHTML = `<p class="sec-err">${esc(msg || 'Not available for this account.')}</p>`;
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    let body = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    if (!res.ok) {
      const err = new Error(body.message || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function renderProfileBasics(data) {
    const p = data.profile || {};
    const a = data.about || {};
    document.getElementById('avatar').src = avatarUrl(p.profile_image_url);
    document.getElementById('avatar').alt = (p.display_name || p.username || '') + ' avatar';
    document.getElementById('display-name').textContent = p.display_name || p.username || '—';
    const badge = document.getElementById('verified-badge');
    badge.hidden = !(p.verified || a.is_blue_verified);
    const handle = document.getElementById('handle-link');
    handle.textContent = '@' + (p.username || '');
    handle.href = 'https://x.com/' + encodeURIComponent(p.username || '');
    document.getElementById('bio').textContent = p.description || '';

    const followers = Number(p.followers_count) || 0;
    const following = Number(p.followings_count) || 0;
    const ratio = following > 0 ? (followers / following).toFixed(2) : followers > 0 ? '∞' : '—';

    document.getElementById('profile-stats').innerHTML = `
      <div><dt>Followers</dt><dd>${fmt(followers)}</dd></div>
      <div><dt>Following</dt><dd>${fmt(following)}</dd></div>
      <div><dt>Follower / following</dt><dd>${esc(ratio)} <span class="ratio-chip">ratio</span></dd></div>
      <div><dt>Posts</dt><dd>${fmt(p.tweets_count)}</dd></div>`;

    document.getElementById('about-grid').innerHTML = `
      <div><dt>Country</dt><dd>${esc(a.country || p.location || '—')}</dd></div>
      <div><dt>Joined</dt><dd>${esc(fmtDate(p.created_at))}</dd></div>
      <div><dt>Account age</dt><dd>${esc(accountAge(p.created_at))}</dd></div>
      <div><dt>Username changes</dt><dd>${esc(a.username_change_count ?? '—')}</dd></div>
      <div><dt>Last rename</dt><dd>${esc(fmtDate(a.last_username_change_at))}</dd></div>
      <div><dt>Premium since</dt><dd>${esc(fmtDate(a.premium_start_at))}</dd></div>`;

    return { followers, following, ratio, created_at: p.created_at, country: a.country || p.location };
  }

  function renderScore(data) {
    const panel = document.getElementById('score-panel');
    const plain = document.getElementById('score-plain');
    const score = data.score?.score;
    const week = Number(data.changes?.week_delta);
    const month = Number(data.changes?.month_delta);
    const tier = scoreTier(score);
    const sign = (n) => (Number.isFinite(n) ? (n > 0 ? '+' : '') + fmt(n) : '—');
    const weekCls = week > 0 ? 'up' : week < 0 ? 'down' : '';
    const monthCls = month > 0 ? 'up' : month < 0 ? 'down' : '';
    let trendText = 'Score is flat recently.';
    if (week > 0 || month > 0) trendText = 'Reputation is rising — more smart accounts are noticing this handle.';
    else if (week < 0 || month < 0) trendText = 'Reputation cooled a bit over the last weeks.';

    panel.innerHTML = `
      <div class="score-main">
        <span class="score-label-text">Sorsa Score</span>
        <div class="score-big">${fmt(score)}</div>
        <span class="rep-tier ${tier.key}">${esc(tier.label)}</span>
      </div>
      <div class="score-side">
        <div class="score-deltas">
          <div class="delta ${weekCls}"><span>Trend · 7 days</span><b>${sign(week)}</b></div>
          <div class="delta ${monthCls}"><span>Trend · 30 days</span><b>${sign(month)}</b></div>
        </div>
        <p class="hint" style="margin:0">${esc(tier.blurb)}</p>
      </div>`;
    plain.hidden = false;
    plain.textContent = trendText + ' Sorsa Score estimates how known this account is among crypto influencers, projects, and VCs.';
  }

  function renderQuality(data) {
    const el = sectionBody('quality');
    const s = data.stats || {};
    const inf = Number(s.influencers_count) || 0;
    const proj = Number(s.projects_count) || 0;
    const vc = Number(s.venture_capitals_count) || 0;
    const total = Math.max(Number(s.followers_count) || inf + proj + vc, 1);
    const row = (label, n) => {
      const pct = Math.min(100, Math.round((n / total) * 100));
      return `<div class="qbar"><span>${esc(label)}</span><div class="qtrack"><div class="qfill" style="width:${pct}%"></div></div><b>${fmt(n)}</b></div>`;
    };
    el.innerHTML = `
      <p class="plain" style="margin:0 0 .9rem">Breakdown of <b>tracked</b> crypto followers (not every follower on X).</p>
      <div class="quality-bars">
        ${row('Influencers', inf)}
        ${row('Projects', proj)}
        ${row('VCs', vc)}
      </div>
      <p class="hint" style="margin-top:.9rem">${fmt(s.followers_count)} tracked smart followers total.</p>`;
  }

  function renderVerified(data) {
    const el = sectionBody('verified');
    const count = data.count ?? (data.users || []).length;
    const label = data.hasMore ? fmt(count) + '+' : fmt(count);
    el.innerHTML = `
      <div class="metric-xl">${esc(label)}</div>
      <p class="plain" style="margin:.6rem 0 0">${data.hasMore ? 'At least this many verified followers (first page; more exist).' : 'Verified followers on the first results page.'} More verified followers usually means stronger social proof.</p>`;
  }

  function renderEngagement(data) {
    const el = sectionBody('engagement');
    const eng = data.engagement || {};
    el.innerHTML = `
      <div class="metric-xl">${fmt(eng.engagementRatePct)}%</div>
      <p class="plain" style="margin:.6rem 0 0">Engagement rate from the latest ${fmt(eng.tweetsAnalyzed)} posts (likes + replies + reposts + quotes + bookmarks ÷ views). Avg engagement per post: <b>${fmt(eng.avgEngagementPerTweet)}</b>.</p>`;
  }

  function renderUserList(section, users, { showScore, emptyMsg } = {}) {
    const el = sectionBody(section);
    if (!users || !users.length) {
      el.innerHTML = `<p class="empty">${esc(emptyMsg || 'No tracked accounts found.')}</p>`;
      return;
    }
    el.innerHTML =
      '<ul class="user-list">' +
      users
        .slice(0, 12)
        .map((u) => {
          const scoreBit = showScore && u.score != null ? `<span class="score-chip">${fmt(u.score)}</span>` : '';
          const when = u.followerDate || u.follower_date;
          const sub = when ? 'Followed ' + fmtDate(when) : '@' + (u.username || '');
          return `<li><a href="https://x.com/${esc(u.username)}" target="_blank" rel="noopener noreferrer">
            <img src="${esc(avatarUrl(u.profile_image_url))}" alt="" width="40" height="40" loading="lazy">
            <span class="who"><b>${esc(u.display_name || u.username)}</b><small>${esc(sub)}</small></span>
            ${scoreBit}
          </a></li>`;
        })
        .join('') +
      '</ul>';
  }

  function renderTweets(data) {
    const el = sectionBody('tweets');
    const tweets = data.tweets || [];
    if (!tweets.length) {
      el.innerHTML = '<p class="empty">No recent posts.</p>';
      return;
    }
    el.innerHTML =
      '<ul class="tweet-list">' +
      tweets
        .slice(0, 8)
        .map((t) => {
          const link = t.id ? `https://x.com/i/status/${esc(t.id)}` : '#';
          return `<li class="tweet">
            <p>${esc(t.full_text || '')}</p>
            <div class="meta">
              <span>${esc(fmtDate(t.created_at))}</span>
              <span>♥ ${fmt(t.likes_count)}</span>
              <span>↻ ${fmt(t.retweet_count)}</span>
              <span>💬 ${fmt(t.reply_count)}</span>
              <span>👁 ${fmt(t.view_count)}</span>
              <a href="${link}" target="_blank" rel="noopener noreferrer">Open</a>
            </div>
          </li>`;
        })
        .join('') +
      '</ul>';
  }

  async function loadSection(username, name, path, renderer) {
    showSkeleton(name);
    try {
      const data = await fetchJson(`https://dxsgndmgpwhpduwzwowr.supabase.co/functions/v1/x-reputation/lookup/${encodeURIComponent(username)}/${path}`);
      renderer(data);
      return data;
    } catch (err) {
      showSecError(name, err.message);
      return null;
    }
  }

  async function runLookup(raw) {
    const username = String(raw || '')
      .trim()
      .replace(/^@+/, '')
      .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '')
      .split(/[/?#]/)[0]
      .replace(/^@+/, '');

    if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
      setError('Use a valid X username (1–15 letters, numbers, or underscores).');
      results.hidden = true;
      return;
    }

    setError('');
    setStatus('Building reputation report…');
    btn.disabled = true;
    results.hidden = true;
    document.getElementById('score-panel').innerHTML = '<div class="skeleton" style="height:120px"></div>';
    document.getElementById('score-plain').hidden = true;
    ['quality', 'verified', 'engagement', 'top-followers', 'new-followers', 'tweets'].forEach(showSkeleton);

    try {
      const profile = await fetchJson(`https://dxsgndmgpwhpduwzwowr.supabase.co/functions/v1/x-reputation/lookup/${encodeURIComponent(username)}/profile`);
      renderProfileBasics(profile);
      results.hidden = false;
      const mockNote = profile.meta?.mock ? ' (demo data — add SORSA_API_KEY for live results)' : '';
      setStatus(`Reputation report for @${username}${mockNote}`);

      // Score is the hero
      fetchJson(`https://dxsgndmgpwhpduwzwowr.supabase.co/functions/v1/x-reputation/lookup/${encodeURIComponent(username)}/score`)
        .then(renderScore)
        .catch((err) => {
          document.getElementById('score-panel').innerHTML = `<p class="sec-err">${esc(err.message)}</p>`;
        });

      loadSection(username, 'quality', 'followers-stats', renderQuality);
      loadSection(username, 'verified', 'verified-followers', renderVerified);
      loadSection(username, 'top-followers', 'top-followers', (d) =>
        renderUserList('top-followers', d.users, {
          showScore: true,
          emptyMsg: 'No high-score followers indexed yet.',
        })
      );
      loadSection(username, 'new-followers', 'new-followers', (d) =>
        renderUserList('new-followers', d.users, {
          emptyMsg: 'No new tracked smart followers in the last 7 days.',
        })
      );

      // Tweets power engagement + list
      fetchJson(`https://dxsgndmgpwhpduwzwowr.supabase.co/functions/v1/x-reputation/lookup/${encodeURIComponent(username)}/tweets`)
        .then((d) => {
          renderEngagement(d);
          renderTweets(d);
        })
        .catch((err) => {
          showSecError('engagement', err.message);
          showSecError('tweets', err.message);
        });
    } catch (err) {
      results.hidden = true;
      setStatus('');
      setError(err.message || 'Something went wrong.');
    } finally {
      btn.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runLookup(input.value);
  });

  const params = new URLSearchParams(location.search);
  const q = params.get('u') || params.get('username');
  if (q) {
    input.value = q.replace(/^@/, '');
    runLookup(q);
  }
})();
