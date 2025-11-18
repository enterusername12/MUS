// src/services/dashboardService.js
// Dashboard aggregation service: reads AI cached suggestions, hydrates from Postgres, falls back gracefully.
// Data sources:
//   • campus_news, campus_events, community_posts, polls
//   • user_calendar_items entries mirrored from polls, merch orders, and now campus event/competition joins
//     so the dashboard calendar always reflects what the student has opted into.

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
  ensureArray(items).map((item, i) => {
    const description = ensureString(item.description ?? item.content ?? '');
    return {
      id: String(item.id ?? `event-${i + 1}`),
      title: ensureString(item.title, `Event ${i + 1}`),
      author: ensureString(item.organizer ?? item.host ?? item.author ?? 'Community'),
      category: ensureString(item.category ?? 'Event'),
      content: description,
      description,
      start_time: toISOString(item.start_time ?? ''),
      end_time: toISOString(item.end_time ?? ''),
      publishedAt: toISOString(item.start_time ?? item.created_at ?? item.createdAt ?? ''),
      location: ensureString(item.location ?? ''),
      image_url: item.image_url ?? null
    };
  });

const normalizeCommunityPosts = (items) =>
  ensureArray(items).map((item, i) => {
    const content = ensureString(item.content ?? item.description ?? '');
    const tagsArray = Array.isArray(item.tags)
      ? item.tags.map((tag) => ensureString(tag)).filter(Boolean)
      : ensureString(item.tags ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0);

    return {
      id: String(item.id ?? `post-${i + 1}`),
      title: ensureString(item.title ?? `Community Highlight ${i + 1}`),
      author: ensureString(item.author ?? item.owner ?? 'Community'),
      category: ensureString(item.category ?? 'Community'),
      content,
      description: content,
      tags: tagsArray,
      createdAt: toISOString(item.created_at ?? item.createdAt ?? ''),
      image_url: item.image_url ?? null
    };
  });

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

function normalizeSpotlightRecord(record) {
  if (!record) return null;
  const monthString = record.featured_at ? ensureString(toDateOnly(record.featured_at)) : '';
  return {
    id: String(record.id),
    userId: record.user_id ? Number(record.user_id) : null,
    name: ensureString(record.student_name ?? 'Student'),
    month: monthString ? monthString.slice(0, 7) : '',
    points: 0,
    award: 'Spotlight',
    description: ensureString(record.achievements ?? record.quote ?? ''),
    major: ensureString(record.major ?? ''),
    classYear: ensureString(record.class_year ?? ''),
    quote: ensureString(record.quote ?? ''),
    achievements: ensureString(record.achievements ?? ''),
    imageUrl: ensureString(record.image_url ?? ''),
    isCurrent: Boolean(record.featured_at)
  };
}

// ---------- Optional: calendar, spotlights, reward leaders (unchanged logic) ----------
async function fetchStudentSpotlights(limit = DEFAULT_SPOTLIGHTS_LIMIT, userId = null) {
  const safeLimit = Number.isInteger(limit) ? Math.max(limit, 0) : DEFAULT_SPOTLIGHTS_LIMIT;

  let personal = null;
  if (Number.isInteger(userId)) {
    const personalResult = await getPool().query(
        `SELECT *
         FROM (
               SELECT DISTINCT ON (DATE_TRUNC('month', featured_at))
                      id,
                      user_id,
                      student_name,
                      major,
                      class_year,
                      achievements,
                      quote,
                      image_url,
                      featured_at
                 FROM student_spotlights
                WHERE user_id = $1
                ORDER BY DATE_TRUNC('month', featured_at) DESC,
                         featured_at DESC NULLS LAST,
                         id DESC
              ) AS monthly_personal
        ORDER BY featured_at DESC NULLS LAST, id DESC
        LIMIT 1`,
      [userId]
    );
    personal = personalResult.rows[0] ?? null;
  }

  const fallbackLimit = personal
    ? Math.max(safeLimit - 1, 0)
    : Math.max(safeLimit, 1);

  let highlights = [];
  if (fallbackLimit > 0) {
    const highlightsResult = await getPool().query(
      `SELECT id,
              user_id,
              student_name,
              major,
              class_year,
              achievements,
              quote,
              image_url,
              featured_at
         FROM (
               SELECT DISTINCT ON (DATE_TRUNC('month', featured_at))
                      id,
                      user_id,
                      student_name,
                      major,
                      class_year,
                      achievements,
                      quote,
                      image_url,
                      featured_at
                 FROM student_spotlights
                WHERE user_id IS NULL
                ORDER BY DATE_TRUNC('month', featured_at) DESC,
                         featured_at DESC NULLS LAST,
                         id DESC
              ) AS monthly_highlights
        ORDER BY featured_at DESC NULLS LAST, id DESC
        LIMIT $1`,
      [fallbackLimit]
    );
    highlights = highlightsResult.rows;
  }

  return { personal, highlights };
}

