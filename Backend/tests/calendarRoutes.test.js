const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('../src/utils/jwt');

const app = require('../src/app');
const { setPool } = require('../src/db');
const { JWT_SECRET } = require('../src/config/env');

const createAuthHeader = (userId) => `Bearer ${jwt.sign({ sub: userId }, JWT_SECRET)}`;

class InMemoryPool {
  constructor() {
    this.reset();
  }

  reset() {
    this.users = new Map();
    this.calendarItems = new Map();
    this.userSeq = 1;
    this.calendarSeq = 1;
    this.sourceSeq = 1;
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

  createCalendarItem(attrs) {
    const id = this.calendarSeq;
    this.calendarSeq += 1;
    const now = new Date().toISOString();
    const record = {
      id,
      user_id: attrs.user_id,
      source_type: attrs.source_type || 'seed',
      source_id: attrs.source_id ?? this.sourceSeq++,
      title: attrs.title || `Seed item ${id}`,
      description: attrs.description ?? null,
      date: attrs.date || '2024-01-01',
      time: attrs.time ?? null,
      category: attrs.category ?? 'Personal',
      created_at: attrs.created_at || now,
      updated_at: attrs.updated_at || now
    };
    this.calendarItems.set(id, record);
    return record;
  }

  getCalendarItem(id) {
    const record = this.calendarItems.get(id);
    return record ? { ...record } : null;
  }

  cloneRow(row) {
    return JSON.parse(JSON.stringify(row));
  }

  async query(text, params = []) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT id, user_id, source_type')) {
      const [userId, limit] = params;
      const rows = Array.from(this.calendarItems.values())
        .filter((item) => item.user_id === userId)
        .sort((a, b) => {
          if (a.date === b.date) {
            if (a.time === b.time) {
              return a.id - b.id;
            }
            if (a.time === null) return 1;
            if (b.time === null) return -1;
            return a.time.localeCompare(b.time);
          }
          if (a.date === null) return 1;
          if (b.date === null) return -1;
          return a.date.localeCompare(b.date);
        })
        .slice(0, limit)
        .map((row) => this.cloneRow(row));
      return { rows, rowCount: rows.length };
    }

