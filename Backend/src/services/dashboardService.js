// src/services/dashboardService.js
// Dashboard aggregation service: reads AI cached suggestions, hydrates from Postgres, falls back gracefully.

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

// ---------- small helpers ----------
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
const toTimestamp = (value) => {
  const iso = toISOString(value);
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

const toMonthLabel = (value) => {
  const ts = toTimestamp(value);
  if (!ts) return '';
  const d = new Date(ts);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${year}-${month}`;
};

// ---------- DB fetchers ----------
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
  return rows.map((r) => ({ ...r, content: r.description }));
}

async function fetchActivePolls() {
  const { rows: polls } = await getPool().query(
    `SELECT id, title, description, is_active, expires_at, created_at
       FROM polls
       WHERE is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY COALESCE(expires_at, created_at + INTERVAL '365 days') ASC, created_at DESC`
  );
  if (!polls.length) return [];

  const ids = polls.map(p => p.id);
  const { rows: options } = await getPool().query(
    `SELECT o.id, o.poll_id, o.label, COUNT(v.id)::INT AS vote_count
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

  return polls.map(p => ({ ...p, options: byPoll[p.id] || [] }));
}

async function fetchRewardPoints() {
  const { rows } = await getPool().query(
  `SELECT rp.id,
              rp.user_id,
              rp.points,
              rp.updated_at,
              u.first_name,
              u.last_name,
              u.email
        FROM reward_points rp
        LEFT JOIN users u ON u.id = rp.user_id`
  );

  return rows.map((row, idx) => {
    const fullName = ensureString(
      [ensureString(row.first_name), ensureString(row.last_name)].filter(Boolean).join(' '),
      ensureString(row.email, `User ${row.user_id ?? idx + 1}`)
    );

    return {
      ...row,
      name: fullName,
      fullName,
      points: ensureNumber(row.points, 0),
      user_id: ensureNumber(row.user_id, null)
    };
  });
}

async function fetchUserNameMap(userIds = []) {
  if (!Array.isArray(userIds) || !userIds.length) return {};

  const { rows } = await getPool().query(
    `SELECT id, first_name, last_name, email FROM users WHERE id = ANY($1::INT[])`,
    [userIds]
  );

  return rows.reduce((acc, user) => {
    const fullName = ensureString(
      [ensureString(user.first_name), ensureString(user.last_name)].filter(Boolean).join(' '),
      ensureString(user.email, `User ${user.id}`)
    );
    acc[user.id] = fullName;
    return acc;
  }, {});
}


// ⚡ fetch all competitions, convert banner to base64
// ⚡ fetch all competitions, include participation + reward, convert banner to base64
async function fetchCompetitions() {
  const pool = getPool();
  
  // 1️⃣ fetch all competitions
  const { rows } = await pool.query(
    `SELECT id, hosts, title, reward, venue, max_participants, due, description, banner
       FROM competition
       ORDER BY COALESCE(due, NOW()) ASC NULLS LAST, id ASC`
  );

  if (!rows.length) return [];

  // 2️⃣ fetch participation and reward in batch
  const compIds = rows.map(r => r.id);

  const { rows: participationRows } = await pool.query(
    `SELECT competition_id, Participants_token AS token, participants
     FROM participation
     WHERE competition_id = ANY($1::INT[])`,
    [compIds]
  );
  const { rows: rewardRows } = await pool.query(
    `SELECT competition_id, rewardToken AS token, points
     FROM reward
     WHERE competition_id = ANY($1::INT[])`,
    [compIds]
  );

  const participationMap = participationRows.reduce((acc, p) => {
    acc[p.competition_id] = { token: p.token, participants: p.participants };
    return acc;
  }, {});

  const rewardMap = rewardRows.reduce((acc, r) => {
    acc[r.competition_id] = { token: r.token, points: r.points };
    return acc;
  }, {});

  // 3️⃣ map competitions to structured object
  return rows.map((item, i) => ({
    id: String(item.id ?? `comp-${i + 1}`),
    title: ensureString(item.title, `Competition ${i + 1}`),
    hosts: ensureArray(item.hosts),
    reward: ensureString(item.reward),
    venue: ensureString(item.venue),
    maxParticipants: ensureNumber(item.max_participants, 0),
    due: toISOString(item.due),
    description: ensureString(item.description),
    bannerBase64: item.banner ? `data:image/png;base64,${item.banner.toString('base64')}` : null,
    participation: participationMap[item.id] || { token: null, participants: 0 },
    reward: rewardMap[item.id] || { token: null, points: 0 }
  }));
}

// ---------- merge events + posts ----------
function mergeEvents(campusEvents, communityPosts, limit = DEFAULT_EVENTS_LIMIT) {
  const arr = [
    ...ensureArray(campusEvents).map((e) => ({ ...e, __t: toTimestamp(e.start_time ?? e.created_at) })),
    ...ensureArray(communityPosts).map((p) => ({ ...p, __t: toTimestamp(p.created_at), author: ensureString(p.author ?? 'Community') }))
  ];
  arr.sort((a, b) => (b.__t || 0) - (a.__t || 0));
  return arr.slice(0, limit).map(({ __t, ...x }) => x);
}

// ---------- normalizers ----------
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

// ---------- main public API ----------
async function getDashboardData(options = {}) {
  const { userId = null } = options;

  const [news, events, posts, polls, competitions, rewardPoints] = await Promise.all([
    fetchLatestNews(),
    fetchUpcomingEvents(),
    fetchPublishedCommunityPosts(),
    fetchActivePolls(),
    fetchCompetitions(), // ⚡ get all competitions
    fetchRewardPoints()
  ]);

 const rewardLeaderboard = ensureArray(rewardPoints)
    .slice()
    .sort((a, b) => (ensureNumber(b.points, 0) || 0) - (ensureNumber(a.points, 0) || 0));

  let spotlights = [];
  if (rewardLeaderboard.length) {
    const topReward = rewardLeaderboard[0];
    const topName = ensureString(
      topReward.name ?? topReward.fullName,
      ensureString(
        [ensureString(topReward.first_name), ensureString(topReward.last_name)].filter(Boolean).join(' '),
        `User ${topReward.user_id}`
      )
    );

    spotlights = [
      {
        name: topName,
        fullName: topName,
        points: ensureNumber(topReward.points, 0),
        month: ensureString(toMonthLabel(topReward.updated_at ?? new Date())),
        award: 'Reward Points Leader',
        description: 'Top reward points for the month.'
      }
    ];
  }

  return {
    news: normalizeNews(news),
    events: mergeEvents(normalizeEvents(events), normalizeEvents(posts.map(p => ({ ...p, description: p.content })))),
    polls: normalizePolls(polls),
    competitions,  // ⚡ include full competition list
    rewardPoints,
    spotlights,
    generatedAt: new Date().toISOString()
  };
}

module.exports = { getDashboardData };
