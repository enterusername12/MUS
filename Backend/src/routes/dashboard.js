const express = require('express');

const {
  getDashboardData,
  getLatestNews,
  getUpcomingEvents,
  getActivePolls,
  getStudentSpotlights,
  getRewardLeaders,
  getCalendarItems,
  parseLimit
} = require('../services/dashboard');

const router = express.Router();

const withErrorHandling = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    res.status(500).json({ success: false, message: 'Unable to load dashboard data.' });
  }
};

router.get(
  '/',
  withErrorHandling(async (req, res) => {
    const data = await getDashboardData({
      newsLimit: req.query.newsLimit,
      eventsLimit: req.query.eventsLimit,
      pollsLimit: req.query.pollsLimit,
      spotlightLimit: req.query.spotlightLimit,
      rewardLimit: req.query.rewardLimit,
      calendarLimit: req.query.calendarLimit
    });
    res.json({ success: true, data });
  })
);

router.get(
  '/news',
  withErrorHandling(async (req, res) => {
    const limit = parseLimit(req.query.limit, undefined);
    const news = await getLatestNews({ limit });
    res.json({ success: true, data: news });
  })
);

router.get(
  '/events',
  withErrorHandling(async (req, res) => {
    const limit = parseLimit(req.query.limit, undefined);
    const events = await getUpcomingEvents({ limit });
    res.json({ success: true, data: events });
  })
);

router.get(
  '/polls',
  withErrorHandling(async (req, res) => {
    const limit = parseLimit(req.query.limit, undefined);
    const polls = await getActivePolls({ limit });
    res.json({ success: true, data: polls });
  })
);

router.get(
  '/spotlights',
  withErrorHandling(async (req, res) => {
    const limit = parseLimit(req.query.limit, undefined);
    const spotlights = await getStudentSpotlights({ limit });
    res.json({ success: true, data: spotlights });
  })
);

router.get(
  '/rewards',
  withErrorHandling(async (req, res) => {
    const limit = parseLimit(req.query.limit, undefined);
    const rewards = await getRewardLeaders({ limit });
    res.json({ success: true, data: rewards });
  })
);

router.get(
  '/calendar',
  withErrorHandling(async (req, res) => {
    const limit = parseLimit(req.query.limit, undefined);
    const calendar = await getCalendarItems({ limit });
    res.json({ success: true, data: calendar });
  })
);

module.exports = router;