    if (normalized.startsWith('INSERT INTO user_calendar_items')) {
      const [userId, sourceType, sourceId, title, date, time, category] = params;
      const now = new Date().toISOString();
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

    if (normalized.startsWith('UPDATE user_calendar_items')) {
      const itemId = params[params.length - 2];
      const userId = params[params.length - 1];
      const row = this.calendarItems.get(itemId);
      if (!row || row.user_id !== userId) {
        return { rows: [], rowCount: 0 };
      }
      const setClause = normalized.split('SET')[1].split('WHERE')[0].trim();
      const assignments = setClause.split(',').map((part) => part.trim());
      const valueParams = params.slice(0, -2);
      let cursor = 0;
      for (const assignment of assignments) {
        if (assignment.startsWith('title =')) {
          row.title = valueParams[cursor++];
        } else if (assignment.startsWith('date =')) {
          row.date = valueParams[cursor++];
        } else if (assignment.startsWith('time = NULL')) {
          row.time = null;
        } else if (assignment.startsWith('time =')) {
          row.time = valueParams[cursor++];
        } else if (assignment.startsWith('category = NULL')) {
          row.category = null;
        } else if (assignment.startsWith('category =')) {
          row.category = valueParams[cursor++];
        } else if (assignment.startsWith('updated_at =')) {
          row.updated_at = new Date().toISOString();
        }
      }
      return { rows: [this.cloneRow(row)], rowCount: 1 };
    }

    if (normalized.startsWith('DELETE FROM user_calendar_items')) {
      const [itemId, userId] = params;
      const row = this.calendarItems.get(itemId);
      if (!row || row.user_id !== userId) {
        return { rows: [], rowCount: 0 };
      }
      this.calendarItems.delete(itemId);
      return { rows: [{ id: itemId }], rowCount: 1 };
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
  let data = null;
  const text = await response.text();
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

describe('Calendar routes integration', () => {
  let owner;
  let guest;

  beforeEach(() => {
    testDb.reset();
    owner = testDb.createUser({ first_name: 'Calendar', last_name: 'Owner', email: 'owner@example.com' });
    guest = testDb.createUser({ first_name: 'Calendar', last_name: 'Guest', email: 'guest@example.com' });
  });

  it('GET /api/calendar returns only the user\'s rows and respects the limit cap', async () => {
    for (let index = 0; index < 150; index += 1) {
      testDb.createCalendarItem({
        user_id: owner.id,
        title: `Owner item ${index}`,
        date: `2024-02-${String((index % 28) + 1).padStart(2, '0')}`,
        source_id: 10_000 + index
      });
    }

    for (let index = 0; index < 3; index += 1) {
      testDb.createCalendarItem({
        user_id: guest.id,
        title: `Guest item ${index}`,
        date: `2024-03-0${index + 1}`,
        source_id: 20_000 + index
      });
    }

    await withServer(async (server) => {
      const response = await sendRequest(server, {
        method: 'GET',
        path: '/api/calendar?limit=200',
        token: createAuthHeader(owner.id)
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.items.length, 100);
      response.body.items.forEach((item) => {
        assert.equal(item.user_id, owner.id);
      });
    });
  });

  it('POST /api/calendar validates payloads and persists rows for the authenticated user', async () => {
    await withServer(async (server) => {
      const missingTitle = await sendRequest(server, {
        method: 'POST',
        path: '/api/calendar',
        token: createAuthHeader(owner.id),
        body: { date: '2024-05-01' }
      });
      assert.equal(missingTitle.status, 400);
      assert.equal(missingTitle.body.message, 'Title is required.');

      const invalidDate = await sendRequest(server, {
        method: 'POST',
        path: '/api/calendar',
        token: createAuthHeader(owner.id),
        body: { title: 'Invalid date', date: 'not-a-date' }
      });
      assert.equal(invalidDate.status, 400);
      assert.equal(invalidDate.body.message, 'A valid date (YYYY-MM-DD) is required.');

      const payload = { title: 'Research presentation', date: '2024-05-01', time: '09:30', category: 'Workshop' };
      const created = await sendRequest(server, {
        method: 'POST',
        path: '/api/calendar',
        token: createAuthHeader(owner.id),
        body: payload
      });

      assert.equal(created.status, 201);
      assert.equal(created.body.item.user_id, owner.id);
      assert.equal(created.body.item.title, payload.title);
      const stored = testDb.getCalendarItem(created.body.item.id);
      assert.equal(stored.user_id, owner.id);
      assert.equal(stored.title, payload.title);
    });
  });

  it('PUT /api/calendar/:id enforces ownership, rejects missing rows, and updates nullable fields', async () => {
    const ownItem = testDb.createCalendarItem({
      user_id: owner.id,
      title: 'Original title',
      date: '2024-06-10',
      time: '12:30',
      category: 'Reminder'
    });
    const otherItem = testDb.createCalendarItem({
      user_id: guest.id,
      title: 'Other user row',
      date: '2024-06-11',
      time: '09:00'
    });

    await withServer(async (server) => {
      const missing = await sendRequest(server, {
        method: 'PUT',
        path: '/api/calendar/9999',
        token: createAuthHeader(owner.id),
        body: { title: 'Updated' }
      });
      assert.equal(missing.status, 404);
      assert.equal(missing.body.message, 'Calendar item not found.');

      const unauthorized = await sendRequest(server, {
        method: 'PUT',
        path: `/api/calendar/${otherItem.id}`,
        token: createAuthHeader(owner.id),
        body: { title: 'Updated' }
      });
      assert.equal(unauthorized.status, 404);

      const update = await sendRequest(server, {
        method: 'PUT',
        path: `/api/calendar/${ownItem.id}`,
        token: createAuthHeader(owner.id),
        body: { title: 'Updated title', time: '', category: '' }
      });

      assert.equal(update.status, 200);
      assert.equal(update.body.item.title, 'Updated title');
      assert.equal(update.body.item.time, null);
      assert.equal(update.body.item.category, null);

      const stored = testDb.getCalendarItem(ownItem.id);
      assert.equal(stored.title, 'Updated title');
      assert.equal(stored.time, null);
      assert.equal(stored.category, null);
    });
  });

  it('DELETE /api/calendar/:id enforces ownership and reports missing rows', async () => {
    const ownItem = testDb.createCalendarItem({ user_id: owner.id, title: 'Delete me', date: '2024-07-01' });
    const foreignItem = testDb.createCalendarItem({ user_id: guest.id, title: 'Keep me', date: '2024-07-02' });

    await withServer(async (server) => {
      const unauthorized = await sendRequest(server, {
        method: 'DELETE',
        path: `/api/calendar/${foreignItem.id}`,
        token: createAuthHeader(owner.id)
      });
      assert.equal(unauthorized.status, 404);
      assert.equal(unauthorized.body.message, 'Calendar item not found.');

      const missing = await sendRequest(server, {
        method: 'DELETE',
        path: '/api/calendar/9999',
        token: createAuthHeader(owner.id)
      });
      assert.equal(missing.status, 404);

      const deleted = await sendRequest(server, {
        method: 'DELETE',
        path: `/api/calendar/${ownItem.id}`,
        token: createAuthHeader(owner.id)
      });
      assert.equal(deleted.status, 200);
      assert.equal(deleted.body.success, true);
      assert.equal(testDb.getCalendarItem(ownItem.id), null);
    });
  });
});