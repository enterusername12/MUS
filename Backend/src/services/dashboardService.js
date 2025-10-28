// Dashboard aggregation service that gathers campus data from Postgres with
// graceful fallbacks for local development or limited environments.
const { getPool } = require('../db');

const DEFAULT_NEWS_LIMIT = 5;
const DEFAULT_EVENTS_LIMIT = 5;
const DEFAULT_POLLS_LIMIT = 2;
const DEFAULT_SPOTLIGHTS_LIMIT = 3;
const DEFAULT_REWARD_LIMIT = 5;
const DEFAULT_CALENDAR_LIMIT = 6;

const FALLBACK_DASHBOARD_DATA = {
  news: [
    {
      id: 'news-1',
      title: 'STEM Innovation Lab Opens',
      desc:
        'Explore the brand-new STEM lab featuring cutting-edge equipment for robotics, coding, and engineering projects.',
      publishedAt: '2024-10-11T08:00:00.000Z',
      author: 'Office of Academics'
    },
    {
      id: 'news-2',
      title: 'Athletics Achieve Regional Victory',
      desc: 'Congratulations to the MUS Tigers for clinching the regional championship in a thrilling overtime finish.',
      publishedAt: '2024-10-09T18:30:00.000Z',
      author: 'Athletics Department'
    }
  ],
  events: [
    {
      id: 'event-1',
      title: 'Film Club Premiere Night',
      author: 'Film Club',
      category: 'Event',
      content:
        'Join us in the auditorium on Friday for exclusive student-produced films followed by a Q&A with the directors.'
    },
    {
      id: 'event-2',
      title: 'Robotics Team Showcase',
      author: 'Robotics Society',
      category: 'Competition',
      content: 'See the award-winning robots in action and learn how you can get involved ahead of the state meet.'
    }
  ],
  polls: [
    {
      id: 'poll-1',
      title: 'Which spirit week theme are you most excited about?',
      options: [
        { name: 'Retro Day', votes: 120 },
        { name: 'Class Colors', votes: 95 },
        { name: 'Future Friday', votes: 60 }
      ],
      deadline: '2024-10-18T23:59:59.000Z'
    },
    {
      id: 'poll-2',
      title: 'Select the next service project focus',
      options: [
        { name: 'Community Garden', percent: 45 },
        { name: 'Literacy Tutoring', percent: 35 },
        { name: 'Food Bank Support', percent: 20 }
      ],
      deadline: '2024-10-25T23:59:59.000Z'
    }
  ],
  spotlights: [
    {
      id: 'spotlight-oct',
      name: 'Jordan Kim',
      month: '2024-10',
      points: 1420,
      award: 'October Spotlight Winner',
      description: 'Recognized for leading the successful community clean-up initiative.',
      isCurrent: true
    },
    {
      id: 'spotlight-sep',
      name: 'Amelia Rivera',
      month: '2024-09',
      points: 1310,
      award: 'Community Service Star',
      description: 'Coordinated over 200 volunteer hours across campus clubs.'
    }
  ],
  rewardLeaders: {
    currentUser: {
      name: 'You',
      points: 860,
      progress: '+45 this week'
    },
    leaderboard: [
      { name: 'Jordan Kim', points: 1420 },
      { name: 'Amelia Rivera', points: 1310 },
      { name: 'Dev Patel', points: 1215 }
    ]
  },
  calendar: [
    {
      date: '2024-10-14',
      type: 'event',
      title: 'Spirit Week Kickoff Rally',
      time: '08:30 AM'
    },
    {
      date: '2024-10-16',
      type: 'competition',
      title: 'Regional Robotics Qualifier',
      time: '05:00 PM'
    },
    {
      date: '2024-10-19',
      type: 'poll',
      title: 'Spirit Week Voting Closes',
      time: '11:59 PM'
    }
  ]
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const ensureString = (value, fallback = '') => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return fallback;
};

const ensureNumber = (value, fallback = null) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
};

const toISOString = (value) => {
  if (!value && value !== 0) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? '' : fromNumber.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }

    return trimmed;
  }

  return '';
};

const toDateOnly = (value) => {
  const iso = toISOString(value);
  if (!iso) {
    return '';
  }
  return iso.slice(0, 10);
};

const toTime = (value) => {
  if (!value && value !== 0) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(11, 16);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(11, 16);
    }
    return trimmed;
  }

  return '';
};

