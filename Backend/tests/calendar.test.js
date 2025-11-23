const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const ISO_DAY = 24 * 60 * 60 * 1000;

const dateFromNow = (days) => new Date(Date.now() + days * ISO_DAY).toISOString();
const toDateOnly = (iso) => iso.slice(0, 10);

describe('dashboard calendar integration', () => {
  let dashboardService;
  let queryStub;

  const calendarRows = [
    { id: 1, title: 'Public Lecture', start_time: dateFromNow(1), category: 'campus' },
    { id: 2, title: 'Club Social', start_time: dateFromNow(5), category: 'club' }
  ];

  const competitionRows = [
    { id: 10, title: 'Innovation Challenge', due: dateFromNow(3) },
    { id: 11, title: 'Robotics Cup', due: dateFromNow(7) }
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
      if (text.includes('FROM user_calendar_items')) return { rows: [] };
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

  it('includes competition deadlines in calendar output', async () => {
    const result = await dashboardService.getDashboardData({ limits: { calendarLimit: 6 } });

    const competitionEntry = result.calendar.find((entry) => entry.type === 'competition');

    assert.ok(competitionEntry, 'competition deadline is present');
    assert.equal(competitionEntry.title, 'Innovation Challenge');
    assert.equal(competitionEntry.date, competitionRows[0].due.slice(0, 10));
    assert.equal(competitionEntry.category, 'competition');
  });

  it('respects calendar limits when merging competitions', async () => {
    const result = await dashboardService.getDashboardData({ limits: { calendarLimit: 3 } });

    assert.equal(result.calendar.length, 3);

    const dates = result.calendar.map((item) => item.date);
    const expectedDates = [calendarRows[0].start_time, competitionRows[0].due, calendarRows[1].start_time].map(toDateOnly);
    assert.deepEqual(dates, expectedDates);

    assert.ok(
      result.calendar.some((item) => item.type === 'competition' && item.title === 'Innovation Challenge'),
      'earliest competition deadline should be merged into calendar'
    );
  });
});