// src/services/dashboardService.js
// Dashboard aggregation service: reads AI cached suggestions, hydrates from Postgres, falls back gracefully.

const pool = require('../config/pool');
const { getPool } = require('../db');
const { AI_HUB_URL } = require('../config/env');

// Node 18+ has global fetch; add ponyfill for older.
const fetchHttp = global.fetch || ((...a) => import('node-fetch').then(({ default: f }) => f(...a)));

const DEFAULT_NEWS_LIMIT = 5;
const DEFAULT_EVENTS_LIMIT = 8;
const DEFAULT_POLLS_LIMIT = 2;
const DEFAULT_SPOTLIGHTS_LIMIT = 3;
const DEFAULT_REWARD_LIMIT = 5;
const DEFAULT_CALENDAR_LIMIT = 6;

// ---------- small helpers (no large dummy payloads) ----------
const ensureArray = (v) => (Array.isArray(v) ? v : []);
const ensureString = (v, fb = '') => (typeof v === 'string' && v.trim() ? v.trim() : fb);
const ensureNumber = (v, fb = null) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return fb;
};
const toISOString = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value.trim() : d.toISOString();
  }
  return '';
};
const toDateOnly = (value) => {
  const iso = toISOString(value);
  return iso ? iso.slice(0, 10) : '';
};
const toTime = (value) => {
  const iso = toISOString(value);
  return iso ? iso.slice(11, 16) : '';
};
const parseLimit = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const toTimestamp = (value) => {
  const iso = toISOString(value);
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

// ---------- DB fetchers (schema-aligned) ----------
async function fetchLatestNews(limit = DEFAULT_NEWS_LIMIT) {
  const { rows } = await getPool().query(
    `SELECT id, title, summary, body, link, image_url, COALESCE(published_at, created_at) AS published_at
       FROM campus_news
       ORDER BY COALESCE(published_at, created_at) DESC NULLS LAST, id DESC
       LIMIT $1`,
    [limit]
  );
  return rows;
}

async function fetchUpcomingEvents(limit = DEFAULT_EVENTS_LIMIT) {
  const { rows } = await getPool().query(
    `SELECT id, title, description, location, start_time, end_time, image_url
       FROM campus_events
       WHERE start_time >= NOW()
       ORDER BY start_time ASC NULLS LAST, id ASC
       LIMIT $1`,
    [limit]
  );
  return rows;
}

async function fetchPublishedCommunityPosts(limit = DEFAULT_EVENTS_LIMIT) {
  const { rows } = await getPool().query(
    `SELECT id, title, category, description, tags, created_at
    FROM community_posts
    WHERE moderation_status = 'publish'
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    ...r,
    content: r.description,
  }));
}

async function fetchActivePolls(limit = DEFAULT_POLLS_LIMIT) {
  const { rows: polls } = await getPool().query(
    `SELECT id, title, description, is_active, expires_at, created_at
       FROM polls
       WHERE is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY COALESCE(expires_at, created_at + INTERVAL '365 days') ASC, created_at DESC
       LIMIT $1`,
    [limit]
  );
  if (!polls.length) return [];

  const ids = polls.map((p) => p.id);
  const { rows: options } = await getPool().query(
    `SELECT o.id, o.poll_id, o.label, o.created_at, COUNT(v.id)::INT AS vote_count
       FROM poll_options o
       LEFT JOIN poll_votes v ON v.option_id = o.id
      WHERE o.poll_id = ANY($1::INT[])
      GROUP BY o.id
      ORDER BY o.created_at ASC, o.id ASC`,
    [ids]
  );
  const byPoll = options.reduce((acc, o) => {
    const arr = acc[o.poll_id] || (acc[o.poll_id] = []);
    arr.push({ id: o.id, name: o.label, vote_count: Number(o.vote_count) || 0 });
    return acc;
  }, {});
  return polls.map((p) => ({ ...p, options: byPoll[p.id] || [] }));
}

// ---------- Hydration helpers (preserve order from AI) ----------
async function fetchEventsByIdsInOrder(eventIds) {
  if (!eventIds?.length) return [];
  const ids = eventIds.map(Number);
  const { rows } = await pool.query(`SELECT * FROM campus_events WHERE id = ANY($1::int[])`, [ids]);
  if (!rows.length) return [];
  const map = new Map(rows.map((r) => [String(r.id), r]));
  return eventIds
    .map((id) => map.get(String(id)))
    .filter(Boolean);
}

async function fetchNewsByIdsInOrder(newsIds) {
  if (!newsIds?.length) return [];
  const ids = newsIds.map(Number);
  const { rows } = await pool.query(
    `SELECT id, title, summary, body, link, image_url, COALESCE(published_at, created_at) AS published_at
       FROM campus_news
      WHERE id = ANY($1::int[])`,
    [ids]
  );
  if (!rows.length) return [];
  const map = new Map(rows.map((r) => [String(r.id), r]));
  return newsIds
    .map((id) => map.get(String(id)))
    .filter(Boolean);
}

async function fetchPostsByIdsInOrder(postIds) {
  if (!postIds?.length) return [];
  const ids = postIds.map(Number);
  const { rows } = await pool.query(
    `SELECT id, title, category, description, tags, created_at
    FROM community_posts
    WHERE moderation_status = 'publish' AND id = ANY($1::int[])`,
    [ids]
  );
  if (!rows.length) return [];
  const map = new Map(rows.map((r) => [String(r.id), { ...r, content: r.description }]));
  return postIds
    .map((id) => map.get(String(id)))
    .filter(Boolean);
}

async function fetchPollsByIdsInOrder(pollIds) {
  if (!pollIds?.length) return [];
  const ids = pollIds.map(Number);
  // base polls
  const { rows: polls } = await pool.query(
    `SELECT id, title, description, is_active, expires_at, created_at
       FROM polls
      WHERE id = ANY($1::int[])`,
    [ids]
  );
  if (!polls.length) return [];

  // options
  const { rows: options } = await pool.query(
    `SELECT o.id, o.poll_id, o.label, COUNT(v.id)::INT AS vote_count
       FROM poll_options o
       LEFT JOIN poll_votes v ON v.option_id = o.id
      WHERE o.poll_id = ANY($1::int[])
      GROUP BY o.id
      ORDER BY o.id ASC`,
    [ids]
  );
  const byPoll = options.reduce((acc, o) => {
    const arr = acc[o.poll_id] || (acc[o.poll_id] = []);
    arr.push({ id: o.id, name: o.label, vote_count: Number(o.vote_count) || 0 });
    return acc;
  }, {});
  const map = new Map(polls.map((p) => [String(p.id), { ...p, options: byPoll[p.id] || [] }]));
  return pollIds
    .map((id) => map.get(String(id)))
    .filter(Boolean);
}

// ---------- Normalizers for UI ----------
const normalizeNews = (items) =>
  ensureArray(items).map((item, i) => ({
    id: String(item.id ?? `news-${i + 1}`),
    title: ensureString(item.title, `Campus Update ${i + 1}`),
    desc: ensureString(item.summary ?? item.body ?? ''),
    author: ensureString(item.author ?? ''),
    publishedAt: toISOString(item.published_at ?? item.created_at ?? item.createdAt ?? ''),
    image_url: item.image_url ?? null,
    link: item.link ?? null
  }));

const normalizeEvents = (items) =>
  ensureArray(items).map((item, i) => ({
    id: String(item.id ?? `event-${i + 1}`),
    title: ensureString(item.title, `Event ${i + 1}`),
    author: ensureString(item.organizer ?? item.host ?? item.author ?? 'Community'),
    category: ensureString(item.category ?? 'Event'),
    content: ensureString(item.description ?? ''),
    start_time: toISOString(item.start_time ?? ''),
    end_time: toISOString(item.end_time ?? ''),
    location: ensureString(item.location ?? ''),
    image_url: item.image_url ?? null
  }));

const normalizePolls = (items) =>
  ensureArray(items).map((p, i) => {
    const options = ensureArray(p.options).map((o, idx) => ({
      id: String(o.id ?? `opt-${idx + 1}`),
      name: ensureString(o.name ?? o.label ?? `Option ${idx + 1}`),
      percent: null,
      optionId: ensureNumber(o.id, null),
      voteCount: ensureNumber(o.vote_count, 0)
    }));
    const totalVotes = options.reduce((s, o) => s + (o.voteCount || 0), 0);
    return {
      id: String(p.id ?? `poll-${i + 1}`),
      pollId: ensureNumber(p.id, null),
      title: ensureString(p.title ?? `Poll ${i + 1}`),
      description: ensureString(p.description ?? ''),
      deadline: toISOString(p.expires_at ?? p.created_at ?? ''),
      totalVotes,
      options
    };
  });

// ---------- AI Hub (cached) ----------
async function fetchAICachedSuggestions(userId, { kHeadline = 12, kPosts = 6, kPolls = 6 } = {}) {
  if (!userId) return null;
  const qs = new URLSearchParams({
    user_id: String(userId),
    k_headline: String(kHeadline),
    k_posts: String(kPosts),
    k_polls: String(kPolls)
  });

  const url = `${AI_HUB_URL}/recommend_dashboard_cached?${qs.toString()}`;
  const res = await fetchHttp(url);
  if (!res.ok) {
    // fall back silently
    return null;
  }
  const data = await res.json();
  // data: { headline:[{content_type,content_id,rank,score?}], posts:[{content_id,...}], polls:[{content_id,...}] }
  return data;
}

// ---------- Merge campus events + posts for a single stream (optional) ----------
function mergeEvents(campusEvents, communityPosts, limit = DEFAULT_EVENTS_LIMIT) {
  const arr = [
    ...ensureArray(campusEvents).map((e) => ({
      ...e,
      __t: toTimestamp(e.start_time ?? e.created_at),
    })),
    ...ensureArray(communityPosts).map((p) => ({
      ...p,
      __t: toTimestamp(p.created_at),
      author: ensureString(p.author ?? 'Community')
    }))
  ];
  arr.sort((a, b) => (b.__t || 0) - (a.__t || 0));
  return arr.slice(0, limit).map(({ __t, ...x }) => x);
}

// ---------- Optional: calendar, spotlights, reward leaders (unchanged logic) ----------
async function fetchStudentSpotlights(limit = DEFAULT_SPOTLIGHTS_LIMIT) {
  const { rows } = await getPool().query(
    `SELECT id, student_name, major, class_year, achievements, quote, image_url, featured_at
       FROM student_spotlights
       ORDER BY featured_at DESC NULLS LAST, id DESC
       LIMIT $1`,
    [limit]
  );
  return rows;
}

async function fetchRewardLeaders(limit = DEFAULT_REWARD_LIMIT) {
  const { rows } = await getPool().query(
    `SELECT id, student_name, points, category, updated_at
       FROM reward_points
       ORDER BY points DESC, updated_at DESC NULLS LAST, id ASC
       LIMIT $1`,
    [limit]
  );
  return {
    leaderboard: rows.map((r) => ({
      id: r.id, name: r.student_name, points: r.points, category: r.category, updatedAt: r.updated_at
    }))
  };
}

async function fetchCalendarItems(limit = DEFAULT_CALENDAR_LIMIT, userId = null) {
  const baseQuery = getPool().query(
    `SELECT id, title, description, start_time, end_time, location, category, link
       FROM calendar_items
       ORDER BY start_time ASC NULLS LAST, id ASC
       LIMIT $1`,
    [limit]
  );

  const userQuery =
    userId && Number.isInteger(userId)
      ? getPool().query(
          `SELECT id, user_id, source_type, source_id, title, date, time, category
             FROM user_calendar_items
            WHERE user_id = $1
            ORDER BY date ASC NULLS LAST, time ASC NULLS LAST, id ASC
            LIMIT $2`,
          [userId, limit]
        )
      : Promise.resolve({ rows: [] });

  const [baseRes, userRes] = await Promise.all([baseQuery, userQuery]);

  const combined = [
    ...baseRes.rows.map((r) => ({ ...r, __t: toTimestamp(r.start_time), type: r.category ?? 'event' })),
    ...ensureArray(userRes.rows).map((r) => ({
      id: `user-calendar-${r.id}`,
      title: r.title, date: r.date, time: r.time, category: r.category ?? r.source_type, type: r.category ?? r.source_type,
      source_type: r.source_type, source_id: r.source_id,
      __t: toTimestamp(`${toDateOnly(r.date)}T${ensureString(r.time, '00:00')}:00`)
    }))
  ];

  combined.sort((a, b) => (a.__t ?? Number.POSITIVE_INFINITY) - (b.__t ?? Number.POSITIVE_INFINITY));
  return combined.slice(0, limit).map(({ __t, ...x }) => x);
}

// ---------- Public API ----------
async function getDashboardData(options = {}) {
  const {
    loaders: overrideLoaders = {},
    limits: limitOverrides = {},
    userId = null
  } = options;

  const limits = {
    news: parseLimit(limitOverrides.newsLimit, DEFAULT_NEWS_LIMIT),
    events: parseLimit(limitOverrides.eventsLimit, DEFAULT_EVENTS_LIMIT),
    polls: parseLimit(limitOverrides.pollsLimit, DEFAULT_POLLS_LIMIT),
    spotlights: parseLimit(limitOverrides.spotlightLimit, DEFAULT_SPOTLIGHTS_LIMIT),
    rewards: parseLimit(limitOverrides.rewardLimit, DEFAULT_REWARD_LIMIT),
    calendar: parseLimit(limitOverrides.calendarLimit, DEFAULT_CALENDAR_LIMIT)
  };

  // 1) Ask AI cache (fast path)
  const ai = await fetchAICachedSuggestions(userId).catch(() => null);

  // 2) If we have cache, hydrate IDs preserving order. Otherwise, fallback to simple DB queries.
  let headlineEvents = [];
  let headlineNews = [];
  let posts = [];
  let polls = [];

  if (ai && ai.headline) {
    const eventIds = ai.headline.filter(it => it.content_type === 'event').map(it => it.content_id);
    const newsIds = ai.headline.filter(it => it.content_type === 'news').map(it => it.content_id);
    const postIds = (ai.posts || []).map(it => it.content_id);
    const pollIds = (ai.polls || []).map(it => it.content_id);

    // hydrate in parallel
    const [eventsHydrated, newsHydrated, postsHydrated, pollsHydrated] = await Promise.all([
      fetchEventsByIdsInOrder(eventIds),
      fetchNewsByIdsInOrder(newsIds),
      fetchPostsByIdsInOrder(postIds),
      fetchPollsByIdsInOrder(pollIds)
    ]);

    headlineEvents = eventsHydrated;
    headlineNews = newsHydrated;
    posts = postsHydrated;
    polls = pollsHydrated;
  } else {
    // Fallbacks (minimal, no dummy content)
    [headlineNews, headlineEvents, posts, polls] = await Promise.all([
      fetchLatestNews(limits.news),
      fetchUpcomingEvents(limits.events),
      fetchPublishedCommunityPosts(limits.events),
      fetchActivePolls(limits.polls)
    ]);
  }

  // 3) Merge events + posts into a single feed slot for the UI (optional)
  const mergedEvents = mergeEvents(
    normalizeEvents(headlineEvents),
    normalizeEvents(posts.map(p => ({ ...p, description: p.content }))), // reuse normalizer
    limits.events
  );

  // 4) Build response (no heavy fake data)
  const [spotlights, rewards, calendar] = await Promise.all([
    fetchStudentSpotlights(limits.spotlights).catch(() => []),
    fetchRewardLeaders(limits.rewards).catch(() => ({ leaderboard: [] })),
    fetchCalendarItems(limits.calendar, userId).catch(() => [])
  ]);

  return {
    news: normalizeNews(headlineNews),
    events: mergedEvents,
    polls: normalizePolls(polls),
    spotlights: spotlights.map((s) => ({
      id: String(s.id),
      name: ensureString(s.student_name ?? 'Student'),
      month: ensureString(s.featured_at ? toDateOnly(s.featured_at).slice(0, 7) : ''),
      points: 0,
      award: 'Spotlight',
      description: ensureString(s.achievements ?? s.quote ?? ''),
      isCurrent: Boolean(s.featured_at)
    })),
    rewardLeaders: {
      currentUser: null,
      leaderboard: ensureArray(rewards.leaderboard)
    },
    calendar,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  getDashboardData,
  __private: {
    ensureArray,
    ensureString,
    ensureNumber,
    parseLimit,
    toISOString,
    toDateOnly,
    toTime,
    toTimestamp,
    fetchAICachedSuggestions: fetchAICachedSuggestions
  }
};
