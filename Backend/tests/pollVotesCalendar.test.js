const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const { setPool } = require('../src/db');
const { JWT_SECRET } = require('../src/config/env');

const POLL_SOURCE = 'poll';

const createAuthHeader = (userId) => `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;

class InMemoryPool {
  constructor() {
    this.reset();
  }

  reset() {
    this.users = new Map();
    this.userSeq = 1;

    this.calendarItems = new Map();
    this.calendarSeq = 1;

    this.polls = new Map();
    this.pollSeq = 1;

    this.pollOptions = new Map();
    this.optionSeq = 1;

    this.pollVotes = new Map();
    this.pollVoteSeq = 1;
  }

  createUser(attrs = {}) {
    const id = this.userSeq;
    this.userSeq += 1;
    const record = {
      id,
      role: attrs.role || 'student',
      first_name: attrs.first_name || null,
      last_name: attrs.last_name || null,
      email: attrs.email || `user${id}@example.com`,
      password_hash: attrs.password_hash || 'hash'
    };
    this.users.set(id, record);
    return record;
  }

  createPoll(attrs = {}) {
    const id = this.pollSeq;
    this.pollSeq += 1;
    const now = new Date();
    const record = {
      id,
      title: attrs.title || `Poll ${id}`,
      description: attrs.description || 'Description',
      is_active: attrs.is_active !== undefined ? attrs.is_active : true,
      expires_at: attrs.expires_at || new Date(now.getTime() + 60 * 60 * 1000),
      created_at: attrs.created_at || now
    };
    this.polls.set(id, record);

    const optionLabels = attrs.options?.length ? attrs.options : ['Option A', 'Option B'];
    const options = optionLabels.map((label) => this.createPollOption(id, { label }));
    return { poll: record, options };
  }

  createPollOption(pollId, attrs = {}) {
    const id = this.optionSeq;
    this.optionSeq += 1;
    const now = new Date();
    const record = {
      id,
      poll_id: pollId,
      label: attrs.label || `Option ${id}`,
      created_at: attrs.created_at || now
    };
    this.pollOptions.set(id, record);
    return record;
  }

  createCalendarItem(attrs) {
    const id = this.calendarSeq;
    this.calendarSeq += 1;
    const now = new Date().toISOString();
    const record = {
      id,
      user_id: attrs.user_id,
      source_type: attrs.source_type || 'seed',
      source_id: attrs.source_id ?? id,
      title: attrs.title || `Item ${id}`,
      description: attrs.description ?? null,
      date: attrs.date || '2024-01-01',
      time: attrs.time ?? null,
      category: attrs.category ?? null,
      created_at: attrs.created_at || now,
      updated_at: attrs.updated_at || now
    };
    this.calendarItems.set(id, record);
    return record;
  }

  findCalendarItemBySource(userId, sourceType, sourceId) {
    for (const item of this.calendarItems.values()) {
      if (item.user_id === userId && item.source_type === sourceType && item.source_id === sourceId) {
        return { ...item };
      }
    }
    return null;
  }

  deleteCalendarItemBySource(userId, sourceType, sourceId) {
    for (const [id, item] of this.calendarItems.entries()) {
      if (item.user_id === userId && item.source_type === sourceType && item.source_id === sourceId) {
        this.calendarItems.delete(id);
        return true;
      }
    }
    return false;
  }

  countVotesForOption(optionId) {
    let total = 0;
    for (const vote of this.pollVotes.values()) {
      if (vote.option_id === optionId) {
        total += 1;
      }
    }
    return total;
  }

  cloneRow(row) {
    return JSON.parse(JSON.stringify(row));
  }

  async connect() {
    return {
      query: (text, params) => this.query(text, params),
      release: () => {}
    };
  }

  async query(text, params = []) {
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('SELECT id, title, description, is_active, expires_at, created_at FROM polls')) {
      const [pollId] = params;
      const row = this.polls.get(pollId);
      const rows = row ? [this.cloneRow(row)] : [];
      return { rows, rowCount: rows.length };
    }

    if (normalized.startsWith('SELECT o.id, o.poll_id, o.label, o.created_at, COUNT(v.id)::INT AS vote_count')) {
      const [pollId] = params;
      const rows = Array.from(this.pollOptions.values())
        .filter((option) => option.poll_id === pollId)
        .sort((a, b) => {
          if (a.created_at === b.created_at) {
            return a.id - b.id;
          }
          return new Date(a.created_at) - new Date(b.created_at);
        })
        .map((option) => ({
          id: option.id,
          poll_id: option.poll_id,
          label: option.label,
          created_at: option.created_at,
          vote_count: this.countVotesForOption(option.id)
        }));
      return { rows, rowCount: rows.length };
    }

    if (normalized.startsWith('INSERT INTO poll_votes')) {
      const [pollId, optionId, userId] = params;
      const option = this.pollOptions.get(optionId);
      if (!option || option.poll_id !== pollId) {
        throw new Error('Option does not belong to poll.');
      }

      const key = `${pollId}:${userId ?? 'null'}`;
      if (this.pollVotes.has(key)) {
        this.pollVotes.get(key).option_id = optionId;
      } else {
        this.pollVotes.set(key, {
          id: this.pollVoteSeq++,
          poll_id: pollId,
          option_id: optionId,
          user_id: userId ?? null
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO user_calendar_items')) {
      const [userId, sourceType, sourceId, title, date, time, category] = params;
      let existingId = null;
      for (const [id, row] of this.calendarItems.entries()) {
        if (row.user_id === userId && row.source_type === sourceType && row.source_id === sourceId) {
          existingId = id;
          break;
        }
      }
      const now = new Date().toISOString();
      if (existingId) {
        const row = this.calendarItems.get(existingId);
        row.title = title;
        row.date = date;
        row.time = time;
        row.category = category;
        row.updated_at = now;
        return { rows: [this.cloneRow(row)], rowCount: 1 };
      }
      const id = this.calendarSeq;
      this.calendarSeq += 1;
      const row = {
        id,
        user_id: userId,
        source_type: sourceType,
        source_id: sourceId,
        title,
        description: null,
        date,
        time,
        category,
        created_at: now,
        updated_at: now
      };
      this.calendarItems.set(id, row);
      return { rows: [this.cloneRow(row)], rowCount: 1 };
    }

    if (normalized.startsWith('DELETE FROM user_calendar_items WHERE user_id = $1 AND source_type = $2 AND source_id = $3')) {
      const [userId, sourceType, sourceId] = params;
      const deleted = this.deleteCalendarItemBySource(userId, sourceType, sourceId);
      return { rows: deleted ? [{ id: 1 }] : [], rowCount: deleted ? 1 : 0 };
    }

    throw new Error(`Unsupported query in in-memory pool: ${normalized}`);
  }
}

const testDb = new InMemoryPool();
setPool(testDb);

const startServer = () =>
  new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });

const stopServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const sendRequest = async (server, { method = 'GET', path, body = null, token = null }) => {
  const url = new URL(path, `http://127.0.0.1:${server.address().port}`);
  const headers = {};
  let payload;
  if (token) {
    headers.Authorization = token;
  }
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(url, { method, headers, body: payload });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = text;
    }
  }
  return { status: response.status, body: data };
};