const parseLimit = (value, fallback) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const normalizeNews = (items) =>
  ensureArray(items).map((item, index) => ({
    id: ensureString(item.id, `news-${index + 1}`),
    title: ensureString(item.title ?? item.headline ?? item.name, `Campus Update ${index + 1}`),
    desc: ensureString(item.desc ?? item.summary ?? item.description ?? item.body, 'Details coming soon.'),
    author: ensureString(item.author ?? item.byline ?? item.source ?? ''),
    publishedAt: toISOString(
      item.publishedAt ?? item.published_at ?? item.date ?? item.createdAt ?? item.created_at ?? ''
    )
  }));

const normalizeEvents = (items) =>
  ensureArray(items).map((item, index) => ({
    id: ensureString(item.id, `event-${index + 1}`),
    title: ensureString(item.title ?? item.name ?? item.headline, `Community Highlight ${index + 1}`),
    author: ensureString(
      item.author ??
        item.organizer ??
        item.host ??
        item.createdBy ??
        item.owner ??
        item.student_name ??
        'Community'
    ),
    category: ensureString(item.category ?? item.type ?? item.tag ?? 'Event'),
    content: ensureString(
      item.content ?? item.description ?? item.summary ?? item.body ?? 'Stay tuned for more details.'
    )
  }));

  const toTimestamp = (value) => {
  const iso = toISOString(value);
  if (!iso) {
    return null;
  }

  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizePollOptions = (options, totalVotes) => {
  const normalizedOptions = ensureArray(options).map((option, index) => {
    const votes = ensureNumber(
      option.votes ?? option.count ?? option.total ?? option.value ?? option.vote_count,
      null
    );
    const percent = ensureNumber(option.percent, null);
    const resolvedPercent =
      percent !== null
        ? Math.min(Math.max(percent, 0), 100)
        : totalVotes > 0 && votes !== null
          ? Math.round((votes / totalVotes) * 100)
          : 0;

    return {
      id: ensureString(option.id, `option-${index + 1}`),
      name: ensureString(option.name ?? option.label ?? option.option ?? `Option ${index + 1}`),
      percent: resolvedPercent
    };
  });

  return normalizedOptions;
};

const normalizePolls = (items) =>
  ensureArray(items).map((poll, index) => {
    const options = ensureArray(poll.options);
    const explicitTotal = ensureNumber(
      poll.totalVotes ?? poll.voteCount ?? poll.total_votes ?? poll.votes ?? poll.total,
      null
    );
    const fallbackTotal = options.reduce((sum, option) => {
      const votes = ensureNumber(
        option.votes ?? option.count ?? option.total ?? option.value ?? option.vote_count,
        0
      );
      return sum + (votes || 0);
    }, 0);
    const totalVotes = explicitTotal ?? fallbackTotal;

    return {
      id: ensureString(poll.id, `poll-${index + 1}`),
      title: ensureString(poll.title ?? poll.question ?? `Poll ${index + 1}`),
      description: ensureString(poll.description ?? poll.prompt ?? ''),
      deadline: toISOString(poll.deadline ?? poll.expires_at ?? poll.endsAt ?? poll.closesAt ?? ''),
      totalVotes,
      options: normalizePollOptions(options, totalVotes)
    };
  });

const normalizeSpotlights = (items) => {
  const normalized = ensureArray(items).map((item, index) => ({
    id: ensureString(item.id, `spotlight-${index + 1}`),
    name: ensureString(item.name ?? item.studentName ?? item.student_name ?? item.title ?? 'Student Spotlight'),
    month: ensureString(
      item.month ??
        item.period ??
        item.cohort ??
        (item.featured_at ? `${toDateOnly(item.featured_at).slice(0, 7)}` : ''),
      ''
    ),
    points: ensureNumber(item.points ?? item.score ?? item.totalPoints ?? item.rewardPoints, 0),
    award: ensureString(item.award ?? item.recognition ?? item.honor ?? 'Spotlight Award'),
    description: ensureString(
      item.description ?? item.summary ?? item.reason ?? item.achievements ?? 'Keep up the amazing work!'
    ),
    isCurrent: Boolean(item.isCurrent ?? item.current ?? item.active ?? item.featured_at)
  }));

  if (!normalized.some((entry) => entry.isCurrent) && normalized[0]) {
    normalized[0].isCurrent = true;
  }

  return normalized;
};

const normalizeRewardLeaders = (value) => {
  if (!value || typeof value !== 'object') {
    return {
      currentUser: null,
      leaderboard: []
    };
  }

  const currentUserSource =
    value.currentUser ??
    value.self ??
    value.me ??
    value.user ??
    value.profile ??
    null;

  const currentUser = currentUserSource
    ? {
        name: ensureString(currentUserSource.name ?? currentUserSource.title ?? ''),
        points: ensureNumber(
          currentUserSource.points ??
            currentUserSource.total ??
            currentUserSource.score ??
            currentUserSource.rewardPoints ??
            currentUserSource.balance,
          0
        ),
        progress: ensureString(
          currentUserSource.progress ??
            currentUserSource.delta ??
            currentUserSource.change ??
            currentUserSource.trend ??
            currentUserSource.weeklyChange ??
            ''
        )
      }
    : null;

  const leaderboardSource =
    ensureArray(value.leaderboard ?? value.leaders ?? value.entries ?? (Array.isArray(value) ? value : []));

  const leaderboard = leaderboardSource.map((entry, index) => ({
    id: ensureString(entry.id, `leader-${index + 1}`),
    name: ensureString(entry.name ?? entry.title ?? entry.student_name ?? `Leader ${index + 1}`),
    points: ensureNumber(
      entry.points ?? entry.total ?? entry.score ?? entry.rewardPoints ?? entry.balance ?? entry.points_earned,
      0
    ),
    category: ensureString(entry.category ?? entry.group ?? '')
  }));

  return {
    currentUser,
    leaderboard
  };
};

const normalizeCalendar = (items) =>
  ensureArray(items).map((item, index) => {
    const rawDate = item.date ?? item.day ?? item.scheduledFor ?? item.start_time ?? item.startTime;
    const rawTime = item.time ?? item.start_time ?? item.startTime ?? item.startsAt ?? item.timeRange;

    return {
      id: ensureString(item.id, `calendar-${index + 1}`),
      date: toDateOnly(rawDate),
      type: ensureString(item.type ?? item.category ?? item.kind ?? 'event').toLowerCase(),
      title: ensureString(item.title ?? item.name ?? item.summary ?? item.description ?? ''),
      time: toTime(rawTime)
    };
  });

const fetchLatestNews = async (limit = DEFAULT_NEWS_LIMIT) => {
  const { rows } = await getPool().query(
    `SELECT id, title, summary, body, link, image_url, published_at
       FROM campus_news
       ORDER BY published_at DESC NULLS LAST, id DESC
       LIMIT $1`,
    [limit]
  );
  return rows;
};

const fetchUpcomingEvents = async (limit = DEFAULT_EVENTS_LIMIT) => {
  const { rows } = await getPool().query(
    `SELECT id, title, description, location, start_time, end_time, image_url
       FROM campus_events
       ORDER BY start_time ASC NULLS LAST, id ASC
       LIMIT $1`,
    [limit]
  );
  return rows;
};

const fetchCommunityPosts = async (limit = DEFAULT_EVENTS_LIMIT) => {
  const { rows } = await getPool().query(
    `SELECT id, title, category, description, tags, created_at
       FROM community_posts
       ORDER BY created_at DESC NULLS LAST, id DESC
       LIMIT $1`,
    [limit]
  );

  return rows.map((row) => ({
    ...row,
    author: ensureString(row.author, 'Community'),
    content: row.description,
    created_at: row.created_at
  }));
};

const mergeEvents = (campusEvents, communityPosts, limit = DEFAULT_EVENTS_LIMIT) => {
  const withSortKey = [
    ...ensureArray(campusEvents).map((event) => ({
      ...event,
      __sortTimestamp:
        toTimestamp(event.start_time ?? event.startTime ?? event.created_at ?? event.createdAt) ?? 0
    })),
    ...ensureArray(communityPosts).map((post) => ({
      ...post,
      author: ensureString(post.author, 'Community'),
      __sortTimestamp: toTimestamp(post.created_at ?? post.createdAt) ?? 0
    }))
  ];

  withSortKey.sort((a, b) => b.__sortTimestamp - a.__sortTimestamp);

  return withSortKey.slice(0, limit).map((item) => {
    const { __sortTimestamp, ...rest } = item;
    return rest;
  });
};

const fetchActivePolls = async (limit = DEFAULT_POLLS_LIMIT) => {
  const { rows: polls } = await getPool().query(
    `SELECT id, title, description, is_active, expires_at, created_at
       FROM polls
       WHERE is_active = TRUE OR (expires_at IS NOT NULL AND expires_at > NOW())
       ORDER BY COALESCE(expires_at, created_at + INTERVAL '365 days') ASC, created_at DESC
       LIMIT $1`,
    [limit]
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
    const formatted = { ...option, vote_count: voteCount, name: option.label };
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

const fetchStudentSpotlights = async (limit = DEFAULT_SPOTLIGHTS_LIMIT) => {
  const { rows } = await getPool().query(
    `SELECT id, student_name, major, class_year, achievements, quote, image_url, featured_at
       FROM student_spotlights
       ORDER BY featured_at DESC NULLS LAST, id DESC
       LIMIT $1`,
    [limit]
  );
  return rows;
};

const fetchRewardLeaders = async (limit = DEFAULT_REWARD_LIMIT) => {
  const { rows } = await getPool().query(
    `SELECT id, student_name, points, category, updated_at
       FROM reward_points
       ORDER BY points DESC, updated_at DESC NULLS LAST, id ASC
       LIMIT $1`,
    [limit]
  );

  return {
    leaderboard: rows.map((row) => ({
      id: row.id,
      name: row.student_name,
      points: row.points,
      category: row.category,
      updatedAt: row.updated_at
    }))
  };
};

const fetchCalendarItems = async (limit = DEFAULT_CALENDAR_LIMIT) => {
  const { rows } = await getPool().query(
    `SELECT id, title, description, start_time, end_time, location, category, link
       FROM calendar_items
       ORDER BY start_time ASC NULLS LAST, id ASC
       LIMIT $1`,
    [limit]
  );
  return rows;
};

async function safeLoadSection(loader, fallback) {
  if (typeof loader !== 'function') {
    return fallback;
  }

  try {
    const result = await loader();
    if (result === undefined || result === null) {
      return fallback;
    }
    return result;
  } catch (error) {
    console.error('Dashboard data loader failed:', error);
    return fallback;
  }
}

async function getDashboardData(options = {}) {
  const { loaders: overrideLoaders = {}, limits: limitOverrides = {} } = options;

  const effectiveLimits = {
    news: parseLimit(limitOverrides.newsLimit, DEFAULT_NEWS_LIMIT),
    events: parseLimit(limitOverrides.eventsLimit, DEFAULT_EVENTS_LIMIT),
    polls: parseLimit(limitOverrides.pollsLimit, DEFAULT_POLLS_LIMIT),
    spotlights: parseLimit(limitOverrides.spotlightLimit, DEFAULT_SPOTLIGHTS_LIMIT),
    rewards: parseLimit(limitOverrides.rewardLimit, DEFAULT_REWARD_LIMIT),
    calendar: parseLimit(limitOverrides.calendarLimit, DEFAULT_CALENDAR_LIMIT)
  };

  const defaultLoaders = {
    news: () => fetchLatestNews(effectiveLimits.news),
    events: () =>
      (async () => {
        const [campusEvents, communityPosts] = await Promise.all([
          fetchUpcomingEvents(effectiveLimits.events),
          fetchCommunityPosts(effectiveLimits.events)
        ]);

        return mergeEvents(campusEvents, communityPosts, effectiveLimits.events);
      })(),
    polls: () => fetchActivePolls(effectiveLimits.polls),
    spotlights: () => fetchStudentSpotlights(effectiveLimits.spotlights),
    rewardLeaders: () => fetchRewardLeaders(effectiveLimits.rewards),
    calendar: () => fetchCalendarItems(effectiveLimits.calendar)
  };

  const loaders = {
    ...defaultLoaders,
    ...overrideLoaders
  };

  const [newsRaw, eventsRaw, pollsRaw, spotlightsRaw, rewardLeadersRaw, calendarRaw] =
    await Promise.all([
      safeLoadSection(loaders.news, FALLBACK_DASHBOARD_DATA.news),
      safeLoadSection(loaders.events, FALLBACK_DASHBOARD_DATA.events),
      safeLoadSection(loaders.polls, FALLBACK_DASHBOARD_DATA.polls),
      safeLoadSection(loaders.spotlights, FALLBACK_DASHBOARD_DATA.spotlights),
      safeLoadSection(loaders.rewardLeaders, FALLBACK_DASHBOARD_DATA.rewardLeaders),
      safeLoadSection(loaders.calendar, FALLBACK_DASHBOARD_DATA.calendar)
    ]);

  return {
    news: normalizeNews(newsRaw),
    events: normalizeEvents(eventsRaw),
    polls: normalizePolls(pollsRaw),
    spotlights: normalizeSpotlights(spotlightsRaw),
    rewardLeaders: normalizeRewardLeaders(rewardLeadersRaw),
    calendar: normalizeCalendar(calendarRaw),
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  getDashboardData,
  __private: {
    FALLBACK_DASHBOARD_DATA,
    ensureArray,
    ensureString,
    ensureNumber,
    parseLimit,
    safeLoadSection,
    normalizeNews,
    normalizeEvents,
    normalizePolls,
    normalizeSpotlights,
    normalizeRewardLeaders,
    normalizeCalendar,
    toISOString,
    toDateOnly,
    toTime
  }
};
