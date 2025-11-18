const { describe, it, beforeEach, afterEach } = require('node:test');
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
    this.events = new Map();
    this.eventSeq = 1;
    this.eventRegistrations = new Map();
    this.eventRegistrationSeq = 1;

    this.competitions = new Map();
    this.competitionSeq = 1;
    this.competitionRegistrations = new Map();
    this.competitionRegistrationSeq = 1;

    this.calendarItems = new Map();
    this.calendarSeq = 1;
  }

  clone(row) {
    return JSON.parse(JSON.stringify(row));
  }

  createEvent(attrs = {}) {
    const id = this.eventSeq++;
    const now = Date.now();
    const record = {
      id,
      title: attrs.title || `Event ${id}`,
      description: attrs.description || 'Desc',
      location: attrs.location || 'Campus',
      start_time: attrs.start_time || new Date(now + 60 * 60 * 1000).toISOString(),
      end_time: attrs.end_time || new Date(now + 2 * 60 * 60 * 1000).toISOString(),
      is_cancelled: attrs.is_cancelled ?? false,
      max_participants: attrs.max_participants ?? null
    };
    this.events.set(id, record);
    return record;
  }

  createCompetition(attrs = {}) {
    const id = this.competitionSeq++;
    const now = Date.now();
    const record = {
      id,
      title: attrs.title || `Competition ${id}`,
      description: attrs.description || 'Desc',
      location: attrs.location || 'Campus',
      reward: attrs.reward || 'Reward',
      start_time: attrs.start_time || new Date(now + 60 * 60 * 1000).toISOString(),
      end_time: attrs.end_time || new Date(now + 2 * 60 * 60 * 1000).toISOString(),
      is_cancelled: attrs.is_cancelled ?? false,
      max_participants: attrs.max_participants ?? null
    };
    this.competitions.set(id, record);
    return record;
  }

  createCalendarItem(attrs = {}) {
    const id = this.calendarSeq++;
    const now = new Date().toISOString();
    const record = {
      id,
      user_id: attrs.user_id,
      source_type: attrs.source_type,
      source_id: attrs.source_id,
      title: attrs.title || 'Title',
      description: attrs.description ?? null,
      date: attrs.date || '2024-01-01',
      time: attrs.time || '09:00',
      category: attrs.category || attrs.source_type,
      created_at: now,
      updated_at: now
    };
    this.calendarItems.set(`${record.user_id}:${record.source_type}:${record.source_id}`, record);
    return record;
  }

  forceRegisterEvent(eventId, userId) {
    const key = `${eventId}:${userId}`;
    const now = new Date().toISOString();
    const record = {
      id: this.eventRegistrationSeq++,
      event_id: eventId,
      user_id: userId,
      created_at: now,
      updated_at: now
    };
    this.eventRegistrations.set(key, record);
    return record;
  }

  forceRegisterCompetition(competitionId, userId) {
    const key = `${competitionId}:${userId}`;
    const now = new Date().toISOString();
    const record = {
      id: this.competitionRegistrationSeq++,
      competition_id: competitionId,
      user_id: userId,
      created_at: now,
      updated_at: now
    };
    this.competitionRegistrations.set(key, record);
    return record;
  }

  countEventRegistrations(eventId) {
    let total = 0;
    for (const key of this.eventRegistrations.keys()) {
      if (key.startsWith(`${eventId}:`)) {
        total += 1;
      }
    }
    return total;
  }

  countCompetitionRegistrations(competitionId) {
    let total = 0;
    for (const key of this.competitionRegistrations.keys()) {
      if (key.startsWith(`${competitionId}:`)) {
        total += 1;
      }
    }
    return total;
  }

  findCalendarItem(userId, sourceType, sourceId) {
    const key = `${userId}:${sourceType}:${sourceId}`;
    const row = this.calendarItems.get(key);
    return row ? this.clone(row) : null;
  }

  deleteCalendarItem(userId, sourceType, sourceId) {
    const key = `${userId}:${sourceType}:${sourceId}`;
    return this.calendarItems.delete(key);
  }

  upsertCalendarItem(params) {
    const key = `${params.user_id}:${params.source_type}:${params.source_id}`;
    const now = new Date().toISOString();
    if (this.calendarItems.has(key)) {
      const existing = this.calendarItems.get(key);
      existing.title = params.title;
      existing.description = params.description;
      existing.date = params.date;
      existing.time = params.time;
      existing.category = params.category;
      existing.updated_at = now;
      return existing;
    }
    const record = {
      id: this.calendarSeq++,
      user_id: params.user_id,
      source_type: params.source_type,
      source_id: params.source_id,
      title: params.title,
      description: params.description,
      date: params.date,
      time: params.time,
      category: params.category,
      created_at: now,
      updated_at: now
    };
    this.calendarItems.set(key, record);
    return record;
  }

  async query(text, params = []) {
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('SELECT e.id') && normalized.includes('FROM campus_events')) {
      const [eventId] = params;
      const row = this.events.get(eventId);
      if (!row) {
        return { rows: [], rowCount: 0 };
      }
      return {
        rows: [
          this.clone({
            ...row,
            registrations_count: this.countEventRegistrations(eventId)
          })
        ],
        rowCount: 1
      };
    }

    if (normalized.startsWith('SELECT c.id') && normalized.includes('FROM competitions')) {
      const [competitionId] = params;
      const row = this.competitions.get(competitionId);
      if (!row) {
        return { rows: [], rowCount: 0 };
      }
      return {
        rows: [
          this.clone({
            ...row,
            registrations_count: this.countCompetitionRegistrations(competitionId)
          })
        ],
        rowCount: 1
      };
    }

    if (normalized.startsWith('INSERT INTO event_registrations')) {
      const [eventId, userId] = params;
      const key = `${eventId}:${userId}`;
      const now = new Date().toISOString();
      let record = this.eventRegistrations.get(key);
      if (!record) {
        record = {
          id: this.eventRegistrationSeq++,
          event_id: eventId,
          user_id: userId,
          created_at: now,
          updated_at: now
        };
        this.eventRegistrations.set(key, record);
      } else {
        record.updated_at = now;
      }
      return { rows: [this.clone(record)], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO competition_registrations')) {
      const [competitionId, userId] = params;
      const key = `${competitionId}:${userId}`;
      const now = new Date().toISOString();
      let record = this.competitionRegistrations.get(key);
      if (!record) {
        record = {
          id: this.competitionRegistrationSeq++,
          competition_id: competitionId,
          user_id: userId,
          created_at: now,
          updated_at: now
        };
        this.competitionRegistrations.set(key, record);
      } else {
        record.updated_at = now;
      }
      return { rows: [this.clone(record)], rowCount: 1 };
    }

    if (normalized.startsWith('DELETE FROM event_registrations')) {
      const [eventId, userId] = params;
      const key = `${eventId}:${userId}`;
      const existed = this.eventRegistrations.get(key);
      if (!existed) {
        return { rows: [], rowCount: 0 };
      }
      this.eventRegistrations.delete(key);
      return { rows: [{ id: existed.id }], rowCount: 1 };
    }

    if (normalized.startsWith('DELETE FROM competition_registrations')) {
      const [competitionId, userId] = params;
      const key = `${competitionId}:${userId}`;
      const existed = this.competitionRegistrations.get(key);
      if (!existed) {
        return { rows: [], rowCount: 0 };
      }
      this.competitionRegistrations.delete(key);
      return { rows: [{ id: existed.id }], rowCount: 1 };
    }

    if (normalized.startsWith('INSERT INTO user_calendar_items')) {
      const [userId, sourceType, sourceId, title, description, date, time, category] = params;
      const row = this.upsertCalendarItem({
        user_id: userId,
        source_type: sourceType,
        source_id: sourceId,
        title,
        description,
        date,
        time,
        category
      });
      return { rows: [this.clone(row)], rowCount: 1 };
    }

    if (normalized.startsWith('DELETE FROM user_calendar_items')) {
      const [userId, sourceType, sourceId] = params;
      const deleted = this.deleteCalendarItem(userId, sourceType, sourceId);
      return { rows: [], rowCount: deleted ? 1 : 0 };
    }

    throw new Error(`Unsupported query: ${normalized}`);
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

const sendRequest = async (server, { method = 'GET', path, token = null }) => {
  const url = new URL(path, `http://127.0.0.1:${server.address().port}`);
  const headers = {};
  if (token) {
    headers.Authorization = token;
  }
  const response = await fetch(url, { method, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body };
};

describe('Event & competition join calendar sync', () => {
  let server;

  beforeEach(async () => {
    testDb.reset();
    server = await startServer();
  });

  afterEach(async () => {
    await stopServer(server);
  });

  it('mirrors event joins and leaves into the calendar', async () => {
    const event = testDb.createEvent();
    const userId = 101;
    const token = createAuthHeader(userId);

    const joinResponse = await sendRequest(server, {
      method: 'POST',
      path: `/api/events/${event.id}/join`,
      token
    });
    assert.equal(joinResponse.status, 200);
    assert.equal(joinResponse.body.calendarItem.source_type, 'event');

    const stored = testDb.findCalendarItem(userId, 'event', event.id);
    assert.ok(stored);
    assert.equal(stored.title, event.title);

    const leaveResponse = await sendRequest(server, {
      method: 'DELETE',
      path: `/api/events/${event.id}/join`,
      token
    });
    assert.equal(leaveResponse.status, 200);
    assert.equal(leaveResponse.body.success, true);
    assert.equal(testDb.findCalendarItem(userId, 'event', event.id), null);
  });

  it('prevents joining full or past events and cleans stale rows', async () => {
    const now = Date.now();
    const event = testDb.createEvent({
      start_time: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      max_participants: 1
    });
    const userId = 202;
    const token = createAuthHeader(userId);
    testDb.forceRegisterEvent(event.id, userId);
    testDb.createCalendarItem({
      user_id: userId,
      source_type: 'event',
      source_id: event.id,
      title: 'Stale event',
      date: '2024-01-01',
      time: '10:00'
    });

    const pastResponse = await sendRequest(server, {
      method: 'POST',
      path: `/api/events/${event.id}/join`,
      token
    });
    assert.equal(pastResponse.status, 409);
    assert.equal(testDb.findCalendarItem(userId, 'event', event.id), null);

    const futureEvent = testDb.createEvent({ max_participants: 1 });
    testDb.forceRegisterEvent(futureEvent.id, 999);
    const fullResponse = await sendRequest(server, {
      method: 'POST',
      path: `/api/events/${futureEvent.id}/join`,
      token
    });
    assert.equal(fullResponse.status, 409);
    assert.equal(testDb.findCalendarItem(userId, 'event', futureEvent.id), null);
  });

  it('mirrors competition joins and leaves into the calendar', async () => {
    const competition = testDb.createCompetition({ max_participants: 2 });
    const userId = 303;
    const token = createAuthHeader(userId);

    const joinResponse = await sendRequest(server, {
      method: 'POST',
      path: `/api/competitions/${competition.id}/join`,
      token
    });
    assert.equal(joinResponse.status, 200);
    assert.equal(joinResponse.body.calendarItem.source_type, 'competition');

    const stored = testDb.findCalendarItem(userId, 'competition', competition.id);
    assert.ok(stored);
    assert.equal(stored.title, competition.title);

    const leaveResponse = await sendRequest(server, {
      method: 'DELETE',
      path: `/api/competitions/${competition.id}/join`,
      token
    });
    assert.equal(leaveResponse.status, 200);
    assert.equal(testDb.findCalendarItem(userId, 'competition', competition.id), null);
  });
});