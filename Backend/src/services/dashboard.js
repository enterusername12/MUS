const { getPool } = require('../db');

const DEFAULT_NEWS_LIMIT = 5;
const DEFAULT_EVENTS_LIMIT = 5;
const DEFAULT_POLLS_LIMIT = 2;
const DEFAULT_SPOTLIGHTS_LIMIT = 3;
const DEFAULT_REWARD_LIMIT = 5;
const DEFAULT_CALENDAR_LIMIT = 6;

const parseLimit = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const getLatestNews = async ({ limit } = {}) => {
  const cappedLimit = limit ?? DEFAULT_NEWS_LIMIT;
  const { rows } = await getPool().query(
    `SELECT id, title, summary, body, link, image_url, published_at
       FROM campus_news
       ORDER BY published_at DESC, id DESC
       LIMIT $1`,
    [cappedLimit]
  );
  return rows;
};

const getUpcomingEvents = async ({ limit } = {}) => {
  const cappedLimit = limit ?? DEFAULT_EVENTS_LIMIT;
  const { rows } = await getPool().query(
    `SELECT id, title, description, location, start_time, end_time, image_url
       FROM campus_events
       ORDER BY start_time ASC, id ASC
       LIMIT $1`,
    [cappedLimit]
  );
  return rows;
};

const getActivePolls = async ({ limit } = {}) => {
  const cappedLimit = limit ?? DEFAULT_POLLS_LIMIT;
  const { rows: polls } = await getPool().query(
    `SELECT id, title, description, is_active, expires_at, created_at
       FROM polls
       WHERE is_active = TRUE OR (expires_at IS NOT NULL AND expires_at > NOW())
       ORDER BY COALESCE(expires_at, created_at + INTERVAL '365 days') ASC, created_at DESC
       LIMIT $1`,
    [cappedLimit]
  );

  if (polls.length === 0) {
    return [];
  }

  const pollIds = polls.map((poll) => poll.id);
  const { rows: options } = await getPool().query(
    `SELECT
         o.id,
         o.poll_id,
         o.label,
         o.created_at,
         COUNT(v.id)::INT AS vote_count
       FROM poll_options o
       LEFT JOIN poll_votes v ON v.option_id = o.id
       WHERE o.poll_id = ANY($1::INT[])
       GROUP BY o.id
       ORDER BY o.created_at ASC, o.id ASC`,
    [pollIds]
  );

  const optionsByPoll = options.reduce((acc, option) => {
    const voteCount = Number(option.vote_count) || 0;
    const formatted = { ...option, vote_count: voteCount };
    if (!acc[option.poll_id]) {
      acc[option.poll_id] = [];
    }
    acc[option.poll_id].push(formatted);
    return acc;
  }, {});

  return polls.map((poll) => ({
    ...poll,
    options: optionsByPoll[poll.id] || []
  }));
};

const getStudentSpotlights = async ({ limit } = {}) => {
  const cappedLimit = limit ?? DEFAULT_SPOTLIGHTS_LIMIT;
  const { rows } = await getPool().query(
    `SELECT id, student_name, major, class_year, achievements, quote, image_url, featured_at
       FROM student_spotlights
       ORDER BY featured_at DESC, id DESC
       LIMIT $1`,
    [cappedLimit]
  );
  return rows;
};

const getRewardLeaders = async ({ limit } = {}) => {
  const cappedLimit = limit ?? DEFAULT_REWARD_LIMIT;
  const { rows } = await getPool().query(
    `SELECT id, student_name, points, category, updated_at
       FROM reward_points
       ORDER BY points DESC, updated_at DESC, id ASC
       LIMIT $1`,
    [cappedLimit]
  );
  return rows;
};

const getCalendarItems = async ({ limit } = {}) => {
  const cappedLimit = limit ?? DEFAULT_CALENDAR_LIMIT;
  const { rows } = await getPool().query(
    `SELECT id, title, description, start_time, end_time, location, category, link
       FROM calendar_items
       ORDER BY start_time ASC, id ASC
       LIMIT $1`,
    [cappedLimit]
  );
  return rows;
};

const getDashboardData = async (limits = {}) => {
  const [news, events, polls, spotlights, rewardLeaders, calendar] = await Promise.all([
    getLatestNews({ limit: parseLimit(limits.newsLimit, DEFAULT_NEWS_LIMIT) }),
    getUpcomingEvents({ limit: parseLimit(limits.eventsLimit, DEFAULT_EVENTS_LIMIT) }),
    getActivePolls({ limit: parseLimit(limits.pollsLimit, DEFAULT_POLLS_LIMIT) }),
    getStudentSpotlights({ limit: parseLimit(limits.spotlightLimit, DEFAULT_SPOTLIGHTS_LIMIT) }),
    getRewardLeaders({ limit: parseLimit(limits.rewardLimit, DEFAULT_REWARD_LIMIT) }),
    getCalendarItems({ limit: parseLimit(limits.calendarLimit, DEFAULT_CALENDAR_LIMIT) })
  ]);

  return {
    news,
    events,
    polls,
    spotlights,
    rewardLeaders,
    calendar
  };
};

module.exports = {
  getLatestNews,
  getUpcomingEvents,
  getActivePolls,
  getStudentSpotlights,
  getRewardLeaders,
  getCalendarItems,
  getDashboardData,
  parseLimit
};