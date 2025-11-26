const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysFromNow = (days) => new Date(Date.now() + days * DAY_MS).toISOString();
const toDateOnly = (isoString) => isoString.slice(0, 10);
const toTimeOnly = (isoString) => isoString.slice(11, 16);

const sendRequest = async (server, { method = 'GET', path, headers = {}, body = null }) => {
  const url = new URL(path, `http://127.0.0.1:${server.address().port}`);
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  const parsedBody = text ? JSON.parse(text) : null;
  return { status: res.status, body: parsedBody };
};

describe('poll calendar integration', () => {
  let server;
  let dashboardService;
  let polls;
  let pollOptions;
  let pollVotes;
  let queryLog;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret';

    const dbModuleId = require.resolve('../src/db');
    delete require.cache[dbModuleId];
    delete require.cache[require.resolve('../src/routes/polls')];
    delete require.cache[require.resolve('../src/services/dashboardService')];

    polls = [
      {
        id: 1,
        title: 'Dorm Improvements',
        description: 'Help prioritize the next upgrade.',
        is_active: true,
        expires_at: new Date(isoDaysFromNow(2)),
        created_at: new Date()
      }
    ];

    pollOptions = [
      { id: 101, poll_id: 1, label: 'New study lounges', created_at: new Date() },
      { id: 102, poll_id: 1, label: 'Better Wi-Fi', created_at: new Date() }
    ];

    pollVotes = [];
    queryLog = [];

    const queryStub = async (text, params = []) => {
      queryLog.push(text);

      if (text.startsWith('BEGIN') || text.startsWith('COMMIT') || text.startsWith('ROLLBACK')) {
        return { rows: [] };
      }

      if (text.includes('FROM polls') && text.includes('WHERE id = $1')) {
        const [id] = params;
        return { rows: polls.filter((p) => p.id === id) };
      }

      if (text.includes('FROM polls') && text.includes('WHERE is_active')) {
        return { rows: polls };
      }

      if (text.includes('FROM poll_options') && text.includes('ANY($1')) {
        const ids = params[0] || [];
        const rows = pollOptions
          .filter((option) => ids.includes(option.poll_id))
          .map((option) => ({
            ...option,
            vote_count: pollVotes.filter((vote) => vote.option_id === option.id).length
          }));
        return { rows };
      }

      if (text.includes('FROM poll_votes v') && text.includes('JOIN polls p')) {
        const [userId] = params;
        const now = Date.now();
        const futureLimit = now + 180 * DAY_MS;
        const pastLimit = now - DAY_MS;

        const rows = pollVotes
          .filter((vote) => vote.user_id === userId)
          .map((vote) => polls.find((poll) => poll.id === vote.poll_id))
          .filter(Boolean)
          .filter((poll) => {
            const expiresAt = poll.expires_at?.getTime?.() ?? Date.parse(poll.expires_at);
            return expiresAt >= pastLimit && expiresAt <= futureLimit;
          });

        return { rows };
      }

      if (text.includes('FROM poll_options')) {
        const [pollId] = params;
        const rows = pollOptions
          .filter((option) => option.poll_id === pollId)
          .map((option) => ({
            ...option,
            vote_count: pollVotes.filter((vote) => vote.option_id === option.id).length
          }));
        return { rows };
      }

      if (text.includes('FROM poll_votes') && text.includes('INNER JOIN polls p ON p.id = v.poll_id')) {
        const [userId, limit] = params;
        const rows = pollVotes
          .filter((vote) => vote.user_id === userId)
          .map((vote) => polls.find((poll) => poll.id === vote.poll_id))
          .filter(Boolean)
          .map((poll) => ({ id: poll.id, title: poll.title, expires_at: poll.expires_at }))
          .slice(0, limit ?? pollVotes.length);
        return { rows };
      }
      
      if (text.startsWith('INSERT INTO poll_votes')) {
        const [pollId, optionId, userId] = params;
        const existingIndex = pollVotes.findIndex((vote) => vote.poll_id === pollId && vote.user_id === userId);
        const vote = { poll_id: pollId, option_id: optionId, user_id: userId };
        if (existingIndex >= 0) {
          pollVotes[existingIndex] = vote;
        } else {
          pollVotes.push(vote);
        }
        return { rows: [] };
      }

      if (text.includes('FROM poll_votes') && text.includes('poll_id = ANY')) {
        const [userId, pollIds] = params;
        const rows = pollVotes
          .filter((vote) => vote.user_id === userId && pollIds.includes(vote.poll_id))
          .map((vote) => ({ poll_id: vote.poll_id }));
        return { rows };
      }

      if (text.includes('FROM poll_votes')) {
        return { rows: [] };
      }

      if (text.includes('FROM user_calendar_items')) {
        return { rows: [] };
      }

      return { rows: [] };
    };

    const pool = {
      query: queryStub,
      connect: async () => ({ query: queryStub, release: () => {} })
    };

    require.cache[dbModuleId] = {
      id: dbModuleId,
      filename: dbModuleId,
      loaded: true,
      exports: { getPool: () => pool }
    };

    dashboardService = require('../src/services/dashboardService');
    const pollRoutes = require('../src/routes/polls');
    const app = express();
    app.use(express.json());
    app.use('/api/polls', pollRoutes);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('exposes voted poll deadlines through the dashboard calendar without persisting calendar rows', async () => {
    const userId = 321;
    const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET);

    const voteResponse = await sendRequest(server, {
      method: 'POST',
      path: `/api/polls/${polls[0].id}/vote`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ optionId: pollOptions[0].id })
    });

    assert.equal(voteResponse.status, 200);
    assert.equal(pollVotes.length, 1);
    assert.equal(pollVotes[0].user_id, userId);

    const calendarMutations = queryLog.filter(
      (text) => text.includes('user_calendar_items') && /INSERT|DELETE|UPDATE/i.test(text)
    );
    assert.equal(calendarMutations.length, 0, 'poll votes should not upsert user_calendar_items');

    const dashboard = await dashboardService.getDashboardData({ userId, limits: { calendarLimit: 5 } });
    const pollEntries = dashboard.calendar.filter((entry) => entry.type === 'poll');

    assert.equal(pollEntries.length, 1, 'voted poll should appear on the calendar');
    assert.equal(pollEntries[0].title, polls[0].title);
    assert.equal(pollEntries[0].date, toDateOnly(polls[0].expires_at.toISOString()));
    assert.equal(pollEntries[0].time, toTimeOnly(polls[0].expires_at.toISOString()));
  });
  
  it('rejects voting when no authenticated user is provided', async () => {
    const response = await sendRequest(server, {
      method: 'POST',
      path: `/api/polls/${polls[0].id}/vote`,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': '',
        Authorization: ''
      },
      body: JSON.stringify({ optionId: pollOptions[0].id })
    });

    assert.equal(response.status, 401);
    assert.deepEqual(pollVotes, []);
  });
});