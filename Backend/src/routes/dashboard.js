const express = require('express');

const { getDashboardData } = require('../services/dashboardService');

const router = express.Router();

// Aggregated dashboard feed consumed by the student dashboard frontend.
router.get('/', async (req, res) => {
  try {
    const limits = {
      newsLimit: req.query.newsLimit,
      eventsLimit: req.query.eventsLimit,
      pollsLimit: req.query.pollsLimit,
      spotlightLimit: req.query.spotlightLimit,
      rewardLimit: req.query.rewardLimit,
      calendarLimit: req.query.calendarLimit
    };

    const data = await getDashboardData({ limits });
    res.json(data);
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    res.status(500).json({ message: 'Unable to load dashboard data.' });
  }
});

module.exports = router;