async function fetchRewardLeaders(limit = DEFAULT_REWARD_LIMIT, userId = null) {
  const normalizedUserId = Number.isInteger(Number(userId)) ? Number(userId) : null;
  const leaderboardQuery = getPool().query(
    `SELECT id, student_name, points, category, updated_at
       FROM reward_points
       ORDER BY points DESC, updated_at DESC NULLS LAST, id ASC
       LIMIT $1`,
    [limit]
  );

  const currentUserQuery =
    normalizedUserId !== null
      ? getPool().query(
          `SELECT u.id AS user_id,
                  CONCAT_WS(' ', u.first_name, u.last_name) AS full_name,
                  COALESCE(MAX(r.student_name), CONCAT_WS(' ', u.first_name, u.last_name)) AS display_name,
                  COALESCE(SUM(r.points), 0) AS total_points,
                  MAX(r.updated_at) AS updated_at
             FROM users u
        LEFT JOIN reward_points r ON r.user_id = u.id
            WHERE u.id = $1
         GROUP BY u.id, u.first_name, u.last_name`,
          [normalizedUserId]
        )
      : Promise.resolve({ rows: [] });

  const [leaderboardRes, currentUserRes] = await Promise.all([leaderboardQuery, currentUserQuery]);

  const currentUserRow = currentUserRes.rows[0];
  const currentUser = currentUserRow
    ? (() => {
        const totalPoints = ensureNumber(currentUserRow.total_points, 0);
        return {
          id: currentUserRow.user_id,
          name: ensureString(currentUserRow.display_name || currentUserRow.full_name || 'You'),
          points: totalPoints,
          progress:
            totalPoints > 0
              ? currentUserRow.updated_at
                ? `Last updated ${toDateOnly(currentUserRow.updated_at)}`
                : 'Lifetime points earned'
              : 'Start earning points to unlock rewards.',
          updatedAt: currentUserRow.updated_at
        };
      })()
    : null;

  return {
    leaderboard: leaderboardRes.rows.map((r) => ({
      id: r.id,
      name: r.student_name,
      points: r.points,
      category: r.category,
      updatedAt: r.updated_at
    })),
    currentUser
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
            `SELECT id, user_id, source_type, source_id, title, description, date, time, category
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
      title: r.title,
      description: ensureString(r.description ?? ''),
      date: r.date,
      time: r.time,
      category: r.category ?? r.source_type,
      type: r.category ?? r.source_type,
      source_type: r.source_type,
      source_id: r.source_id,
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

  const normalizedNews = normalizeNews(headlineNews).slice(0, limits.news);
  const normalizedCampusEvents = normalizeEvents(headlineEvents).slice(0, limits.events);
  const normalizedCommunityHighlights = normalizeCommunityPosts(posts).slice(0, limits.events);

  // 3) Build response (no heavy fake data)
  const [spotlightsResult, rewards, calendar] = await Promise.all([
    fetchStudentSpotlights(limits.spotlights, userId).catch(() => ({ personal: null, highlights: [] })),
    fetchRewardLeaders(limits.rewards, userId).catch(() => ({ leaderboard: [], currentUser: null })),
    fetchCalendarItems(limits.calendar, userId).catch(() => [])
  ]);

  const normalizedSpotlights = {
    personal: spotlightsResult?.personal ? normalizeSpotlightRecord(spotlightsResult.personal) : null,
    highlights: ensureArray(spotlightsResult?.highlights).map((s) => normalizeSpotlightRecord(s)).filter(Boolean)
  };

  // Response payload consumed by the student dashboard client:
  //  - news: campus news articles (array)
  //  - campusEvents: time-bound campus event cards
  //  - communityHighlights: community-post spotlights  
  return {
    news: normalizedNews,
    campusEvents: normalizedCampusEvents,
    communityHighlights: normalizedCommunityHighlights,
    polls: normalizePolls(polls),
    spotlights: normalizedSpotlights,
    rewardLeaders: {
      currentUser: rewards.currentUser ?? null,
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
