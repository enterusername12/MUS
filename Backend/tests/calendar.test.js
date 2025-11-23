const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysFromNow = (days) => new Date(Date.now() + days * DAY_MS).toISOString();
const toDateOnly = (isoString) => isoString.slice(0, 10);

describe('dashboard calendar integration', () => {
  let dashboardService;
  let queryStub;
  let registrationRows;
  let lastRegistrationQueryUserId;

  const calendarRows = [
    { id: 1, title: 'Campus Open Day', start_time: isoDaysFromNow(2), category: 'campus' }
  ];

  const userCalendarRows = [
    { id: 101, user_id: 42, title: 'Study Group', date: isoDaysFromNow(1), time: '09:00', category: 'personal' },
    { id: 102, user_id: 42, title: 'Lab Review', date: isoDaysFromNow(4), time: '16:00', category: 'personal' }
  ];

  const competitionRows = [
    { id: 10, title: 'Registered Hackathon', due: isoDaysFromNow(3) },
    { id: 11, title: 'Open Robotics Cup', due: isoDaysFromNow(1.5) }
  ];

  beforeEach(() => {
    const dbModuleId = require.resolve('../src/db');
    delete require.cache[dbModuleId];
    delete require.cache[require.resolve('../src/services/dashboardService')];

    lastRegistrationQueryUserId = null;
    registrationRows = [{ competition_id: competitionRows[0].id }];

    queryStub = async (text, params = []) => {
      if (text.includes('FROM competition_registrations')) {
        lastRegistrationQueryUserId = params[0];
        return { rows: registrationRows };
      }
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

  it('includes only registered competitions in the calendar and respects order and limit', async () => {
    const result = await dashboardService.getDashboardData({ userId: 42, limits: { calendarLimit: 3 } });

    assert.equal(lastRegistrationQueryUserId, 42);
    assert.equal(result.calendar.length, 3);

    const competitionEntries = result.calendar.filter((entry) => entry.type === 'competition');
    assert.equal(competitionEntries.length, 1, 'only registered competitions are included');
    assert.equal(competitionEntries[0].title, 'Registered Hackathon');
    assert.equal(competitionEntries[0].date, toDateOnly(competitionRows[0].due));

    const orderedTitles = result.calendar.map((item) => item.title);
    assert.deepEqual(orderedTitles, ['Study Group', 'Campus Open Day', 'Registered Hackathon']);
  });

  it('excludes competitions from the calendar when no user ID is provided', async () => {
    const result = await dashboardService.getDashboardData({ limits: { calendarLimit: 5 } });

    assert.ok(!result.calendar.some((entry) => entry.type === 'competition'));
  });
});