const withServer = async (handler) => {
  const server = await startServer();
  try {
    return await handler(server);
  } finally {
    await stopServer(server);
  }
};

const futureDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
const pastDate = () => new Date(Date.now() - 60 * 60 * 1000);

const formatDeadlineParts = (date) => {
  const iso = date.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 19)
  };
};

describe('Poll vote calendar integration', () => {
  let voter;
  let poll;
  let options;

  beforeEach(() => {
    testDb.reset();
    voter = testDb.createUser({ first_name: 'Poll', last_name: 'Voter', email: 'poll@example.com' });
    const seeded = testDb.createPoll({
      title: 'Campus speaker selection',
      description: 'Vote for the speaker',
      expires_at: futureDate(),
      options: ['Ada Lovelace', 'Grace Hopper']
    });
    poll = seeded.poll;
    options = seeded.options;
  });

  it('adds or updates the poll deadline in the user calendar when voting succeeds', async () => {
    await withServer(async (server) => {
      const response = await sendRequest(server, {
        method: 'POST',
        path: `/api/polls/${poll.id}/vote`,
        token: createAuthHeader(voter.id),
        body: { optionId: options[0].id }
      });

      assert.equal(response.status, 200);
      assert.ok(response.body.poll);

      const calendarRow = testDb.findCalendarItemBySource(voter.id, POLL_SOURCE, poll.id);
      assert.ok(calendarRow);
      assert.equal(calendarRow.title, poll.title);
      const deadline = formatDeadlineParts(poll.expires_at);
      assert.equal(calendarRow.date, deadline.date);
      assert.equal(calendarRow.time, deadline.time);
      assert.equal(calendarRow.category, POLL_SOURCE);
    });
  });

  it('removes the poll calendar entry when the poll is inactive or expired', async () => {
    poll.is_active = false;
    poll.expires_at = pastDate();
    testDb.createCalendarItem({
      user_id: voter.id,
      source_type: POLL_SOURCE,
      source_id: poll.id,
      title: 'Old poll reminder',
      date: '2024-02-01',
      time: '10:00:00',
      category: POLL_SOURCE
    });

    await withServer(async (server) => {
      const response = await sendRequest(server, {
        method: 'POST',
        path: `/api/polls/${poll.id}/vote`,
        token: createAuthHeader(voter.id),
        body: { optionId: options[0].id }
      });

      assert.equal(response.status, 400);
      assert.equal(response.body.message, 'This poll is no longer accepting votes.');
      const calendarRow = testDb.findCalendarItemBySource(voter.id, POLL_SOURCE, poll.id);
      assert.equal(calendarRow, null);
    });
  });
});