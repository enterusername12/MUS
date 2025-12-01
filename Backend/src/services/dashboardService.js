// src/services/dashboardService.js
const { getPool } = require('../db');
const { getDashboardRecommendations } = require("./aiHub");

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

const toDateOnly = (value) => {
  const ts = toTimestamp(value);
  if (!ts) return '';
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const toTimeOnly = (value) => {
  const ts = toTimestamp(value);
  if (!ts) return '';
  const d = new Date(ts);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const toMonthLabel = (value) => {
  const ts = toTimestamp(value);
  if (!ts) return '';
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}`;
};

// ---------- DB fetchers ----------

// 1. Fetch News
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

// 2. Fetch Events (for Community Highlights / General List)
async function fetchUpcomingEvents(limit = DEFAULT_EVENTS_LIMIT) {
  // Uses public.events
  const { rows } = await getPool().query(
    `SELECT id, type, title, description, venue AS location, date AS start_time, NULL as end_time, poster
       FROM events
       WHERE date >= CURRENT_DATE
       ORDER BY date ASC NULLS LAST, id ASC
       LIMIT $1`,
    [limit]
  );
  
  return rows.map(e => ({
    ...e,
    image_url: e.poster ? `data:image/png;base64,${e.poster.toString("base64")}` : null
  }));
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

async function fetchCalendarItems(limit = DEFAULT_CALENDAR_LIMIT) {
  const { rows } = await getPool().query(
    `SELECT id, title, start_time, category
       FROM calendar_items
       WHERE start_time >= NOW() - INTERVAL '1 day'
         AND start_time <= NOW() + INTERVAL '180 days'
       ORDER BY start_time ASC NULLS LAST, id ASC
       LIMIT $1`,
    [limit]
  );
  return rows;
}

// 3. Fetch Events (for Headline - singular 'event' variable)
async function fetchEvents() {
  // Uses public.events
  const { rows } = await getPool().query(`
    SELECT id, type, title, date, venue, description, poster, created_at
    FROM events
    ORDER BY date ASC NULLS LAST, id ASC
  `);

  return rows.map(event => ({
    id: event.id,
    type: event.type,
    title: event.title,
    date: event.date,
    venue: event.venue,
    description: event.description,
    image_url: event.poster 
      ? `data:image/png;base64,${event.poster.toString("base64")}`
      : null,
    created_at: event.created_at
  }));
}

async function fetchUserCalendarItems(userId, limit = DEFAULT_CALENDAR_LIMIT) {
  if (!userId) return [];
  const { rows } = await getPool().query(
    `SELECT id, title, date, time, category
       FROM user_calendar_items
       WHERE user_id = $1
         AND date >= (NOW() - INTERVAL '1 day')::DATE
         AND date <= (NOW() + INTERVAL '180 days')::DATE
       ORDER BY date ASC, time ASC NULLS LAST, id ASC
       LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function fetchUserVotedPolls(userId, limit = DEFAULT_CALENDAR_LIMIT) {
  if (!userId) return [];
  const { rows } = await getPool().query(
    `SELECT DISTINCT p.id, p.title, p.expires_at
       FROM poll_votes v
       INNER JOIN polls p ON p.id = v.poll_id
      WHERE v.user_id = $1
        AND p.expires_at >= NOW() - INTERVAL '1 day'
        AND p.expires_at <= NOW() + INTERVAL '180 days'
      ORDER BY p.expires_at ASC NULLS LAST, p.id ASC
      LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function fetchActivePolls(userId = null) {
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

  let userVoteLookup = {};
  if (userId) {
    const { rows: voteRows } = await getPool().query(
      `SELECT DISTINCT poll_id
         FROM poll_votes
        WHERE user_id = $1
          AND poll_id = ANY($2::INT[])`,
      [userId, ids]
    );
    userVoteLookup = voteRows.reduce((acc, row) => {
      acc[row.poll_id] = true;
      return acc;
    }, {});
  }

  return polls.map(p => ({ ...p, options: byPoll[p.id] || [], user_has_vote: Boolean(userVoteLookup[p.id]) }));
}

async function fetchRewardPoints() {
  const { rows } = await getPool().query(
  `SELECT rp.id, rp.user_id, rp.points, rp.updated_at, u.first_name, u.last_name, u.email
     FROM reward_points rp
     LEFT JOIN users u ON u.id = rp.user_id`
  );
  return rows.map((row, idx) => {
    const fullName = ensureString(
      [ensureString(row.first_name), ensureString(row.last_name)].filter(Boolean).join(' '),
      ensureString(row.email, `User ${row.user_id ?? idx + 1}`)
    );
    return { ...row, name: fullName, fullName, points: ensureNumber(row.points, 0), user_id: ensureNumber(row.user_id, null) };
  });
}

async function fetchCompetitions(userId = null) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, hosts, title, reward, venue, max_participants, due, description, banner
       FROM competition
       ORDER BY COALESCE(due, NOW()) ASC NULLS LAST, id ASC`
  );
  if (!rows.length) return [];

  const compIds = rows.map(r => r.id);
  const { rows: participationRows } = await pool.query(
    `SELECT competition_id, Participants_token AS token, participants
     FROM participation WHERE competition_id = ANY($1::INT[])`, [compIds]
  );
  const { rows: rewardRows } = await pool.query(
    `SELECT competition_id, rewardToken AS token, points
     FROM reward WHERE competition_id = ANY($1::INT[])`, [compIds]
  );
  
  let userParticipationLookup = {};
  if (userId) {
    const { rows: userParticipationRows } = await pool.query(
      `SELECT competition_id FROM competition_registrations WHERE user_id = $1`, [userId]
    );
    userParticipationLookup = userParticipationRows.reduce((acc, row) => {
      acc[row.competition_id] = true;
      return acc;
    }, {});
  }  

  const participationMap = participationRows.reduce((acc, p) => {
    acc[p.competition_id] = { token: p.token, participants: p.participants };
    return acc;
  }, {});
  const rewardMap = rewardRows.reduce((acc, r) => {
    acc[r.competition_id] = { token: r.token, points: r.points };
    return acc;
  }, {});

  return rows.map((item, i) => ({
    id: String(item.id ?? `comp-${i + 1}`),
    title: ensureString(item.title, `Competition ${i + 1}`),
    hosts: ensureArray(item.hosts),
    rewardText: ensureString(item.reward),
    venue: ensureString(item.venue),
    maxParticipants: ensureNumber(item.max_participants, 0),
    due: toISOString(item.due),
    description: ensureString(item.description),
    bannerBase64: item.banner ? `data:image/png;base64,${item.banner.toString('base64')}` : null,
    participation: participationMap[item.id] || { token: null, participants: 0 },
    reward: rewardMap[item.id] || { token: null, points: 0 },
    isUserRegistered: Boolean(userParticipationLookup[item.id])
  }));
}

function mergeEvents(campusEvents, communityPosts, limit = DEFAULT_EVENTS_LIMIT) {
  const arr = [
    ...ensureArray(campusEvents).map((e) => ({ ...e, __t: toTimestamp(e.start_time ?? e.created_at) })),
    ...ensureArray(communityPosts).map((p) => ({ ...p, __t: toTimestamp(p.created_at), author: ensureString(p.author ?? 'Community') }))
  ];
  arr.sort((a, b) => (b.__t || 0) - (a.__t || 0));
  return arr.slice(0, limit).map(({ __t, ...x }) => x);
}

// ---------- normalizers ----------
// ... (normalizeCompetitions, normalizeNews are same) ...
const normalizeCompetitions = (items) =>
  ensureArray(items).map((item, i) => {
    const dueIso = toISOString(item.due ?? item.due_date ?? item.deadline ?? item.ends_at ?? item.created_at ?? '');
    const rewardDetails =
      item.reward && typeof item.reward === 'object' && !Array.isArray(item.reward)
        ? item.reward
        : { token: null, points: ensureNumber(item.reward?.points, 0) || 0 };
    const rewardText = ensureString(item.rewardText ?? (typeof item.reward === 'string' ? item.reward : ''));
    const bannerBase64 =
      item.bannerBase64 ?? (item.banner ? `data:image/png;base64,${item.banner.toString('base64')}` : null);

    return {
      ...item,
      id: String(item.id ?? `comp-${i + 1}`),
      title: ensureString(item.title, `Competition ${i + 1}`),
      hosts: ensureArray(item.hosts),
      venue: ensureString(item.venue),
      maxParticipants: ensureNumber(item.max_participants ?? item.maxParticipants, 0),
      due: dueIso,
      rewardText,
      description: ensureString(item.description),
      bannerBase64,
      participation: item.participation || { token: null, participants: 0 },
      reward: rewardDetails,
      isUserRegistered: Boolean(item.isUserRegistered)
    };
  });

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

// 🟢 UPDATED: Explicitly map 'description' so frontend finds it
const normalizeEvents = (items) =>
  ensureArray(items).map((item, i) => ({
    id: String(item.id ?? `event-${i + 1}`),
    title: ensureString(item.title, `Event ${i + 1}`),
    author: ensureString(item.organizer ?? item.host ?? item.author ?? 'Community'),
    category: ensureString(item.category ?? item.type ?? 'Event'),
    // Frontend (headline) looks for 'description' or 'desc'. 
    // Community highlights looks for 'content'. We provide both.
    description: ensureString(item.description ?? ''), 
    content: ensureString(item.description ?? ''),
    start_time: toISOString(item.start_time ?? item.date ?? ''),
    end_time: toISOString(item.end_time ?? ''),
    location: ensureString(item.location ?? item.venue ?? ''),
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

const normalizeCalendarEntries = (
  publicItems,
  userItems,
  competitions,
  polls,
  votedPolls,
  limit = DEFAULT_CALENDAR_LIMIT,
  userId = null
) => {
  const normalizedPublic = ensureArray(publicItems)
    .map((item, i) => {
      const startIso = toISOString(item.start_time);
      return {
        date: toDateOnly(startIso),
        title: ensureString(item.title, `Event ${i + 1}`),
        time: toTimeOnly(startIso),
        type: ensureString(item.category ?? 'event').toLowerCase(),
        category: ensureString(item.category ?? 'event')
      };
    })
    .filter((item) => item.date);

  const normalizedUser = ensureArray(userItems)
    .map((item, i) => ({
      date: toDateOnly(item.date),
      title: ensureString(item.title, `Event ${i + 1}`),
      time: ensureString(item.time ?? ''),
      type: ensureString(item.category ?? 'personal').toLowerCase(),
      category: ensureString(item.category ?? 'personal')
    }))
    .filter((item) => item.date);

  const participationLookup = ensureArray(competitions).reduce((acc, comp) => {
    const compId = ensureNumber(comp.id ?? comp.competition_id, null);
    if (compId && comp.isUserRegistered) {
      acc[compId] = true;
    }
    return acc;
  }, {});

  const normalizedCompetitions = ensureArray(competitions)
    .filter((item) => {
      const compId = ensureNumber(item.id ?? item.competition_id, null);
      return Boolean(compId && participationLookup[compId]);
    })
    .map((item, i) => {
      const dueIso = toISOString(item.due ?? item.due_date ?? item.deadline ?? item.ends_at ?? item.created_at ?? '');
      const date = toDateOnly(dueIso);
      return {
        date,
        title: ensureString(item.title, `Competition ${i + 1}`),
        time: toTimeOnly(dueIso),
        type: 'competition',
        category: 'competition'
      };
    })
    .filter((item) => item.date);

  const normalizedPolls = ensureArray(votedPolls)
    .filter((poll) => userId && ensureNumber(poll.id ?? poll.poll_id, null))
    .map((poll, i) => {
      const deadlineIso = toISOString(poll.expires_at ?? poll.deadline ?? poll.created_at ?? '');
      const date = toDateOnly(deadlineIso);
      return {
        date,
        title: ensureString(poll.title, `Poll ${i + 1}`),
        time: toTimeOnly(deadlineIso),
        type: 'poll',
        category: 'poll'
      };
    })
    .filter((item) => item.date);

  const combined = [...normalizedUser, ...normalizedPublic, ...normalizedCompetitions, ...normalizedPolls];
  const normalized = combined
    .map((item) => ({ ...item, type: ensureString(item.type || 'event').toLowerCase() }))
    .filter((item) => item.date);

  normalized.sort((a, b) => {
    const tsA = toTimestamp(a.time ? `${a.date}T${a.time}Z` : a.date) || 0;
    const tsB = toTimestamp(b.time ? `${b.date}T${b.time}Z` : b.date) || 0;
    return tsA - tsB;
  });

  return normalized.slice(0, limit);
};

// ---------- main public API ----------
async function getDashboardData(options = {}) {
  const { userId = null, limits = {} } = options;
  const calendarLimit = ensureNumber(limits?.calendarLimit, DEFAULT_CALENDAR_LIMIT);

  let [
    news,
    events,
    posts,
    polls,
    competitions,
    rewardPoints,
    calendarItems,
    userCalendarItems,
    event,
    votedPolls
  ] = await Promise.all([
    fetchLatestNews(),
    fetchUpcomingEvents(),
    fetchPublishedCommunityPosts(),
    fetchActivePolls(userId),
    fetchCompetitions(userId),
    fetchRewardPoints(),
    fetchCalendarItems(calendarLimit),
    fetchUserCalendarItems(userId, calendarLimit),
    fetchEvents(),
    fetchUserVotedPolls(userId, calendarLimit)
  ]);

  // --- AI-driven suggestions ---
  let personalizedOverrides = null;

  if (userId) {
    try {
      const interestsText = await getUserInterestsText(userId);
      if (interestsText) {
        let suggestionRow = await getLatestSuggestionRow(userId);
        const ttlMs = 10 * 60 * 1000; // 10 minutes
        const now = Date.now();

        let needFresh = true;
        if (suggestionRow && suggestionRow.created_at) {
          const createdAtMs = new Date(suggestionRow.created_at).getTime();
          if (now - createdAtMs <= ttlMs) {
            needFresh = false;
          }
        }

        if (needFresh) {
          const aiResp = await getDashboardRecommendations({
            userId,
            kHeadline: DEFAULT_NEWS_LIMIT + DEFAULT_EVENTS_LIMIT,
            kPosts: DEFAULT_EVENTS_LIMIT,
            kPolls: DEFAULT_POLLS_LIMIT,
            useCache: false,
          });

          if (aiResp && (aiResp.headline || aiResp.posts || aiResp.polls)) {
            suggestionRow = await saveSuggestionRow(userId, aiResp);
          }
        }

        if (suggestionRow && suggestionRow.headline) {
          personalizedOverrides = await hydrateSuggestionsFromDb(suggestionRow);
        }
      }
    } catch (err) {
      console.warn("Failed to apply AI dashboard suggestions:", err.message || err);
    }
  }

  // Override default lists if we have AI suggestions
  if (personalizedOverrides) {
    // 🟢 UPDATED: AI 'events' recommendations (from headline) should update the 'event' (singular) variable used by Headline.
    if (personalizedOverrides.events && personalizedOverrides.events.length) {
      // The frontend uses 'data.event' for the headline.
      event = personalizedOverrides.events;
      
      // Also update 'events' (plural) for consistency if desired, or keep as default
      events = personalizedOverrides.events; 
    }
    
    if (personalizedOverrides.news && personalizedOverrides.news.length) {
      news = personalizedOverrides.news;
    }
    
    if (personalizedOverrides.posts && personalizedOverrides.posts.length) {
      posts = personalizedOverrides.posts;
    }
    if (personalizedOverrides.polls && personalizedOverrides.polls.length) {
      polls = personalizedOverrides.polls;
    }
  }

  const normalizedCompetitions = normalizeCompetitions(competitions);
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
    event: normalizeEvents(event), 
    competitions: normalizedCompetitions,
    rewardPoints,
    spotlights,
    calendar: normalizeCalendarEntries(
      calendarItems,
      userCalendarItems,
      normalizedCompetitions,
      polls,
      votedPolls,
      calendarLimit,
      userId
    ),
    generatedAt: new Date().toISOString()
  };
}

function getDbPool() {
  return getPool();
}

async function getUserInterestsText(userId) {
  const pool = getDbPool();
  const { rows } = await pool.query(
    "SELECT interests_text FROM users WHERE id = $1",
    [userId]
  );
  if (!rows[0] || !rows[0].interests_text) return "";
  return String(rows[0].interests_text || "").trim();
}

async function getLatestSuggestionRow(userId) {
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
    SELECT *
    FROM rec_suggestion_cache
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId]
  );
  return rows[0] || null;
}

async function saveSuggestionRow(userId, payload) {
  const pool = getDbPool();
  const headline = JSON.stringify(payload.headline || []);
  const posts = JSON.stringify(payload.posts || []);
  const polls = JSON.stringify(payload.polls || []);
  const competitions = JSON.stringify(payload.competitions || []);

  const { rows } = await pool.query(
    `
    INSERT INTO rec_suggestion_cache (user_id, headline, posts, polls, competitions)
    VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)
    RETURNING *
    `,
    [userId, headline, posts, polls, competitions]
  );
  return rows[0];
}

// ------------------------------------------------------------------
// 🟢 UPDATED: Hydration logic now includes POLL OPTIONS
// ------------------------------------------------------------------
async function hydrateSuggestionsFromDb(payload) {
  const pool = getDbPool();
  const headline = payload?.headline || [];
  const postsJson = payload?.posts || [];
  const pollsJson = payload?.polls || [];

  const eventIds = [
    ...new Set(
      headline
        .filter((it) => it.content_type === "event" && it.event_id)
        .map((it) => Number(it.event_id))
    ),
  ];
  const newsIds = [
    ...new Set(
      headline
        .filter((it) => it.content_type === "news" && it.news_id)
        .map((it) => Number(it.news_id))
    ),
  ];
  const postIds = [
    ...new Set(
      postsJson
        .filter((it) => it.post_id)
        .map((it) => Number(it.post_id))
    ),
  ];
  const pollIds = [
    ...new Set(
      pollsJson
        .filter((it) => it.poll_id)
        .map((it) => Number(it.poll_id))
    ),
  ];

  const [eventRows, newsRows, postRows, pollRows] = await Promise.all([
    eventIds.length
      ? pool.query(
          `SELECT 
             id, type, title, description, venue AS location, date AS start_time, poster 
           FROM events 
           WHERE id = ANY($1::int[])`,
          [eventIds]
        )
      : { rows: [] },
    newsIds.length
      ? pool.query(
          "SELECT * FROM campus_news WHERE id = ANY($1::int[])",
          [newsIds]
        )
      : { rows: [] },
    postIds.length
      ? pool.query(
          "SELECT * FROM community_posts WHERE id = ANY($1::int[])",
          [postIds]
        )
      : { rows: [] },
    pollIds.length
      ? pool.query(
          "SELECT * FROM polls WHERE id = ANY($1::int[])",
          [pollIds]
        )
      : { rows: [] },
  ]);

  // 🟢 NEW: Fetch Options for the AI-recommended polls
  let optionsByPollId = {};
  if (pollIds.length > 0) {
    const { rows: optionRows } = await pool.query(
      `SELECT o.id, o.poll_id, o.label, COUNT(v.id)::INT AS vote_count
         FROM poll_options o
         LEFT JOIN poll_votes v ON v.option_id = o.id
        WHERE o.poll_id = ANY($1::INT[])
        GROUP BY o.id
        ORDER BY o.created_at ASC, o.id ASC`,
      [pollIds]
    );

    optionsByPollId = optionRows.reduce((acc, o) => {
      if (!acc[o.poll_id]) acc[o.poll_id] = [];
      acc[o.poll_id].push({ 
        id: o.id, 
        name: o.label, 
        vote_count: Number(o.vote_count) || 0 
      });
      return acc;
    }, {});
  }

  const eventsById = new Map(eventRows.rows.map((r) => [Number(r.id), r]));
  const newsById = new Map(newsRows.rows.map((r) => [Number(r.id), r]));
  const postsById = new Map(postRows.rows.map((r) => [Number(r.id), r]));
  const pollsById = new Map(pollRows.rows.map((r) => [Number(r.id), r]));

  const orderedEvents = eventIds
    .map((id) => {
      const e = eventsById.get(id);
      if(!e) return null;
      return {
        ...e,
        image_url: e.poster ? `data:image/png;base64,${e.poster.toString("base64")}` : null
      };
    })
    .filter(Boolean);
    
  const orderedNews = newsIds.map((id) => newsById.get(id)).filter(Boolean);
  const orderedPosts = postIds.map((id) => postsById.get(id)).filter(Boolean);
  
  // 🟢 NEW: Attach options to the polls
  const orderedPolls = pollIds
    .map((id) => {
      const p = pollsById.get(id);
      if (!p) return null;
      return {
        ...p,
        options: optionsByPollId[id] || [] // Attach the fetched options
      };
    })
    .filter(Boolean);

  return {
    events: orderedEvents,
    news: orderedNews,
    posts: orderedPosts,
    polls: orderedPolls,
  };
}

module.exports = { 
  getDashboardData,
  saveSuggestionRow 
};