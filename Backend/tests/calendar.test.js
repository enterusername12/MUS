const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const ISO_DAY = 24 * 60 * 60 * 1000;

const dateFromNow = (days) => new Date(Date.now() + days * ISO_DAY).toISOString();
const toDateOnly = (iso) => iso.slice(0, 10);

describe('dashboard calendar integration', () => {
  let dashboardService;
  let queryStub;

  const calendarRows = [
    { id: 1, title: 'Public Lecture', start_time: dateFromNow(2), category: 'campus' },
    { id: 2, title: 'Club Social', start_time: dateFromNow(5), category: 'club' }
  ];

  const userCalendarRows = [
    { id: 101, user_id: 42, title: 'Study Group', date: dateFromNow(1), time: '10:00', category: 'personal' },
    { id: 102, user_id: 42, title: 'Doctor Visit', date: dateFromNow(4), time: '15:00', category: 'personal' }
  ];

  const competitionRows = [
    { id: 10, title: 'Innovation Challenge', due: dateFromNow(3) },
    { id: 11, title: 'Robotics Cup', due: dateFromNow(6) }
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

  it('normalizes competition due dates for calendar consumption', async () => {
    const result = await dashboardService.getDashboardData({ limits: { calendarLimit: 6 } });

    assert.ok(result.competitions.every((comp) => typeof comp.due === 'string' && comp.due.length > 0));

    const competitionEntry = result.calendar.find((entry) => entry.type === 'competition');
    assert.ok(competitionEntry, 'competition should appear in calendar');
    const expectedTime = new Date(competitionRows[0].due).toISOString().slice(11, 16);
    assert.equal(competitionEntry.time, expectedTime);
  });

  it('includes competition deadlines in calendar output', async () => {
    const result = await dashboardService.getDashboardData({ userId: 42, limits: { calendarLimit: 6 } });

    const competitionEntry = result.calendar.find((entry) => entry.type === 'competition');

    assert.ok(competitionEntry, 'competition deadline is present');
    assert.equal(competitionEntry.title, 'Innovation Challenge');
    assert.equal(competitionEntry.date, competitionRows[0].due.slice(0, 10));
    assert.equal(competitionEntry.category, 'competition');
  });

  it('merges user, competition, and public calendar items by date and respects limit', async () => {
    const result = await dashboardService.getDashboardData({ userId: 42, limits: { calendarLimit: 4 } });

    assert.equal(result.calendar.length, 4);

    const orderedDates = result.calendar.map((item) => item.date);
    const expectedDates = [
      userCalendarRows[0].date,
      calendarRows[0].start_time,
      competitionRows[0].due,
      userCalendarRows[1].date
    ].map(toDateOnly);

    assert.deepEqual(orderedDates, expectedDates);

    assert.ok(
      result.calendar.some((item) => item.type === 'competition' && item.title === 'Innovation Challenge'),
      'earliest competition deadline should be merged into calendar'
    );
  });
});