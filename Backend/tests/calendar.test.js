const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysFromNow = (days) => new Date(Date.now() + days * DAY_MS).toISOString();
const toDateOnly = (isoString) => isoString.slice(0, 10);

describe('dashboard calendar integration', () => {
  let dashboardService;
  let queryStub;

  const calendarRows = [
    { id: 1, title: 'Campus Open Day', start_time: isoDaysFromNow(2), category: 'campus' },
    { id: 2, title: 'Club Social', start_time: isoDaysFromNow(5), category: 'club' }
  ];

  const userCalendarRows = [
    { id: 101, user_id: 42, title: 'Study Group', date: isoDaysFromNow(1), time: '10:00', category: 'personal' },
    { id: 102, user_id: 42, title: 'Doctor Visit', date: isoDaysFromNow(4), time: '15:00', category: 'personal' }
  ];

  const competitionRows = [
    { id: 10, title: 'Innovation Challenge', due: isoDaysFromNow(3) },
    { id: 11, title: 'Robotics Cup', due: isoDaysFromNow(6) }
  ];

  beforeEach(() => {
    const dbModuleId = require.resolve('../src/db');
    delete require.cache[dbModuleId];
    delete require.cache[require.resolve('../src/services/dashboardService')];

    queryStub = async (text) => {
      if (text.includes('FROM competition')) return { rows: competitionRows };
      if (text.includes('FROM participation')) return { rows: [] };
      if (text.includes('FROM reward ')) return { rows: [] };
      if (text.includes('FROM calendar_items')) return { rows: calendarRows };
      if (text.includes('FROM user_calendar_items')) return { rows: userCalendarRows };
      return { rows: [] };
    };

    require.cache[dbModuleId] = {
      id: dbModuleId,
      filename: dbModuleId,
      loaded: true,
      exports: { getPool: () => ({ query: queryStub }) }
    };

    dashboardService = require('../src/services/dashboardService');
  });

  afterEach(() => {
    delete require.cache[require.resolve('../src/services/dashboardService')];
  });

  it('merges calendar sources, includes competition entries, and respects limit order', async () => {
    const result = await dashboardService.getDashboardData({ userId: 42, limits: { calendarLimit: 4 } });

    assert.equal(result.calendar.length, 4);

    const competitionEntry = result.calendar.find((entry) => entry.type === 'competition');

    assert.ok(competitionEntry, 'competition deadline should be merged into calendar');
    assert.equal(competitionEntry.title, 'Innovation Challenge');
    assert.equal(competitionEntry.date, toDateOnly(competitionRows[0].due));

    const orderedDates = result.calendar.map((item) => item.date);
    const expectedDates = [
      userCalendarRows[0].date,
      calendarRows[0].start_time,
      competitionRows[0].due,
      userCalendarRows[1].date
    ].map(toDateOnly);

    assert.deepEqual(orderedDates, expectedDates);
    assert.equal(competitionEntry.date, toDateOnly(competitionRows[0].due));
  });
});